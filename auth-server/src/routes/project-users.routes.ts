import { Router } from 'express';
import { listAssignableUsers } from '../controllers/projects.controller';
import { requireAuthenticatedUser } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/permission.middleware';

const router = Router();

router.get('/', requireAuthenticatedUser, requirePermission('project:manage'), listAssignableUsers);

export default router;
