import type { z } from 'zod';

type Translate = (key: 'tooLong' | 'required' | 'invalid') => string;

/** zod issue → form message for the cash dialogs (same wording as the debt dialogs). */
export function cashFormError(tCommon: Translate): z.core.$ZodErrorMap {
  return (issue) => {
    if (issue.code === 'too_big' && issue.origin === 'string') return tCommon('tooLong');
    if (issue.code === 'invalid_type' || issue.code === 'invalid_format') {
      return tCommon('required');
    }
    return tCommon('invalid');
  };
}
