import { createHmac } from 'node:crypto';

/**
 * Código do paciente para contar pacientes únicos sem guardar quem é:
 * HMAC-SHA256 do CPF (ou, sem CPF, do CNS), com chave secreta — sem a chave
 * não dá para testar CPFs e descobrir de quem é o código.
 *
 * Chave: PACIENTE_HASH_KEY; se não existir, CPF_ENCRYPTION_KEY. Trocar a
 * chave muda todos os códigos (o próximo sync regrava a coluna inteira).
 */
export function pacienteHash(cpf: unknown, cns: unknown): string | null {
  const chave = process.env.PACIENTE_HASH_KEY || process.env.CPF_ENCRYPTION_KEY;
  if (!chave) throw new Error('Defina PACIENTE_HASH_KEY (ou CPF_ENCRYPTION_KEY) no .env.');

  const cpfDigitos = typeof cpf === 'string' ? cpf.replace(/\D/g, '') : '';
  const cnsDigitos = typeof cns === 'string' ? cns.replace(/\D/g, '') : '';
  const base = cpfDigitos.length === 11 ? `cpf:${cpfDigitos}` : cnsDigitos ? `cns:${cnsDigitos}` : null;
  return base ? createHmac('sha256', chave).update(base).digest('hex') : null;
}
