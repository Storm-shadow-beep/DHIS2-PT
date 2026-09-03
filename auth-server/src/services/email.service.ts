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

export async function sendLoginOtpEmail(input: {
  to: string;
  code: string;
  expiresInMinutes: number;
}): Promise<void> {
  const subject = 'Your sign-in verification code';
  const text = [
    `Your Project Management Software verification code is ${input.code}.`,
    `This code expires in ${input.expiresInMinutes} minutes.`,
    'If you did not try to sign in, you can safely ignore this email.',
  ].join('\n\n');

  if (env.otpEmailProvider === 'file') {
    if (env.nodeEnv === 'production') {
      throw new Error('File email delivery is not allowed in production');
    }
    const mailboxDirectory = path.resolve(process.cwd(), '.local-mailbox');
    const filename = `${new Date().toISOString().replace(/[:.]/g, '-')}-${input.to.replace(/[^a-z0-9]/gi, '_')}.txt`;
    await mkdir(mailboxDirectory, { recursive: true });
    await writeFile(
      path.join(mailboxDirectory, filename),
      `To: ${input.to}\nSubject: ${subject}\n\n${text}\n`,
      { encoding: 'utf8', flag: 'wx' },
    );
    return;
  }

  if (env.otpEmailProvider === 'smtp') {
    if (!smtpTransport) throw new Error('Local SMTP delivery is not configured');
    await smtpTransport.sendMail({
      from: `${env.smtpFromName} <${env.smtpFromEmail}>`,
      to: input.to,
      subject,
      text,
    });
    return;
  }

  if (!resend || !env.resendFromEmail) {
    throw new Error('Resend email delivery is not configured');
  }

  const result = await resend.emails.send({
    from: `${env.resendFromName} <${env.resendFromEmail}>`,
    to: [input.to],
    subject,
    text,
  });

  if (result.error) {
    throw new Error(`Resend delivery failed: ${result.error.message}`);
  }
}
