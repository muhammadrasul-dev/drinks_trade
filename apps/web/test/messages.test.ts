// Every UI string exists in both languages (T-202), and the server↔UI contracts
// (error codes, enums) are fully translated (architecture §4.2, §7).
import type { Locale } from '@drinks/shared';
import { ErrorCode } from '@drinks/shared';
import * as enums from '@drinks/shared/enums';
import { describe, expect, it } from 'vitest';

import ru from '../messages/ru.json';
import uz from '../messages/uz.json';

type Tree = { [key: string]: string | Tree };
type EnumMap = Record<string, Record<string, string>>;

const catalogs: Record<Locale, Tree> = { uz, ru };

/** Flattens a catalog into [dotted.key, text] pairs. */
function leaves(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? [[path, value] as [string, string]] : leaves(value, path);
  });
}

const sortedKeys = (tree: Tree) =>
  leaves(tree)
    .map(([path]) => path)
    .sort();

describe('messages', () => {
  it('uz.json and ru.json have the identical key set', () => {
    expect(sortedKeys(catalogs.ru)).toEqual(sortedKeys(catalogs.uz));
  });

  it.each(Object.entries(catalogs))('%s has no empty strings', (_, tree) => {
    expect(leaves(tree).filter(([, text]) => text.trim() === '')).toEqual([]);
  });

  it('translates every ErrorCode under errors.*', () => {
    expect(Object.keys(uz.errors).sort()).toEqual(Object.values(ErrorCode).sort());
  });

  it('translates every shared enum member under enums.*', () => {
    const members = (map: EnumMap, pick: (m: Record<string, string>) => string[]) =>
      Object.fromEntries(Object.entries(map).map(([name, m]) => [name, pick(m).sort()]));

    expect(members(uz.enums, Object.keys)).toEqual(
      members(enums as unknown as EnumMap, Object.values),
    );
  });
});
