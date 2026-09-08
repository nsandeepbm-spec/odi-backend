import { sendMail, sendMailSafe } from './send.js';
import { welcomeEmail } from './templates/welcome.js';
import { orderPlacedEmail } from './templates/order-placed.js';
import { productLiveEmail } from './templates/product-live.js';
import { refundProcessedEmail } from './templates/refund.js';
import { orderCancelledEmail } from './templates/order-cancelled.js';
import { orderShippedEmail } from './templates/order-shipped.js';
import { orderDeliveredEmail } from './templates/order-delivered.js';
import { supportReplyEmail } from './templates/support-reply.js';
import { supabase } from '../../config/supabase.js';

export function sendWelcomeEmail(opts: { to: string; name?: string | null }) {
  const mail = welcomeEmail({ name: opts.name, email: opts.to });
  sendMailSafe({ to: opts.to, ...mail });
}

/** Awaited send — admin SMTP check. Register still uses fire-and-forget `sendWelcomeEmail`. */
export async function sendWelcomeEmailNow(opts: { to: string; name?: string | null }) {
  const mail = welcomeEmail({ name: opts.name, email: opts.to });
  return sendMail({ to: opts.to, ...mail });
}

export function sendOrderPlacedEmail(opts: {
  to: string;
  name?: string | null;
  orderId?: string;
  orderNumber: string;
  totalPaise: number;
  shippingPaise?: number;
  isCod: boolean;
  items?: Array<{ name: string; quantity: number; lineTotalPaise: number }>;
  shippingAddress?: {
    first_name?: string | null;
    last_name?: string | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
  } | null;
}) {
  const mail = orderPlacedEmail(opts);
  sendMailSafe({ to: opts.to, ...mail });
}

/** Queue the order-placed mail from a saved order row (after COD create or online capture). */
export function sendOrderPlacedEmailForOrder(
  order: {
    id?: string;
    order_number: string;
    total_paise: number;
    shipping_paise?: number;
    shipping_address?: unknown;
  },
  isCod: boolean,
  fallbackEmail?: string | null
) {
  void sendOrderPlacedEmailForOrderAsync(order, isCod, fallbackEmail);
}

async function sendOrderPlacedEmailForOrderAsync(
  order: {
    id?: string;
    order_number: string;
    total_paise: number;
    shipping_paise?: number;
    shipping_address?: unknown;
  },
  isCod: boolean,
  fallbackEmail?: string | null
) {
  const addr = (order.shipping_address ?? {}) as {
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
  };
  const to =
    (typeof addr.email === 'string' && addr.email.includes('@') ? addr.email : null) ??
    (fallbackEmail && fallbackEmail.includes('@') ? fallbackEmail : null);
  if (!to) return;

  let items: Array<{ name: string; quantity: number; lineTotalPaise: number }> = [];
  if (order.id) {
    const { data } = await supabase
      .from('order_items')
      .select('snapshot_name, quantity, line_total_paise')
      .eq('order_id', order.id);
    items = (data ?? []).map((row) => ({
      name: String(row.snapshot_name ?? 'ODI kit'),
      quantity: Number(row.quantity) || 1,
      lineTotalPaise: Math.trunc(Number(row.line_total_paise) || 0),
    }));
  }

  sendOrderPlacedEmail({
    to,
    name: `${addr.first_name ?? ''} ${addr.last_name ?? ''}`.trim(),
    orderId: order.id,
    orderNumber: order.order_number,
    totalPaise: order.total_paise,
    shippingPaise: order.shipping_paise,
    isCod,
    items,
    shippingAddress: addr,
  });
}

export function sendProductLiveEmail(opts: {
  to: string;
  name?: string | null;
  productName: string;
  productSlug: string;
  imageUrl?: string | null;
}) {
  const mail = productLiveEmail(opts);
  sendMailSafe({ to: opts.to, ...mail });
}

export function sendRefundProcessedEmail(opts: {
  to: string;
  orderId: string;
  orderNumber: string;
  amountPaise: number;
  processedAt?: string | null;
  provider?: string | null;
}) {
  const mail = refundProcessedEmail(opts);
  sendMailSafe({ to: opts.to, ...mail });
}

