import { BRAND_SOCIAL } from '../brand.js';
import {
  BRAND_EMAIL,
  BRAND_EMAIL_FONT,
  absoluteUrl,
  escapeHtml,
  formatEmailDate,
  formatInrFromPaise,
  formatOrderNumber,
  renderBrandCta,
  renderBrandCtaOutline,
  renderBrandEmailShell,
  renderSectionHead,
  renderTwoCol,
} from '../layout.js';

export function orderCancelledEmail(opts: {
  orderId: string;
  orderNumber: string;
  amountPaise: number;
  reason?: string | null;
  itemCount?: number;
  placedAt?: string | null;
  queuedRefund: boolean;
}) {
  const C = BRAND_EMAIL;
  const FONT = BRAND_EMAIL_FONT;
  const amount = formatInrFromPaise(opts.amountPaise);
  const orderLabel = formatOrderNumber(opts.orderNumber);
  const orderUrl = absoluteUrl(`/dashboard/orders/${opts.orderId}`);
  const shopUrl = absoluteUrl('/products');
  const placed = formatEmailDate(opts.placedAt);
  const reason = (opts.reason ?? '').trim() || 'Customer request';
  const itemsLabel =
    (opts.itemCount ?? 0) === 1 ? '1 item' : `${opts.itemCount ?? 0} items`;

  const refundBlock = opts.queuedRefund
    ? `
              ${renderSectionHead('Refund status')}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:8px 12px 8px 0;font-family:${FONT};font-size:14px;color:${C.ink};">Original charge</td>
                  <td align="right" style="padding:8px 0;font-family:${FONT};font-size:15px;font-weight:700;color:${C.ink};">${escapeHtml(amount)}</td>
                </tr>
                <tr>
                  <td style="padding:8px 12px 8px 0;font-family:${FONT};font-size:14px;color:${C.ink};">Refund initiated</td>
                  <td align="right" style="padding:8px 0;font-family:${FONT};font-size:15px;font-weight:700;color:${C.button};">−${escapeHtml(amount)}</td>
                </tr>
              </table>
              <p style="margin:16px 0 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${C.body};">
                Your refund is under review. Once it is sent, the amount should appear on your original payment method within 3–5 business days.
              </p>`
    : `
              ${renderSectionHead('Refund status')}
              <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.7;color:${C.body};">
                This order had no captured online payment, so no refund is due.
              </p>`;

  const bodyHtml = `
              <h1 style="margin:0 0 20px;font-family:${FONT};font-size:32px;line-height:1.2;font-weight:700;color:${C.ink};">
                Your order has been cancelled.
              </h1>

              <p style="margin:0 0 8px;font-family:${FONT};font-size:16px;line-height:1.7;color:${C.body};">
                As requested, we have cancelled order ${escapeHtml(orderLabel)}.
              </p>

              ${renderSectionHead('Cancellation details')}
              ${renderTwoCol(
                { label: 'Order number', title: orderLabel, sub: `Placed ${placed}` },
                { label: 'Cancellation reason', title: reason, sub: `Impacted: ${itemsLabel}` }
              )}

              ${refundBlock}

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:36px 0 0;">
                <tr>
                  <td style="padding:0 10px 0 0;">
                    ${renderBrandCta(shopUrl, 'Continue shopping')}
                  </td>
                  <td style="padding:0;">
                    ${renderBrandCtaOutline(orderUrl, 'View order')}
                  </td>
                </tr>
              </table>`;

  const html = renderBrandEmailShell({
    title: 'Your order has been cancelled',
    preheader: `Order ${orderLabel} has been cancelled.`,
    bodyHtml,
  });

  const text = [
    'Your order has been cancelled.',
    '',
    `Order ${orderLabel}`,
    `Reason: ${reason}`,
    opts.queuedRefund
      ? `Refund of ${amount} is under review.`
      : 'No online payment was captured, so no refund is due.',
    '',
    `Continue shopping: ${shopUrl}`,
    `View order: ${orderUrl}`,
    '',
    BRAND_SOCIAL.map((s) => `${s.label}: ${s.href}`).join('\n'),
    '',
    '— ODI Studio',
  ].join('\n');

  return { subject: `Order ${orderLabel} cancelled`, html, text };
}
