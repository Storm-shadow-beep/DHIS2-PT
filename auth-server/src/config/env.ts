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
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? '',
  resendFromName: process.env.RESEND_FROM_NAME ?? 'Project Management Software',
  otpEmailProvider: (process.env.OTP_EMAIL_PROVIDER ?? 'resend') as 'resend' | 'smtp' | 'file',
  smtpHost: process.env.SMTP_HOST ?? '127.0.0.1',
  smtpPort: Number(process.env.SMTP_PORT) || 1025,
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPassword: process.env.SMTP_PASSWORD ?? '',
  smtpFromEmail: process.env.SMTP_FROM_EMAIL ?? 'no-reply@localhost',
  smtpFromName: process.env.SMTP_FROM_NAME ?? 'Project Management Software',
  otpExpiryMinutes: Number(process.env.OTP_EXPIRY_MINUTES) || 10,
  otpMaxAttempts: Number(process.env.OTP_MAX_ATTEMPTS) || 5,
  otpResendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS) || 60,
  otpMaxSendsPerWindow: Number(process.env.OTP_MAX_SENDS_PER_WINDOW) || 5,
  otpSendWindowMinutes: Number(process.env.OTP_SEND_WINDOW_MINUTES) || 15,
  passwordResetExpiryMinutes: Number(process.env.PASSWORD_RESET_EXPIRY_MINUTES) || 60,
} as const;
