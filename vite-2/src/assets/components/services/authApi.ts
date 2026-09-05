export interface UserSession {
  id: string;
  fullName: string;
  email: string;
  role: string;
  roleDisplayName?: string;
}

export interface OtpChallenge {
  requiresOtp: true;
  challengeId: string;
  expiresAt: string;
  resendAvailableAt: string;
  message?: string;
}

interface AuthResponse {
  user: UserSession;
  accessToken?: string;
  message?: string;
}

let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

const requestRefresh = async (): Promise<string | null> => {
  if (!refreshInFlight) {
    refreshInFlight = fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as { accessToken?: string };
        accessToken = data.accessToken ?? null;
        return accessToken;
      })
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
};

const authFetch = async (url: string, init: RequestInit = {}, retry = true): Promise<Response> => {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(url, { ...init, headers, credentials: 'include' });
  if (response.status !== 401 || !retry || url.endsWith('/refresh')) return response;

  const refreshedToken = await requestRefresh();
  if (!refreshedToken) return response;
  return authFetch(url, init, false);
};

const parseResponse = async <T>(response: Response): Promise<T> => {
  const data = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(data.message || 'Authentication request failed.');
  return data;
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
  const data = await parseResponse<OtpChallenge>(response);
  accessToken = null;
  return data;
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
  try {
    const response = await authFetch('/api/auth/me');
    if (response.status === 401) return null;
    const data = await parseResponse<AuthResponse>(response);
    return data.user;
  } catch {
    return null;
  }
};

export const logoutApi = async (): Promise<void> => {
  try {
    await authFetch('/api/auth/logout', { method: 'POST' }, false);
  } finally {
    accessToken = null;
  }
};
