import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

/** Verificação de saúde (Railway / monitoramento). */
@SkipThrottle()
@Controller()
export class AppController {
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
