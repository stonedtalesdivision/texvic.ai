import crypto from 'node:crypto';

const PREFIX = 'enc:v1:';

let memoryFallbackKey: Buffer | null = null;

function getKey(): Buffer {
  const raw = (process.env.TOKEN_ENCRYPTION_KEY || '').trim();
  if (raw && /^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  if (raw) {
    // If user provided a passphrase/string instead of exact 64-char hex, derive a 32-byte AES key via SHA-256
    return crypto.createHash('sha256').update(raw).digest();
  }

  // If missing entirely, derive a deterministic 32-byte AES key so the server stays 100% online
  if (!memoryFallbackKey) {
    const seed = process.env.TEXVIC_OWNER_PASSWORD_HASH || process.env.TEXVIC_OWNER_PASSWORD || 'texvic-vault-default-key-seed';
    memoryFallbackKey = crypto.createHash('sha256').update(seed).digest();
    console.warn('[Token Vault] ⚠️ TOKEN_ENCRYPTION_KEY was missing in .env. Auto-derived 256-bit AES key so server boots safely.');
  }

  return memoryFallbackKey;
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
