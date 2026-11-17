import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { DataSource, IsNull, MoreThan, Repository } from 'typeorm';
import { UserAuditService } from '../audit/user-audit.service.js';
import { hashToken, newOneTimeToken } from '../common/crypto/tokens.js';
import { buildResetLink, sendPasswordResetEmail } from '../common/mail/mailer.js';
import { UserAuditAction } from '../database/entities/user-audit.entity.js';
import { UserCode, UserCodePurpose } from '../database/entities/user-code.entity.js';
import { UserLogin } from '../database/entities/user-login.entity.js';
import { UserPermission } from '../database/entities/user-permission.entity.js';
import { UserInfo } from '../database/entities/user-info.entity.js';
import { User } from '../database/entities/user.entity.js';
import type { JwtPayload } from './authenticated-user.js';
import type { LoginDto } from './dto/login.dto.js';
import { contaAtiva, findUserByLogin, podeEntrar } from './login-lookup.js';
import { avaliarRiscoLogin, SEPARADOR_MOTIVOS } from './login-risk.js';
import { latestPermission } from './permissions.js';
import type { UserProfile } from './profiles.js';
import { scopeOf, type UserScope } from './scope.js';
import { SESSION_TTL_MS } from './session-cookie.js';

const HISTORICO_RISCO = 50;
const PASSWORD_SALT_ROUNDS = 10;
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hora
const INVALID_CREDENTIALS_MESSAGE = 'CPF/e-mail ou senha inválidos.';
const AMBIGUOUS_EMAIL_MESSAGE = 'Este e-mail está em mais de uma conta. Entre com o seu CPF.';
/** Hash qualquer, só para o login inexistente gastar o mesmo tempo do bcrypt. */
const DUMMY_HASH = bcrypt.hashSync('oncodash-dummy-password', PASSWORD_SALT_ROUNDS);

export interface LoginContext {
  ip: string | null;
  userAgent: string | null;
}

