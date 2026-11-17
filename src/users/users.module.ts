import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module.js';
import { UserCode } from '../database/entities/user-code.entity.js';
import { UserPermission } from '../database/entities/user-permission.entity.js';
import { User } from '../database/entities/user.entity.js';
import { InvitesController } from './invites.controller.js';
import { TerritorioService } from './territorio.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserPermission, UserCode]), AuditModule],
  controllers: [UsersController, InvitesController],
  providers: [UsersService, TerritorioService],
})
export class UsersModule {}
