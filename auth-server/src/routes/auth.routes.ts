import { NextFunction, Request, Response, Router } from 'express';
import rateLimit, { Options } from 'express-rate-limit';
import * as authController from '../controllers/auth.controller';
import { protect } from '../middleware/auth.middleware';
import { env } from '../config/env';

const router = Router();

const getRetryAfterSeconds = (req: unknown, windowMs: number): number => {
  const resetTime = (req as { rateLimit?: { resetTime?: Date } })?.rateLimit?.resetTime;
  if (resetTime instanceof Date) {
    return Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
  }
  return Math.ceil(windowMs / 1000);
};

const tooManyRequestsHandler = (message: string, windowMs: number) => {
  return (req: Request, res: Response, _next: NextFunction, options: Options): void => {
    const retryAfterSeconds = getRetryAfterSeconds(req, windowMs);
    res.setHeader('Retry-After', String(retryAfterSeconds));
    res.status(options.statusCode).json({ message, retryAfterSeconds });
  };
};

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyRequestsHandler('Too many attempts, try again later.', 15 * 60 * 1000),
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyRequestsHandler('Too many verification requests, try again later.', 15 * 60 * 1000),
});

const registrationLimiter = rateLimit({
  windowMs: env.registrationRateLimitWindowMs,
  max: env.registrationRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyRequestsHandler(
    'Too many registration attempts, try again later.',
    env.registrationRateLimitWindowMs,
  ),
});

// Public
router.post('/login', authLimiter, authController.login);
router.post('/verify-otp', otpLimiter, authController.verifyOtp);
router.post('/resend-otp', otpLimiter, authController.resendOtp);
router.post('/refresh', authController.refresh);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password', authLimiter, authController.resetPassword);

// Authenticated
router.get('/me', protect, authController.me);
router.post('/logout', authController.logout);
router.post('/logout-other-sessions', protect, authController.logoutOtherSessions);

// Public registration creates a Team Member account. Privileged role assignment remains administrative.
router.post('/register', registrationLimiter, authController.register);
// Password change is OTP-guarded: POST /change-password validates and sends
// the code, POST /change-password/verify confirms it and applies the change.
router.post('/change-password', protect, authController.changePassword);
router.post('/change-password/verify', protect, otpLimiter, authController.verifyPasswordChange);
router.post('/change-password/resend-otp', protect, otpLimiter, authController.resendPasswordChangeOtp);
router.patch('/me', protect, authController.updateProfile);

export default router;
