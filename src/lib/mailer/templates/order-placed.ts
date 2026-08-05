import { absoluteUrl, escapeHtml, formatInrFromPaise, renderEmailLayout } from '../layout.js';

export function orderPlacedEmail(opts: {
  name?: string | null;
  orderNumber: string;
  totalPaise: number;
  isCod: boolean;
}) {
  const first = (opts.name ?? '').trim().split(/\s+/)[0] || 'there';
  const amount = formatInrFromPaise(opts.totalPaise);
  const ordersUrl = absoluteUrl('/dashboard/orders');
  const when = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const html = renderEmailLayout({
    preheader: `Order ${opts.orderNumber} · ${amount}`,
    eyebrow: 'Order confirmed',
    title: `Thanks, ${first}`,
    bodyHtml: `
      <p style="margin:0 0 14px;">
        We’ve received your order and it’s saved in your account.
      </p>
      <p style="margin:0;">
        ${
          opts.isCod
            ? 'You chose cash on delivery. We’ll prepare your kit for shipment.'
            : 'Once payment is confirmed, we’ll start packing your kit.'
        }
        Track progress anytime from your orders page.
      </p>
    `,
    summaryTitle: 'Order details',
    summaryRows: [
      { label: 'Order', valueHtml: escapeHtml(opts.orderNumber) },
      { label: 'Total', valueHtml: `<strong style="color:#0F172A;">${escapeHtml(amount)}</strong>` },
      { label: 'Payment', valueHtml: opts.isCod ? 'Cash on delivery' : 'Online payment' },
      { label: 'Date', valueHtml: escapeHtml(when) },
    ],
    ctaLabel: 'View your order',
    ctaHref: ordersUrl,
  });

  const text = `Thanks, ${first}.\n\nOrder ${opts.orderNumber} · ${amount}\nView: ${ordersUrl}\n\n— ODI Studio`;

  return { subject: `Order ${opts.orderNumber} confirmed`, html, text };
}
