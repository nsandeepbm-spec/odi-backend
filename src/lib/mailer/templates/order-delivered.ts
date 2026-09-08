import { BRAND_SOCIAL } from '../brand.js';
import {
  BRAND_EMAIL,
  BRAND_EMAIL_FONT,
  absoluteUrl,
  escapeHtml,
  formatOrderNumber,
  renderBrandCta,
  renderBrandEmailShell,
} from '../layout.js';

export function orderDeliveredEmail(opts: { orderId: string; orderNumber: string }) {
  const C = BRAND_EMAIL;
  const FONT = BRAND_EMAIL_FONT;
  const orderLabel = formatOrderNumber(opts.orderNumber);
  const orderUrl = absoluteUrl(`/dashboard/orders/${opts.orderId}`);

  const bodyHtml = `
              <h1 style="margin:0 0 20px;font-family:${FONT};font-size:32px;line-height:1.2;font-weight:700;color:${C.ink};">
                Your order was delivered.
              </h1>

              <p style="margin:0 0 36px;font-family:${FONT};font-size:16px;line-height:1.7;color:${C.body};">
                Order ${escapeHtml(orderLabel)} has been delivered. We hope you enjoy your ODI kit — if anything is missing or damaged, reply from your inbox and we’ll help.
              </p>

              ${renderBrandCta(orderUrl, 'View order')}`;

  const html = renderBrandEmailShell({
    title: 'Your order was delivered',
    preheader: `Order ${orderLabel} was delivered.`,
    bodyHtml,
  });

  const text = [
    'Your order was delivered.',
    '',
    `Order ${orderLabel}`,
    `View: ${orderUrl}`,
    '',
    BRAND_SOCIAL.map((s) => `${s.label}: ${s.href}`).join('\n'),
    '',
    '— ODI Studio',
  ].join('\n');

  return { subject: `Order ${orderLabel} delivered`, html, text };
}
