import { Router } from 'express';
import * as reportsController from '../controllers/reports.controller';
import { requireAuthenticatedUser } from '../middleware/auth.middleware';
import { requirePermission, requireNonAdministrator } from '../middleware/authorize.middleware';

const router = Router();
router.use(requireAuthenticatedUser);
router.get('/', requirePermission('report:view'), reportsController.listReports);
router.post(
  '/',
  requirePermission('report:create'),
  requireNonAdministrator,
  reportsController.createReport,
);
router.delete('/:reportId', reportsController.deleteReport);
export default router;
