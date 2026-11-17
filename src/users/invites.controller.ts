import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { clientIp } from '../common/http/client-info.js';
import { AcceptInviteDto } from './dto/accept-invite.dto.js';
import { UsersService } from './users.service.js';

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

/** Rotas públicas do convite (o token do link é a credencial). */
@Controller('invites')
export class InvitesController {
  constructor(private readonly usersService: UsersService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(':token')
  get(@Param('token') token: string) {
    return this.usersService.getInvite(TOKEN_PATTERN.test(token) ? token : '0'.repeat(64));
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(':token/accept')
  @HttpCode(HttpStatus.OK)
  accept(@Param('token') token: string, @Body() dto: AcceptInviteDto, @Req() req: Request) {
    return this.usersService.acceptInvite(TOKEN_PATTERN.test(token) ? token : '0'.repeat(64), dto, clientIp(req));
  }
}
