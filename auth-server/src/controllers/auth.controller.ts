import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import * as tokenService from '../services/token.service';
import * as otpService from '../services/otp.service';
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
  const identity = await authService.verifyLoginCredentials({
    email: email ?? '',
    password: password ?? '',
    rememberMe,
  });
  const challenge = await otpService.createLoginChallenge(identity, {
    userAgent: req.get('user-agent'),
    ipAddress: req.ip,
  });
  res.json({
    message: 'Verification code sent',
    requiresOtp: true,
    ...challenge,
  });
});

export const verifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const { challengeId, code, rememberMe } = req.body as {
    challengeId?: string;
    code?: string;
    rememberMe?: boolean;
  };
  if (!challengeId) {
    res.status(400).json({ message: 'Verification session is required.' });
    return;
  }

  const result = await otpService.verifyLoginChallenge(
    challengeId,
    code ?? '',
    Boolean(rememberMe),
    (userId, shouldRememberMe) =>
      authService.issueTokensForUser(userId, shouldRememberMe, {
        userAgent: req.get('user-agent'),
        ipAddress: req.ip,
      }),
  );
  setRefreshCookie(res, result.refreshToken, Boolean(rememberMe));
  res.json({ message: 'Logged in', user: result.user, accessToken: result.accessToken });
});

export const resendOtp = asyncHandler(async (req: Request, res: Response) => {
  const { challengeId } = req.body as { challengeId?: string };
  if (!challengeId) {
    res.status(400).json({ message: 'Verification session is required.' });
    return;
  }

  const challenge = await otpService.resendLoginChallenge(challengeId, {
    userAgent: req.get('user-agent'),
    ipAddress: req.ip,
  });
  res.json({ message: 'Verification code sent', requiresOtp: true, ...challenge });
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

export const logoutOtherSessions = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ message: 'Not authenticated' });
    return;
  }
  const currentToken = req.cookies?.[env.refreshTokenCookieName] as string | undefined;
  await tokenService.revokeOtherRefreshTokens(req.user.sub, currentToken);
  res.json({ message: 'Other sessions have been signed out' });
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

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!req.user) {
    res.status(401).json({ message: 'Not authenticated' });
    return;
  }

  await authService.changePassword({
    userId: req.user.sub,
    currentPassword: currentPassword ?? '',
    newPassword: newPassword ?? '',
  });
  clearRefreshCookie(res);
  res.json({ message: 'Password changed successfully. Please sign in again.' });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user ? await authService.getUserById(req.user.sub) : null;
  if (!user) {
    res.status(401).json({ message: 'Not authenticated' });
    return;
  }
  res.json({ user });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ message: 'Not authenticated' });
    return;
  }
  const { fullName, profilePicture } = req.body as {
    fullName?: string;
    profilePicture?: string | null;
  };
  const user = await authService.updateProfile({
    userId: req.user.sub,
    ...(fullName !== undefined ? { fullName } : {}),
    ...(profilePicture !== undefined ? { profilePicture } : {}),
  });
  res.json({ message: 'Profile updated successfully', user });
});
