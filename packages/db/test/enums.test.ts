// shared/enums.ts is a hand-written, Prisma-free copy of the schema enums
// (ADR-003). This test keeps the two in sync in both directions.
import * as sharedEnums from '@drinks/shared/enums';
import { describe, expect, it } from 'vitest';

import * as prismaEnums from '../src/generated/prisma/enums';

const shared = sharedEnums as unknown as Record<string, Record<string, string>>;
const prisma = prismaEnums as unknown as Record<string, Record<string, string>>;

describe('shared enums match Prisma enums', () => {
  it('declares the same enum names', () => {
    expect(Object.keys(shared).sort()).toEqual(Object.keys(prisma).sort());
    expect(Object.keys(prisma)).toHaveLength(13);
  });

  it.each(Object.keys(prisma))('%s has identical members', (name) => {
    expect(shared[name]).toEqual(prisma[name]);
  });
});
