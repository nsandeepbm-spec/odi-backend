import { BRAND_SOCIAL } from '../brand.js';
import {
  BRAND_EMAIL,
  BRAND_EMAIL_FONT,
  BRAND_EMAIL_UI,
  absoluteUrl,
  escapeHtml,
  formatAddressHtml,
  formatInrFromPaise,
  formatOrderNumber,
  renderBrandCta,
  renderBrandEmailShell,
  renderSectionHead,
  renderTwoCol,
} from '../layout.js';

export type OrderPlacedItem = {
  name: string;
  quantity: number;
  lineTotalPaise: number;
};

export function orderPlacedEmail(opts: {
  name?: string | null;
  orderId?: string;
  orderNumber: string;
  totalPaise: number;
  shippingPaise?: number;
  isCod: boolean;
  items?: OrderPlacedItem[];
  shippingAddress?: {
    first_name?: string | null;
    last_name?: string | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
  } | null;
}) {
  const C = BRAND_EMAIL;
  const FONT = BRAND_EMAIL_FONT;
  const amount = formatInrFromPaise(opts.totalPaise);
  const orderLabel = formatOrderNumber(opts.orderNumber);
  const orderUrl = absoluteUrl(opts.orderId ? `/dashboard/orders/${opts.orderId}` : '/dashboard/orders');
  const kitName = opts.items?.[0]?.name?.trim() || 'your ODI kit';
  const itemCount = opts.items?.reduce((n, i) => n + i.quantity, 0) ?? 0;
  const shippingLabel =
    (opts.shippingPaise ?? 0) > 0 ? formatInrFromPaise(opts.shippingPaise ?? 0) : 'Standard shipping';
  const paymentLabel = opts.isCod ? 'Cash on delivery' : 'Online payment';
  const shipHtml = formatAddressHtml(opts.shippingAddress);

  const itemTitle =
    itemCount > 1
      ? `${itemCount} items`
      : opts.items?.[0]?.name ?? 'ODI kit';
  const itemSub =
    opts.items && opts.items.length
      ? opts.items.length === 1
        ? `Qty: ${opts.items[0].quantity}`
        : opts.items.map((i) => `${escapeHtml(i.name)} × ${i.quantity}`).join('<br />')
      : 'Qty: 1';

  const bodyHtml = `
              <h1 style="margin:0 0 20px;font-family:${FONT};font-size:32px;line-height:1.2;font-weight:700;color:${C.ink};">
                Your book is on its way.
              </h1>

              <p style="margin:0 0 8px;font-family:${FONT};font-size:16px;line-height:1.7;color:${C.body};">
                Thank you for your order. We are preparing ${escapeHtml(kitName)} for shipment.
                ${
                  opts.isCod
                    ? 'You chose cash on delivery — please keep the amount ready for the courier.'
                    : 'You will receive another notification when it leaves our studio.'
                }
              </p>

              <p style="margin:28px 0 8px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${BRAND_EMAIL_UI.orange};">
                Order ${escapeHtml(orderLabel)}
              </p>
              ${renderSectionHead('Order details')}
              ${renderTwoCol(
                { label: 'Item', title: itemTitle, sub: itemSub },
                { label: 'Total', title: amount, sub: shippingLabel }
              )}

              <div style="height:1px;line-height:1px;font-size:0;background:${BRAND_EMAIL_UI.line};margin:22px 0;">&nbsp;</div>

              ${renderTwoCol(
                { label: 'Shipping to', title: '', sub: shipHtml },
                {
                  label: 'Billed to',
                  title: paymentLabel,
                  sub: opts.isCod ? 'Pay the courier on delivery' : 'Charged to your original payment method',
                }
              )}

              <div style="margin:36px 0 0;">
                ${renderBrandCta(orderUrl, 'Track order')}
              </div>`;

  const html = renderBrandEmailShell({
    title: 'Your book is on its way',
    preheader: `Order ${orderLabel} · ${amount}`,
    bodyHtml,
  });

  const text = [
    'Your book is on its way.',
    '',
    `Order ${orderLabel} · ${amount}`,
    opts.isCod ? 'Payment: Cash on delivery' : 'Payment: Online payment',
    '',
    `Track order: ${orderUrl}`,
    '',
    BRAND_SOCIAL.map((s) => `${s.label}: ${s.href}`).join('\n'),
    '',
    '— ODI Studio',
  ].join('\n');

  return { subject: `Order ${orderLabel} confirmed`, html, text };
}
