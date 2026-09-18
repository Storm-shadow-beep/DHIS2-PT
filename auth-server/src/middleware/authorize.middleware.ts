import { Request, Response, NextFunction, RequestHandler } from 'express';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../db';
import { roles, userRoles } from '../db/schema';
import { RoleName } from '../types/auth.types';

export { requirePermission } from './permission.middleware';
export {
  requireDocumentAccess,
  requireProjectAccess,
  requireProjectManager,
  requireProjectMember,
  requireNonAdministrator,
  requireAdministrator,
} from './authorization.middleware';

export const authorize =
  (...allowedRoles: RoleName[]): RequestHandler =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ message: 'Not authenticated' });
      return;
    }

    try {
      const assignments = await db
        .select({ roleName: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(
          and(
            eq(userRoles.userId, req.user.sub),
            isNull(userRoles.projectId),
            inArray(roles.name, allowedRoles),
          ),
        );

      if (assignments.length === 0) {
        res.status(403).json({ message: 'Forbidden: insufficient role' });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };

export default authorize;
