import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { UserAuditService } from '../audit/user-audit.service.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { latestPermission, latestPermissionsByUserId } from '../auth/permissions.js';
import {
  canInvite,
  invitableProfilesFor,
  isNationalProfile,
  UserProfile,
} from '../auth/profiles.js';
import { applyScope, describeScope, scopeOf, type UserScope } from '../auth/scope.js';
import { encryptCpf, maskCpf } from '../common/crypto/cpf-cipher.js';
import { hashToken, newOneTimeToken } from '../common/crypto/tokens.js';
import { buildInviteLink, sendInviteEmail } from '../common/mail/mailer.js';
import { UserAuditAction } from '../database/entities/user-audit.entity.js';
import { UserCode, UserCodePurpose } from '../database/entities/user-code.entity.js';
import { UserPermission } from '../database/entities/user-permission.entity.js';
import { UserInfo } from '../database/entities/user-info.entity.js';
import { User } from '../database/entities/user.entity.js';
import { contaAtiva } from '../auth/login-lookup.js';
import { isValidCpf } from './cpf.js';
import type { AcceptInviteDto } from './dto/accept-invite.dto.js';
import type { CreateInviteDto } from './dto/create-invite.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import { isWithinScope, resolveInviteScope } from './invite-scope.js';
import { TerritorioService, type TerritorioOpcoes } from './territorio.service.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_SALT_ROUNDS = 10;
const NO_PERMISSION = 'Você não tem permissão para adicionar novos usuários.';

/**
 * ativo     → tem senha e a conta está ativa
 * pendente  → sem senha, com convite válido
 * expirado  → sem senha, convite vencido
 * sem_senha → sem senha e sem convite (ex.: importado da tb_usuario sem senha)
 * inativo   → st_registro_ativo = 'N' ou excluído (dt_exclusao)
 */
export type UserStatus = 'ativo' | 'pendente' | 'expirado' | 'sem_senha' | 'inativo';

export interface UserListItem {
  id: number;
  nome: string;
  login: string | null;
  email: string | null;
  coCnes: string | null;
  origem: 'tb_usuario' | 'oncodash';
  telefone: string | null;
  cargo: string | null;
  cpfMasked: string | null;
  profile: UserProfile | null;
  canEdit: boolean;
  canAdd: boolean;
  scope: UserScope;
  scopeLabel: string | null;
  status: UserStatus;
  createdAt: string;
  invitedByNome: string | null;
}

export interface InvitePreview {
  nome: string;
  email: string | null;
  /** Preenchido quando a conta já tem login (ex.: importada da tb_usuario): o CPF digitado precisa bater. */
  login: string | null;
  cargo: string | null;
  profile: UserProfile | null;
  scopeLabel: string | null;
  expiresAt: string;
}

export interface CreateInviteResult extends UserListItem {
  /** Link do convite: só volta para o Desenvolvedor (para quando o e-mail falhar). */
  inviteLink: string | null;
  emailSent: boolean;
}

export interface InviteOptions {
  profiles: UserProfile[];
  /** Níveis já fixados pelo escopo de quem convida (o formulário mostra travado). */
  fixedScope: UserScope | null;
  territorio: TerritorioOpcoes;
}

type Requester = Pick<AuthenticatedUser, 'id' | 'profile' | 'canAdd' | 'scope'>;

