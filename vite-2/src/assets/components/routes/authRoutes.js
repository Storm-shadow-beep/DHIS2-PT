import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, logout, getMe } from '../controllers/authController.js';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many authentication attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const createAuthRouter = (pool) => {
  const router = Router();

  router.post('/register', authLimiter, register(pool));
  router.post('/login', authLimiter, login(pool));
  router.post('/logout', logout(pool));
  router.get('/me', getMe(pool));

  return router;
};