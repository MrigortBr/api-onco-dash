import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExportLog } from '../database/entities/export-log.entity.js';
import { UserAudit } from '../database/entities/user-audit.entity.js';
import { UserLogin } from '../database/entities/user-login.entity.js';
import { UserPermission } from '../database/entities/user-permission.entity.js';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';
import { UserAuditService } from './user-audit.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([UserLogin, UserPermission, ExportLog, UserAudit])],
  controllers: [AuditController],
  providers: [AuditService, UserAuditService],
  exports: [UserAuditService],
})
export class AuditModule {}
