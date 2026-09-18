import crypto from 'crypto';
import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../db';
import { otpChallenges } from '../db/schema';
import { env } from '../config/env';
import { SafeUser, RoleName } from '../types/auth.types';
import { sendLoginOtpEmail, sendPasswordChangeOtpEmail } from './email.service';
import { getUserById } from './auth.service';

export const OTP_PURPOSES = {
  login: 'login',
  passwordChange: 'password_change',
} as const;

export type OtpPurpose = (typeof OTP_PURPOSES)[keyof typeof OTP_PURPOSES];

export class OtpError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'OtpError';
  }
}

interface LoginIdentity {
  user: SafeUser;
  role: RoleName;
}

interface ChallengeMetadata {
  ipAddress?: string;
  userAgent?: string;
}

interface ChallengeResponse {
  challengeId: string;
  expiresAt: Date;
  resendAvailableAt: Date;
}

const hashCode = (challengeId: string, code: string): Buffer =>
  crypto.createHmac('sha256', env.otpHmacSecret).update(`${challengeId}:${code}`).digest();

const generateCode = (): string => String(crypto.randomInt(100000, 1000000));

const publicChallenge = (challenge: {
  id: string;
  expiresAt: Date;
  resendAvailableAt: Date;
}): ChallengeResponse => ({
  challengeId: challenge.id,
  expiresAt: challenge.expiresAt,
  resendAvailableAt: challenge.resendAvailableAt,
});

async function getIdentityByUserId(userId: string): Promise<LoginIdentity | null> {
  const user = await getUserById(userId);
  if (!user) return null;
  return {
    role: user.role as RoleName,
    user,
  };
}

async function getRecentSendStats(
  email: string,
  ipAddress: string | undefined,
  now: Date,
  purpose: OtpPurpose,
): Promise<{ count: number; oldestCreatedAt?: Date; limitType?: 'email' | 'ip' }> {
  const since = new Date(now.getTime() - env.otpSendWindowMinutes * 60 * 1000);
  const emailRows = await db
    .select({ id: otpChallenges.id, createdAt: otpChallenges.createdAt })
    .from(otpChallenges)
    .where(and(eq(otpChallenges.email, email), eq(otpChallenges.purpose, purpose), gt(otpChallenges.createdAt, since)))
    .orderBy(asc(otpChallenges.createdAt));
  const ipRows = ipAddress
    ? await db
      .select({ id: otpChallenges.id, createdAt: otpChallenges.createdAt })
      .from(otpChallenges)
      .where(and(eq(otpChallenges.ipAddress, ipAddress), eq(otpChallenges.purpose, purpose), gt(otpChallenges.createdAt, since)))
      .orderBy(asc(otpChallenges.createdAt))
    : [];

  if (emailRows.length >= env.otpMaxSendsPerWindow) {
    return { count: emailRows.length, oldestCreatedAt: emailRows[0]?.createdAt, limitType: 'email' };
  }
  if (ipRows.length >= env.otpMaxSendsPerWindow) {
    return { count: ipRows.length, oldestCreatedAt: ipRows[0]?.createdAt, limitType: 'ip' };
  }
  return { count: Math.max(emailRows.length, ipRows.length) };
}

