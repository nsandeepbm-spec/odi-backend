import { absoluteUrl, escapeHtml, renderEmailLayout } from '../layout.js';

export function productLiveEmail(opts: {
  name?: string | null;
  productName: string;
  productSlug: string;
}) {
  const first = (opts.name ?? '').trim().split(/\s+/)[0] || 'there';
  const buyUrl = absoluteUrl(`/checkout?product=${encodeURIComponent(opts.productSlug)}`);
  const when = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const html = renderEmailLayout({
    preheader: `${opts.productName} is available now.`,
    eyebrow: 'Now available',
    title: `${opts.productName} is live`,
    bodyHtml: `
      <p style="margin:0 0 14px;">
        Hi <strong style="color:#0F172A;">${escapeHtml(first)}</strong> — you asked us to tell you when this kit launched.
      </p>
      <p style="margin:0;">
        It’s available now. Stock is limited, so grab yours while it’s in stock.
      </p>
    `,
    summaryTitle: 'Product',
    summaryRows: [
      { label: 'Kit', valueHtml: escapeHtml(opts.productName) },
      { label: 'Status', valueHtml: 'Available to buy' },
      { label: 'Date', valueHtml: escapeHtml(when) },
    ],
    ctaLabel: 'Buy now',
    ctaHref: buyUrl,
  });

  const text = `Hi ${first},\n\n${opts.productName} is live.\nBuy: ${buyUrl}\n\n— ODI Studio`;

  return {
    subject: `${opts.productName} is live — ODI`,
    html,
    text,
  };
}
