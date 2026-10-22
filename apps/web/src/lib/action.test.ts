import { DomainError, ErrorCode, UserRole } from '@drinks/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { action, publicAction, toActionError } from './action';
import { getCurrentSession } from './session';

vi.mock('@drinks/server', () => ({
  auth: {
    toServiceContext: (session: { user: { id: string } }, requestId: string) => ({
      userId: session.user.id,
      requestId,
    }),
  },
}));

const META = { ip: '127.0.0.1', userAgent: 'vitest', requestId: 'req-1' };
vi.mock('./session', () => ({
  getCurrentSession: vi.fn(),
  getRequestMeta: vi.fn(async () => META),
}));

const SESSION = {
  user: { id: 'u1', username: 'ali', fullName: 'Ali', role: UserRole.STAFF, locale: 'uz' },
  organizationId: 'o1',
  storeId: 's1',
  expiresAt: new Date('2026-11-21'),
} as const;

const schema = z.object({ name: z.string().trim().min(1) });

beforeEach(() => {
  vi.mocked(getCurrentSession).mockResolvedValue(SESSION);
});

describe('action()', () => {
  it('passes parsed input and a service context to the handler', async () => {
    const handler = vi.fn(async (input: { name: string }) => input.name.toUpperCase());

    const result = await action(schema, handler)({ name: '  cola ' });

    expect(result).toEqual({ ok: true, data: 'COLA' });
    expect(handler).toHaveBeenCalledWith(
      { name: 'cola' },
      { session: SESSION, ctx: { userId: 'u1', requestId: 'req-1' }, meta: META },
    );
  });

  it('no session → UNAUTHORIZED, handler not called', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);
    const handler = vi.fn();

    const result = await action(schema, handler)({ name: 'cola' });

    expect(result).toEqual({ ok: false, error: { code: ErrorCode.UNAUTHORIZED } });
    expect(handler).not.toHaveBeenCalled();
  });

  it('invalid input → VALIDATION_FAILED with field errors, handler not called', async () => {
    const handler = vi.fn();

    const result = await action(schema, handler)({ name: '   ' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(Object.keys(result.error.fieldErrors ?? {})).toEqual(['name']);
    expect(handler).not.toHaveBeenCalled();
  });

  it('DomainError from the service → ActionResult with code and params', async () => {
    const result = await action(schema, async () => {
      throw new DomainError(ErrorCode.INSUFFICIENT_STOCK, { available: 3 });
    })({ name: 'cola' });

    expect(result).toEqual({
      ok: false,
      error: { code: ErrorCode.INSUFFICIENT_STOCK, params: { available: 3 } },
    });
  });

  it('rethrows anything else (bugs, redirect(), forbidden())', async () => {
    const run = action(schema, async () => {
      throw new Error('NEXT_REDIRECT');
    });

    await expect(run({ name: 'cola' })).rejects.toThrow('NEXT_REDIRECT');
  });
});

describe('publicAction()', () => {
  it('runs without a session and passes the request meta', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);
    const handler = vi.fn(async () => 'ok');

    const result = await publicAction(schema, handler)({ name: 'x' });

    expect(result).toEqual({ ok: true, data: 'ok' });
    expect(handler).toHaveBeenCalledWith({ name: 'x' }, META);
  });

  it('still validates the input', async () => {
    const result = await publicAction(schema, vi.fn())({});

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.VALIDATION_FAILED);
  });
});

describe('toActionError()', () => {
  it('keeps only the fields that are set', () => {
    expect(toActionError(new DomainError(ErrorCode.NOT_FOUND))).toEqual({
      code: ErrorCode.NOT_FOUND,
    });
    expect(
      toActionError(new DomainError(ErrorCode.VALIDATION_FAILED, undefined, { name: ['bad'] })),
    ).toEqual({ code: ErrorCode.VALIDATION_FAILED, fieldErrors: { name: ['bad'] } });
  });
});
