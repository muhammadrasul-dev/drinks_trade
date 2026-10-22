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
