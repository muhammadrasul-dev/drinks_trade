// File storage behind one interface (architecture §9): v1 writes to the local
// disk (UPLOAD_DIR, a Docker volume in production); S3/MinIO can replace
// LocalDiskStorage later without touching the services.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface StorageAdapter {
  /** Writes (or replaces) the object atomically. */
  put(key: string, data: Uint8Array): Promise<void>;
  /** null when the object does not exist. */
  get(key: string): Promise<Uint8Array | null>;
  /** Removing a missing object is not an error. */
  delete(key: string): Promise<void>;
}

/** `products/<uuid>/<uuid>.webp`-style keys: lower-case segments, no `..`, no leading slash. */
const KEY_PATTERN = /^[a-z0-9-]+(\/[a-z0-9-]+)*\.[a-z0-9]+$/;

export function assertStorageKey(key: string): void {
  if (!KEY_PATTERN.test(key)) throw new RangeError(`Invalid storage key: ${key}`);
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

export class LocalDiskStorage implements StorageAdapter {
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private file(key: string): string {
    assertStorageKey(key);
    return path.join(this.root, ...key.split('/'));
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const file = this.file(key);
    await mkdir(path.dirname(file), { recursive: true });
    // Write next to the target, then rename: readers never see a half-written file.
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, data);
      await rename(temp, file);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.file(key)));
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.file(key), { force: true });
  }
}

/** Default UPLOAD_DIR (architecture §8.2); a relative path resolves against the process cwd. */
export const DEFAULT_UPLOAD_DIR = './storage/uploads';

/** The configured storage; UPLOAD_DIR is read on every call, so tests can point it elsewhere. */
export function getStorage(): StorageAdapter {
  return new LocalDiskStorage(process.env.UPLOAD_DIR || DEFAULT_UPLOAD_DIR);
}
