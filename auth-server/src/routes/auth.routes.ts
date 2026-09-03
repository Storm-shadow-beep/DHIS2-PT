import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as authController from '../controllers/auth.controller';
import { protect } from '../middleware/auth.middleware';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many attempts, try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public
router.post('/login', authLimiter, authController.login);
router.post('/refresh', authController.refresh);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password', authLimiter, authController.resetPassword);

// Authenticated
router.get('/me', protect, authController.me);
router.post('/logout', authController.logout);

// Public registration creates a Team Member account. Privileged role assignment remains administrative.
router.post('/register', authController.register);

export default router;
