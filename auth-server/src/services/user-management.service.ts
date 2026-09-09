import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { refreshTokens, roles, userRoles, users } from '../db/schema';
import { recordAudit } from './audit.service';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const serviceError = (message: string, statusCode: number): Error & { statusCode: number } =>
  Object.assign(new Error(message), { statusCode });

export interface AdminUserRole {
  id: string;
  name: string;
  displayName: string;
}

export interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles: AdminUserRole[];
}

const assertUuid = (value: string, label: string): void => {
  if (!UUID_PATTERN.test(value)) throw serviceError(`Invalid ${label}`, 400);
};

const assertRoleName = (roleName: string): string => {
  const normalized = roleName.trim();
  if (!normalized || normalized.length > 50) {
    throw serviceError('A valid role name is required', 400);
  }
  return normalized;
};

async function getAdminUser(userId: string): Promise<AdminUser> {
  assertUuid(userId, 'user id');

  const rows = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      roleId: roles.id,
      roleName: roles.name,
      roleDisplayName: roles.displayName,
    })
    .from(users)
    .leftJoin(
      userRoles,
      and(eq(userRoles.userId, users.id), isNull(userRoles.projectId)),
    )
    .leftJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(users.id, userId));

  const first = rows[0];
  if (!first) throw serviceError('User not found', 404);

  return {
    id: first.id,
    fullName: first.fullName,
    email: first.email,
    isActive: first.isActive,
    lastLoginAt: first.lastLoginAt,
    createdAt: first.createdAt,
    updatedAt: first.updatedAt,
    roles: rows
      .filter((row): row is typeof row & { roleId: string; roleName: string; roleDisplayName: string } =>
        Boolean(row.roleId && row.roleName && row.roleDisplayName),
      )
      .map((row) => ({
        id: row.roleId,
        name: row.roleName,
        displayName: row.roleDisplayName,
      })),
  };
}

export async function listUsers(): Promise<AdminUser[]> {
  const rows = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      roleId: roles.id,
      roleName: roles.name,
      roleDisplayName: roles.displayName,
    })
    .from(users)
    .leftJoin(
      userRoles,
      and(eq(userRoles.userId, users.id), isNull(userRoles.projectId)),
    )
    .leftJoin(roles, eq(roles.id, userRoles.roleId))
    .orderBy(desc(users.createdAt));

  const usersById = new Map<string, AdminUser>();
  for (const row of rows) {
    const existing = usersById.get(row.id) ?? {
      id: row.id,
      fullName: row.fullName,
      email: row.email,
      isActive: row.isActive,
      lastLoginAt: row.lastLoginAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      roles: [],
    };

    if (row.roleId && row.roleName && row.roleDisplayName) {
      existing.roles.push({
        id: row.roleId,
        name: row.roleName,
        displayName: row.roleDisplayName,
      });
    }
    usersById.set(row.id, existing);
  }

  return [...usersById.values()];
}

export async function setUserActive(
  userId: string,
  isActive: boolean,
  actorId: string,
): Promise<AdminUser> {
  assertUuid(userId, 'user id');
  assertUuid(actorId, 'actor id');
  if (!isActive && userId === actorId) {
    throw serviceError('You cannot deactivate your own account', 400);
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(users)
      .set({ isActive, updatedAt: now })
      .where(eq(users.id, userId))
      .returning({ id: users.id });

    if (updated.length === 0) throw serviceError('User not found', 404);

    if (!isActive) {
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
    }
  });

  await recordAudit({
    userId: actorId,
    action: isActive ? 'user.activated' : 'user.deactivated',
    entityType: 'user',
    entityId: userId,
  });

  return getAdminUser(userId);
}

export async function assignGlobalRole(
  userId: string,
  roleName: string,
  actorId: string,
): Promise<AdminUser> {
  assertUuid(userId, 'user id');
  assertUuid(actorId, 'actor id');
  const normalizedRoleName = assertRoleName(roleName);

  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target) throw serviceError('User not found', 404);

  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, normalizedRoleName))
    .limit(1);
  if (!role) throw serviceError('Role not found', 404);

  await db
    .insert(userRoles)
    .values({ userId, roleId: role.id, assignedBy: actorId })
    .onConflictDoNothing();

  await recordAudit({
    userId: actorId,
    action: 'role.assigned',
    entityType: 'user',
    entityId: userId,
    metadata: { roleName: normalizedRoleName },
  });

  return getAdminUser(userId);
}

export async function removeGlobalRole(
  userId: string,
  roleName: string,
  actorId: string,
): Promise<AdminUser> {
  assertUuid(userId, 'user id');
  assertUuid(actorId, 'actor id');
  const normalizedRoleName = assertRoleName(roleName);

  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, normalizedRoleName))
    .limit(1);
  if (!role) throw serviceError('Role not found', 404);

  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target) throw serviceError('User not found', 404);

  const [requestedAssignment] = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(userRoles.roleId, role.id),
        isNull(userRoles.projectId),
      ),
    )
    .limit(1);
  if (!requestedAssignment) throw serviceError('User does not have that global role', 404);

  const assignments = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), isNull(userRoles.projectId)));
  if (assignments.length === 0) throw serviceError('User not found', 404);
  if (assignments.length === 1) {
    throw serviceError('A user must retain at least one global role', 400);
  }

  const removed = await db
    .delete(userRoles)
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(userRoles.roleId, role.id),
        isNull(userRoles.projectId),
      ),
    )
    .returning({ id: userRoles.id });

  if (removed.length === 0) throw serviceError('User does not have that global role', 404);

  await recordAudit({
    userId: actorId,
    action: 'role.removed',
    entityType: 'user',
    entityId: userId,
    metadata: { roleName: normalizedRoleName },
  });

  return getAdminUser(userId);
}
