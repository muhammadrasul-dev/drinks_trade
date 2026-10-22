import { DomainError, ErrorCode, type FieldErrors } from '@drinks/shared';
import { z } from 'zod';

/** zod failure → VALIDATION_FAILED with per-field messages (business-logic §10). */
export function validationError(error: z.ZodError): DomainError {
  const fieldErrors: FieldErrors = {};
  for (const [field, messages] of Object.entries(z.flattenError(error).fieldErrors)) {
    if (Array.isArray(messages)) fieldErrors[field] = messages;
  }
  return new DomainError(ErrorCode.VALIDATION_FAILED, undefined, fieldErrors);
}
