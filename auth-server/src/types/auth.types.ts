export const ROLE_NAMES = {
  ADMINISTRATOR: 'administrator',
  PROJECT_MANAGER: 'project_manager',
  TEAM_MEMBER: 'team_member',
  DOCUMENT_APPROVER: 'document_approver',
} as const;

export type RoleName = (typeof ROLE_NAMES)[keyof typeof ROLE_NAMES];

export interface SafeUser {
  id: string;
  fullName: string;
  email: string;
  role: RoleName;
  roleDisplayName: string;
}

export interface JwtPayload {
  sub: string;
  jti: string;
  tokenType: 'access' | 'refresh';
  email: string;
  role: RoleName;
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
