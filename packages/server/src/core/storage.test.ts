import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { assertStorageKey, LocalDiskStorage } from './storage';

let root: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'drinks-storage-'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('LocalDiskStorage', () => {
  it('puts, replaces, gets and deletes an object under nested folders', async () => {
    const storage = new LocalDiskStorage(root);
    const key = 'products/abc-1/v1.webp';

    await storage.put(key, new Uint8Array([1, 2, 3]));
    await storage.put(key, new Uint8Array([4, 5]));
    expect(await storage.get(key)).toEqual(new Uint8Array([4, 5]));
    // No temp files left behind.
    expect(await readdir(path.join(root, 'products', 'abc-1'))).toEqual(['v1.webp']);

    await storage.delete(key);
    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
  });

  it('rejects keys that could leave the root', async () => {
    for (const key of [
      '../x.webp',
      '/etc/passwd',
      'a/../b.webp',
      'a//b.webp',
      'A/b.webp',
      'noext',
    ]) {
      expect(() => assertStorageKey(key), key).toThrow(RangeError);
    }
    await expect(new LocalDiskStorage(root).get('../secret.txt')).rejects.toThrow(RangeError);
  });
});
