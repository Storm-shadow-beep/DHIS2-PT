import bcrypt from 'bcrypt';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from './index';
import { roles, userRoles, users } from './schema';
import { env } from '../config/env';
import { ROLE_NAMES, type RoleName } from '../types/auth.types';

/**
 * Presence guard for shared databases (e.g. one Neon DB used by several
 * developers). Returns true when any user already holds the given global
 * role, in which case seeding is skipped instead of inserting duplicates.
 */
const globalRoleHolderExists = async (roleName: RoleName): Promise<boolean> => {
  const [holder] = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(roles.name, roleName), isNull(userRoles.projectId)))
    .limit(1);
  return Boolean(holder);
};

export async function seedDefaultProjectManager(): Promise<void> {
  if (await globalRoleHolderExists(ROLE_NAMES.PROJECT_MANAGER)) {
    console.log('[auth-service] a project manager already exists, skipping project manager seed');
    return;
  }
  if (!env.projectManagerEmail && !env.projectManagerPassword) return;
  if (!env.projectManagerEmail || !env.projectManagerPassword) {
    throw new Error('PROJECT_MANAGER_EMAIL and PROJECT_MANAGER_PASSWORD must be configured together');
  }

  const email = env.projectManagerEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('PROJECT_MANAGER_EMAIL must be a valid email address');
  }
  if (
    env.projectManagerPassword.length < 8 ||
    !/[A-Za-z]/.test(env.projectManagerPassword) ||
    !/\d/.test(env.projectManagerPassword)
  ) {
    throw new Error('PROJECT_MANAGER_PASSWORD must be at least 8 characters and contain letters and numbers');
  }

  await db.transaction(async (tx) => {
    const [managerRole] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, ROLE_NAMES.PROJECT_MANAGER))
      .limit(1);
    if (!managerRole) throw new Error('The project_manager role is not configured');

    let manager = (await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1))[0];

    if (!manager) {
      const passwordHash = await bcrypt.hash(env.projectManagerPassword, env.bcryptSaltRounds);
      // onConflictDoNothing covers concurrent startups racing the
      // check-then-insert above (unique users.email); fall back to a
      // re-select so the role grant below still applies to the winner.
      const [inserted] = await tx
        .insert(users)
        .values({
          fullName: 'Default Project Manager',
          email,
          passwordHash,
        })
        .onConflictDoNothing()
        .returning({ id: users.id });
      manager = inserted ?? (await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1))[0];
      if (!manager) throw new Error('Project manager seed lost a concurrent insert, retry startup');
    }

    const [existingRole] = await tx
      .select({ id: userRoles.id })
      .from(userRoles)
      .where(and(
        eq(userRoles.userId, manager.id),
        eq(userRoles.roleId, managerRole.id),
        isNull(userRoles.projectId),
      ))
      .limit(1);

    if (!existingRole) {
      await tx.insert(userRoles).values({
        userId: manager.id,
        roleId: managerRole.id,
      });
    }
  });

  // console.log(`[auth-service] ensured default project manager: ${email}`);
}

const DEFAULT_ADMIN_EMAIL = 'admin@example.org';
const DEFAULT_ADMIN_PASSWORD = 'admin@123';

function isWeakPassword(password: string): boolean {
  return password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password);
}

export async function seedDefaultAdmin(): Promise<void> {
  if (await globalRoleHolderExists(ROLE_NAMES.ADMINISTRATOR)) {
    console.log('[auth-service] an administrator already exists, skipping admin seed');
    return;
  }
  const email = env.adminEmail.trim().toLowerCase();
  const password = env.adminPassword;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('ADMIN_EMAIL must be a valid email address');
  }

  const isDefaultCredentials = email === DEFAULT_ADMIN_EMAIL && password === DEFAULT_ADMIN_PASSWORD;
  if (isWeakPassword(password)) {
    if (env.nodeEnv === 'production' || !isDefaultCredentials) {
      throw new Error('ADMIN_PASSWORD must be at least 8 characters and contain letters and numbers');
    }
    console.warn('[auth-service] default admin uses a weak development password; set a strong ADMIN_PASSWORD in production');
  } else if (isDefaultCredentials && env.nodeEnv === 'production') {
    throw new Error('ADMIN_PASSWORD must be changed from the default in production');
  }

  await db.transaction(async (tx) => {
    const [adminRole] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, ROLE_NAMES.ADMINISTRATOR))
      .limit(1);
    if (!adminRole) throw new Error('The administrator role is not configured');

    let admin = (await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1))[0];

    if (!admin) {
      const passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);
      // Race-safe per the project manager seed above.
      const [inserted] = await tx
        .insert(users)
        .values({
          fullName: 'Default Administrator',
          email,
          passwordHash,
        })
        .onConflictDoNothing()
        .returning({ id: users.id });
      admin = inserted ?? (await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1))[0];
      if (!admin) throw new Error('Admin seed lost a concurrent insert, retry startup');
    }

    const [existingRole] = await tx
      .select({ id: userRoles.id })
      .from(userRoles)
      .where(and(
        eq(userRoles.userId, admin.id),
        eq(userRoles.roleId, adminRole.id),
        isNull(userRoles.projectId),
      ))
      .limit(1);

    if (!existingRole) {
      await tx.insert(userRoles).values({
        userId: admin.id,
        roleId: adminRole.id,
      });
    }
  });

  // console.log(`[auth-service] ensured default administrator: ${email}`);
}
