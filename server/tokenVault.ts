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
  try {
    const payload = value.slice(PREFIX.length);
    const parts = payload.split('.');
    if (parts.length !== 3) throw new Error('Invalid encrypted secret format.');
    const [ivB64, tagB64, encryptedB64] = parts;
    const ivBuffer = Buffer.from(ivB64, 'base64url');
    const tagBuffer = Buffer.from(tagB64, 'base64url');
    const encBuffer = Buffer.from(encryptedB64, 'base64url');

    if (ivBuffer.length !== 12 || tagBuffer.length !== 16) {
      throw new Error('Invalid IV or auth tag length in encrypted secret.');
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), ivBuffer);
    decipher.setAuthTag(tagBuffer);
    return Buffer.concat([decipher.update(encBuffer), decipher.final()]).toString('utf8');
  } catch (err: any) {
    console.error('[Token Vault] Decryption error:', err?.message || err);
    throw new Error('Failed to decrypt secret.');
  }
}
