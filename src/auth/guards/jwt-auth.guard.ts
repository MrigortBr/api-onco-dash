import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Exige sessão válida (cookie + dispositivo). Ver jwt.strategy.ts. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
