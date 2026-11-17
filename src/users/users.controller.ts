import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { ADMIN_PROFILES, INVITER_PROFILES } from '../auth/profiles.js';
import { clientIp } from '../common/http/client-info.js';
import { CreateInviteDto } from './dto/create-invite.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UsersService } from './users.service.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(...INVITER_PROFILES)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('search') search?: string) {
    return this.usersService.list(user, search);
  }

  @Roles(...INVITER_PROFILES)
  @Get('invite-options')
  inviteOptions(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.inviteOptions(user);
  }

  @Roles(...INVITER_PROFILES)
  @Post('invites')
  createInvite(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateInviteDto, @Req() req: Request) {
    return this.usersService.createInvite(user, dto, clientIp(req));
  }

  @Roles(...INVITER_PROFILES)
  @Post(':id/resend-invite')
  resendInvite(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.usersService.resendInvite(user, id, clientIp(req));
  }

  @Roles(...ADMIN_PROFILES)
  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.get(id);
  }

  @Roles(...ADMIN_PROFILES)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @Req() req: Request,
  ) {
    return this.usersService.update(user, id, dto, clientIp(req));
  }
}
