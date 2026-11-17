import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { clientIp, clientUserAgent } from '../common/http/client-info.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { clearSessionCookie, setSessionCookie } from './session-cookie.js';

/** 5 tentativas por minuto por IP nas rotas públicas sensíveis. */
const SENSITIVE_LIMIT = { default: { limit: 5, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle(SENSITIVE_LIMIT)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.authService.login(dto, { ip: clientIp(req), userAgent: clientUserAgent(req) });
    setSessionCookie(res, token);
    return { user };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() user: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(user.sid);
    clearSessionCookie(res);
  }

  @Throttle(SENSITIVE_LIMIT)
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    await this.authService.forgotPassword(dto.login, clientIp(req));
    return { message: 'Se a conta existir e tiver e-mail cadastrado, enviaremos para ele um link para criar uma nova senha.' };
  }

  @Throttle(SENSITIVE_LIMIT)
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.resetPassword(dto.token, dto.senha, clientIp(req));
    clearSessionCookie(res);
    return { message: 'Senha alterada. Entre com a nova senha.' };
  }
}
