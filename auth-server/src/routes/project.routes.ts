import { Router } from 'express';
import * as projectController from '../controllers/projects.controller';
import * as projectMembersController from '../controllers/project-members.controller';
import * as phasesController from '../controllers/phases.controller';
import * as requirementsController from '../controllers/requirements.controller';
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

// Phase Engine (Module 3): reads are project-visible, writes are PM-managed.
router.get(
  '/:projectId/phases',
  requirePermission('project:view'),
  requireProjectAccess('view'),
  phasesController.listPhases,
);
router.get(
  '/:projectId/phases/current',
  requirePermission('project:view'),
  requireProjectAccess('view'),
  phasesController.getCurrentPhase,
);
router.post(
  '/:projectId/phases/ensure',
  requirePermission('phase:manage'),
  requireProjectAccess('phaseManage'),
  phasesController.ensurePhases,
);
router.patch(
  '/:projectId/phases/:phaseId',
  requirePermission('phase:manage'),
  requireProjectAccess('phaseManage'),
  phasesController.updatePhase,
);

// Document Requirements (Module 4): reads are project-visible, writes are PM-managed.
router.get(
  '/:projectId/requirements',
  requirePermission('project:view'),
  requireProjectAccess('view'),
  requirementsController.listRequirements,
);
router.get(
  '/:projectId/phases/:phaseId/requirements',
  requirePermission('project:view'),
  requireProjectAccess('view'),
  requirementsController.listPhaseRequirements,
);
router.post(
  '/:projectId/phases/:phaseId/requirements',
  requirePermission('phase:manage'),
  requireProjectAccess('phaseManage'),
  requirementsController.createRequirement,
);
router.patch(
  '/:projectId/requirements/:requirementId',
  requirePermission('phase:manage'),
  requireProjectAccess('phaseManage'),
  requirementsController.updateRequirement,
);
router.delete(
  '/:projectId/requirements/:requirementId',
  requirePermission('phase:manage'),
  requireProjectAccess('phaseManage'),
  requirementsController.deleteRequirement,
);
router.post(
  '/:projectId/requirements/ensure',
  requirePermission('phase:manage'),
  requireProjectAccess('phaseManage'),
  requirementsController.ensureRequirements,
);

export default router;
