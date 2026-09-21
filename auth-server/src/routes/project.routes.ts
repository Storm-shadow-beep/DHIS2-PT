import { Router } from 'express';
import * as projectController from '../controllers/projects.controller';
import * as projectMembersController from '../controllers/project-members.controller';
import * as phasesController from '../controllers/phases.controller';
import * as requirementsController from '../controllers/requirements.controller';
import * as documentsController from '../controllers/documents.controller';
import * as driveController from '../controllers/drive.controller';
import { requireAuthenticatedUser } from '../middleware/auth.middleware';
import {
  requireDocumentAccess,
  requirePermission,
  requireProjectAccess,
  requireProjectManager,
  requireNonAdministrator,
  requireAdministrator,
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
  requireAdministrator,
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

// Document Management (Module 5): metadata + version + approval workflow.
// Collection writes need member-level upload rights; :documentId routes add
// document-scoped guards (service re-verifies the :projectId scope).
router.get(
  '/:projectId/documents',
  requirePermission('document:view'),
  requireProjectAccess('view'),
  documentsController.listDocuments,
);
router.post(
  '/:projectId/documents',
  requirePermission('document:upload'),
  requireNonAdministrator,
  requireProjectAccess('member'),
  documentsController.documentUpload.single('file'),
  documentsController.uploadDocument,
);
router.get(
  '/:projectId/documents/:documentId',
  requirePermission('document:view'),
  requireDocumentAccess('view', 'documentId'),
  documentsController.getDocument,
);
router.patch(
  '/:projectId/documents/:documentId',
  requirePermission('document:upload'),
  requireNonAdministrator,
  requireDocumentAccess('upload', 'documentId'),
  documentsController.updateDocument,
);
router.delete(
  '/:projectId/documents/:documentId',
  requirePermission('document:delete'),
  requireNonAdministrator,
  requireDocumentAccess('delete', 'documentId'),
  documentsController.deleteDocument,
);
router.get(
  '/:projectId/documents/:documentId/versions',
  requirePermission('document:view'),
  requireDocumentAccess('view', 'documentId'),
  documentsController.listVersions,
);
router.post(
  '/:projectId/documents/:documentId/versions',
  requirePermission('document:upload'),
  requireNonAdministrator,
  requireDocumentAccess('upload', 'documentId'),
  documentsController.documentUpload.single('file'),
  documentsController.uploadVersion,
);
router.get(
  '/:projectId/documents/:documentId/approvals',
  requirePermission('document:view'),
  requireDocumentAccess('view', 'documentId'),
  documentsController.listApprovals,
);
router.post(
  '/:projectId/documents/:documentId/approvals',
  requirePermission('document:approve'),
  requireNonAdministrator,
  requireDocumentAccess('approve', 'documentId'),
  documentsController.reviewDocument,
);

// Google Drive Integration (Module 6): service-account + Shared Drive.
// Writes are PM-managed; raw file reads/uploads stay project-visible.
// Document metadata/version/approval above enforce document permissions.
router.post(
  '/:projectId/drive/ensure',
  requirePermission('phase:manage'),
  requireProjectAccess('phaseManage'),
  driveController.ensureDrive,
);
router.post(
  '/:projectId/drive/upload',
  requirePermission('project:view'),
  requireProjectAccess('view'),
  driveController.driveUpload.single('file'),
  driveController.uploadDriveFile,
);
router.get(
  '/:projectId/drive/files',
  requirePermission('project:view'),
  requireProjectAccess('view'),
  driveController.listDriveFiles,
);
router.get(
  '/:projectId/drive/files/:fileId/content',
  requirePermission('project:view'),
  requireProjectAccess('view'),
  driveController.downloadDriveFile,
);

export default router;
