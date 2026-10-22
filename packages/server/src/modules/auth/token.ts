import { createHash, randomBytes } from 'node:crypto';

/** 256-bit random token; only the client cookie holds it. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** session.id is the SHA-256 of the token (ADR-006), so a DB leak yields no usable cookies. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
