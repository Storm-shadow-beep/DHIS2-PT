import { RoleName } from '../types/auth.types';

export type ProjectAccessType =
  | 'view'
  | 'manage'
  | 'member'
  | 'phaseManage'
  | 'publish'
  | 'reportView'
  | 'reportCreate';

export type DocumentAccessType = 'view' | 'upload' | 'delete' | 'approve';

export interface ProjectPolicyContext {
  isAdministrator: boolean;
  globalRoles: RoleName[];
  projectRoles: RoleName[];
  permissions: string[];
  isProjectManager: boolean;
  isActiveMember: boolean;
}

export interface DocumentPolicyContext extends ProjectPolicyContext {
  isUploader: boolean;
}

const hasPermission = (context: ProjectPolicyContext, permission: string): boolean =>
  context.permissions.includes(permission);

export const canAccessProject = (
  context: ProjectPolicyContext,
  accessType: ProjectAccessType,
): boolean => {
  if (context.isAdministrator) return true;

  switch (accessType) {
    case 'view':
    case 'reportView':
      return hasPermission(context, 'project:view') && (
        context.isProjectManager || context.isActiveMember
      );
    case 'member':
      return hasPermission(context, 'project:view') && (
        context.isActiveMember || context.isProjectManager
      );
    case 'manage':
      return hasPermission(context, 'project:manage') && context.isProjectManager;
    case 'phaseManage':
      return hasPermission(context, 'phase:manage') && context.isProjectManager;
    case 'publish':
      return hasPermission(context, 'project:publish') && context.isProjectManager;
    case 'reportCreate':
      return hasPermission(context, 'report:create') && (
        context.isProjectManager || context.isActiveMember
      );
  }
};

export const canAccessDocument = (
  context: DocumentPolicyContext,
  accessType: DocumentAccessType,
): boolean => {
  // Administrators can audit documents, but document submission, deletion,
  // and review remain scoped to the users who perform those workflows.
  if (context.isAdministrator) return accessType === 'view';

  switch (accessType) {
    case 'view':
      return canAccessProject(context, 'view') && hasPermission(context, 'document:view');
    case 'upload':
      return canAccessProject(context, 'member') && hasPermission(context, 'document:upload');
    case 'delete':
      return hasPermission(context, 'document:delete') && (
        (context.isUploader && canAccessProject(context, 'member')) ||
        canAccessProject(context, 'manage')
      );
    case 'approve':
      return canAccessProject(context, 'view') && hasPermission(context, 'document:approve');
  }
};
