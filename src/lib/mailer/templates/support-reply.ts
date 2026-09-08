import { BRAND_SOCIAL } from '../brand.js';
import {
  BRAND_EMAIL,
  BRAND_EMAIL_FONT,
  BRAND_EMAIL_UI,
  absoluteUrl,
  escapeHtml,
  renderBrandCta,
  renderBrandEmailShell,
  renderSectionHead,
} from '../layout.js';

export function supportReplyEmail(opts: {
  subject: string;
  reply: string;
  status: string;
}) {
  const C = BRAND_EMAIL;
  const FONT = BRAND_EMAIL_FONT;
  const inboxUrl = absoluteUrl('/dashboard/inbox');
  const statusLabel = opts.status.replace(/_/g, ' ');

  const bodyHtml = `
              <h1 style="margin:0 0 20px;font-family:${FONT};font-size:32px;line-height:1.2;font-weight:700;color:${C.ink};">
                We replied to your ticket.
              </h1>

              <p style="margin:0 0 8px;font-family:${FONT};font-size:16px;line-height:1.7;color:${C.body};">
                Our team has updated your support request. You can read the reply below or in your ODI inbox.
              </p>

              ${renderSectionHead('Ticket')}
              <p style="margin:0 0 6px;font-family:${FONT};font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:${C.body};">
                Subject
              </p>
              <p style="margin:0 0 18px;font-family:${FONT};font-size:16px;font-weight:700;color:${C.ink};">
                ${escapeHtml(opts.subject)}
              </p>
              <p style="margin:0 0 6px;font-family:${FONT};font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_EMAIL_UI.orange};">
                Reply
              </p>
              <p style="margin:0 0 18px;font-family:${FONT};font-size:15px;line-height:1.7;color:${C.body};white-space:pre-wrap;">
                ${escapeHtml(opts.reply)}
              </p>
              <p style="margin:0;font-family:${FONT};font-size:13px;color:${C.body};">
                Status: ${escapeHtml(statusLabel)}
              </p>

              <div style="margin:36px 0 0;">
                ${renderBrandCta(inboxUrl, 'View inbox')}
              </div>`;

  const html = renderBrandEmailShell({
    title: 'We replied to your ticket',
    preheader: `Reply on “${opts.subject}”.`,
    bodyHtml,
  });

  const text = [
    'We replied to your ticket.',
    '',
    `Subject: ${opts.subject}`,
    `Status: ${statusLabel}`,
    '',
    opts.reply,
    '',
    `Inbox: ${inboxUrl}`,
    '',
    BRAND_SOCIAL.map((s) => `${s.label}: ${s.href}`).join('\n'),
    '',
    '— ODI Studio',
  ].join('\n');

  return { subject: `Re: ${opts.subject}`, html, text };
}
