import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const PREFIX = 'enc:v1:';

export function loadOrCreateKey(keyFile: string): Buffer {
  if (existsSync(keyFile)) {
    const raw = readFileSync(keyFile);
    if (raw.length === 32) return raw;
  }
  mkdirSync(dirname(keyFile), { recursive: true });
  const key = randomBytes(32);
  writeFileSync(keyFile, key, { mode: 0o600 });
  return key;
}

/** At-rest encryption for optional provider credentials. Keys never appear in API responses. */
export function encryptSecret(value: string, key: Buffer): string {
  if (!value) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(value: string, key: Buffer): string {
  if (!value) return '';
  if (!value.startsWith(PREFIX)) return '';
  try {
    const [ivText, tagText, dataText] = value.slice(PREFIX.length).split(':');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataText, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}
