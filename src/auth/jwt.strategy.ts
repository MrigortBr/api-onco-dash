import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { deviceFingerprint } from '../common/http/client-info.js';
import { UserLogin } from '../database/entities/user-login.entity.js';
import { UserPermission } from '../database/entities/user-permission.entity.js';
import type { AuthenticatedUser, JwtPayload } from './authenticated-user.js';
import { MOTIVO_TOKEN_OUTRO_DISPOSITIVO, SEPARADOR_MOTIVOS } from './login-risk.js';
import { contaAtiva } from './login-lookup.js';
import { latestPermission } from './permissions.js';
import { scopeOf } from './scope.js';
import { readSessionCookie } from './session-cookie.js';

/**
 * Valida cada requisição autenticada (mesma lógica do SIMDASH, lendo o token
 * do cookie em vez do header Authorization):
 *  1. assinatura e validade do JWT;
 *  2. a sessão (`sid`) existe, é do mesmo usuário e não foi encerrada;
 *  3. o header X-Device-Fingerprint é o mesmo do login — senão a sessão é
 *     marcada como suspeita e a requisição recusada.
 * Perfil e escopo são lidos do banco aqui, não do token.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(UserLogin)
    private readonly userLoginRepository: Repository<UserLogin>,
    @InjectRepository(UserPermission)
    private readonly userPermissionRepository: Repository<UserPermission>,
  ) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET não configurada — defina no .env.');
    }
    super({
      jwtFromRequest: (req: Request) => readSessionCookie(req),
      ignoreExpiration: false,
      secretOrKey: secret,
      algorithms: ['HS256'],
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload?.sub || !payload.sid) {
      throw new UnauthorizedException();
    }

    const session = await this.userLoginRepository.findOne({
      where: { id: payload.sid },
      relations: { user: { info: true } },
    });
    // Conta desativada ou excluída (st_registro_ativo / dt_exclusao) derruba a sessão na hora.
    const isValid =
      session?.user &&
      session.idUsers === payload.sub &&
      session.expiresAt.getTime() > Date.now() &&
      contaAtiva(session.user.info);
    if (!session || !isValid || !session.user) {
      throw new UnauthorizedException('Sessão expirada ou encerrada. Faça login novamente.');
    }

    const fingerprint = deviceFingerprint(req);
    if (!fingerprint || fingerprint !== session.fingerprint) {
      const motivos = session.motivosSuspeita ? session.motivosSuspeita.split(SEPARADOR_MOTIVOS) : [];
      if (!motivos.includes(MOTIVO_TOKEN_OUTRO_DISPOSITIVO)) {
        motivos.push(MOTIVO_TOKEN_OUTRO_DISPOSITIVO);
        await this.userLoginRepository.update(session.id, {
          suspeito: true,
          motivosSuspeita: motivos.join(SEPARADOR_MOTIVOS).slice(0, 500),
        });
      }
      throw new UnauthorizedException('Sessão vinculada a outro dispositivo. Faça login novamente.');
    }

    const permission = await latestPermission(this.userPermissionRepository, session.idUsers);
    const user = session.user;
    return {
      id: user.id,
      sid: session.id,
      login: user.info?.noLogin ?? null,
      email: user.email,
      nome: user.nome,
      profile: permission?.profile ?? null,
      canAdd: permission?.canAdd ?? false,
      canEdit: permission?.canEdit ?? false,
      scope: scopeOf(user.info),
    };
  }
}
