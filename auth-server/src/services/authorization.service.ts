import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import {
  documents,
  permissions,
  projectMembers,
  projects,
  rolePermissions,
  roles,
  userRoles,
  users,
} from '../db/schema';
import { RoleName, ROLE_NAMES } from '../types/auth.types';
import { assertUuidWith } from '../utils/validation';
import {
  canAccessDocument,
  canAccessProject,
  DocumentAccessType,
  DocumentPolicyContext,
  ProjectAccessType,
  ProjectPolicyContext,
} from './authorization.policy';

const authorizationError = (
  message: string,
  statusCode: number,
  code: string,
): Error & { statusCode: number; code: string } =>
  Object.assign(new Error(message), { statusCode, code });

export const normalizeResourceId = (value: string | undefined, label: string): string => {
  if (!value) {
    throw authorizationError(`Invalid ${label}`, 400, 'INVALID_RESOURCE_ID');
  }
  assertUuidWith(value, label, (notLabel) =>
    authorizationError(`Invalid ${notLabel}`, 400, 'INVALID_RESOURCE_ID'),
  );
  return value;
};

interface AuthorizationContext {
  userId: string;
  isActive: boolean;
  globalRoles: RoleName[];
  permissions: string[];
}

export const getAuthorizationContext = async (userId: string): Promise<AuthorizationContext> => {
  const [user] = await db
    .select({ id: users.id, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || !user.isActive) {
    throw authorizationError('Account is inactive or unavailable.', 401, 'ACCOUNT_UNAVAILABLE');
  }

  const roleRows = await db
    .select({ roleName: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(userRoles.userId, userId), isNull(userRoles.projectId)));

  const permissionRows = await db
    .select({ permissionName: permissions.name })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(and(eq(userRoles.userId, userId), isNull(userRoles.projectId)));

  return {
    userId,
    isActive: user.isActive,
    globalRoles: [...new Set(roleRows.map((row) => row.roleName as RoleName))],
    permissions: [...new Set(permissionRows.map((row) => row.permissionName))],
  };
};

const getProjectContext = async (
  userId: string,
  projectId: string,
): Promise<ProjectPolicyContext> => {
  const context = await getAuthorizationContext(userId);
  const [project] = await db
    .select({ id: projects.id, projectManagerId: projects.projectManagerId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    throw authorizationError('Project not found.', 404, 'PROJECT_NOT_FOUND');
  }

  const [membership] = await db
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .where(and(
      eq(projectMembers.projectId, projectId),
      eq(projectMembers.userId, userId),
      eq(projectMembers.isActive, true),
    ))
    .limit(1);

  const projectRoleRows = await db
    .select({ roleName: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(userRoles.userId, userId), eq(userRoles.projectId, projectId)));

  const projectRoles = [...new Set(projectRoleRows.map((row) => row.roleName as RoleName))];
  const isAdministrator = context.globalRoles.includes(ROLE_NAMES.ADMINISTRATOR);
  const isProjectManager = project.projectManagerId === userId
    || projectRoles.includes(ROLE_NAMES.PROJECT_MANAGER);

  return {
    isAdministrator,
    globalRoles: context.globalRoles,
    projectRoles,
    permissions: context.permissions,
    isProjectManager,
    isActiveMember: Boolean(membership) || projectRoles.length > 0,
  };
};

export const assertGlobalPermission = async (
  userId: string,
  permission: string,
): Promise<void> => {
  const context = await getAuthorizationContext(userId);
  if (
    !context.globalRoles.includes(ROLE_NAMES.ADMINISTRATOR)
    && !context.permissions.includes(permission)
  ) {
    throw authorizationError(
      'Forbidden: insufficient permission',
      403,
      'INSUFFICIENT_PERMISSION',
    );
  }
};

export const assertProjectAccess = async (
  userId: string,
  projectId: string,
  accessType: ProjectAccessType,
): Promise<void> => {
  const context = await getProjectContext(userId, projectId);
  if (!canAccessProject(context, accessType)) {
    throw authorizationError('Project not found.', 404, 'PROJECT_NOT_FOUND');
  }
};

export const assertProjectManager = async (
  userId: string,
  projectId: string,
): Promise<void> => assertProjectAccess(userId, projectId, 'manage');

export const assertDocumentAccess = async (
  userId: string,
  documentId: string,
  accessType: DocumentAccessType,
): Promise<void> => {
  const [document] = await db
    .select({
      id: documents.id,
      projectId: documents.projectId,
      uploadedBy: documents.uploadedBy,
    })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!document) {
    throw authorizationError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
  }

  const projectContext = await getProjectContext(userId, document.projectId);
  const context: DocumentPolicyContext = {
    ...projectContext,
    isUploader: document.uploadedBy === userId,
  };

  if (!canAccessDocument(context, accessType)) {
    throw authorizationError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
  }
};
