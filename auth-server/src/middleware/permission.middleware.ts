import { Request, Response, NextFunction, RequestHandler } from 'express';
import { PermissionName } from '../types/auth.types';
import { assertGlobalPermission } from '../services/authorization.service';
import { recordAudit } from '../services/audit.service';

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
      await assertGlobalPermission(req.user.sub, permission);
      next();
    } catch (error) {
      if (
        error instanceof Error
        && 'statusCode' in error
        && (error as { statusCode?: number }).statusCode === 403
      ) {
        try {
          await recordAudit({
            userId: req.user.sub,
            action: 'authorization.denied',
            entityType: 'route',
            metadata: {
              permission,
              method: req.method,
              path: req.path,
            },
          });
        } catch (auditError) {
          next(auditError);
          return;
        }
        res.status(403).json({
          message: 'Forbidden: insufficient permission',
          code: 'INSUFFICIENT_PERMISSION',
        });
        return;
      }
      next(error);
    }
  };

export default requirePermission;
