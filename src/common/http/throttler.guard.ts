import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Limite de tentativas contado por IP + login (CPF ou e-mail, quando a requisição
 * traz um, como login e "esqueci minha senha"). Só por IP, uma pessoa errando
 * a senha bloquearia todos os colegas que saem pelo mesmo IP da rede do órgão.
 */
@Injectable()
export class OncoThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const ip = (req.ip as string | undefined) ?? 'sem-ip';
    const body = req.body as { login?: unknown; email?: unknown } | undefined;
    const raw = typeof body?.login === 'string' ? body.login : typeof body?.email === 'string' ? body.email : '';
    // CPF com ou sem máscara conta como o mesmo login.
    const login = /^[\d.\-\s]+$/.test(raw) ? raw.replace(/\D/g, '') : raw.trim().toLowerCase();
    return login ? `${ip}|${login}` : ip;
  }
}
