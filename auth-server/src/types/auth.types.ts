export const ROLE_NAMES = {
  ADMINISTRATOR: 'administrator',
  PROJECT_MANAGER: 'project_manager',
  TEAM_MEMBER: 'team_member',
  DOCUMENT_APPROVER: 'document_approver',
} as const;

export type RoleName = (typeof ROLE_NAMES)[keyof typeof ROLE_NAMES];

export const PERMISSION_NAMES = {
  USER_MANAGE: 'user:manage',
  ROLE_MANAGE: 'role:manage',
  PROJECT_VIEW: 'project:view',
  PROJECT_CREATE: 'project:create',
  PROJECT_MANAGE: 'project:manage',
  PROJECT_MEMBER_MANAGE: 'project:member:manage',
  PROJECT_PUBLISH: 'project:publish',
  PHASE_MANAGE: 'phase:manage',
  DOCUMENT_VIEW: 'document:view',
  DOCUMENT_UPLOAD: 'document:upload',
  DOCUMENT_DELETE: 'document:delete',
  DOCUMENT_APPROVE: 'document:approve',
  REPORT_VIEW: 'report:view',
  REPORT_CREATE: 'report:create',
} as const;

export type PermissionName = (typeof PERMISSION_NAMES)[keyof typeof PERMISSION_NAMES];

export interface SafeUser {
  id: string;
  fullName: string;
  profilePicture: string | null;
  email: string;
  role: RoleName;
  roleDisplayName: string;
  roles: RoleName[];
  permissions: string[];
}

export interface JwtPayload {
  sub: string;
  jti: string;
  tokenType: 'access' | 'refresh';
  email: string;
  role: RoleName;
  roles?: RoleName[];
  fullName: string;
  familyId?: string;
  iat?: number;
  exp?: number;
}

export interface LoginInput {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterInput {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}
