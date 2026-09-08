/** Professional ODI email shell — clean header, Afacad Flux, social footer. */

import { env } from '../../config/env.js';
import { BRAND_LOGO_URL, BRAND_SOCIAL } from './brand.js';

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

export function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

export function formatEmailDate(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Shared chrome for branded mail: black logo bar, gold rule, side borders, black social footer. */
export const BRAND_EMAIL = {
  white: '#FFFFFF',
  black: '#000000',
  ink: '#111111',
  body: '#555555',
  rule: '#C4A47A',
  button: '#2563EB',
  muted: '#A3A3A3',
} as const;

export const BRAND_EMAIL_FONT = 'Arial, Helvetica, sans-serif';

export function renderBrandCta(href: string, label: string): string {
  const C = BRAND_EMAIL;
  const FONT = BRAND_EMAIL_FONT;
  return `<table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td bgcolor="${C.button}" style="background:${C.button};">
                    <a href="${escapeAttr(href)}"
                       style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:700;color:${C.white};text-decoration:none;">
                      ${escapeHtml(label)}
                    </a>
                  </td>
                </tr>
              </table>`;
}

export const BRAND_EMAIL_UI = {
  orange: '#E85D04',
  blueBar: '#2563EB',
  line: '#E5E5E5',
  support: 'odistudio24@gmail.com',
} as const;

export function formatOrderNumber(orderNumber: string): string {
  const n = orderNumber.trim();
  return n.startsWith('#') ? n : `#${n}`;
}

export function renderSectionHead(label: string): string {
  const FONT = BRAND_EMAIL_FONT;
  const { orange, blueBar, line } = BRAND_EMAIL_UI;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:36px 0 8px;">
                <tr>
                  <td style="white-space:nowrap;padding:0 12px 0 0;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${orange};">
                    ${escapeHtml(label)}
                  </td>
                  <td style="width:100%;">
                    <div style="height:1px;line-height:1px;font-size:0;background:${line};">&nbsp;</div>
                  </td>
                </tr>
              </table>
              <div style="height:3px;line-height:3px;font-size:0;background:${blueBar};margin:0 0 16px;">&nbsp;</div>`;
}

export function renderTwoCol(
  left: { label: string; title: string; sub?: string },
  right: { label: string; title: string; sub?: string }
): string {
  const C = BRAND_EMAIL;
  const FONT = BRAND_EMAIL_FONT;
  const orange = BRAND_EMAIL_UI.orange;
  const cell = (col: { label: string; title: string; sub?: string }) => `
                    <p style="margin:0 0 8px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${orange};">
                      ${escapeHtml(col.label)}
                    </p>
                    ${
                      col.title
                        ? `<p style="margin:0;font-family:${FONT};font-size:15px;font-weight:700;line-height:1.45;color:${C.ink};">${escapeHtml(col.title)}</p>`
                        : ''
                    }
                    ${
                      col.sub
                        ? `<p style="margin:${col.title ? '6px' : '0'} 0 0;font-family:${FONT};font-size:13px;line-height:1.55;color:${C.body};">${col.sub}</p>`
                        : ''
                    }`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="50%" valign="top" style="padding:0 16px 0 0;">${cell(left)}
                  </td>
                  <td width="50%" valign="top" style="padding:0 0 0 8px;">${cell(right)}
                  </td>
                </tr>
              </table>`;
}

export function renderBrandCtaOutline(href: string, label: string): string {
  const FONT = BRAND_EMAIL_FONT;
  const rule = BRAND_EMAIL.rule;
  return `<table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border:1px solid ${rule};">
                    <a href="${escapeAttr(href)}"
                       style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:700;color:${rule};text-decoration:none;">
                      ${escapeHtml(label)}
                    </a>
                  </td>
                </tr>
              </table>`;
}

export function formatAddressHtml(addr: {
  first_name?: string | null;
  last_name?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
} | null | undefined): string {
  if (!addr) return escapeHtml('—');
  const name = `${addr.first_name ?? ''} ${addr.last_name ?? ''}`.trim();
  const cityLine = [addr.city, addr.state, addr.postal_code].filter(Boolean).join(', ');
  return [name, addr.street, cityLine]
    .filter(Boolean)
    .map((line) => escapeHtml(line as string))
    .join('<br />');
}

export function renderBrandEmailShell(opts: {
  title: string;
  preheader: string;
  bodyHtml: string;
}): string {
  const C = BRAND_EMAIL;
  const FONT = BRAND_EMAIL_FONT;
  const home = absoluteUrl('/');
  const year = new Date().getFullYear();
  const logoUrl = BRAND_LOGO_URL;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.white};font-family:${FONT};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">
    ${escapeHtml(opts.preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.white};">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">

          <tr>
            <td bgcolor="${C.black}" align="left" style="background:${C.black};padding:22px 28px;">
              <a href="${escapeAttr(home)}" style="text-decoration:none;display:inline-block;">
                <img src="${escapeAttr(logoUrl)}" alt="ODI" width="96" height="40"
                     style="display:block;border:0;outline:none;height:auto;max-width:96px;" />
              </a>
            </td>
          </tr>

          <tr>
            <td align="left" style="padding:0;background:${C.white};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                     style="border-left:1px solid ${C.black};border-right:1px solid ${C.black};">
                <tr>
                  <td align="left" style="padding:40px 28px 64px;background:${C.white};">
                    <div style="height:1px;line-height:1px;font-size:0;background:${C.rule};margin:0 0 36px;">&nbsp;</div>
                    ${opts.bodyHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td bgcolor="${C.black}" align="center" style="background:${C.black};padding:28px 28px 32px;">
              ${renderSocialIconsHtml()}
              <p style="margin:18px 0 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${C.muted};">
                © ${year} ODI Studio
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

export function renderSocialIconsHtml(): string {
  const cells = BRAND_SOCIAL.map(
    (s) => `
                  <td style="padding:0 7px;">
                    <a href="${escapeAttr(s.href)}" style="text-decoration:none;" target="_blank">
                      <img src="${escapeAttr(s.icon)}" width="26" height="26" alt="${escapeHtml(s.label)}" style="display:block;border:0;" />
                    </a>
                  </td>`
  ).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
                <tr>${cells}
                </tr>
              </table>`;
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
  const logoUrl = BRAND_LOGO_URL;
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

              ${renderSocialIconsHtml()}

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
