import bcrypt from 'bcrypt';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { roles, users, userRoles } from '../db/schema';
import { env } from '../config/env';
import { LoginInput, RegisterInput, RoleName, ROLE_NAMES, SafeUser } from '../types/auth.types';
import { issueRefreshToken, signAccessToken } from './token.service';

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
  role: RoleName;
}): SafeUser => ({
  id: user.id,
  fullName: user.fullName,
  email: user.email,
  role: user.role,
  roleDisplayName: ROLE_DISPLAY_NAMES[user.role],
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
      });

    await tx.insert(userRoles).values({ userId: user.id, roleId: role.id });
    return [{ ...user, role: ROLE_NAMES.TEAM_MEMBER }];
  });

  return toSafeUser(created);
}

async function findUserWithRole(email: string) {
  const [result] = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
      role: roles.name,
    })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(users.email, email), isNull(userRoles.projectId)))
    .limit(1);

  return result;
}

export interface LoginIdentity {
  user: SafeUser;
  role: RoleName;
}

export async function verifyLoginCredentials(input: LoginInput): Promise<LoginIdentity> {
  const email = normalizeEmail(input.email);
  const user = await findUserWithRole(email);
  const genericError = httpError('Invalid email or password', 401);

  if (!user || !user.isActive) throw genericError;
  const passwordValid = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordValid) throw genericError;

  const role = user.role as RoleName;
  return { user: toSafeUser({ id: user.id, fullName: user.fullName, email: user.email, role }), role };
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
  const [result] = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      role: roles.name,
      roleDisplayName: roles.displayName,
    })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(users.id, id), eq(users.isActive, true), isNull(userRoles.projectId)))
    .limit(1);

  return result ? { ...result, role: result.role as RoleName } : null;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (!user) return;
  // Email delivery is intentionally deferred; do not expose account existence.
  console.info(`[auth] password reset requested for ${user.id}`);
}

export async function resetPassword(input: { token: string; newPassword: string }): Promise<void> {
  if (!input.token || input.newPassword.length < 8 || !/[A-Za-z]/.test(input.newPassword) || !/\d/.test(input.newPassword)) {
    throw httpError('Invalid password reset request', 400);
  }
  throw httpError('Password reset delivery is not configured', 501);
}

export { getRole };
