/** Professional ODI email shell — clean header, Afacad Flux, social footer. */

import { env } from '../../config/env.js';

const C = {
  pageBg: '#F0F2F5',
  navy: '#0A192F',
  ink: '#0F172A',
  muted: '#526074',
  soft: '#8B9AAB',
  line: '#E6EAF0',
  white: '#FFFFFF',
  link: '#0891B2',
  card: '#F7F9FC',
} as const;

const FONT = "'Afacad Flux', Arial, Helvetica, sans-serif";

const SOCIAL = {
  instagram: env.mail.instagramUrl || 'https://www.instagram.com/odi3dstudio/',
  facebook:
    env.mail.facebookUrl ||
    'https://www.facebook.com/people/Oceaniek-Dimension-Industries/61589448369192/',
  linkedin: env.mail.linkedinUrl || 'https://www.linkedin.com/company/odistudioglobal',
  youtube: env.mail.youtubeUrl || 'https://www.youtube.com/@ODI.STUDIO',
  icons: {
    instagram:
      'https://joiezvghtlyeyhuyvnwl.supabase.co/storage/v1/object/public/product-images/brand/email-instagram.png',
    facebook:
      'https://joiezvghtlyeyhuyvnwl.supabase.co/storage/v1/object/public/product-images/brand/email-facebook.png',
    linkedin:
      'https://joiezvghtlyeyhuyvnwl.supabase.co/storage/v1/object/public/product-images/brand/email-linkedin.png',
    youtube:
      'https://joiezvghtlyeyhuyvnwl.supabase.co/storage/v1/object/public/product-images/brand/email-youtube.png',
  },
} as const;

