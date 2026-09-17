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

const nodeEnv = process.env.NODE_ENV ?? 'development';

function requireSecret(key: string, developmentFallback: string): string {
  const value = process.env[key];
  if (!value) {
    if (nodeEnv === 'production') {
      throw new Error(`Missing required production secret: ${key}`);
    }
    return developmentFallback;
  }

  if (
    nodeEnv === 'production' &&
    (value === developmentFallback || value.length < 32)
  ) {
    throw new Error(`${key} must be a strong, unique secret in production`);
  }

  return value;
}

export const env = {
  nodeEnv,
  port: Number(process.env.PORT) || 5000,
  databaseUrl: requireEnv('DATABASE_URL'),
  jwtSecret: requireSecret('JWT_SECRET', 'dev_jwt_secret_change_me'),
  jwtRefreshSecret: requireSecret('JWT_REFRESH_SECRET', 'dev_refresh_secret_change_me'),
  otpHmacSecret: requireSecret('OTP_HMAC_SECRET', 'dev_otp_hmac_secret_change_me'),
  jwtExpiresIn: parseJwtLifetime(process.env.JWT_EXPIRES_IN, '15m'),
  jwtRefreshExpiresIn: parseJwtLifetime(process.env.JWT_REFRESH_EXPIRES_IN, '7d'),
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 12,
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
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
  projectManagerEmail: process.env.PROJECT_MANAGER_EMAIL?.trim() || '',
  projectManagerPassword: process.env.PROJECT_MANAGER_PASSWORD || '',
  adminEmail: (process.env.ADMIN_EMAIL?.trim() || 'admin@example.org').toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || 'admin@123',
  registrationRateLimitWindowMs: Number(process.env.REGISTRATION_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  registrationRateLimitMax: Number(process.env.REGISTRATION_RATE_LIMIT_MAX) || 5,
  driveDisabled: process.env.DRIVE_DISABLED === 'true',
  driveSharedDriveId: process.env.DRIVE_SHARED_DRIVE_ID?.trim() || '',
  driveRootFolderId: process.env.DRIVE_ROOT_FOLDER_ID?.trim() || '',
  googleServiceAccountKeyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE?.trim() || '',
  googleServiceAccountJsonB64: process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64?.trim() || '',
  googleOAuthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || '',
  googleOAuthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || '',
  googleOAuthRefreshToken: process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim() || '',
  driveUploadMaxBytes: Number(process.env.DRIVE_UPLOAD_MAX_BYTES) || 50 * 1024 * 1024,
} as const;

if (!env.driveDisabled && env.nodeEnv === 'production') {
  const hasOAuth =
    Boolean(env.googleOAuthClientId) &&
    Boolean(env.googleOAuthClientSecret) &&
    Boolean(env.googleOAuthRefreshToken);
  const hasServiceAccount = Boolean(
    env.googleServiceAccountKeyFile || env.googleServiceAccountJsonB64,
  );
  if (!env.driveSharedDriveId && !env.driveRootFolderId) {
    throw new Error(
      'Missing required production env: DRIVE_SHARED_DRIVE_ID or DRIVE_ROOT_FOLDER_ID',
    );
  }
  if (!hasServiceAccount && !hasOAuth) {
    throw new Error(
      'Missing required production env: GOOGLE_SERVICE_ACCOUNT_KEY_FILE/GOOGLE_SERVICE_ACCOUNT_JSON_B64 or GOOGLE_OAUTH_CLIENT_ID/GOOGLE_OAUTH_CLIENT_SECRET/GOOGLE_OAUTH_REFRESH_TOKEN',
    );
  }
  if (!hasOAuth && !env.driveSharedDriveId) {
    throw new Error(
      'Service-account mode requires DRIVE_SHARED_DRIVE_ID (service accounts have no My Drive quota)',
    );
  }
}
