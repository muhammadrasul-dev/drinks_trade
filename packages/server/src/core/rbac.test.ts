import { DomainError, ErrorCode, UserRole } from '@drinks/shared';
import { describe, expect, it } from 'vitest';

// Imported through the entry point to prove 'server-only' resolves under Vitest.
import { assertCan } from '../index';

describe('assertCan', () => {
  it('lets OWNER read cash', () => {
    expect(() => assertCan({ role: UserRole.OWNER }, 'cash.read')).not.toThrow();
  });

  it('throws FORBIDDEN for STAFF on cash.read', () => {
    const call = () => assertCan({ role: UserRole.STAFF }, 'cash.read');

    expect(call).toThrow(DomainError);
    expect(call).toThrow(
      expect.objectContaining({ code: ErrorCode.FORBIDDEN, params: { permission: 'cash.read' } }),
    );
  });
});