type UserWithInfo = User & { info: UserInfo };

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserPermission)
    private readonly userPermissionRepository: Repository<UserPermission>,
    @InjectRepository(UserCode)
    private readonly userCodeRepository: Repository<UserCode>,
    private readonly dataSource: DataSource,
    private readonly audit: UserAuditService,
    private readonly territorio: TerritorioService,
  ) {}

  // ── Lista e detalhe ─────────────────────────────────────────────────────

  /** Nacionais veem todos; perfis restritos só os usuários dentro do próprio escopo. */
  async list(requester: Requester, search?: string): Promise<UserListItem[]> {
    const qb = this.userRepository
      .createQueryBuilder('user')
      .innerJoinAndSelect('user.info', 'info')
      .orderBy('user.nome', 'ASC')
      .addOrderBy('user.id', 'ASC');

    if (search?.trim()) {
      qb.andWhere('(user.nome ILIKE :search OR user.email ILIKE :search OR info.no_login ILIKE :search)', {
        search: `%${search.trim()}%`,
      });
    }

    const users = ((await qb.getMany()) as UserWithInfo[]).filter(
      (u) => requester.profile && isWithinScope({ profile: requester.profile, scope: requester.scope }, scopeOf(u.info)),
    );
    const ids = users.map((u) => u.id);
    const permissions = await latestPermissionsByUserId(this.userPermissionRepository, ids);
    const invites = await this.openInviteExpiry(users.filter((u) => !u.senha).map((u) => u.id));
    const creators = await this.namesById(users.map((u) => u.info.coUsuarioCriacao));
    return users.map((u) => this.toListItem(u, permissions.get(u.id) ?? null, invites.get(u.id) ?? null, creators));
  }

  async get(id: number): Promise<UserListItem> {
    const user = await this.findWithInfo(id);
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    const permission = await latestPermission(this.userPermissionRepository, id);
    const invite = user.senha ? null : ((await this.openInviteExpiry([id])).get(id) ?? null);
    const creators = await this.namesById([user.info.coUsuarioCriacao]);
    return this.toListItem(user, permission, invite, creators);
  }

  // ── Convite ─────────────────────────────────────────────────────────────

  async inviteOptions(requester: Requester): Promise<InviteOptions> {
    if (!requester.profile || !requester.canAdd) throw new ForbiddenException(NO_PERMISSION);
    return {
      profiles: invitableProfilesFor(requester.profile),
      fixedScope: isNationalProfile(requester.profile) ? null : requester.scope,
      territorio: await this.territorio.opcoes(),
    };
  }

  async createInvite(requester: Requester, dto: CreateInviteDto, ip: string | null): Promise<CreateInviteResult> {
    if (!requester.profile || !requester.canAdd) throw new ForbiddenException(NO_PERMISSION);
    if (!canInvite(requester.profile, dto.profile)) {
      throw new ForbiddenException('Você não pode convidar alguém com esse perfil de acesso.');
    }
    const scope = resolveInviteScope({ profile: requester.profile, scope: requester.scope }, dto.profile, dto.escopo);

    // O e-mail não é único no banco (a tb_usuario tem repetidos), mas convite novo para um
    // e-mail que já tem conta quase sempre é a mesma pessoa: melhor editar a conta existente.
    const existing = await this.userRepository
      .createQueryBuilder('user')
      .innerJoin('user.info', 'info')
      .where('lower(user.email) = lower(:email)', { email: dto.email })
      .andWhere('info.dt_exclusao IS NULL')
      .getCount();
    if (existing > 0) {
      throw new ConflictException('Já existe uma conta com este e-mail. Edite a conta existente em vez de convidar de novo.');
    }

    const token = newOneTimeToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const newUser = await this.dataSource.transaction(async (em) => {
      const user = await em.save(em.create(User, { nome: dto.nome, email: dto.email, senha: null }));
      const info = em.create(UserInfo, {
        idUsers: user.id,
        cargo: dto.cargo,
        coUsuarioCriacao: String(requester.id),
        dtCriacao: new Date(),
      });
      applyScope(info, scope);
      await em.save(info);
      await em.save(em.create(UserPermission, { idUsers: user.id, profile: dto.profile, canEdit: false, canAdd: false }));
      await em.save(
        em.create(UserCode, { idUsers: user.id, code: hashToken(token), purpose: UserCodePurpose.CONVITE, expiresAt }),
      );
      return user;
    });

    const inviter = await this.userRepository.findOne({ where: { id: requester.id } });
    const emailSent = await sendInviteEmail({
      to: dto.email,
      nome: newUser.nome,
      profile: dto.profile,
      escopo: describeScope(scope),
      inviterNome: inviter?.nome ?? null,
      link: buildInviteLink(token),
      expiresAt,
    });
    await this.audit.record({
      actorId: requester.id,
      targetId: newUser.id,
      acao: UserAuditAction.CONVITE_CRIADO,
      depois: { email: dto.email, profile: dto.profile, escopo: describeScope(scope), emailEnviado: emailSent },
      ip,
    });

    const created = await this.get(newUser.id);
    const exposeLink = requester.profile === UserProfile.DESENVOLVEDOR;
    return { ...created, inviteLink: exposeLink ? buildInviteLink(token) : null, emailSent };
  }

  /**
   * (Re)envia o link de definição de senha. Serve também para os usuários
   * importados da tb_usuario sem senha: eles recebem o convite no e-mail
   * cadastrado e, ao aceitar, informam o CPF (que precisa bater com o login).
   */
  async resendInvite(requester: Requester, userId: number, ip: string | null): Promise<CreateInviteResult> {
    if (!requester.profile || !requester.canAdd) throw new ForbiddenException('Você não pode enviar convites.');

    const target = await this.findWithInfo(userId);
    if (!target) throw new NotFoundException('Usuário não encontrado.');
    if (target.senha) throw new ConflictException('Este usuário já tem senha; não há convite para enviar.');
    if (!contaAtiva(target.info)) throw new ConflictException('Esta conta está desativada.');
    if (!target.email) {
      throw new ConflictException('Esta conta não tem e-mail cadastrado. Edite o usuário e informe um e-mail antes.');
    }

    const targetPermission = await latestPermission(this.userPermissionRepository, userId);
    if (!targetPermission) throw new ConflictException('Defina o perfil de acesso deste usuário antes de enviar o convite.');
    if (
      !canInvite(requester.profile, targetPermission.profile) ||
      !isWithinScope({ profile: requester.profile, scope: requester.scope }, scopeOf(target.info))
    ) {
      throw new ForbiddenException('Você não pode enviar o convite deste usuário.');
    }

    const token = newOneTimeToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await this.dataSource.transaction(async (em) => {
      await em.update(
        UserCode,
        { idUsers: userId, purpose: UserCodePurpose.CONVITE, usedAt: IsNull() },
        { usedAt: new Date() },
      );
      await em.save(em.create(UserCode, { idUsers: userId, code: hashToken(token), purpose: UserCodePurpose.CONVITE, expiresAt }));
    });

    const inviter = await this.userRepository.findOne({ where: { id: requester.id } });
    const emailSent = await sendInviteEmail({
      to: target.email,
      nome: target.nome,
      profile: targetPermission.profile,
      escopo: describeScope(scopeOf(target.info)),
      inviterNome: inviter?.nome ?? null,
      link: buildInviteLink(token),
      expiresAt,
    });
    await this.audit.record({
      actorId: requester.id,
      targetId: userId,
      acao: UserAuditAction.CONVITE_REENVIADO,
      depois: { emailEnviado: emailSent },
      ip,
    });

    const updated = await this.get(userId);
    const exposeLink = requester.profile === UserProfile.DESENVOLVEDOR;
    return { ...updated, inviteLink: exposeLink ? buildInviteLink(token) : null, emailSent };
  }

  async getInvite(token: string): Promise<InvitePreview> {
    const code = await this.findValidInviteCode(token);
    const user = await this.findWithInfo(code.idUsers);
    if (!user || user.senha || !contaAtiva(user.info)) throw new NotFoundException('Convite inválido ou já utilizado.');
    const permission = await latestPermission(this.userPermissionRepository, user.id);
    return {
      nome: user.nome,
      email: user.email,
      login: user.info.noLogin,
      cargo: user.info.cargo,
      profile: permission?.profile ?? null,
      scopeLabel: describeScope(scopeOf(user.info)),
      expiresAt: code.expiresAt.toISOString(),
    };
  }

  async acceptInvite(
    token: string,
    dto: AcceptInviteDto,
    ip: string | null,
  ): Promise<{ login: string; email: string | null }> {
    if (!isValidCpf(dto.cpf)) throw new BadRequestException('CPF inválido.');

    const result = await this.dataSource.transaction(async (em) => {
      const code = await em.findOne(UserCode, {
        where: { code: hashToken(token), purpose: UserCodePurpose.CONVITE },
        lock: { mode: 'pessimistic_write' },
      });
      this.assertInviteUsable(code);
      const user = await em.findOne(User, { where: { id: code!.idUsers }, relations: { info: true } });
      if (!user?.info || user.senha || !contaAtiva(user.info)) {
        throw new NotFoundException('Convite inválido ou já utilizado.');
      }
      const info = user.info;

      if (info.noLogin) {
        // Conta que já tem login (importada): o CPF informado precisa ser o do cadastro.
        if (info.noLogin.replace(/\D/g, '') !== dto.cpf) {
          throw new BadRequestException('O CPF informado não confere com o cadastro desta conta.');
        }
      } else {
        const taken = await em
          .createQueryBuilder(UserInfo, 'i')
          .where('i.dt_exclusao IS NULL')
          .andWhere(`i.no_login ~ '^[0-9.\\-\\s]+$' AND regexp_replace(i.no_login, '\\D', '', 'g') = :cpf`, { cpf: dto.cpf })
          .getCount();
        if (taken > 0) throw new ConflictException('Já existe uma conta com este CPF. Entre com ela ou fale com o suporte.');
        info.noLogin = dto.cpf;
      }

      const now = new Date();
      user.senha = await bcrypt.hash(dto.senha, PASSWORD_SALT_ROUNDS);
      await em.save(User, { id: user.id, senha: user.senha });
      info.cpf = encryptCpf(dto.cpf);
      info.telefone = dto.telefone;
      info.senhaAlteradaEm = now;
      info.coUsuarioAtualizacao = String(user.id);
      info.dtAtualizacao = now;
      await em.save(info);
      code!.usedAt = now;
      await em.save(code!);
      return { id: user.id, login: info.noLogin, email: user.email };
    });

    await this.audit.record({ actorId: result.id, targetId: result.id, acao: UserAuditAction.CONTA_ATIVADA, ip });
    return { login: result.login, email: result.email };
  }

  // ── Edição (Desenvolvedor e Gestor federal) ─────────────────────────────

  async update(requester: Requester, id: number, dto: UpdateUserDto, ip: string | null): Promise<UserListItem> {
    if (!requester.profile) throw new ForbiddenException();
    const user = await this.findWithInfo(id);
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    const info = user.info;
    const current = await latestPermission(this.userPermissionRepository, id);

    const isSelf = requester.id === id;
    if (!isSelf && current && !canInvite(requester.profile, current.profile)) {
      throw new ForbiddenException('Você não pode editar um usuário com perfil igual ou acima do seu.');
    }
    const nextProfile = dto.profile ?? current?.profile;
    if (!nextProfile) throw new ConflictException('Defina um perfil para este usuário.');
    if (dto.profile && dto.profile !== current?.profile) {
      if (isSelf) throw new ForbiddenException('Você não pode mudar o próprio perfil.');
      if (!canInvite(requester.profile, dto.profile)) {
        throw new ForbiddenException('Você não pode atribuir esse perfil.');
      }
    }

    const antes: Record<string, unknown> = {};
    const depois: Record<string, unknown> = {};
    const track = (field: string, before: unknown, after: unknown) => {
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        antes[field] = before;
        depois[field] = after;
      }
    };

    // Nome e e-mail das contas do APAC Onco vêm de lá (o sync diário sobrescreveria);
    // só dá para informar um e-mail aqui quando a origem não tem nenhum.
    if (info.importadoEm) {
      if (dto.nome !== undefined && dto.nome !== user.nome) {
        throw new BadRequestException('O nome desta conta vem do APAC Onco e só pode ser alterado lá.');
      }
      if (dto.email !== undefined && user.email && dto.email !== user.email.toLowerCase()) {
        throw new BadRequestException('O e-mail desta conta vem do APAC Onco e só pode ser alterado lá.');
      }
    }

    let userChanged = false;
    for (const field of ['nome', 'email'] as const) {
      const atual = field === 'email' ? user.email?.toLowerCase() : user.nome;
      if (dto[field] !== undefined && dto[field] !== atual) {
        track(field, user[field], dto[field]);
        user[field] = dto[field];
        userChanged = true;
      }
    }
    for (const field of ['cargo', 'telefone'] as const) {
      if (dto[field] !== undefined) {
        track(field, info[field], dto[field]);
        info[field] = dto[field];
      }
    }

    // Escopo: recalculado quando o perfil muda ou quando um escopo novo é enviado.
    const profileChanged = nextProfile !== current?.profile;
    if (dto.escopo !== undefined || profileChanged) {
      const scope = resolveInviteScope(
        { profile: requester.profile, scope: requester.scope },
        nextProfile,
        dto.escopo ?? this.scopeToInput(scopeOf(info)),
      );
      track('escopo', describeScope(scopeOf(info)), describeScope(scope));
      applyScope(info, scope);
    }

    const nextCanEdit = dto.canEdit ?? current?.canEdit ?? false;
    const nextCanAdd = dto.canAdd ?? current?.canAdd ?? false;
    const permissionChanged =
      !current || profileChanged || current.canEdit !== nextCanEdit || current.canAdd !== nextCanAdd;
    const infoChanged = Object.keys(depois).some((k) => k !== 'nome' && k !== 'email');

    if (userChanged || infoChanged) {
      info.coUsuarioAtualizacao = String(requester.id);
      info.dtAtualizacao = new Date();
    }

    await this.dataSource.transaction(async (em) => {
      if (userChanged) await em.save(User, { id: user.id, nome: user.nome, email: user.email });
      if (userChanged || infoChanged) await em.save(info);
      if (permissionChanged) {
        await em.save(em.create(UserPermission, { idUsers: id, profile: nextProfile, canEdit: nextCanEdit, canAdd: nextCanAdd }));
      }
    });

    if (Object.keys(depois).length > 0) {
      await this.audit.record({ actorId: requester.id, targetId: id, acao: UserAuditAction.USUARIO_ALTERADO, antes, depois, ip });
    }
    if (permissionChanged) {
      await this.audit.record({
        actorId: requester.id,
        targetId: id,
        acao: UserAuditAction.PERMISSAO_ALTERADA,
        antes: current ? { profile: current.profile, canEdit: current.canEdit, canAdd: current.canAdd } : null,
        depois: { profile: nextProfile, canEdit: nextCanEdit, canAdd: nextCanAdd },
        ip,
      });
    }
    return this.get(id);
  }

  // ── Auxiliares ──────────────────────────────────────────────────────────

  private async findWithInfo(id: number): Promise<UserWithInfo | null> {
    const user = await this.userRepository.findOne({ where: { id }, relations: { info: true } });
    return user?.info ? (user as UserWithInfo) : null;
  }

  /** Nome de quem criou cada conta (co_usuario_criacao), quando o id existir aqui. */
  private async namesById(ids: Array<string | null>): Promise<Map<string, string>> {
    const numeric = [...new Set(ids.filter((v): v is string => !!v).map(Number))].filter(
      (n) => Number.isSafeInteger(n) && n > 0 && n <= 2147483647,
    );
    if (numeric.length === 0) return new Map();
    const rows = await this.userRepository.find({ where: { id: In(numeric) }, select: { id: true, nome: true } });
    return new Map(rows.map((r) => [String(r.id), r.nome]));
  }

  private scopeToInput(scope: UserScope) {
    return {
      ufCodigo: scope.uf?.codigo,
      ufNome: scope.uf?.nome ?? undefined,
      macrorregiaoCodigo: scope.macrorregiao?.codigo,
      macrorregiaoNome: scope.macrorregiao?.nome ?? undefined,
      regiaoSaudeCodigo: scope.regiaoSaude?.codigo,
      regiaoSaudeNome: scope.regiaoSaude?.nome ?? undefined,
      municipioCodigo: scope.municipio?.codigo,
      municipioNome: scope.municipio?.nome ?? undefined,
      cnesCodigo: scope.cnes?.codigo,
      cnesNome: scope.cnes?.nome ?? undefined,
    };
  }

  private async findValidInviteCode(token: string): Promise<UserCode> {
    const code = await this.userCodeRepository.findOne({
      where: { code: hashToken(token), purpose: UserCodePurpose.CONVITE },
    });
    this.assertInviteUsable(code);
    return code!;
  }

  private assertInviteUsable(code: UserCode | null): void {
    if (!code || code.usedAt) throw new NotFoundException('Convite inválido ou já utilizado.');
    if (code.expiresAt.getTime() < Date.now()) throw new GoneException('Este convite expirou. Peça um novo a quem convidou você.');
  }

  /** Maior validade entre os convites ainda não usados de cada usuário (vencidos inclusive). */
  private async openInviteExpiry(userIds: number[]): Promise<Map<number, Date>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.userCodeRepository.find({
      where: { idUsers: In(userIds), purpose: UserCodePurpose.CONVITE, usedAt: IsNull() },
    });
    const map = new Map<number, Date>();
    for (const row of rows) {
      const current = map.get(row.idUsers);
      if (!current || row.expiresAt > current) map.set(row.idUsers, row.expiresAt);
    }
    return map;
  }

  private toListItem(
    user: UserWithInfo,
    permission: UserPermission | null,
    inviteExpiresAt: Date | null,
    creators: Map<string, string>,
  ): UserListItem {
    const info = user.info;
    let status: UserStatus;
    if (!contaAtiva(info)) status = 'inativo';
    else if (user.senha) status = 'ativo';
    else if (!inviteExpiresAt) status = 'sem_senha';
    else status = inviteExpiresAt.getTime() >= Date.now() ? 'pendente' : 'expirado';

    let cpfMasked: string | null = null;
    if (info.cpf) {
      try {
        cpfMasked = maskCpf(info.cpf);
      } catch {
        cpfMasked = '***';
      }
    }
    const scope = scopeOf(info);
    return {
      id: user.id,
      nome: user.nome,
      login: info.noLogin,
      email: user.email,
      coCnes: info.coCnes,
      origem: info.importadoEm ? 'tb_usuario' : 'oncodash',
      telefone: info.telefone,
      cargo: info.cargo,
      cpfMasked,
      profile: permission?.profile ?? null,
      canEdit: permission?.canEdit ?? false,
      canAdd: permission?.canAdd ?? false,
      scope,
      scopeLabel: describeScope(scope),
      status,
      createdAt: info.dtCriacao.toISOString(),
      invitedByNome: info.coUsuarioCriacao ? (creators.get(info.coUsuarioCriacao) ?? null) : null,
    };
  }
}
