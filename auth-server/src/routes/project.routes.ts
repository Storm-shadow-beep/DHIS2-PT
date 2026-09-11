import { Router } from 'express';
import * as projectController from '../controllers/projects.controller';
import * as projectMembersController from '../controllers/project-members.controller';
import { requireAuthenticatedUser } from '../middleware/auth.middleware';
import {
  requirePermission,
  requireProjectAccess,
  requireProjectManager,
} from '../middleware/authorize.middleware';

const router = Router();

router.use(requireAuthenticatedUser);

router.get('/', requirePermission('project:view'), projectController.listProjects);
router.post('/', requirePermission('project:create'), projectController.createProject);

router.get(
  '/:projectId',
  requirePermission('project:view'),
  requireProjectAccess('view'),
  projectController.getProject,
);
router.patch(
  '/:projectId',
  requirePermission('project:manage'),
  requireProjectManager(),
  projectController.updateProject,
);

router.get(
  '/:projectId/members',
  requirePermission('project:view'),
  requireProjectAccess('view'),
  projectMembersController.listMembers,
);
router.put(
  '/:projectId/members',
  requirePermission('project:member:manage'),
  requireProjectManager(),
  projectMembersController.replaceMembers,
);

export default router;
