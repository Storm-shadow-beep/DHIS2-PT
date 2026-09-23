import fs from 'node:fs';
import { google, drive_v3 } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { env } from './env';

export const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive'];

let cachedDrive: drive_v3.Drive | null = null;

const isDriveDisabled = (): boolean => env.driveDisabled;

export type DriveAuthMode = 'oauth' | 'service-account' | 'unconfigured';

export const isOAuthConfigured = (): boolean =>
  Boolean(env.googleOAuthClientId && env.googleOAuthClientSecret && env.googleOAuthRefreshToken);

export const isServiceAccountConfigured = (): boolean =>
  Boolean(env.googleServiceAccountKeyFile || env.googleServiceAccountJsonB64);

export const getDriveAuthMode = (): DriveAuthMode => {
  if (isDriveDisabled()) return 'unconfigured';
  if (isOAuthConfigured() && (env.driveRootFolderId || env.driveSharedDriveId)) return 'oauth';
  if (isServiceAccountConfigured() && env.driveSharedDriveId) return 'service-account';
  return 'unconfigured';
};

export const isDriveConfigured = (): boolean => getDriveAuthMode() !== 'unconfigured';

const resolveCredentials = (): { keyFile?: string; credentials?: Record<string, unknown> } => {
  try {
    if (env.googleServiceAccountJsonB64) {
      const json = Buffer.from(env.googleServiceAccountJsonB64, 'base64').toString('utf8');
      return { credentials: JSON.parse(json) as Record<string, unknown> };
    }
    if (env.googleServiceAccountKeyFile) {
      if (!fs.existsSync(env.googleServiceAccountKeyFile)) {
        throw new Error(
          `Service account key file not found: ${env.googleServiceAccountKeyFile}`,
        );
      }
      return { keyFile: env.googleServiceAccountKeyFile };
    }
    throw new Error('No Drive service-account credentials configured');
  } catch (error) {
    // Never include key material in the thrown message.
    if (error instanceof Error && error.message.includes('Service account key file not found')) {
      throw error;
    }
    throw new Error('Invalid Drive service-account credentials: failed to parse JSON');
  }
};

/**
 * Singleton Drive v3 client authenticated as the service account.
 * Throws DRIVE_* errors (mapped downstream); never logs credentials.
 */
export const getDriveClient = async (): Promise<drive_v3.Drive> => {
  try {
    if (cachedDrive) return cachedDrive;
    if (isDriveDisabled()) {
      throw driveConfigError('Drive integration is disabled (DRIVE_DISABLED=true)');
    }
    // OAuth user-delegation mode: uploads run as the user, so a regular
    // My Drive folder (DRIVE_ROOT_FOLDER_ID) works — no Shared Drive needed.
    if (isOAuthConfigured()) {
      if (!env.driveRootFolderId && !env.driveSharedDriveId) {
        throw driveConfigError('DRIVE_ROOT_FOLDER_ID is not configured for OAuth Drive mode');
      }
      const oauth2Client = new google.auth.OAuth2(
        env.googleOAuthClientId,
        env.googleOAuthClientSecret,
      );
      oauth2Client.setCredentials({ refresh_token: env.googleOAuthRefreshToken });
      cachedDrive = google.drive({ version: 'v3', auth: oauth2Client });
      return cachedDrive;
    }
    // Service-account mode: SAs have no My Drive quota, so a Shared Drive is mandatory.
    if (!env.driveSharedDriveId) {
      throw driveConfigError(
        'DRIVE_SHARED_DRIVE_ID is not configured (service accounts require a Shared Drive; use OAuth mode for personal Gmail)',
      );
    }
    const { keyFile, credentials } = resolveCredentials();
    const auth = new GoogleAuth({ keyFile, credentials, scopes: DRIVE_SCOPES });
    cachedDrive = google.drive({ version: 'v3', auth });
    return cachedDrive;
  } catch (error) {
    if (isDriveError(error)) throw error;
    throw driveConfigError(error instanceof Error ? error.message : 'Failed to init Drive client');
  }
};

export type DriveError = Error & { statusCode: number; code: string; retryAfterSeconds?: number };

export const driveError = (
  message: string,
  statusCode: number,
  code: string,
  retryAfterSeconds?: number,
): DriveError =>
  Object.assign(new Error(message), { statusCode, code, retryAfterSeconds });

export const driveConfigError = (message: string): DriveError =>
  driveError(message, 500, 'DRIVE_NOT_CONFIGURED');

export const isDriveError = (error: unknown): error is DriveError =>
  error instanceof Error && 'statusCode' in error && 'code' in error;
