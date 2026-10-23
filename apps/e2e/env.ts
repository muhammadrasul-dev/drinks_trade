// E2E environment (architecture §10): a dedicated database, a fixed port and
// the seed OWNER's credentials. Everything is explicit here, so a run never
// picks up the developer's repo-root .env (its DATABASE_URL is the dev DB).
import path from 'node:path';

export const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
export const E2E_DIR = import.meta.dirname;

export const PORT = Number(process.env.E2E_PORT ?? 3911);
export const BASE_URL = `http://localhost:${PORT}`;

export const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgresql://drinks:drinks@localhost:5433/drinks_trade_e2e';

/** The seeded OWNER (packages/db/prisma/seed.ts reads SEED_OWNER_*). */
export const OWNER = {
  username: process.env.E2E_OWNER_USERNAME ?? 'owner',
  password: process.env.E2E_OWNER_PASSWORD ?? 'e2e-owner-password',
  fullName: 'Egasi',
};

/** STAFF accounts the setup project creates through the Users page. */
export const STAFF = {
  username: 'e2e-staff',
  password: 'e2e-staff-password',
  fullName: 'E2E Xodim',
};
export const LOCALE_USER = {
  username: 'e2e-lang',
  password: 'e2e-lang-password',
  fullName: 'E2E Til',
};

/** Signed-in browser states written by tests/auth.setup.ts. */
export const STORAGE_STATE = {
  owner: path.join(E2E_DIR, '.auth/owner.json'),
  staff: path.join(E2E_DIR, '.auth/staff.json'),
};

/** Variables the web server and the seed need (the list in .env.example). */
export function serverEnv(): Record<string, string> {
  return {
    DATABASE_URL,
    SESSION_SECRET: 'e2e-session-secret',
    APP_TIMEZONE: 'Asia/Tashkent',
    UPLOAD_DIR: path.join(E2E_DIR, 'storage/uploads'),
    SEED_OWNER_USERNAME: OWNER.username,
    SEED_OWNER_PASSWORD: OWNER.password,
    NEXT_TELEMETRY_DISABLED: '1',
  };
}
