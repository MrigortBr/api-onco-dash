import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { latestPermissionsByUserId } from '../auth/permissions.js';
import type { UserProfile } from '../auth/profiles.js';
import { describeScope, scopeOf } from '../auth/scope.js';
import { ExportLog } from '../database/entities/export-log.entity.js';
import { UserAudit } from '../database/entities/user-audit.entity.js';
import { UserLogin } from '../database/entities/user-login.entity.js';
import { UserPermission } from '../database/entities/user-permission.entity.js';
import type { AuditQueryDto } from './dto/audit-query.dto.js';
import type { RegisterExportDto } from './dto/register-export.dto.js';

const DEFAULT_LIMIT = 50;

export interface Page<T> {
  items: T[];
  total: number;
}

export interface LoginAuditItem {
  id: number;
  userId: number;
  nome: string;
  email: string | null;
  profile: UserProfile | null;
  scopeLabel: string | null;
  createdAt: string;
  expiresAt: string;
  status: 'ativa' | 'encerrada';
  ip: string | null;
  userAgent: string | null;
  latitude: number | null;
  longitude: number | null;
  suspeito: boolean;
  motivosSuspeita: string[];
  distanciaKm: number | null;
}

export interface ExportAuditItem {
  exportId: string;
  createdAt: string;
  usuario: { id: number; nome: string; email: string | null } | null;
  pagina: string;
  arquivo: string;
  formato: string;
  abas: { nome: string; linhas: number }[];
  totalLinhas: number;
  ip: string | null;
}

export interface UserAuditItem {
  id: number;
  createdAt: string;
  acao: string;
  ator: { id: number; nome: string; email: string | null } | null;
  alvo: { id: number; nome: string; email: string | null } | null;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  ip: string | null;
}

/**
 * Telas de auditoria (Desenvolvedor e Gestor federal): logins, exportações
 * e alterações de usuário. Mesmo formato do SIMDASH, sem recorte por UF
 * porque só os perfis nacionais acessam.
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(UserLogin) private readonly logins: Repository<UserLogin>,
    @InjectRepository(UserPermission) private readonly permissions: Repository<UserPermission>,
    @InjectRepository(ExportLog) private readonly exports: Repository<ExportLog>,
    @InjectRepository(UserAudit) private readonly userAudit: Repository<UserAudit>,
  ) {}

  async loginsPage(q: AuditQueryDto): Promise<Page<LoginAuditItem>> {
    const qb = this.logins
      .createQueryBuilder('login')
      .innerJoinAndSelect('login.user', 'user')
      .leftJoinAndSelect('user.info', 'info')
      .orderBy('login.createdAt', 'DESC')
      .skip(q.offset ?? 0)
      .take(q.limit ?? DEFAULT_LIMIT);
    if (q.search?.trim()) {
      qb.andWhere('(user.nome ILIKE :s OR user.email ILIKE :s OR info.no_login ILIKE :s OR login.ip ILIKE :s)', { s: `%${q.search.trim()}%` });
    }
    if (q.suspeito) qb.andWhere('login.suspeito = true');

    const [rows, total] = await qb.getManyAndCount();
    const perms = await latestPermissionsByUserId(this.permissions, [...new Set(rows.map((r) => r.idUsers))]);
    const now = Date.now();
    return {
      total,
      items: rows.map((r) => ({
        id: r.id,
        userId: r.idUsers,
        nome: r.user!.nome,
        email: r.user!.email,
        profile: perms.get(r.idUsers)?.profile ?? null,
        scopeLabel: describeScope(scopeOf(r.user!.info)),
        createdAt: r.createdAt.toISOString(),
        expiresAt: r.expiresAt.toISOString(),
        status: r.expiresAt.getTime() > now ? 'ativa' : 'encerrada',
        ip: r.ip,
        userAgent: r.userAgent,
        latitude: r.latitude,
        longitude: r.longitude,
        suspeito: r.suspeito,
        motivosSuspeita: r.motivosSuspeita ? r.motivosSuspeita.split(' · ') : [],
        distanciaKm: r.distanciaKm === null ? null : Math.round(r.distanciaKm),
      })),
    };
  }

  async exportsPage(q: AuditQueryDto): Promise<Page<ExportAuditItem>> {
    const qb = this.exports
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.user', 'user')
      .orderBy('e.createdAt', 'DESC')
      .skip(q.offset ?? 0)
      .take(q.limit ?? DEFAULT_LIMIT);
    if (q.search?.trim()) {
      qb.andWhere('(user.nome ILIKE :s OR user.email ILIKE :s OR e.pagina ILIKE :s OR e.arquivo ILIKE :s)', {
        s: `%${q.search.trim()}%`,
      });
    }
    const [rows, total] = await qb.getManyAndCount();
    return {
      total,
      items: rows.map((e) => ({
        exportId: e.exportId,
        createdAt: e.createdAt.toISOString(),
        usuario: e.user ? { id: e.user.id, nome: e.user.nome, email: e.user.email } : null,
        pagina: e.pagina,
        arquivo: e.arquivo,
        formato: e.formato,
        abas: e.abas,
        totalLinhas: e.totalLinhas,
        ip: e.ip,
      })),
    };
  }

  async userChangesPage(q: AuditQueryDto): Promise<Page<UserAuditItem>> {
    const qb = this.userAudit
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.actor', 'actor')
      .leftJoinAndSelect('a.target', 'target')
      .orderBy('a.createdAt', 'DESC')
      .skip(q.offset ?? 0)
      .take(q.limit ?? DEFAULT_LIMIT);
    if (q.search?.trim()) {
      qb.andWhere(
        '(actor.nome ILIKE :s OR actor.email ILIKE :s OR target.nome ILIKE :s OR target.email ILIKE :s OR a.acao ILIKE :s)',
        { s: `%${q.search.trim()}%` },
      );
    }
    const [rows, total] = await qb.getManyAndCount();
    const who = (u?: { id: number; nome: string; email: string | null } | null) =>
      u ? { id: u.id, nome: u.nome, email: u.email } : null;
    return {
      total,
      items: rows.map((a) => ({
        id: a.id,
        createdAt: a.createdAt.toISOString(),
        acao: a.acao,
        ator: who(a.actor),
        alvo: who(a.target),
        antes: a.antes,
        depois: a.depois,
        ip: a.ip,
      })),
    };
  }

  /** Registra uma exportação feita no painel; devolve o id para o front gravar no arquivo. */
  async registerExport(
    dto: RegisterExportDto,
    ctx: { user: AuthenticatedUser; ip: string | null; fingerprint: string | null },
  ): Promise<{ exportId: string; geradoEm: string }> {
    const session = await this.logins.findOne({ where: { id: ctx.user.sid } });
    const abas = dto.abas ?? [];
    const log = await this.exports.save(
      this.exports.create({
        exportId: randomUUID(),
        idUsers: ctx.user.id,
        idUsersLogin: ctx.user.sid,
        fingerprint: ctx.fingerprint,
        ip: ctx.ip,
        latitude: session?.latitude ?? null,
        longitude: session?.longitude ?? null,
        pagina: dto.pagina,
        arquivo: dto.arquivo,
        formato: dto.formato,
        abas,
        totalLinhas: abas.reduce((sum, a) => sum + a.linhas, 0),
      }),
    );
    return { exportId: log.exportId, geradoEm: log.createdAt.toISOString() };
  }
}
