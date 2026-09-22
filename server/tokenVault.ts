import crypto from 'node:crypto';

const PREFIX = 'enc:v1:';

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('TOKEN_ENCRYPTION_KEY is required to store Instagram access tokens securely.');
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a 64-character hexadecimal AES-256 key.');
  }
  return key;
}

export function encryptSecret(value: string): string {
  if (!value) return '';
  if (value.startsWith(PREFIX)) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, encrypted].map(part => part.toString('base64url')).join('.');
}

export function decryptSecret(value: string): string {
  if (!value) return '';
  if (!value.startsWith(PREFIX)) return value; // legacy plaintext; callers should migrate it on write
  const [, payload] = value.split(PREFIX);
  const [ivB64, tagB64, encryptedB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !encryptedB64) throw new Error('Invalid encrypted secret format.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedB64, 'base64url')), decipher.final()]).toString('utf8');
}
