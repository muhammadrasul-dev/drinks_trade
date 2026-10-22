import { can, DomainError, ErrorCode, type Permission, type UserRole } from '@drinks/shared';

/** First line of every service function (conventions §4). */
export function assertCan(user: { role: UserRole }, permission: Permission): void {
  if (!can(user.role, permission)) {
    throw new DomainError(ErrorCode.FORBIDDEN, { permission });
  }
}
