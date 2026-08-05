import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';

export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  const { user, pass, host, port, secure } = env.mail.smtp;
  if (!user || !pass) return null;

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
  }
  return transporter;
}

/**
 * Sends mail via Gmail SMTP when SMTP_USER + SMTP_PASS are set.
 * Otherwise logs to console (dev-safe; never throws).
 */
export async function sendMail(input: SendMailInput): Promise<{ sent: boolean; mode: 'smtp' | 'console' }> {
  const to = input.to.trim().toLowerCase();
  if (!to || !to.includes('@')) {
    console.warn('[mailer] skip: invalid recipient', input.to);
    return { sent: false, mode: 'console' };
  }

  const transport = getTransporter();
  if (!transport) {
    console.info(
      `[mailer:console] To: ${to}\nSubject: ${input.subject}\n(Set SMTP_USER + SMTP_PASS to send via ${env.mail.from})`
    );
    return { sent: false, mode: 'console' };
  }

  await transport.sendMail({
    from: env.mail.from,
    to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: 'odistudio24@gmail.com',
  });

  console.info(`[mailer:smtp] sent "${input.subject}" → ${to}`);
  return { sent: true, mode: 'smtp' };
}

/** Fire-and-forget wrapper — never rejects callers. */
export function sendMailSafe(input: SendMailInput): void {
  void sendMail(input).catch((err) => {
    console.error('[mailer] send failed:', err instanceof Error ? err.message : err);
  });
}
