import { Router } from 'express';
import * as adminUsersController from '../controllers/admin-users.controller';
import { protect } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/permission.middleware';

const router = Router();

router.use(protect);

router.get(
  '/users',
  requirePermission('user:manage'),
  adminUsersController.listUsers,
);
router.patch(
  '/users/:userId/status',
  requirePermission('user:manage'),
  adminUsersController.setUserActive,
);
router.post(
  '/users/:userId/roles',
  requirePermission('role:manage'),
  adminUsersController.assignRole,
);
router.delete(
  '/users/:userId/roles/:roleName',
  requirePermission('role:manage'),
  adminUsersController.removeRole,
);

export default router;
