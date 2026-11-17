import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { ADMIN_PROFILES } from '../auth/profiles.js';
import { clientIp, deviceFingerprint } from '../common/http/client-info.js';
import { AuditService } from './audit.service.js';
import { AuditQueryDto } from './dto/audit-query.dto.js';
import { RegisterExportDto } from './dto/register-export.dto.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Roles(...ADMIN_PROFILES)
  @Get('logins')
  logins(@Query() q: AuditQueryDto) {
    return this.audit.loginsPage(q);
  }

  @Roles(...ADMIN_PROFILES)
  @Get('exports')
  exports(@Query() q: AuditQueryDto) {
    return this.audit.exportsPage(q);
  }

  @Roles(...ADMIN_PROFILES)
  @Get('users')
  users(@Query() q: AuditQueryDto) {
    return this.audit.userChangesPage(q);
  }

  /** Qualquer usuário logado registra as próprias exportações. */
  @Post('exports')
  register(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterExportDto, @Req() req: Request) {
    return this.audit.registerExport(dto, { user, ip: clientIp(req), fingerprint: deviceFingerprint(req) });
  }
}
