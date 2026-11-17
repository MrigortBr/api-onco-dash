import type { CookieOptions, Request, Response } from 'express';

/**
 * Cookie da sessão (decisão de 13/11/2026: token em cookie httpOnly, não no
 * localStorage como no SIMDASH). O JavaScript da página não consegue ler o
 * token; o navegador o envia sozinho nas chamadas a /api/* (mesmo endereço do
 * front, via repasse do Next.js).
 */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function sessionCookieName(): string {
  return process.env.COOKIE_NAME || 'oncodash_session';
}

function cookieOptions(): CookieOptions {
  const secureEnv = process.env.COOKIE_SECURE;
  const secure = secureEnv ? ['1', 'true', 'yes'].includes(secureEnv.toLowerCase()) : process.env.NODE_ENV === 'production';
  return { httpOnly: true, secure, sameSite: 'lax', path: '/' };
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(sessionCookieName(), token, { ...cookieOptions(), maxAge: SESSION_TTL_MS });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(sessionCookieName(), cookieOptions());
}

export function readSessionCookie(req: Request): string | null {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  const value = cookies?.[sessionCookieName()];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
