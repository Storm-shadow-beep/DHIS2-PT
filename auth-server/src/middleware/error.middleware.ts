import { Request, Response, NextFunction } from 'express';

export const notFound = (req: Request, res: Response): void => {
  res.status(404).json({ message: `Not Found - ${req.originalUrl}` });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (
  err: Error & { statusCode?: number; isJoi?: boolean; details?: unknown; code?: unknown; name?: string },
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Multer (Drive uploads): normalize to stable API errors with try-catch-safe codes.
  try {
    if (err?.name === 'MulterError') {
      const multerCode = typeof err.code === 'string' ? err.code : '';
      if (multerCode === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ message: 'File exceeds the configured upload limit', code: 'FILE_TOO_LARGE' });
        return;
      }
      if (multerCode === 'LIMIT_FILE_COUNT' || multerCode === 'LIMIT_UNEXPECTED_FILE') {
        res.status(400).json({ message: 'Send exactly one file in the "file" field', code: 'VALIDATION_ERROR' });
        return;
      }
      res.status(400).json({ message: 'File upload failed', code: 'VALIDATION_ERROR' });
      return;
    }
  } catch {
    // Fall through to generic handling — error mapping must never throw.
  }
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