async function createChallenge(identity: LoginIdentity, metadata: ChallengeMetadata, purpose: OtpPurpose): Promise<{
  challenge: ChallengeResponse;
  code: string;
}> {
  const now = new Date();
  const recentSends = await getRecentSendStats(identity.user.email, metadata.ipAddress, now, purpose);
  if (recentSends.limitType) {
    const retryAfterSeconds = recentSends.oldestCreatedAt
      ? Math.max(1, Math.ceil((recentSends.oldestCreatedAt.getTime() + env.otpSendWindowMinutes * 60 * 1000 - now.getTime()) / 1000))
      : env.otpSendWindowMinutes * 60;
    throw new OtpError(
      recentSends.limitType === 'email'
        ? 'Too many verification codes requested for this email. Try again later.'
        : 'Too many verification requests from this network. Try again later.',
      recentSends.limitType === 'email' ? 'OTP_SEND_RATE_LIMITED' : 'OTP_IP_RATE_LIMITED',
      429,
      retryAfterSeconds,
    );
  }

  const code = generateCode();
  const expiresAt = new Date(now.getTime() + env.otpExpiryMinutes * 60 * 1000);
  const resendAvailableAt = new Date(now.getTime() + env.otpResendCooldownSeconds * 1000);
  const challengeId = crypto.randomUUID();
  const codeHash = hashCode(challengeId, code);

  const challenge = await db.transaction(async (tx) => {
    await tx
      .update(otpChallenges)
      .set({ supersededAt: now, updatedAt: now })
      .where(and(eq(otpChallenges.userId, identity.user.id), eq(otpChallenges.purpose, purpose), isNull(otpChallenges.consumedAt), isNull(otpChallenges.supersededAt)));

    const [created] = await tx
      .insert(otpChallenges)
      .values({
        id: challengeId,
        userId: identity.user.id,
        email: identity.user.email,
        purpose,
        codeHash: codeHash.toString('hex'),
        expiresAt,
        maxAttempts: env.otpMaxAttempts,
        resendAvailableAt,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      })
      .returning({
        id: otpChallenges.id,
        expiresAt: otpChallenges.expiresAt,
        resendAvailableAt: otpChallenges.resendAvailableAt,
      });
    return created;
  });

  try {
    if (purpose === OTP_PURPOSES.passwordChange) {
      await sendPasswordChangeOtpEmail({
        to: identity.user.email,
        code,
        expiresInMinutes: env.otpExpiryMinutes,
      });
    } else {
      await sendLoginOtpEmail({
        to: identity.user.email,
        code,
        expiresInMinutes: env.otpExpiryMinutes,
      });
    }
  } catch (error) {
    await db
      .update(otpChallenges)
      .set({ deliveryFailedAt: new Date(), updatedAt: new Date() })
      .where(eq(otpChallenges.id, challenge.id));
    console.error('[auth] OTP email delivery failed', {
      provider: 'resend',
      message: error instanceof Error ? error.message : 'Unknown delivery error',
    });
    throw new OtpError('Verification email could not be sent. Please try again.', 'OTP_DELIVERY_FAILED', 503);
  }

  return { challenge: publicChallenge(challenge), code };
}

export async function createLoginChallenge(identity: LoginIdentity, metadata: ChallengeMetadata): Promise<ChallengeResponse> {
  const result = await createChallenge(identity, metadata, OTP_PURPOSES.login);
  return result.challenge;
}

async function loadResendableChallenge(challengeId: string, purpose: OtpPurpose) {
  const now = new Date();
  const [current] = await db
    .select()
    .from(otpChallenges)
    .where(and(eq(otpChallenges.id, challengeId), eq(otpChallenges.purpose, purpose)))
    .limit(1);

  if (!current || current.consumedAt || current.supersededAt) {
    throw new OtpError('Verification session is no longer valid.', 'OTP_CHALLENGE_INVALID', 400);
  }

  if (current.resendAvailableAt > now) {
    throw new OtpError(
      'Please wait before requesting another code.',
      'OTP_RESEND_COOLDOWN',
      429,
      Math.ceil((current.resendAvailableAt.getTime() - now.getTime()) / 1000),
    );
  }

  return current;
}

export async function resendLoginChallenge(challengeId: string, metadata: ChallengeMetadata): Promise<ChallengeResponse> {
  const current = await loadResendableChallenge(challengeId, OTP_PURPOSES.login);

  const identity = await getIdentityByUserId(current.userId);
  if (!identity) throw new OtpError('Verification session is no longer valid.', 'OTP_CHALLENGE_INVALID', 400);

  return (await createChallenge(identity, metadata, OTP_PURPOSES.login)).challenge;
}

