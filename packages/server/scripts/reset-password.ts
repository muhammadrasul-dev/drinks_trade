// `pnpm user:reset-password <login>` (T-205, business-logic §11): the server
// admin sets a new password, e.g. when the OWNER has forgotten theirs. This
// file only does terminal I/O; the reset itself is users.resetPassword.
// The password is read without echo (twice) and is never printed or logged.
// Without a TTY (piped stdin) the first two lines are the password and its repeat.
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { ErrorCode, isDomainError } from '@drinks/shared';
import { config } from 'dotenv';

// Not '../src' (index.ts): its 'server-only' marker throws outside a React Server bundle.
import { users } from '../src/modules/users';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const USAGE = 'Usage: pnpm user:reset-password <login>';

class CancelledError extends Error {}

/** One line from a TTY in raw mode, echoing nothing. Ctrl+C / Ctrl+D cancel. */
function readHidden(prompt: string): Promise<string> {
  const { stdin, stdout } = process;
  stdout.write(prompt);
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error?: Error) => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u0003' || char === '\u0004') return finish(new CancelledError());
        if (char === '\u007f' || char === '\b') value = Array.from(value).slice(0, -1).join('');
        else if (char >= ' ') value += char;
      }
    };
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

/** The first two lines of piped stdin. */
async function readPipedPasswords(): Promise<[string, string]> {
  const lines: string[] = [];
  const rl = createInterface({ input: process.stdin, terminal: false });
  for await (const line of rl) {
    lines.push(line);
    if (lines.length === 2) break;
  }
  rl.close();
  if (lines.length < 2) throw new Error('Expected the password and its repeat on two stdin lines');
  return [lines[0]!, lines[1]!];
}

async function readPasswords(username: string): Promise<[string, string]> {
  if (!process.stdin.isTTY) return readPipedPasswords();
  const first = await readHidden(`New password for "${username}": `);
  const second = await readHidden('Repeat the new password: ');
  return [first, second];
}

function describeError(error: unknown, username: string): string {
  if (error instanceof CancelledError) return 'Cancelled; nothing changed.';
  if (isDomainError(error)) {
    if (error.code === ErrorCode.NOT_FOUND) return `User "${username}" not found.`;
    if (error.code === ErrorCode.VALIDATION_FAILED) {
      const fields = Object.entries(error.fieldErrors ?? {})
        .map(([field, messages]) => `${field}: ${messages.join('; ')}`)
        .join('\n  ');
      return `Invalid input:\n  ${fields}`;
    }
    return error.code;
  }
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0]!.startsWith('-')) {
    console.error(USAGE);
    return 2;
  }
  const username = args[0]!;

  const [password, repeat] = await readPasswords(username);
  if (password !== repeat) {
    console.error('The passwords do not match; nothing changed.');
    return 1;
  }

  const result = await users.resetPassword(
    { username, password },
    { requestId: `cli-${randomUUID()}`, source: 'cli' },
  );
  console.log(
    `Password reset for "${result.username}" (${result.role}). ` +
      `Sessions revoked: ${result.sessionsRevoked}, login attempts cleared: ${result.attemptsCleared}.`,
  );
  if (!result.isActive) {
    console.warn('Note: this account is inactive and stays inactive; the OWNER can reactivate it.');
  }
  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(describeError(error, process.argv[2] ?? ''));
  process.exitCode = 1;
} finally {
  // Close the pool so the process can exit (no client without DATABASE_URL).
  if (process.env.DATABASE_URL) {
    const { prisma } = await import('@drinks/db');
    await prisma.$disconnect();
  }
}
