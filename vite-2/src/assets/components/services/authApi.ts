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

export interface UserSession {
  id: string;
  fullName: string;
  email: string;
  role: string;
  roleDisplayName?: string;
  roles?: string[];
  permissions: string[];
}

export interface OtpChallenge {
  requiresOtp: true;
  challengeId: string;
  expiresAt: string;
  resendAvailableAt: string;
  message?: string;
}

export interface AuthResponse {
  user: UserSession;
  accessToken?: string;
  message?: string;
}

export class AuthApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    status: number,
    details: { code?: string; retryAfterSeconds?: number } = {},
  ) {
    super(message);
    this.name = 'AuthApiError';
    this.status = status;
    this.code = details.code;
    this.retryAfterSeconds = details.retryAfterSeconds;
  }
}

let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;
let currentUserInFlight: Promise<UserSession | null> | null = null;
const sessionListeners = new Set<(authenticated: boolean) => void>();

const notifySessionChange = (authenticated: boolean): void => {
  sessionListeners.forEach((listener) => listener(authenticated));
};

export const subscribeToSessionChanges = (
  listener: (authenticated: boolean) => void,
): (() => void) => {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
};

const clearAccessToken = (notify = false): void => {
  accessToken = null;
  if (notify) notifySessionChange(false);
};

const requestRefresh = async (): Promise<string | null> => {
  if (!refreshInFlight) {
    refreshInFlight = fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) {
          clearAccessToken();
          return null;
        }

        const data = (await response.json()) as { accessToken?: string };
        accessToken = data.accessToken ?? null;
        return accessToken;
      })
      .catch(() => {
        clearAccessToken();
        return null;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
};

export const authFetch = async (
  url: string,
  init: RequestInit = {},
  retry = true,
): Promise<Response> => {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(url, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (response.status !== 401 || !retry || url.endsWith('/refresh')) {
    return response;
  }

  const refreshedToken = await requestRefresh();
  if (!refreshedToken) {
    clearAccessToken(true);
    return response;
  }

  return authFetch(url, init, false);
};

const parseResponse = async <T>(response: Response): Promise<T> => {
  const data = await response.json().catch(() => null) as (T & {
    message?: string;
    code?: string;
    retryAfterSeconds?: number;
  }) | null;

  if (!response.ok) {
    const headerRetryAfter = Number(response.headers.get('Retry-After'));
    throw new AuthApiError(
      data?.message || `Authentication request failed (${response.status}).`,
      response.status,
      {
        code: data?.code,
        retryAfterSeconds: data?.retryAfterSeconds
          ?? (Number.isFinite(headerRetryAfter) && headerRetryAfter > 0 ? headerRetryAfter : undefined),
      },
    );
  }

  return data as T;
};

export const loginApi = async (
  email: string,
  password: string,
  rememberMe: boolean,
): Promise<OtpChallenge> => {
  const response = await authFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, rememberMe }),
  }, false);
  clearAccessToken();
  return parseResponse<OtpChallenge>(response);
};

export const verifyOtpApi = async (
  challengeId: string,
  code: string,
  rememberMe: boolean,
): Promise<UserSession> => {
  const response = await authFetch('/api/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId, code, rememberMe }),
  }, false);
  const data = await parseResponse<AuthResponse>(response);
  accessToken = data.accessToken ?? null;
  notifySessionChange(true);
  return data.user;
};

export const resendOtpApi = async (challengeId: string): Promise<OtpChallenge> => {
  const response = await authFetch('/api/auth/resend-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId }),
  }, false);
  return parseResponse<OtpChallenge>(response);
};

export const requestPasswordResetApi = async (email: string): Promise<void> => {
  const response = await authFetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  }, false);
  await parseResponse<{ message: string }>(response);
};

export const resetPasswordApi = async (token: string, newPassword: string): Promise<void> => {
  const response = await authFetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  }, false);
  await parseResponse<{ message: string }>(response);
};

export const registerApi = async (input: {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}): Promise<AuthResponse> => {
  const response = await authFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }, false);
  return parseResponse<AuthResponse>(response);
};

export const getCurrentUserApi = async (): Promise<UserSession | null> => {
  if (!currentUserInFlight) {
    currentUserInFlight = (async () => {
      const response = await authFetch('/api/auth/me');
      if (response.status === 401) return null;
      const data = await parseResponse<AuthResponse>(response);
      return data.user;
    })().finally(() => {
      currentUserInFlight = null;
    });
  }

  return currentUserInFlight;
};

export const logoutApi = async (): Promise<void> => {
  try {
    const response = await authFetch('/api/auth/logout', { method: 'POST' }, false);
    if (!response.ok) await parseResponse<void>(response);
  } finally {
    clearAccessToken();
    notifySessionChange(false);
  }
  };

  export const changePasswordApi = async (currentPassword: string, newPassword: string): Promise<void> => {
    const response = await authFetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    await parseResponse<{ message: string }>(response);
    clearAccessToken(true);
};
