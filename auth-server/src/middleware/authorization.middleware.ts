import { Request, RequestHandler, Response, NextFunction } from 'express';
import {
  assertDocumentAccess,
  assertProjectAccess,
  assertProjectManager,
  assertProjectMember,
  getAuthorizationContext,
  normalizeResourceId,
} from '../services/authorization.service';
import { DocumentAccessType, ProjectAccessType } from '../services/authorization.policy';
import { recordAudit } from '../services/audit.service';

const requireUser = (req: Request, res: Response): string | null => {
  if (!req.user) {
    res.status(401).json({ message: 'Not authenticated' });
    return null;
  }
  return req.user.sub;
};

// Express 5 types req.params values as string | string[].
const paramAsOptionalString = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const continueWithAudit = async (
  error: unknown,
  req: Request,
  userId: string,
  resourceType: string,
  resourceId: string | undefined,
  next: NextFunction,
): Promise<void> => {
  const statusCode = error instanceof Error && 'statusCode' in error
    ? (error as { statusCode?: number }).statusCode
    : undefined;

  if (statusCode === 403 || statusCode === 404) {
    try {
      await recordAudit({
        userId,
        action: 'authorization.denied',
        entityType: resourceType,
        metadata: {
          method: req.method,
          path: req.path,
          resourceId,
        },
      });
    } catch (auditError) {
      next(auditError);
      return;
    }
  }

  next(error);
};

export const requireProjectAccess = (
  accessType: ProjectAccessType,
  parameter = 'projectId',
): RequestHandler => async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;

  try {
    const projectId = normalizeResourceId(paramAsOptionalString(req.params[parameter]), 'project id');
    await assertProjectAccess(userId, projectId, accessType);
    next();
  } catch (error) {
    await continueWithAudit(error, req, userId, 'project', paramAsOptionalString(req.params[parameter]), next);
  }
};

export const requireProjectManager = (parameter = 'projectId'): RequestHandler =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = requireUser(req, res);
    if (!userId) return;

    try {
      const projectId = normalizeResourceId(paramAsOptionalString(req.params[parameter]), 'project id');
      await assertProjectManager(userId, projectId);
      next();
    } catch (error) {
      await continueWithAudit(error, req, userId, 'project', paramAsOptionalString(req.params[parameter]), next);
    }
  };

export const requireAdministrator: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const context = await getAuthorizationContext(userId);
    if (!context.globalRoles.includes('administrator')) {
      res.status(403).json({ message: 'Only an administrator can edit project details.' });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};

export const requireProjectMember = (parameter = 'projectId'): RequestHandler =>
  requireProjectAccess('member', parameter);

export const requireNonAdministrator: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const context = await getAuthorizationContext(userId);
    if (context.globalRoles.includes('administrator')) {
      res.status(403).json({ message: 'Administrators have read-only access to documents and reports.' });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};

export const requireDocumentAccess = (
  accessType: DocumentAccessType,
  parameter = 'documentId',
): RequestHandler => async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;

  try {
    const documentId = normalizeResourceId(paramAsOptionalString(req.params[parameter]), 'document id');
    await assertDocumentAccess(userId, documentId, accessType);
    next();
  } catch (error) {
    await continueWithAudit(error, req, userId, 'document', paramAsOptionalString(req.params[parameter]), next);
  }
};
