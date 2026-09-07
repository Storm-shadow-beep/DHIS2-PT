import {
  PERMISSION_NAMES,
  ROLE_NAMES,
} from '../services/authApi';
import type { PermissionName, RoleName, UserSession } from '../services/authApi';

const ROLE_ALIASES: Record<string, RoleName> = {
  administrator: ROLE_NAMES.ADMINISTRATOR,
  admin: ROLE_NAMES.ADMINISTRATOR,
  project_manager: ROLE_NAMES.PROJECT_MANAGER,
  'project manager': ROLE_NAMES.PROJECT_MANAGER,
  team_member: ROLE_NAMES.TEAM_MEMBER,
  'team member': ROLE_NAMES.TEAM_MEMBER,
  developer: ROLE_NAMES.TEAM_MEMBER,
  'system analyst': ROLE_NAMES.TEAM_MEMBER,
  document_approver: ROLE_NAMES.DOCUMENT_APPROVER,
  'document approver': ROLE_NAMES.DOCUMENT_APPROVER,
};

const ROLE_PERMISSIONS: Record<RoleName, PermissionName[]> = {
  [ROLE_NAMES.ADMINISTRATOR]: Object.values(PERMISSION_NAMES),
  [ROLE_NAMES.PROJECT_MANAGER]: [
    PERMISSION_NAMES.PROJECT_VIEW,
    PERMISSION_NAMES.PROJECT_MANAGE,
    PERMISSION_NAMES.PHASE_MANAGE,
    PERMISSION_NAMES.DOCUMENT_VIEW,
    PERMISSION_NAMES.DOCUMENT_UPLOAD,
    PERMISSION_NAMES.DOCUMENT_DELETE,
  ],
  [ROLE_NAMES.TEAM_MEMBER]: [
    PERMISSION_NAMES.PROJECT_VIEW,
    PERMISSION_NAMES.DOCUMENT_VIEW,
    PERMISSION_NAMES.DOCUMENT_UPLOAD,
    PERMISSION_NAMES.DOCUMENT_DELETE,
  ],
  [ROLE_NAMES.DOCUMENT_APPROVER]: [
    PERMISSION_NAMES.PROJECT_VIEW,
    PERMISSION_NAMES.DOCUMENT_VIEW,
    PERMISSION_NAMES.DOCUMENT_APPROVE,
  ],
};

export const normalizeRole = (role: string): RoleName | null =>
  ROLE_ALIASES[role.trim().toLowerCase()] ?? null;

export const getUserRoles = (user: UserSession): RoleName[] => [
  ...new Set(
    [user.role, ...(user.roles ?? [])]
      .map(normalizeRole)
      .filter((role): role is RoleName => role !== null),
  ),
];

export const getUserPermissions = (user: UserSession): string[] => {
  if (user.permissions && user.permissions.length > 0) {
    return [...new Set(user.permissions)];
  }

  return [
    ...new Set(getUserRoles(user).flatMap((role) => ROLE_PERMISSIONS[role])),
  ];
};

export const hasRole = (user: UserSession | null, role: RoleName): boolean =>
  user ? getUserRoles(user).includes(role) : false;

export const hasPermission = (
  user: UserSession | null,
  permission: PermissionName | string,
): boolean => user ? getUserPermissions(user).includes(permission) : false;

export const getRoleDisplayName = (user: UserSession): string =>
  user.roleDisplayName ||
  getUserRoles(user)
    .map((role) => role.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()))
    .join(', ') ||
  user.role;
