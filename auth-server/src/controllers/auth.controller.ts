import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import * as tokenService from '../services/token.service';
import { asyncHandler } from '../utils/asyncHandler';
import { env } from '../config/env';

const setRefreshCookie = (res: Response, token: string, rememberMe: boolean): void => {
  res.cookie(env.refreshTokenCookieName, token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    path: '/api/auth',
    maxAge: rememberMe ? env.rememberMeMaxAgeMs : env.refreshTokenMaxAgeMs,
  });
};

const clearRefreshCookie = (res: Response): void => {
  res.clearCookie(env.refreshTokenCookieName, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    path: '/api/auth',
  });
};

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { fullName, email, password, confirmPassword } = req.body as {
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  };
  const user = await authService.register({
    fullName: fullName ?? '',
    email: email ?? '',
    password: password ?? '',
    confirmPassword: confirmPassword ?? '',
  });
  res.status(201).json({ message: 'Account created successfully', user });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, rememberMe } = req.body as {
    email?: string;
    password?: string;
    rememberMe?: boolean;
  };
  const result = await authService.login(
    { email: email ?? '', password: password ?? '', rememberMe },
    { userAgent: req.get('user-agent'), ipAddress: req.ip },
  );
  setRefreshCookie(res, result.refreshToken, Boolean(rememberMe));
  res.json({ message: 'Logged in', user: result.user, accessToken: result.accessToken });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[env.refreshTokenCookieName] as string | undefined;
  if (!token) {
    res.status(401).json({ message: 'Refresh token required' });
    return;
  }
  const result = await tokenService.refreshAccessToken(token, {
    userAgent: req.get('user-agent'),
    ipAddress: req.ip,
  });
  setRefreshCookie(res, result.refreshToken, result.rememberMe);
  res.json({ accessToken: result.accessToken });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[env.refreshTokenCookieName] as string | undefined;
  if (token) await tokenService.revokeRefreshToken(token);
  clearRefreshCookie(res);
  res.json({ message: 'Logged out' });
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const email = String(req.body?.email ?? '');
  await authService.requestPasswordReset(email);
  res.json({ message: 'If that email exists, a reset link has been sent.' });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string };
  await authService.resetPassword({ token: token ?? '', newPassword: newPassword ?? '' });
  res.json({ message: 'Password reset successful' });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user ? await authService.getUserById(req.user.sub) : null;
  if (!user) {
    res.status(401).json({ message: 'Not authenticated' });
    return;
  }
  res.json({ user });
});
