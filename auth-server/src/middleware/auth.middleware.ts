import { Request, Response, NextFunction, RequestHandler } from 'express';
import { verifyAccessToken } from '../services/token.service';
import * as authService from '../services/auth.service';

export const protect: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

  if (!token) {
    res.status(401).json({ message: 'Not authenticated. No access token provided.' });
    return;
  }

  try {
    const decoded = verifyAccessToken(token);
    const user = await authService.getUserById(decoded.sub);
    if (!user) {
      res.status(401).json({ message: 'Account is inactive or unavailable.' });
      return;
    }
    req.user = decoded;
    next();
  } catch (error) {
    next(error);
  }
};

export const requireAuthenticatedUser = protect;
