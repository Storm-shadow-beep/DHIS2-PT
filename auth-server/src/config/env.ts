import dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (!val) throw new Error(`Missing required env: ${key}`);
  return val;
}

function parseJwtLifetime(value: string | undefined, fallback: string): number | string {
  const raw = value ?? fallback;
  if (/^\d+(?:\*\d+)+$/.test(raw)) {
    return raw.split('*').reduce((total, part) => total * Number(part), 1);
  }
  return raw;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT) || 5000,
  databaseUrl: requireEnv('DATABASE_URL'),
  jwtSecret: requireEnv('JWT_SECRET', 'dev_jwt_secret_change_me'),
  jwtRefreshSecret: requireEnv('JWT_REFRESH_SECRET', 'dev_refresh_secret_change_me'),
  jwtExpiresIn: parseJwtLifetime(process.env.JWT_EXPIRES_IN, '15m'),
  jwtRefreshExpiresIn: parseJwtLifetime(process.env.JWT_REFRESH_EXPIRES_IN, '7d'),
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 12,
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  cookieSameSite: (process.env.COOKIE_SAMESITE as 'lax' | 'strict' | 'none') ?? 'lax',
  refreshTokenCookieName: process.env.REFRESH_TOKEN_COOKIE_NAME ?? 'refresh_token',
  refreshTokenMaxAgeMs: Number(process.env.REFRESH_TOKEN_MAX_AGE_MS) || 7 * 24 * 60 * 60 * 1000,
  rememberMeMaxAgeMs: Number(process.env.REMEMBER_ME_MAX_AGE_MS) || 30 * 24 * 60 * 60 * 1000,
} as const;
