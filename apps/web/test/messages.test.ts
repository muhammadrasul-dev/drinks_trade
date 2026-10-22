// Every UI string exists in both languages (T-202), and the server↔UI contracts
// (error codes, enums) are fully translated (architecture §4.2, §7).
import { ErrorCode } from '@drinks/shared';
import * as enums from '@drinks/shared/enums';
import { describe, expect, it } from 'vitest';

import ru from '../messages/ru.json';
import uz from '../messages/uz.json';

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ''): [path: string, value: string][] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? [[path, value] as [string, string]] : leaves(value, path);
  });
}

const leafKeys = (tree: Tree) => leaves(tree).map(([path]) => path);

const catalogs = { uz, ru } as Record<string, Tree>;

describe('messages', () => {
  it('uz.json and ru.json have the identical key set', () => {
    expect(leafKeys(catalogs.ru!).sort()).toEqual(leafKeys(catalogs.uz!).sort());
  });

  it.each(Object.keys(catalogs))('%s has no empty strings', (locale) => {
    const empty = leaves(catalogs[locale]!).filter(([, value]) => value.trim() === '');
    expect(empty).toEqual([]);
  });

  it('translates every ErrorCode under errors.*', () => {
    expect(Object.keys(uz.errors).sort()).toEqual(Object.values(ErrorCode).sort());
  });

  it('translates every shared enum member under enums.*', () => {
    const expected = Object.fromEntries(
      Object.entries(enums as unknown as Record<string, Record<string, string>>).map(
        ([name, members]) => [name, Object.values(members).sort()],
      ),
    );
    const actual = Object.fromEntries(
      Object.entries(uz.enums as Record<string, Record<string, string>>).map(([name, members]) => [
        name,
        Object.keys(members).sort(),
      ]),
    );
    expect(actual).toEqual(expected);
  });
});
