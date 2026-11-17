import { createHash, randomBytes } from 'node:crypto';

/** Token aleatório de uso único (convite, recuperação de senha): 32 bytes em hex. */
export function newOneTimeToken(): string {
  return randomBytes(32).toString('hex');
}

/** Só o hash vai para o banco; o token em si só existe no link enviado. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
