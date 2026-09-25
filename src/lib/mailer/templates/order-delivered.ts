import { BRAND_SOCIAL } from '../brand.js';
import {
  BRAND_EMAIL,
  BRAND_EMAIL_FONT,
  absoluteUrl,
  escapeHtml,
  formatOrderNumber,
  renderBrandCta,
  renderBrandCtaOutline,
  renderBrandEmailShell,
} from '../layout.js';

export function orderDeliveredEmail(opts: {
  orderId: string;
  orderNumber: string;
  /** First line-item slug for “Write a review” deep link */
  reviewProductSlug?: string | null;
  reviewProductName?: string | null;
}) {
  const C = BRAND_EMAIL;
  const FONT = BRAND_EMAIL_FONT;
  const orderLabel = formatOrderNumber(opts.orderNumber);
  const orderUrl = absoluteUrl(`/dashboard/orders/${opts.orderId}`);
  // Dashboard Reviews — user can write the review in-app (not checkout).
  const reviewPath = opts.reviewProductSlug
    ? `/dashboard/reviews?product=${encodeURIComponent(opts.reviewProductSlug)}`
    : '/dashboard/reviews';
  const reviewUrl = absoluteUrl(reviewPath);
  const kitLabel = opts.reviewProductName?.trim() || 'your ODI kit';

  const bodyHtml = `
              <h1 style="margin:0 0 20px;font-family:${FONT};font-size:32px;line-height:1.2;font-weight:700;color:${C.ink};">
                Your order was delivered.
              </h1>

              <p style="margin:0 0 20px;font-family:${FONT};font-size:16px;line-height:1.7;color:${C.body};">
                Order ${escapeHtml(orderLabel)} has been delivered. We hope you enjoy ${escapeHtml(kitLabel)} — if anything is missing or damaged, reply from your inbox and we’ll help.
              </p>

              <p style="margin:0 0 28px;font-family:${FONT};font-size:16px;line-height:1.7;color:${C.body};">
                Loved it? A short review helps other families discover ODI.
              </p>

              <div style="margin:0 0 12px;">
                ${renderBrandCta(reviewUrl, 'Write a review')}
              </div>
              <div style="margin:0 0 8px;">
                ${renderBrandCtaOutline(orderUrl, 'View order')}
              </div>`;

  const html = renderBrandEmailShell({
    title: 'Your order was delivered',
    preheader: `Order ${orderLabel} was delivered — leave a review when you’re ready.`,
    bodyHtml,
  });

  const text = [
    'Your order was delivered.',
    '',
    `Order ${orderLabel}`,
    `Write a review: ${reviewUrl}`,
    `View order: ${orderUrl}`,
    '',
    BRAND_SOCIAL.map((s) => `${s.label}: ${s.href}`).join('\n'),
    '',
    '— ODI Studio',
  ].join('\n');

  return { subject: `Order ${orderLabel} delivered`, html, text };
}