export interface PublicUser {
  id: number;
  login: string | null;
  email: string | null;
  nome: string;
  cargo: string | null;
  profile: UserProfile | null;
  canEdit: boolean;
  canAdd: boolean;
  scope: UserScope;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserPermission)
    private readonly userPermissionRepository: Repository<UserPermission>,
    @InjectRepository(UserLogin)
    private readonly userLoginRepository: Repository<UserLogin>,
    @InjectRepository(UserCode)
    private readonly userCodeRepository: Repository<UserCode>,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly audit: UserAuditService,
  ) {}

  /** Confere senha, avalia risco, abre a sessão e devolve o token (que vira cookie no controller). */
  async login(dto: LoginDto, ctx: LoginContext): Promise<{ token: string; user: PublicUser }> {
    const found = await findUserByLogin(this.userRepository, dto.login);
    if (found.tipo === 'ambiguo') {
      await bcrypt.compare(dto.senha, DUMMY_HASH);
      throw new UnauthorizedException(AMBIGUOUS_EMAIL_MESSAGE);
    }
    const user = found.tipo === 'encontrado' ? found.user : null;

    // Conta inexistente, sem senha ou desativada: mesma resposta e mesmo tempo de uma senha errada.
    // O hash vem da tb_usuario ($2a$) ou do OncoDash ($2b$); o bcryptjs confere os dois.
    const hash = user && podeEntrar(user) ? user.senha! : DUMMY_HASH;
    const passwordMatches = await bcrypt.compare(dto.senha, hash);
    if (!user || hash === DUMMY_HASH || !passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const permission = await latestPermission(this.userPermissionRepository, user.id);
    if (!permission) {
      throw new UnauthorizedException('Sua conta ainda não tem perfil de acesso ao OncoDash. Fale com o administrador.');
    }

    const anteriores = await this.userLoginRepository.find({
      where: { idUsers: user.id },
      select: { fingerprint: true, latitude: true, longitude: true, createdAt: true },
      order: { createdAt: 'DESC' },
      take: HISTORICO_RISCO,
    });
    const risco = avaliarRiscoLogin(
      { fingerprint: dto.fingerprint, latitude: dto.latitude, longitude: dto.longitude, data: new Date() },
      anteriores,
    );

    const session = await this.userLoginRepository.save(
      this.userLoginRepository.create({
        idUsers: user.id,
        fingerprint: dto.fingerprint,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        latitude: dto.latitude,
        longitude: dto.longitude,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        suspeito: risco.suspeito,
        motivosSuspeita: risco.motivos.length > 0 ? risco.motivos.join(SEPARADOR_MOTIVOS).slice(0, 500) : null,
        distanciaKm: risco.distanciaKm,
      }),
    );

    const payload: JwtPayload = { sub: user.id, sid: session.id };
    const token = await this.jwtService.signAsync(payload);
    return { token, user: this.toPublicUser(user, permission) };
  }

  async logout(sessionId: number): Promise<void> {
    await this.userLoginRepository.update({ id: sessionId }, { expiresAt: new Date() });
  }

  async me(userId: number): Promise<PublicUser> {
    const user = await this.userRepository.findOne({ where: { id: userId }, relations: { info: true } });
    if (!user || !contaAtiva(user.info)) throw new UnauthorizedException();
    const permission = await latestPermission(this.userPermissionRepository, user.id);
    return this.toPublicUser(user, permission);
  }

  /**
   * Pede o link de redefinição pelo CPF/login ou e-mail. Resposta sempre
   * igual (quem chama não fica sabendo se a conta existe). Só recebe o link
   * conta ativa, com senha e com e-mail cadastrado; os links anteriores ainda
   * não usados deixam de valer.
   */
  async forgotPassword(login: string, ip: string | null): Promise<void> {
    const found = await findUserByLogin(this.userRepository, login);
    if (found.tipo !== 'encontrado') return;
    const user = found.user;
    if (!podeEntrar(user) || !user.email) return;

    await this.userCodeRepository.update(
      { idUsers: user.id, purpose: UserCodePurpose.RESET_SENHA, usedAt: IsNull() },
      { usedAt: new Date() },
    );
    const token = newOneTimeToken();
    await this.userCodeRepository.save(
      this.userCodeRepository.create({
        idUsers: user.id,
        code: hashToken(token),
        purpose: UserCodePurpose.RESET_SENHA,
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      }),
    );
    const emailSent = await sendPasswordResetEmail({ to: user.email, nome: user.nome, link: buildResetLink(token) });
    await this.audit.record({
      actorId: null,
      targetId: user.id,
      acao: UserAuditAction.SENHA_RECUPERACAO_PEDIDA,
      depois: { emailEnviado: emailSent },
      ip,
    });
  }

  /** Troca a senha pelo link e encerra todas as sessões abertas do usuário. */
  async resetPassword(token: string, senha: string, ip: string | null): Promise<void> {
    const invalid = new BadRequestException('Link inválido, expirado ou já utilizado. Peça um novo.');
    await this.dataSource.transaction(async (em) => {
      const code = await em.findOne(UserCode, {
        where: { code: hashToken(token), purpose: UserCodePurpose.RESET_SENHA },
        lock: { mode: 'pessimistic_write' },
      });
      if (!code || code.usedAt || code.expiresAt.getTime() < Date.now()) throw invalid;

      const user = await em.findOne(User, { where: { id: code.idUsers }, relations: { info: true } });
      if (!user || !podeEntrar(user)) throw invalid;

      const now = new Date();
      user.senha = await bcrypt.hash(senha, PASSWORD_SALT_ROUNDS);
      await em.save(user);
      await em.update(UserInfo, { idUsers: user.id }, {
        senhaAlteradaEm: now,
        coUsuarioAtualizacao: String(user.id),
        dtAtualizacao: now,
      });
      code.usedAt = now;
      await em.save(code);
      await em.update(UserLogin, { idUsers: user.id, expiresAt: MoreThan(now) }, { expiresAt: now });
    });

    const code = await this.userCodeRepository.findOne({ where: { code: hashToken(token) } });
    await this.audit.record({
      actorId: code?.idUsers ?? null,
      targetId: code?.idUsers ?? null,
      acao: UserAuditAction.SENHA_REDEFINIDA,
      ip,
    });
  }

  toPublicUser(user: User, permission: UserPermission | null): PublicUser {
    return {
      id: user.id,
      login: user.info?.noLogin ?? null,
      email: user.email,
      nome: user.nome,
      cargo: user.info?.cargo ?? null,
      profile: permission?.profile ?? null,
      canEdit: permission?.canEdit ?? false,
      canAdd: permission?.canAdd ?? false,
      scope: scopeOf(user.info),
    };
  }
}
