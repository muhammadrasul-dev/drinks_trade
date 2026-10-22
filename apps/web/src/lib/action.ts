import { auth, type AuthSession, type RequestMeta, type ServiceContext } from '@drinks/server';
import {
  type ActionError,
  type ActionResult,
  DomainError,
  ErrorCode,
  isDomainError,
  validationError,
} from '@drinks/shared';
import type { z } from 'zod';

import { getCurrentSession, getRequestMeta } from './session';

/** What a protected action's handler gets besides its parsed input. */
export interface ActionContext {
  session: AuthSession;
  /** Ready for service calls: `products.create(ctx, input)`. */
  ctx: ServiceContext;
  meta: RequestMeta;
}

/**
 * Server Action wrapper (architecture §4.2): session → zod → handler, with
 * expected failures returned as `ActionResult` instead of thrown.
 * - no valid session → `UNAUTHORIZED`;
 * - input fails the schema → `VALIDATION_FAILED` + `fieldErrors` (services re-validate too);
 * - handler throws `DomainError` → its code/params/fieldErrors.
 * Anything else (redirect(), forbidden(), bugs) is rethrown for Next.js to handle.
 * Permissions stay in the services (`assertCan`).
 *
 * Usage, in a 'use server' module:
 * `export const createProduct = action(productInputSchema, (input, { ctx }) => products.create(ctx, input));`
 */
export function action<TSchema extends z.ZodType, TResult>(
  schema: TSchema,
  handler: (input: z.output<TSchema>, context: ActionContext) => Promise<TResult>,
): (input: unknown) => Promise<ActionResult<TResult>> {
  return async (input) =>
    run(async () => {
      const session = await getCurrentSession();
      if (!session) throw new DomainError(ErrorCode.UNAUTHORIZED);
      const data = parse(schema, input);
      const meta = await getRequestMeta();
      return handler(data, { session, ctx: auth.toServiceContext(session, meta.requestId), meta });
    });
}

/** Same as action() without the session check: login and other pre-auth forms. */
export function publicAction<TSchema extends z.ZodType, TResult>(
  schema: TSchema,
  handler: (input: z.output<TSchema>, meta: RequestMeta) => Promise<TResult>,
): (input: unknown) => Promise<ActionResult<TResult>> {
  return async (input) =>
    run(async () => {
      const data = parse(schema, input);
      return handler(data, await getRequestMeta());
    });
}

/** DomainError → ActionError; anything else is rethrown. */
export function toActionError(error: unknown): ActionError {
  if (!isDomainError(error)) throw error;
  return {
    code: error.code,
    ...(error.params && { params: error.params }),
    ...(error.fieldErrors && { fieldErrors: error.fieldErrors }),
  };
}

function parse<TSchema extends z.ZodType>(schema: TSchema, input: unknown): z.output<TSchema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

async function run<T>(body: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await body() };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
