import { Request, Response, NextFunction } from 'express';

export const notFound = (req: Request, res: Response): void => {
  res.status(404).json({ message: `Not Found - ${req.originalUrl}` });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (
  err: Error & { statusCode?: number; isJoi?: boolean; details?: unknown },
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const status = err.statusCode ?? 500;
  const payload: Record<string, unknown> = {
    message: err.message || 'Internal Server Error',
  };

  if ('code' in err && typeof err.code === 'string') payload.code = err.code;
  if ('retryAfterSeconds' in err && typeof err.retryAfterSeconds === 'number') {
    payload.retryAfterSeconds = err.retryAfterSeconds;
    res.setHeader('Retry-After', String(err.retryAfterSeconds));
  }

  if (process.env.NODE_ENV !== 'production') {
    payload.stack = err.stack;
  }

  if (err.isJoi) {
    res.status(400).json({ message: err.message, details: err.details });
    return;
  }

  res.status(status).json(payload);
};
