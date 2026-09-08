import { BRAND_SOCIAL } from '../brand.js';
import {
  BRAND_EMAIL,
  BRAND_EMAIL_FONT,
  absoluteUrl,
  escapeHtml,
  formatOrderNumber,
  renderBrandCta,
  renderBrandEmailShell,
  renderSectionHead,
} from '../layout.js';

export function orderShippedEmail(opts: {
  orderId: string;
  orderNumber: string;
  waybill?: string | null;
}) {
  const C = BRAND_EMAIL;
  const FONT = BRAND_EMAIL_FONT;
  const orderLabel = formatOrderNumber(opts.orderNumber);
  const orderUrl = absoluteUrl(`/dashboard/orders/${opts.orderId}`);
  const waybill = opts.waybill?.trim() || null;

  const bodyHtml = `
              <h1 style="margin:0 0 20px;font-family:${FONT};font-size:32px;line-height:1.2;font-weight:700;color:${C.ink};">
                Your order is on the way.
              </h1>

              <p style="margin:0 0 8px;font-family:${FONT};font-size:16px;line-height:1.7;color:${C.body};">
                Good news — order ${escapeHtml(orderLabel)} has left our studio and is heading to you.
              </p>

              ${renderSectionHead('Shipment')}
              <p style="margin:0 0 8px;font-family:${FONT};font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:${C.body};">
                Order number
              </p>
              <p style="margin:0 0 16px;font-family:${FONT};font-size:16px;font-weight:700;color:${C.ink};">
                ${escapeHtml(orderLabel)}
              </p>
              ${
                waybill
                  ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:${C.body};">Tracking</p>
              <p style="margin:0;font-family:${FONT};font-size:15px;font-weight:700;color:${C.ink};">${escapeHtml(waybill)}</p>`
                  : ''
              }

              <div style="margin:36px 0 0;">
                ${renderBrandCta(orderUrl, 'Track order')}
              </div>`;

  const html = renderBrandEmailShell({
    title: 'Your order is on the way',
    preheader: `Order ${orderLabel} has shipped.`,
    bodyHtml,
  });

  const text = [
    'Your order is on the way.',
    '',
    `Order ${orderLabel}`,
    waybill ? `Tracking: ${waybill}` : '',
    `Track: ${orderUrl}`,
    '',
    BRAND_SOCIAL.map((s) => `${s.label}: ${s.href}`).join('\n'),
    '',
    '— ODI Studio',
  ]
    .filter((line) => line !== '')
    .join('\n');

  return { subject: `Order ${orderLabel} has shipped`, html, text };
}
