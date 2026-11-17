import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Criptografia reversível do CPF (AES-256-GCM), conforme exigido pelo
 * comentário da própria entidade `User.cpf`: a coluna guarda só o valor já
 * cifrado, e a chave nunca vive no banco — ela vem de `CPF_ENCRYPTION_KEY`
 * (variável de ambiente), gerada com:
 *
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Formato armazenado: "<iv>.<authTag>.<ciphertext>", cada parte em base64,
 * separadas por ".". Isso cabe tranquilamente na coluna varchar existente.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // recomendado para GCM

function resolveKey(): Buffer {
  const raw = process.env.CPF_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'CPF_ENCRYPTION_KEY não configurada — defina uma chave de 32 bytes (hex de 64 caracteres) no .env.',
    );
  }

  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');

  if (key.length !== 32) {
    throw new Error(
      'CPF_ENCRYPTION_KEY inválida — precisa resultar em exatamente 32 bytes (AES-256). Gere com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }

  return key;
}

export function encryptCpf(cpfPlain: string): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, resolveKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(cpfPlain, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, encrypted].map((buf) => buf.toString('base64')).join('.');
}

/**
 * Máscara de exibição do CPF — "gestores veem apenas os 3 últimos dígitos
 * do CPF" (context.md, seção "Dados sensíveis (CPF)"). Decifra internamente
 * só pra extrair os 3 últimos dígitos; a API nunca deve devolver o CPF
 * decifrado por completo pra exibição em tela — só esta máscara.
 */
export function maskCpf(cpfEncrypted: string): string {
  const digits = decryptCpf(cpfEncrypted).replace(/\D/g, '').padStart(11, '0');
  const last3 = digits.slice(-3);
  return `***.***.**${last3[0]}-${last3.slice(1)}`;
}

export function decryptCpf(cpfEncrypted: string): string {
  const parts = cpfEncrypted.split('.');
  if (parts.length !== 3) {
    throw new Error('Valor de CPF cifrado em formato inesperado.');
  }
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, resolveKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);

  return decrypted.toString('utf8');
}
