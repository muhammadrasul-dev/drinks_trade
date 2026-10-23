// zod → DomainError, shared by services (re-validation) and Server Actions
// (apps/web/src/lib/action.ts), so both report the same VALIDATION_FAILED shape.
import { z } from 'zod';

import { DomainError, ErrorCode, type FieldErrors } from './errors';

/** zod failure → VALIDATION_FAILED with per-field messages (business-logic §10). */
export function validationError(error: z.ZodError): DomainError {
  const fieldErrors: FieldErrors = {};
  for (const [field, messages] of Object.entries(z.flattenError(error).fieldErrors)) {
    if (Array.isArray(messages)) fieldErrors[field] = messages;
  }
  return new DomainError(ErrorCode.VALIDATION_FAILED, undefined, fieldErrors);
}

/** `schema.parse` that fails as VALIDATION_FAILED (services and Server Actions alike). */
export function parseInput<TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown,
): z.output<TSchema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}
