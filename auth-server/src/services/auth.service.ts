import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { and, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { db } from '../db';
import {
  passwordResetTokens,
  permissions,
  refreshTokens,
  rolePermissions,
  roles,
  users,
  userRoles,
} from '../db/schema';
import { env } from '../config/env';
import { LoginInput, RegisterInput, RoleName, ROLE_NAMES, SafeUser } from '../types/auth.types';
import { issueRefreshToken, signAccessToken } from './token.service';
import { sendPasswordResetEmail } from './email.service';

const ROLE_DISPLAY_NAMES: Record<RoleName, string> = {
  administrator: 'Administrator',
  project_manager: 'Project Manager',
  team_member: 'Team Member',
  document_approver: 'Document Approver',
};

const httpError = (message: string, statusCode: number): Error & { statusCode: number } =>
  Object.assign(new Error(message), { statusCode });

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const toSafeUser = (user: {
  id: string;
  fullName: string;
  email: string;
  profilePicture?: string | null;
  role: RoleName;
  roles?: RoleName[];
  permissions: string[];
}): SafeUser => ({
  id: user.id,
  fullName: user.fullName,
  email: user.email,
  profilePicture: user.profilePicture ?? null,
  role: user.role,
  roleDisplayName: ROLE_DISPLAY_NAMES[user.role],
  roles: [...new Set(user.roles?.length ? user.roles : [user.role])],
  permissions: [...new Set(user.permissions)],
});

async function getRole(roleName: RoleName) {
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName)).limit(1);
  if (!role) throw httpError('Authentication roles are not configured', 500);
  return role;
}

export async function register(input: RegisterInput): Promise<SafeUser> {
  const fullName = input.fullName.trim();
  const email = normalizeEmail(input.email);

  if (!fullName) throw httpError('Full name is required', 400);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw httpError('A valid email address is required', 400);
  }
  if (input.password.length < 8 || !/[A-Za-z]/.test(input.password) || !/\d/.test(input.password)) {
    throw httpError('Password must be at least 8 characters and contain letters and numbers', 400);
  }
  if (input.password !== input.confirmPassword) {
    throw httpError('Passwords do not match', 400);
  }

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) throw httpError('An account with this email already exists', 409);

  const passwordHash = await bcrypt.hash(input.password, env.bcryptSaltRounds);
  const role = await getRole(ROLE_NAMES.TEAM_MEMBER);
  const [created] = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ fullName, email, passwordHash })
      .returning({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        profilePicture: users.profilePicture,
      });

    await tx.insert(userRoles).values({ userId: user.id, roleId: role.id });
    return [{ ...user, role: ROLE_NAMES.TEAM_MEMBER }];
  });

  const registeredUser = await getUserById(created.id);
  if (!registeredUser) throw httpError('Unable to load the registered account', 500);
  return registeredUser;
}

async function findUserWithRoles(email: string) {
  const results = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      profilePicture: users.profilePicture,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
      role: roles.name,
    })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(users.email, email), isNull(userRoles.projectId)))
    ;

  const first = results[0];
  return first
    ? {
        ...first,
        roles: results.map((result) => result.role as RoleName),
      }
    : null;
}

export async function getUserPermissions(userId: string): Promise<string[]> {
  const rows = await db
    .select({ permissionName: permissions.name })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(and(eq(userRoles.userId, userId), isNull(userRoles.projectId)));

  return [...new Set(rows.map((row) => row.permissionName))];
}

export interface LoginIdentity {
  user: SafeUser;
  role: RoleName;
}

export async function verifyLoginCredentials(input: LoginInput): Promise<LoginIdentity> {
  const email = normalizeEmail(input.email);
  const user = await findUserWithRoles(email);
  const genericError = httpError('Invalid email or password', 401);

  if (!user || !user.isActive) throw genericError;
  const passwordValid = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordValid) throw genericError;

  const role = user.role as RoleName;
  const userPermissions = await getUserPermissions(user.id);
  return {
    user: toSafeUser({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      profilePicture: user.profilePicture,
      role,
      roles: user.roles,
      permissions: userPermissions,
    }),
    role,
  };
}

export async function issueTokensForUser(
  userId: string,
  rememberMe: boolean,
  metadata: { userAgent?: string; ipAddress?: string },
): Promise<{ user: SafeUser; accessToken: string; refreshToken: string }> {
  const user = await getUserById(userId);
  if (!user) throw httpError('Not authenticated', 401);

  await db.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));

  const tokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    roles: user.roles,
    fullName: user.fullName,
  };
  const accessToken = signAccessToken(tokenPayload);
  const refresh = await issueRefreshToken(tokenPayload, {
    rememberMe,
    userAgent: metadata.userAgent,
    ipAddress: metadata.ipAddress,
  });
  return { user, accessToken, refreshToken: refresh.token };
}

export async function getUserById(id: string): Promise<SafeUser | null> {
  const results = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      role: roles.name,
      roleDisplayName: roles.displayName,
      profilePicture: users.profilePicture,
    })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(users.id, id), eq(users.isActive, true), isNull(userRoles.projectId)))
    ;

  const first = results[0];
  if (!first) return null;

  const rolesForUser = [...new Set(results.map((result) => result.role as RoleName))];
  const userPermissions = await getUserPermissions(first.id);
  return toSafeUser({
    id: first.id,
    fullName: first.fullName,
    email: first.email,
    profilePicture: first.profilePicture,
    role: first.role as RoleName,
    roles: rolesForUser,
    permissions: userPermissions,
  });
}

const threeMonthsAgo = (now: Date): Date => {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - 3);
  return cutoff;
};

