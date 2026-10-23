import type { ChangeEvent } from 'react';

/** Digits only → number; empty → undefined (the schema then says "required"). */
export function toNumber(event: ChangeEvent<HTMLInputElement>): number | undefined {
  const digits = event.target.value.replace(/\D/g, '');
  return digits === '' ? undefined : Number(digits);
}

/** Same as toNumber, but an empty field means 0 (payment parts). */
export function toAmount(event: ChangeEvent<HTMLInputElement>): number {
  return toNumber(event) ?? 0;
}
