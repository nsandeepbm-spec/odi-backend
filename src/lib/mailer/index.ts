import { sendMailSafe } from './send.js';
import { welcomeEmail } from './templates/welcome.js';
import { orderPlacedEmail } from './templates/order-placed.js';
import { productLiveEmail } from './templates/product-live.js';

export function sendWelcomeEmail(opts: { to: string; name?: string | null }) {
  const mail = welcomeEmail({ name: opts.name, email: opts.to });
  sendMailSafe({ to: opts.to, ...mail });
}

export function sendOrderPlacedEmail(opts: {
  to: string;
  name?: string | null;
  orderNumber: string;
  totalPaise: number;
  isCod: boolean;
}) {
  const mail = orderPlacedEmail(opts);
  sendMailSafe({ to: opts.to, ...mail });
}

export function sendProductLiveEmail(opts: {
  to: string;
  name?: string | null;
  productName: string;
  productSlug: string;
}) {
  const mail = productLiveEmail(opts);
  sendMailSafe({ to: opts.to, ...mail });
}

export { sendMail, sendMailSafe } from './send.js';