/** Awaited send — admin SMTP check for the refund template. */
export async function sendRefundProcessedEmailNow(opts: {
  to: string;
  orderId?: string;
  orderNumber?: string;
  amountPaise?: number;
}) {
  const mail = refundProcessedEmail({
    orderId: opts.orderId ?? 'preview',
    orderNumber: opts.orderNumber ?? 'ODI-00000',
    amountPaise: opts.amountPaise ?? 129900,
    processedAt: new Date().toISOString(),
    provider: 'razorpay',
  });
  return sendMail({ to: opts.to, ...mail });
}

export function sendOrderCancelledEmail(opts: {
  to: string;
  orderId: string;
  orderNumber: string;
  amountPaise: number;
  reason?: string | null;
  itemCount?: number;
  placedAt?: string | null;
  queuedRefund: boolean;
}) {
  const mail = orderCancelledEmail(opts);
  sendMailSafe({ to: opts.to, ...mail });
}

async function emailForUserId(userId: string, shippingAddress?: unknown): Promise<string | null> {
  const addr = (shippingAddress ?? {}) as { email?: string | null };
  if (typeof addr.email === 'string' && addr.email.includes('@')) return addr.email;
  const { data } = await supabase.from('users').select('email').eq('id', userId).maybeSingle();
  const email = typeof data?.email === 'string' ? data.email : null;
  return email && email.includes('@') ? email : null;
}

export function sendOrderShippedEmailForOrder(order: {
  id: string;
  user_id: string;
  order_number: string;
  delhivery_waybill?: string | null;
  shipping_address?: unknown;
}) {
  void (async () => {
    const to = await emailForUserId(order.user_id, order.shipping_address);
    if (!to) return;
    const mail = orderShippedEmail({
      orderId: order.id,
      orderNumber: order.order_number,
      waybill: order.delhivery_waybill ?? null,
    });
    sendMailSafe({ to, ...mail });
  })();
}

export function sendOrderDeliveredEmailForOrder(order: {
  id: string;
  user_id: string;
  order_number: string;
  shipping_address?: unknown;
}) {
  void (async () => {
    const to = await emailForUserId(order.user_id, order.shipping_address);
    if (!to) return;
    const mail = orderDeliveredEmail({ orderId: order.id, orderNumber: order.order_number });
    sendMailSafe({ to, ...mail });
  })();
}

export function sendSupportReplyEmail(opts: {
  to: string;
  subject: string;
  reply: string;
  status: string;
}) {
  const mail = supportReplyEmail(opts);
  sendMailSafe({ to: opts.to, ...mail });
}

export async function sendOrderPlacedEmailNow(opts: { to: string }) {
  const mail = orderPlacedEmail({
    name: 'there',
    orderId: 'preview',
    orderNumber: 'ODI-00000',
    totalPaise: 129900,
    shippingPaise: 0,
    isCod: false,
    items: [{ name: 'Space Explorer', quantity: 1, lineTotalPaise: 129900 }],
    shippingAddress: {
      first_name: 'ODI',
      last_name: 'Studio',
      street: 'Studio address',
      city: 'Mohali',
      state: 'Punjab',
      postal_code: '160074',
    },
  });
  return sendMail({ to: opts.to, ...mail });
}

export async function sendProductLiveEmailNow(opts: { to: string; productName?: string }) {
  const mail = productLiveEmail({
    name: 'there',
    productName: opts.productName ?? 'Space Explorer',
    productSlug: 'space-explorer',
  });
  return sendMail({ to: opts.to, ...mail });
}

export async function sendOrderCancelledEmailNow(opts: { to: string }) {
  const mail = orderCancelledEmail({
    orderId: 'preview',
    orderNumber: 'ODI-00000',
    amountPaise: 129900,
    reason: 'Customer request',
    itemCount: 1,
    placedAt: new Date().toISOString(),
    queuedRefund: true,
  });
  return sendMail({ to: opts.to, ...mail });
}

export { sendMail, sendMailSafe } from './send.js';
export { welcomeEmail } from './templates/welcome.js';
