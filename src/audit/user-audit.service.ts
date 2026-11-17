import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAudit, UserAuditAction } from '../database/entities/user-audit.entity.js';

export interface UserAuditEntry {
  actorId: number | null;
  targetId: number | null;
  acao: UserAuditAction;
  antes?: Record<string, unknown> | null;
  depois?: Record<string, unknown> | null;
  ip?: string | null;
}

/**
 * Registra alterações de usuário (convite, ativação, perfil, escopo, senha).
 * Nunca derruba a operação principal: se a gravação falhar, só registra no log.
 */
@Injectable()
export class UserAuditService {
  private readonly logger = new Logger(UserAuditService.name);

  constructor(
    @InjectRepository(UserAudit)
    private readonly repo: Repository<UserAudit>,
  ) {}

  async record(entry: UserAuditEntry): Promise<void> {
    try {
      await this.repo.save(
        this.repo.create({
          idUsersActor: entry.actorId,
          idUsersTarget: entry.targetId,
          acao: entry.acao,
          antes: entry.antes ?? null,
          depois: entry.depois ?? null,
          ip: entry.ip ?? null,
        }),
      );
    } catch (err) {
      this.logger.error(`Falha ao gravar auditoria (${entry.acao})`, err as Error);
    }
  }
}
