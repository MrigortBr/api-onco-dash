import type { Request } from 'express';

/** Header com o id do dispositivo/navegador (ver front: lib/auth/fingerprint.ts). */
export const DEVICE_FINGERPRINT_HEADER = 'x-device-fingerprint';

/**
 * IP real do cliente. Com `trust proxy` ligado (main.ts), o Express já resolve
 * `req.ip` a partir do X-Forwarded-For do proxy confiável (Railway) — não lemos
 * o header na mão para não aceitar um IP forjado pelo próprio cliente.
 */
export function clientIp(req: Request): string | null {
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

export function clientUserAgent(req: Request): string | null {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, 400) : null;
}

export function deviceFingerprint(req: Request): string | null {
  const raw = req.headers[DEVICE_FINGERPRINT_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && value.length >= 8 && value.length <= 128 ? value : null;
}
