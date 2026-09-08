import { BRAND_SOCIAL } from '../brand.js';
import {
  BRAND_EMAIL,
  BRAND_EMAIL_FONT,
  absoluteUrl,
  escapeAttr,
  escapeHtml,
  formatEmailDate,
  renderBrandCta,
  renderBrandEmailShell,
  renderSectionHead,
  renderTwoCol,
} from '../layout.js';

export function productLiveEmail(opts: {
  name?: string | null;
  productName: string;
  productSlug: string;
  imageUrl?: string | null;
}) {
  const C = BRAND_EMAIL;
  const FONT = BRAND_EMAIL_FONT;
  const first = (opts.name ?? '').trim().split(/\s+/)[0] || 'there';
  const buyUrl = absoluteUrl(`/checkout?product=${encodeURIComponent(opts.productSlug)}`);
  const when = formatEmailDate();
  const img = opts.imageUrl?.trim() || null;

  const imageBlock = img
    ? `<a href="${escapeAttr(buyUrl)}" style="display:block;margin:0 0 28px;text-decoration:none;">
                  <img src="${escapeAttr(img)}" alt="${escapeHtml(opts.productName)}" width="504"
                       style="display:block;width:100%;max-width:504px;height:auto;border:0;outline:none;" />
                </a>`
    : '';

  const bodyHtml = `
              <h1 style="margin:0 0 20px;font-family:${FONT};font-size:32px;line-height:1.2;font-weight:700;color:${C.ink};">
                ${escapeHtml(opts.productName)} is live.
              </h1>

              <p style="margin:0 0 24px;font-family:${FONT};font-size:16px;line-height:1.7;color:${C.body};">
                Hi ${escapeHtml(first)} — you asked us to tell you when this kit launched. It’s available now. Stock is limited, so grab yours while it’s in stock.
              </p>

              ${imageBlock}
              ${renderSectionHead('Product')}
              ${renderTwoCol(
                { label: 'Kit', title: opts.productName, sub: 'Available to buy' },
                { label: 'Date', title: when, sub: 'Notify Me list' }
              )}

              <div style="margin:36px 0 0;">
                ${renderBrandCta(buyUrl, 'Shop now')}
              </div>`;

  const html = renderBrandEmailShell({
    title: `${opts.productName} is live`,
    preheader: `${opts.productName} is available now.`,
    bodyHtml,
  });

  const text = [
    `Hi ${first},`,
    '',
    `${opts.productName} is live.`,
    `Buy: ${buyUrl}`,
    '',
    BRAND_SOCIAL.map((s) => `${s.label}: ${s.href}`).join('\n'),
    '',
    '— ODI Studio',
  ].join('\n');

  return {
    subject: `${opts.productName} is live — ODI`,
    html,
    text,
  };
}
