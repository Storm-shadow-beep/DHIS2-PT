import bcrypt from 'bcrypt';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from './index';
import { roles, userRoles, users } from './schema';
import { env } from '../config/env';
import { ROLE_NAMES } from '../types/auth.types';

export async function seedDefaultProjectManager(): Promise<void> {
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
      [manager] = await tx
        .insert(users)
        .values({
          fullName: 'Default Project Manager',
          email,
          passwordHash,
        })
        .returning({ id: users.id });
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