/** Verify a code and consume the challenge, returning the owning user id. */
async function verifyAndConsumeCode(challengeId: string, code: string, purpose: OtpPurpose): Promise<string> {
  if (!/^\d{6}$/.test(code)) {
    throw new OtpError('Enter the six-digit verification code.', 'OTP_CODE_INVALID', 400);
  }

  return db.transaction(async (tx) => {
    const [challenge] = await tx
      .select()
      .from(otpChallenges)
      .where(and(eq(otpChallenges.id, challengeId), eq(otpChallenges.purpose, purpose)))
      .for('update')
      .limit(1);

    if (!challenge || challenge.consumedAt || challenge.supersededAt || challenge.deliveryFailedAt) {
      throw new OtpError('Verification session is no longer valid.', 'OTP_CHALLENGE_INVALID', 400);
    }
    if (challenge.expiresAt <= new Date()) {
      throw new OtpError('This verification code has expired.', 'OTP_EXPIRED', 400);
    }
    if (challenge.attempts >= challenge.maxAttempts) {
      throw new OtpError('Too many incorrect verification attempts.', 'OTP_ATTEMPTS_EXCEEDED', 429);
    }

    const expected = Buffer.from(challenge.codeHash, 'hex');
    const received = hashCode(challenge.id, code);
    const valid = expected.length === received.length && crypto.timingSafeEqual(expected, received);
    if (!valid) {
      const attempts = challenge.attempts + 1;
      await tx
        .update(otpChallenges)
        .set({
          attempts,
          consumedAt: attempts >= challenge.maxAttempts ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(otpChallenges.id, challenge.id));
      throw new OtpError(
        attempts >= challenge.maxAttempts ? 'Too many incorrect verification attempts.' : 'Incorrect verification code.',
        attempts >= challenge.maxAttempts ? 'OTP_ATTEMPTS_EXCEEDED' : 'OTP_CODE_INVALID',
        attempts >= challenge.maxAttempts ? 429 : 400,
      );
    }

    await tx.update(otpChallenges).set({ consumedAt: new Date(), updatedAt: new Date() }).where(eq(otpChallenges.id, challenge.id));
    return challenge.userId;
  });
}

export async function verifyLoginChallenge(
  challengeId: string,
  code: string,
  rememberMe: boolean,
  issueTokens: (userId: string, rememberMe: boolean) => Promise<{ user: SafeUser; accessToken: string; refreshToken: string }>,
): Promise<{ user: SafeUser; accessToken: string; refreshToken: string }> {
  const userId = await verifyAndConsumeCode(challengeId, code, OTP_PURPOSES.login);
  return issueTokens(userId, rememberMe);
}

export async function createPasswordChangeChallenge(userId: string, metadata: ChallengeMetadata): Promise<ChallengeResponse> {
  const identity = await getIdentityByUserId(userId);
  if (!identity) throw new OtpError('Verification session is no longer valid.', 'OTP_CHALLENGE_INVALID', 400);
  const result = await createChallenge(identity, metadata, OTP_PURPOSES.passwordChange);
  return result.challenge;
}

export async function resendPasswordChangeChallenge(
  challengeId: string,
  metadata: ChallengeMetadata,
  requesterUserId: string,
): Promise<ChallengeResponse> {
  const current = await loadResendableChallenge(challengeId, OTP_PURPOSES.passwordChange);
  if (current.userId !== requesterUserId) {
    throw new OtpError('Verification session is no longer valid.', 'OTP_CHALLENGE_INVALID', 400);
  }

  const identity = await getIdentityByUserId(current.userId);
  if (!identity) throw new OtpError('Verification session is no longer valid.', 'OTP_CHALLENGE_INVALID', 400);

  return (await createChallenge(identity, metadata, OTP_PURPOSES.passwordChange)).challenge;
}

/** Verify a password-change code. Returns the owning user id; rejects challenges owned by anyone else. */
export async function verifyPasswordChangeChallenge(
  challengeId: string,
  code: string,
  requesterUserId: string,
): Promise<string> {
  // Ownership is checked before consuming so a mismatched request cannot
  // burn the legitimate owner's challenge.
  const [challenge] = await db
    .select({ userId: otpChallenges.userId })
    .from(otpChallenges)
    .where(and(eq(otpChallenges.id, challengeId), eq(otpChallenges.purpose, OTP_PURPOSES.passwordChange)))
    .limit(1);
  if (!challenge || challenge.userId !== requesterUserId) {
    throw new OtpError('Verification session is no longer valid.', 'OTP_CHALLENGE_INVALID', 400);
  }
  const userId = await verifyAndConsumeCode(challengeId, code, OTP_PURPOSES.passwordChange);
  if (userId !== requesterUserId) {
    throw new OtpError('Verification session is no longer valid.', 'OTP_CHALLENGE_INVALID', 400);
  }
  return userId;
}
