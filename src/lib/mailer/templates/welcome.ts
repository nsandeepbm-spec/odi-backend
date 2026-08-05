import { absoluteUrl, escapeHtml, renderEmailLayout } from '../layout.js';

export function welcomeEmail(opts: { name?: string | null; email?: string }) {
  const fullName = (opts.name ?? '').trim();
  const first = fullName.split(/\s+/)[0] || 'there';
  const productsUrl = absoluteUrl('/products');
  const when = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const html = renderEmailLayout({
    preheader: `Welcome to ODI, ${first}. Your account is ready.`,
    eyebrow: 'Welcome',
    title: `Hi ${first}, you're in.`,
    bodyHtml: `
      <p style="margin:0 0 14px;">
        Thanks for joining <strong style="color:#0F172A;">ODI</strong>.
        Your account is set up and ready to use.
      </p>
      <p style="margin:0;">
        Explore our immersive 3D learning kits for kids, track new volume launches,
        and manage your orders — all from one place.
      </p>
    `,
    summaryTitle: 'Your account',
    summaryRows: [
      { label: 'Name', valueHtml: escapeHtml(fullName || first) },
      ...(opts.email
        ? [
            {
              label: 'Email',
              valueHtml: `<a href="mailto:${escapeHtml(opts.email)}" style="color:#0891B2;text-decoration:none;font-weight:600;">${escapeHtml(opts.email)}</a>`,
            },
          ]
        : []),
      { label: 'Joined', valueHtml: escapeHtml(when) },
    ],
    ctaLabel: 'Explore our kits',
    ctaHref: productsUrl,
  });

  const text = `Hi ${first}, you're in.\n\nThanks for joining ODI. Your account is ready.\nExplore kits: ${productsUrl}\n\n— ODI Studio`;

  return { subject: 'Welcome to ODI', html, text };
}
