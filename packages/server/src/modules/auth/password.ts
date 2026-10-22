// argon2id password hashing (ADR-006). @node-rs/argon2 defaults to argon2id and
// writes a PHC string, the same format packages/db/prisma/seed.ts produces.
import { hash, verify } from '@node-rs/argon2';

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

/** False for a wrong password and for a malformed hash; never throws. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Hash to verify against when the username does not exist, so the response
 * time does not reveal which logins exist (business-logic §11).
 */
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('dummy-password-for-constant-time-login');
  return dummyHash;
}
