import { BRAND_SOCIAL } from '../brand.js';
import {
  BRAND_EMAIL,
  BRAND_EMAIL_FONT,
  absoluteUrl,
  escapeHtml,
  formatEmailDate,
  formatInrFromPaise,
  renderBrandCta,
  renderBrandEmailShell,
} from '../layout.js';

const ACCENT = '#E85D04';
const TEAL = '#0D9488';
const LINE = '#E5E5E5';
const SUPPORT = 'odistudio24@gmail.com';

function paymentMethodLabel(provider?: string | null): string {
  const p = (provider ?? '').toLowerCase();
  if (p === 'razorpay') return 'Original online payment';
  if (p === 'cod') return 'Cash on delivery';
  return 'Original payment method';
}

function detailRow(label: string, value: string, last = false): string {
  const C = BRAND_EMAIL;
  const FONT = BRAND_EMAIL_FONT;
  const border = last ? '0' : `1px solid ${LINE}`;
  return `<tr>
                    <td style="padding:12px 12px 12px 0;border-bottom:${border};font-family:${FONT};font-size:13px;color:${C.body};vertical-align:top;">
                      ${escapeHtml(label)}
                    </td>
                    <td align="right" style="padding:12px 0;border-bottom:${border};font-family:${FONT};font-size:14px;font-weight:700;color:${C.ink};vertical-align:top;">
                      ${escapeHtml(value)}
                    </td>
                  </tr>`;
}

export function refundProcessedEmail(opts: {
  orderId: string;
  orderNumber: string;
  amountPaise: number;
  processedAt?: string | null;
  provider?: string | null;
}) {
  const C = BRAND_EMAIL;
  const FONT = BRAND_EMAIL_FONT;
  const amount = formatInrFromPaise(opts.amountPaise);
  const when = formatEmailDate(opts.processedAt);
  const orderUrl = absoluteUrl(`/dashboard/orders/${opts.orderId}`);
  const orderLabel = opts.orderNumber.startsWith('#') ? opts.orderNumber : `#${opts.orderNumber}`;
  const method = paymentMethodLabel(opts.provider);

  const bodyHtml = `
              <h1 style="margin:0 0 20px;font-family:${FONT};font-size:32px;line-height:1.2;font-weight:700;color:${C.ink};">
                Your refund is on its way.
              </h1>

              <p style="margin:0 0 8px;font-family:${FONT};font-size:16px;line-height:1.7;color:${C.body};">
                We have processed a refund for your recent order. The funds should appear in your account within 3–5 business days, depending on your bank's processing times.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:36px 0 8px;">
                <tr>
                  <td style="white-space:nowrap;padding:0 12px 0 0;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${ACCENT};">
                    Refund details
                  </td>
                  <td style="width:100%;">
                    <div style="height:1px;line-height:1px;font-size:0;background:${LINE};">&nbsp;</div>
                  </td>
                </tr>
              </table>
              <div style="height:3px;line-height:3px;font-size:0;background:${TEAL};margin:0 0 8px;">&nbsp;</div>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${detailRow('Order number', orderLabel)}
                ${detailRow('Date processed', when)}
                ${detailRow('Payment method', method, true)}
                <tr>
                  <td style="padding:18px 12px 0 0;font-family:${FONT};font-size:13px;color:${C.body};">
                    Total refunded
                  </td>
                  <td align="right" style="padding:18px 0 0;font-family:${FONT};font-size:22px;font-weight:700;color:${ACCENT};">
                    ${escapeHtml(amount)}
                  </td>
                </tr>
              </table>

              <div style="margin:36px 0 20px;">
                ${renderBrandCta(orderUrl, 'View order')}
              </div>

              <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.6;color:${C.body};">
                Have questions about your refund?
                <a href="mailto:${SUPPORT}" style="color:${C.button};text-decoration:underline;">Contact our support team</a>
              </p>`;

  const html = renderBrandEmailShell({
    title: 'Your refund is on its way',
    preheader: `Refund ${amount} for order ${orderLabel} is on its way.`,
    bodyHtml,
  });

  const text = [
    'Your refund is on its way.',
    '',
    "We have processed a refund for your recent order. The funds should appear in your account within 3–5 business days, depending on your bank's processing times.",
    '',
    `Order number: ${orderLabel}`,
    `Date processed: ${when}`,
    `Payment method: ${method}`,
    `Total refunded: ${amount}`,
    '',
    `View order: ${orderUrl}`,
    `Support: ${SUPPORT}`,
    '',
    BRAND_SOCIAL.map((s) => `${s.label}: ${s.href}`).join('\n'),
    '',
    '— ODI Studio',
  ].join('\n');

  return { subject: `Refund for ${orderLabel} is on its way`, html, text };
}
