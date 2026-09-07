import { Request, Response, NextFunction, RequestHandler } from 'express';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { permissions, rolePermissions, userRoles } from '../db/schema';
import { PermissionName } from '../types/auth.types';

/**
 * Require a permission granted by one of the user's global roles.
 *
 * Project-scoped role assignments deliberately do not grant access to
 * institution-wide admin endpoints.
 */
export const requirePermission =
  (permission: PermissionName | string): RequestHandler =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ message: 'Not authenticated' });
      return;
    }

    try {
      const [grant] = await db
        .select({ permissionId: permissions.id })
        .from(userRoles)
        .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(
          and(
            eq(userRoles.userId, req.user.sub),
            isNull(userRoles.projectId),
            eq(permissions.name, permission),
          ),
        )
        .limit(1);

      if (!grant) {
        res.status(403).json({
          message: 'Forbidden: insufficient permission',
          code: 'INSUFFICIENT_PERMISSION',
        });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };

export default requirePermission;
