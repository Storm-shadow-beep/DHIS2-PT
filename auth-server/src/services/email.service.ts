import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import { env } from '../config/env';

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;
const smtpTransport = env.otpEmailProvider === 'smtp'
  ? nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: false,
    auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPassword } : undefined,
  })
  : null;

async function sendTextEmail(input: { to: string; subject: string; text: string; fileSuffix: string }): Promise<void> {
  if (env.otpEmailProvider === 'file') {
    if (env.nodeEnv === 'production') {
      throw new Error('File email delivery is not allowed in production');
    }
    const mailboxDirectory = path.resolve(process.cwd(), '.local-mailbox');
    const filename = `${new Date().toISOString().replace(/[:.]/g, '-')}-${input.to.replace(/[^a-z0-9]/gi, '_')}-${input.fileSuffix}.txt`;
    await mkdir(mailboxDirectory, { recursive: true });
    await writeFile(
      path.join(mailboxDirectory, filename),
      `To: ${input.to}\nSubject: ${input.subject}\n\n${input.text}\n`,
      { encoding: 'utf8', flag: 'wx' },
    );
    return;
  }

  if (env.otpEmailProvider === 'smtp') {
    if (!smtpTransport) throw new Error('Local SMTP delivery is not configured');
    await smtpTransport.sendMail({
      from: `${env.smtpFromName} <${env.smtpFromEmail}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    return;
  }

  if (!resend || !env.resendFromEmail) {
    throw new Error('Resend email delivery is not configured');
  }

  const result = await resend.emails.send({
    from: `${env.resendFromName} <${env.resendFromEmail}>`,
    to: [input.to],
    subject: input.subject,
    text: input.text,
  });

  if (result.error) {
    throw new Error(`Resend delivery failed: ${result.error.message}`);
  }
}

export function sendLoginOtpEmail(input: {
  to: string;
  code: string;
  expiresInMinutes: number;
}): Promise<void> {
  return sendTextEmail({
    to: input.to,
    subject: 'Your sign-in verification code',
    text: [
      `Your Project Management Software verification code is ${input.code}.`,
      `This code expires in ${input.expiresInMinutes} minutes.`,
      'If you did not try to sign in, you can safely ignore this email.',
    ].join('\n\n'),
    fileSuffix: 'otp',
  });
}

export function sendPasswordChangeOtpEmail(input: {
  to: string;
  code: string;
  expiresInMinutes: number;
}): Promise<void> {
  return sendTextEmail({
    to: input.to,
    subject: 'Confirm your password change',
    text: [
      `Your Project Management Software verification code is ${input.code}.`,
      `Enter this code to confirm your password change. It expires in ${input.expiresInMinutes} minutes.`,
      'If you did not request a password change, change your password immediately and contact your administrator.',
    ].join('\n\n'),
    fileSuffix: 'password-change-otp',
  });
}

export function sendPasswordResetEmail(input: {
  to: string;
  resetLink: string;
  expiresInMinutes: number;
}): Promise<void> {
  return sendTextEmail({
    to: input.to,
    subject: 'Reset your Project Management Software password',
    text: [
      'We received a request to reset your password.',
      `Use this link to choose a new password: ${input.resetLink}`,
      `This link expires in ${input.expiresInMinutes} minutes and can only be used once.`,
      'If you did not request a password reset, you can safely ignore this email.',
    ].join('\n\n'),
    fileSuffix: 'password-reset',
  });
}