export function absoluteUrl(path: string): string {
  const base = env.frontendUrl;
  if (!path) return base;
  return path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function formatInrFromPaise(paise: number): string {
  return (paise / 100).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

export function renderEmailLayout(opts: {
  preheader?: string;
  /** Small eyebrow above the title, e.g. "Welcome" */
  eyebrow?: string;
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaHref?: string;
  summaryTitle?: string;
  summaryRows?: Array<{ label: string; valueHtml: string }>;
}): string {
  const year = new Date().getFullYear();
  const logoUrl = env.mail.logoUrl;
  const home = absoluteUrl('/');
  const products = absoluteUrl('/products');
  const support = 'odistudio24@gmail.com';

  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${escapeHtml(opts.preheader)}</div>`
    : '';

  const eyebrow = opts.eyebrow
    ? `<p style="margin:0 0 10px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:${C.link};text-align:center;">
        ${escapeHtml(opts.eyebrow)}
      </p>`
    : '';

  const summary =
    opts.summaryRows && opts.summaryRows.length
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 0;border:1px solid ${C.line};border-radius:12px;overflow:hidden;background:${C.card};">
          <tr>
            <td style="padding:22px 24px;">
              <p style="margin:0 0 18px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${C.soft};">
                ${escapeHtml(opts.summaryTitle || 'Details')}
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${opts.summaryRows
                  .map(
                    (row, i) => `
                  <tr>
                    <td width="96" style="padding:11px 12px 11px 0;border-top:${i === 0 ? '0' : `1px solid ${C.line}`};font-family:${FONT};font-size:13px;font-weight:700;color:${C.ink};vertical-align:top;">
                      ${escapeHtml(row.label)}
                    </td>
                    <td style="padding:11px 0;border-top:${i === 0 ? '0' : `1px solid ${C.line}`};font-family:${FONT};font-size:14px;color:${C.muted};vertical-align:top;">
                      ${row.valueHtml}
                    </td>
                  </tr>`
                  )
                  .join('')}
              </table>
            </td>
          </tr>
        </table>`
      : '';

  const cta =
    opts.ctaLabel && opts.ctaHref
      ? `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:32px auto 0;">
          <tr>
            <td align="center" style="border-radius:10px;background:${C.navy};">
              <a href="${escapeAttr(opts.ctaHref)}"
                 style="display:inline-block;padding:16px 36px;font-family:${FONT};font-size:15px;font-weight:700;color:${C.white};text-decoration:none;">
                ${escapeHtml(opts.ctaLabel)}
              </a>
            </td>
          </tr>
        </table>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link href="https://fonts.googleapis.com/css2?family=Afacad+Flux:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.pageBg};font-family:${FONT};-webkit-font-smoothing:antialiased;">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.pageBg};padding:40px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:${C.white};border-radius:14px;overflow:hidden;box-shadow:0 10px 30px rgba(10,25,47,0.08);">

          <!-- Brand bar: logo only + thin accent -->
          <tr>
            <td align="center" style="background:${C.navy};padding:34px 28px 30px;">
              <a href="${escapeAttr(home)}" style="text-decoration:none;display:inline-block;">
                <img src="${escapeAttr(logoUrl)}" alt="ODI"
                     width="132" style="display:block;margin:0 auto;border:0;outline:none;height:auto;max-width:132px;" />
              </a>
              <p style="margin:14px 0 0;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:#94A3B8;">
                Studio
              </p>
            </td>
          </tr>
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#22D3EE,#6366F1);font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Message -->
          <tr>
            <td style="padding:40px 36px 12px;">
              ${eyebrow}
              <h1 style="margin:0 0 22px;font-family:${FONT};font-size:26px;line-height:1.3;font-weight:700;color:${C.ink};text-align:center;">
                ${escapeHtml(opts.title)}
              </h1>
              <div style="font-family:${FONT};font-size:15px;line-height:1.75;color:${C.muted};text-align:left;max-width:460px;margin:0 auto;">
                ${opts.bodyHtml}
              </div>
              ${summary}
              ${cta}
            </td>
          </tr>

          <tr>
            <td style="padding:20px 36px 36px;text-align:center;">
              <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.6;color:${C.soft};">
                Questions?
                <a href="mailto:${support}" style="color:${C.link};text-decoration:none;font-weight:600;">${support}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="background:${C.navy};padding:28px 22px 24px;">
              <p style="margin:0 0 16px;font-family:${FONT};font-size:12px;">
                <a href="${escapeAttr(home)}" style="color:#E2E8F0;text-decoration:none;margin:0 8px;">Home</a>
                <span style="color:#334155;">|</span>
                <a href="${escapeAttr(products)}" style="color:#E2E8F0;text-decoration:none;margin:0 8px;">Products</a>
                <span style="color:#334155;">|</span>
                <a href="${escapeAttr(absoluteUrl('/about'))}" style="color:#E2E8F0;text-decoration:none;margin:0 8px;">About</a>
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
                <tr>
                  <td style="padding:0 7px;">
                    <a href="${escapeAttr(SOCIAL.instagram)}" style="text-decoration:none;" target="_blank">
                      <img src="${SOCIAL.icons.instagram}" width="26" height="26" alt="Instagram" style="display:block;border:0;" />
                    </a>
                  </td>
                  <td style="padding:0 7px;">
                    <a href="${escapeAttr(SOCIAL.facebook)}" style="text-decoration:none;" target="_blank">
                      <img src="${SOCIAL.icons.facebook}" width="26" height="26" alt="Facebook" style="display:block;border:0;" />
                    </a>
                  </td>
                  <td style="padding:0 7px;">
                    <a href="${escapeAttr(SOCIAL.linkedin)}" style="text-decoration:none;" target="_blank">
                      <img src="${SOCIAL.icons.linkedin}" width="26" height="26" alt="LinkedIn" style="display:block;border:0;" />
                    </a>
                  </td>
                  <td style="padding:0 7px;">
                    <a href="${escapeAttr(SOCIAL.youtube)}" style="text-decoration:none;" target="_blank">
                      <img src="${SOCIAL.icons.youtube}" width="26" height="26" alt="YouTube" style="display:block;border:0;" />
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-family:${FONT};font-size:11px;color:#94A3B8;">
                © ${year} ODI Studio. All rights reserved.
              </p>
              <p style="margin:0;font-family:${FONT};font-size:10px;line-height:1.5;color:#64748B;">
                You received this email because you have an ODI account.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