export async function updateProfile(input: {
  userId: string;
  fullName?: string;
  profilePicture?: string | null;
}): Promise<SafeUser> {
  const hasName = input.fullName !== undefined;
  const hasPicture = input.profilePicture !== undefined;
  if (!hasName && !hasPicture) throw httpError('At least one profile field is required', 400);

  const fullName = hasName && typeof input.fullName === 'string' ? input.fullName.trim() : undefined;
  if (hasName && (!fullName || fullName.length > 150)) {
    throw httpError('Display name must be between 1 and 150 characters', 400);
  }
  if (hasPicture && input.profilePicture !== null &&
      (typeof input.profilePicture !== 'string' || !input.profilePicture || input.profilePicture.length > 2_000_000)) {
    throw httpError('Profile picture must be a valid image reference no larger than 2 MB', 400);
  }
  if (hasPicture && typeof input.profilePicture === 'string' && input.profilePicture &&
      !/^https?:\/\/[^\s]+$/i.test(input.profilePicture) &&
      !/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+$/i.test(input.profilePicture)) {
    throw httpError('Profile picture must be an http(s) URL or base64 image', 400);
  }

  const [user] = await db.select({
    id: users.id,
    fullNameUpdatedAt: users.fullNameUpdatedAt,
    isActive: users.isActive,
  }).from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user || !user.isActive) throw httpError('Not authenticated', 401);

  const now = new Date();
  const cutoff = threeMonthsAgo(now);
  if (hasName && user.fullNameUpdatedAt && user.fullNameUpdatedAt > cutoff) {
    throw httpError('Display name can only be changed once every three months', 429);
  }
  const changes: {
    fullName?: string;
    fullNameUpdatedAt?: Date;
    profilePicture?: string | null;
    profilePictureUpdatedAt?: Date;
    updatedAt: Date;
  } = { updatedAt: now };
  if (hasName) {
    changes.fullName = fullName;
    changes.fullNameUpdatedAt = now;
  }
  if (hasPicture) {
    changes.profilePicture = input.profilePicture!;
    changes.profilePictureUpdatedAt = now;
  }
  const updateConditions = [eq(users.id, user.id)];
  if (hasName) {
    updateConditions.push(or(isNull(users.fullNameUpdatedAt), lte(users.fullNameUpdatedAt, cutoff))!);
  }
  const [updatedRow] = await db.update(users).set(changes).where(and(...updateConditions)).returning({ id: users.id });
  if (!updatedRow) {
    throw httpError('Profile fields can only be changed once every three months', 429);
  }
  const updated = await getUserById(user.id);
  if (!updated) throw httpError('Unable to load the updated account', 500);
  return updated;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.email, normalizedEmail), eq(users.isActive, true)))
    .limit(1);
  if (!user) return;

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + env.passwordResetExpiryMinutes * 60 * 1000);

  await db.transaction(async (tx) => {
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())));

    await tx.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt,
    });
  });

  const resetLink = `${env.frontendUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
  await sendPasswordResetEmail({
    to: user.email,
    resetLink,
    expiresInMinutes: env.passwordResetExpiryMinutes,
  });
}

export async function resetPassword(input: { token: string; newPassword: string }): Promise<void> {
  if (!input.token || input.newPassword.length < 8 || !/[A-Za-z]/.test(input.newPassword) || !/\d/.test(input.newPassword)) {
    throw httpError('Invalid password reset request', 400);
  }

  const tokenHash = crypto.createHash('sha256').update(input.token).digest('hex');
  const now = new Date();
  await db.transaction(async (tx) => {
    const [resetToken] = await tx
      .select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId })
      .from(passwordResetTokens)
      .where(and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, now),
      ))
      .limit(1);

    if (!resetToken) throw httpError('This password reset link is invalid or expired', 400);

    const passwordHash = await bcrypt.hash(input.newPassword, env.bcryptSaltRounds);
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: now })
      .where(eq(users.id, resetToken.userId));
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(eq(passwordResetTokens.id, resetToken.id));
    await tx
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.userId, resetToken.userId), isNull(refreshTokens.revokedAt)));
  });
}

const assertStrongNewPassword = (newPassword: string): void => {
  if (
    newPassword.length < 8 ||
    !/[A-Za-z]/.test(newPassword) ||
    !/\d/.test(newPassword)
  ) {
    throw httpError(
      'New password must be at least 8 characters and contain letters and numbers',
      400,
    );
  }
};

const verifyCurrentPassword = async (userId: string, currentPassword: string): Promise<string> => {
  const [user] = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || !user.isActive) throw httpError('Not authenticated', 401);

  const currentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!currentPasswordValid) throw httpError('Current password is incorrect', 400);
  return user.id;
};

/**
 * Step 1 of the OTP-guarded password change: validates the request without
 * mutating anything. The controller issues the verification code afterwards.
 */
export async function requestPasswordChange(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  if (!input.currentPassword) throw httpError('Current password is incorrect', 400);
  assertStrongNewPassword(input.newPassword);
  await verifyCurrentPassword(input.userId, input.currentPassword);

  if (input.currentPassword === input.newPassword) {
    throw httpError('New password must be different from the current password', 400);
  }
}

/**
 * Step 2 of the OTP-guarded password change: persists the new password and
 * revokes all refresh sessions (the user signs in again afterwards). The
 * caller (controller) validates the request and consumes the OTP challenge
 * first; OTP verification lives in otp.service to avoid a service cycle.
 */
export async function applyPasswordChange(input: {
  userId: string;
  newPassword: string;
}): Promise<void> {
  assertStrongNewPassword(input.newPassword);

  const now = new Date();
  const passwordHash = await bcrypt.hash(input.newPassword, env.bcryptSaltRounds);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: now })
      .where(eq(users.id, input.userId));
    await tx
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.userId, input.userId), isNull(refreshTokens.revokedAt)));
  });
}

export { getRole };
