import { Controller, Get, HttpCode, HttpStatus, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { ADMIN_PROFILES } from '../auth/profiles.js';
import { SyncService } from './sync.service.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  /** Data da última atualização (rodapé) — qualquer usuário logado. */
  @Get('last-update')
  async lastUpdate(): Promise<{ updatedAt: string | null }> {
    const { updatedAt } = await this.syncService.getStatus();
    return { updatedAt };
  }

  @Roles(...ADMIN_PROFILES)
  @Get('status')
  status() {
    return this.syncService.getStatus();
  }

  @Roles(...ADMIN_PROFILES)
  @Get('history')
  history(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.syncService.history({ limit: Number(limit) || undefined, offset: Number(offset) || undefined });
  }

  @Roles(...ADMIN_PROFILES)
  @Post('run')
  @HttpCode(HttpStatus.OK)
  run(@CurrentUser() user: AuthenticatedUser) {
    return this.syncService.run(undefined, user.id);
  }

  /** Mesma execução de POST /sync/run, com o andamento em tempo real (Server-Sent Events). */
  @Roles(...ADMIN_PROFILES)
  @Get('stream')
  async stream(@CurrentUser() user: AuthenticatedUser, @Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (msg: string, done = false, success = false) => {
      res.write(`data: ${JSON.stringify({ msg, done, success })}\n\n`);
    };
    try {
      const result = await this.syncService.run((msg) => send(msg), user.id);
      send('', true, result.success);
    } catch (err) {
      send(`[ERRO] ${err instanceof Error ? err.message : String(err)}`);
      send('', true, false);
    } finally {
      res.end();
    }
  }
}
