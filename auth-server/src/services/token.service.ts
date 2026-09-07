import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { refreshTokens } from '../db/schema';
import { env } from '../config/env';
import { JwtPayload, RoleName } from '../types/auth.types';

type TokenPayload = {
  sub: string;
  email: string;
  role: RoleName;
  roles?: RoleName[];
  fullName: string;
  familyId?: string;
};

const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

const tokenError = (message: string): Error & { statusCode: number } =>
  Object.assign(new Error(message), { statusCode: 401 });

const sign = (
  payload: TokenPayload & { jti: string; tokenType: 'access' | 'refresh' },
  secret: string,
  expiresIn: jwt.SignOptions['expiresIn'],
): string =>
  jwt.sign(payload, secret, {
    expiresIn,
    issuer: 'dhis2-pt-auth',
    audience: 'dhis2-pt',
  });

export function signAccessToken(payload: TokenPayload): string {
  return sign(
    { ...payload, jti: crypto.randomUUID(), tokenType: 'access' },
    env.jwtSecret,
    env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  );
}

export async function issueRefreshToken(
  payload: TokenPayload,
  options: { rememberMe: boolean; userAgent?: string; ipAddress?: string; familyId?: string },
): Promise<{ token: string; id: string }> {
  const id = crypto.randomUUID();
  const familyId = options.familyId ?? crypto.randomUUID();
  const expiresIn = options.rememberMe ? '30d' : env.jwtRefreshExpiresIn;
  const token = sign(
    { ...payload, familyId, jti: id, tokenType: 'refresh' },
    env.jwtRefreshSecret,
    expiresIn as jwt.SignOptions['expiresIn'],
  );
  const decoded = jwt.decode(token) as jwt.JwtPayload;

  await db.insert(refreshTokens).values({
    id,
    userId: payload.sub,
    jti: id,
    familyId,
    tokenHash: hashToken(token),
    rememberMe: options.rememberMe,
    expiresAt: new Date((decoded.exp ?? 0) * 1000),
    userAgent: options.userAgent,
    ipAddress: options.ipAddress,
  });

  return { token, id };
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, env.jwtSecret, {
      issuer: 'dhis2-pt-auth',
      audience: 'dhis2-pt',
    }) as JwtPayload;
    if (decoded.tokenType !== 'access' || !decoded.sub || !decoded.jti) {
      throw tokenError('Invalid access token');
    }
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw Object.assign(new Error('Token expired'), { statusCode: 401, code: 'TOKEN_EXPIRED' });
    }
    if (error instanceof Error && 'statusCode' in error) throw error;
    throw tokenError('Invalid access token');
  }
}

export async function refreshAccessToken(
  refreshToken: string,
  metadata: { userAgent?: string; ipAddress?: string },
): Promise<{ accessToken: string; refreshToken: string; rememberMe: boolean }> {
  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(refreshToken, env.jwtRefreshSecret, {
      issuer: 'dhis2-pt-auth',
      audience: 'dhis2-pt',
    }) as JwtPayload;
  } catch {
    throw tokenError('Invalid or expired refresh token');
  }

  if (decoded.tokenType !== 'refresh' || !decoded.jti || !decoded.familyId || !decoded.sub) {
    throw tokenError('Invalid refresh token');
  }

  const [stored] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.jti, decoded.jti))
    .limit(1);

  if (!stored || stored.tokenHash !== hashToken(refreshToken)) {
    throw tokenError('Invalid refresh token');
  }

  if (stored.revokedAt) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, stored.familyId), isNull(refreshTokens.revokedAt)));
    throw tokenError('Refresh token reuse detected');
  }

  if (stored.expiresAt <= new Date()) {
    throw tokenError('Refresh token expired');
  }

  const payload: TokenPayload = {
    sub: decoded.sub,
    email: decoded.email,
    role: decoded.role,
    roles: decoded.roles,
    fullName: decoded.fullName,
    familyId: stored.familyId,
  };
  const accessToken = signAccessToken(payload);
  const rememberMe = stored.rememberMe;
  const replacement = await issueRefreshToken(payload, {
    rememberMe,
    familyId: stored.familyId,
    userAgent: metadata.userAgent,
    ipAddress: metadata.ipAddress,
  });

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date(), replacedByTokenId: replacement.id })
    .where(and(eq(refreshTokens.id, stored.id), isNull(refreshTokens.revokedAt)));

  return { accessToken, refreshToken: replacement.token, rememberMe };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const decoded = jwt.decode(token) as JwtPayload | null;
  if (!decoded?.jti) return;
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.jti, decoded.jti), isNull(refreshTokens.revokedAt)));
}
