import {
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
  return [...new Set(user.permissions ?? [])];
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
