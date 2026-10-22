import { DomainError, ErrorCode, Locale } from '@drinks/shared';
import { z } from 'zod';

import type { ServiceContext } from '../../core/context';
import { withTransaction } from '../../core/tx';
import { audit } from '../audit';

const localeSchema = z.enum(Locale);

/** The signed-in user picks their UI language (architecture §7); the next login redirects to it. */
export async function updateOwnLocale(ctx: ServiceContext, locale: unknown): Promise<void> {
  const parsed = localeSchema.safeParse(locale);
  if (!parsed.success) throw new DomainError(ErrorCode.VALIDATION_FAILED);
  const next = parsed.data;

  await withTransaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: ctx.user.id },
      select: { locale: true },
    });
    if (!user) throw new DomainError(ErrorCode.NOT_FOUND, { entity: 'user' });
    if (user.locale === next) return;
    await tx.user.update({ where: { id: ctx.user.id }, data: { locale: next } });
    await audit.log(tx, ctx, {
      action: 'USER_UPDATE',
      entityType: 'user',
      entityId: ctx.user.id,
      before: { locale: user.locale },
      after: { locale: next },
    });
  });
}
