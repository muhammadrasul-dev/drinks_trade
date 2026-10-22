import { type ActionError, isDomainError } from '@drinks/shared';

/**
 * DomainError → ActionError for Server Actions; anything else is rethrown.
 * T-203 folds this into the shared action() wrapper.
 */
export function toActionError(error: unknown): ActionError {
  if (!isDomainError(error)) throw error;
  return {
    code: error.code,
    ...(error.params && { params: error.params }),
    ...(error.fieldErrors && { fieldErrors: error.fieldErrors }),
  };
}
