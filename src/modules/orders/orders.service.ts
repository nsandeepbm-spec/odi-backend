import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { clampPage, clampPerPage, paginationMeta } from '../../lib/pagination.js';

const ADMIN_STATUSES = [
  'pending',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
] as const;

/** Unpaid Razorpay checkout attempts older than this are silently closed. */
export const ONLINE_PAYMENT_ABANDON_TTL_MS = 45 * 60 * 1000;
export const PAYMENT_CLOSE_ABANDONED = 'payment_abandoned';

let lastExpireRunAt = 0;
const EXPIRE_THROTTLE_MS = 60 * 1000;

async function latestRefundByOrderIds(orderIds: string[]) {
  const map = new Map<
    string,
    { status: string; provider_refund_id: string | null }
  >();
  if (!orderIds.length) return map;

  const { data } = await supabase
    .from('refunds')
    .select('order_id, status, provider_refund_id, created_at')
    .in('order_id', orderIds)
    .order('created_at', { ascending: false });

  for (const row of data ?? []) {
    const id = row.order_id as string;
    if (map.has(id)) continue;
    map.set(id, {
      status: row.status as string,
      provider_refund_id: (row.provider_refund_id as string | null) ?? null,
    });
  }
  return map;
}

function withRefundFields(
  order: Record<string, unknown>,
  refund?: { status: string; provider_refund_id: string | null }
) {
  return {
    ...order,
    refund_status: refund?.status ?? null,
    razorpay_refund_id: refund?.provider_refund_id ?? null,
  };
}

/** Customer-visible order (Flipkart-like: hide unpaid / abandoned online attempts). */
export function isCustomerVisibleOrder(order: {
  status?: string | null;
  razorpay_order_id?: string | null;
  payment_close_reason?: string | null;
}): boolean {
  if (order.payment_close_reason === PAYMENT_CLOSE_ABANDONED) return false;
  if (order.status === 'pending' && order.razorpay_order_id) return false;
  return true;
}

/** Admin badge helper — incomplete vs abandoned vs normal. */
export function paymentLifecycleLabel(order: {
  status?: string | null;
  razorpay_order_id?: string | null;
  payment_close_reason?: string | null;
}): 'incomplete_payment' | 'abandoned_payment' | null {
  if (order.payment_close_reason === PAYMENT_CLOSE_ABANDONED) return 'abandoned_payment';
  if (order.status === 'pending' && order.razorpay_order_id) return 'incomplete_payment';
  return null;
}

function withLifecycleFields(order: Record<string, unknown>) {
  const lifecycle = paymentLifecycleLabel({
    status: order.status as string | null,
    razorpay_order_id: order.razorpay_order_id as string | null,
    payment_close_reason: order.payment_close_reason as string | null,
  });
  return {
    ...order,
    payment_lifecycle: lifecycle,
  };
}

function instrumentFromWebhook(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const root = raw as Record<string, unknown>;
  const payload = root.payload as Record<string, unknown> | undefined;
  const payment = (payload?.payment ?? root.payment) as Record<string, unknown> | undefined;
  const entity = (payment?.entity ?? root.entity) as Record<string, unknown> | undefined;
  const method = entity?.method ?? payment?.method ?? root.method;
  return typeof method === 'string' && method.trim() ? method.trim().toLowerCase() : null;
}

function presentPayments(rows: Array<Record<string, unknown>> | null | undefined) {
  return (rows ?? []).map((row) => {
    const { raw_webhook: rawWebhook, ...rest } = row;
    const provider = typeof rest.provider === 'string' ? rest.provider.toLowerCase() : '';
    return {
      ...rest,
      method: provider === 'cod' ? 'cod' : instrumentFromWebhook(rawWebhook),
    };
  });
}

export class OrdersService {
  /**
   * Silently close abandoned unpaid Razorpay checkouts.
   * No email, no Delhivery, no Cancel Management row, no stock restore.
   */
  async expireAbandonedOnlinePending(options?: { force?: boolean }) {
    const now = Date.now();
    if (!options?.force && now - lastExpireRunAt < EXPIRE_THROTTLE_MS) {
      return { expired: 0, skipped: true as const };
    }
    lastExpireRunAt = now;

    const cutoff = new Date(now - ONLINE_PAYMENT_ABANDON_TTL_MS).toISOString();
    const { data: rows, error } = await supabase
      .from('orders')
      .select('id, idempotency_key')
      .eq('status', 'pending')
      .not('razorpay_order_id', 'is', null)
      .lt('created_at', cutoff)
      .limit(100);

    if (error) throw error;
    if (!rows?.length) return { expired: 0, skipped: false as const };

    let expired = 0;
    for (const row of rows) {
      const newKey = `${row.idempotency_key}::abandoned::${row.id}`;
      const { data: updated, error: updErr } = await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          payment_close_reason: PAYMENT_CLOSE_ABANDONED,
          idempotency_key: newKey,
        })
        .eq('id', row.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();

      if (updErr) {
        console.error('[orders] abandon expire failed', row.id, updErr);
        continue;
      }
      if (!updated) continue;

      await supabase
        .from('payments')
        .update({ status: 'failed' })
        .eq('order_id', row.id)
        .in('status', ['created', 'authorized']);

      expired += 1;
    }

    return { expired, skipped: false as const };
  }

  async listForUser(userId: string, page = 1, perPage = 20) {
    await this.expireAbandonedOnlinePending().catch((err) => {
      console.error('[orders] expire on listForUser', err);
    });

    const p = clampPage(page);
    const pp = clampPerPage(perPage);
    const from = (p - 1) * pp;
    const to = from + pp - 1;

    // Hide unpaid online pending + abandoned payment attempts (customer My Orders).
    const { data, error, count } = await supabase
      .from('orders')
      .select(
        'id, order_number, status, subtotal_paise, discount_paise, shipping_paise, total_paise, currency, coupon_code, shipping_address, razorpay_order_id, payment_close_reason, paid_at, created_at, updated_at, delhivery_waybill, delhivery_status, delhivery_pickup_token, order_items(id, snapshot_name, snapshot_slug, snapshot_image_url, quantity, unit_price_paise, line_total_paise)',
        { count: 'exact' }
      )
      .eq('user_id', userId)
      .or('razorpay_order_id.is.null,status.neq.pending')
      .or('payment_close_reason.is.null,payment_close_reason.neq.payment_abandoned')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;
    const orders = data ?? [];
    const refunds = await latestRefundByOrderIds(orders.map((o) => o.id as string));
    return {
      orders: orders.map((o) => withRefundFields(o as Record<string, unknown>, refunds.get(o.id as string))),
      meta: paginationMeta(count ?? 0, p, pp),
    };
  }

  async getForUser(userId: string, orderId: string) {
    await this.expireAbandonedOnlinePending().catch((err) => {
      console.error('[orders] expire on getForUser', err);
    });

    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!order || !isCustomerVisibleOrder(order)) throw ApiError.notFound('Order not found');

    const { data: items, error: itemsErr } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);

    if (itemsErr) throw itemsErr;

    const { data: payments } = await supabase
      .from('payments')
      .select('id, provider, provider_order_id, provider_payment_id, amount_paise, status, created_at, raw_webhook')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    const refunds = await latestRefundByOrderIds([orderId]);
    return {
      order: withRefundFields(order as Record<string, unknown>, refunds.get(orderId)),
      items: items ?? [],
      payments: presentPayments(payments as Array<Record<string, unknown>> | null),
    };
  }

  async listAdmin(
    page = 1,
    perPage = 20,
    status?: string,
    range?: { from?: string; to?: string }
  ) {
    await this.expireAbandonedOnlinePending().catch((err) => {
      console.error('[orders] expire on listAdmin', err);
    });
    const { fulfillmentService } = await import('../fulfillment/fulfillment.service.js');
    await fulfillmentService.syncActiveShipments().catch((err) => {
      console.warn('[orders] delivery sync', err instanceof Error ? err.message : err);
    });

    const p = clampPage(page);
    const pp = clampPerPage(perPage);
    const from = (p - 1) * pp;
    const to = from + pp - 1;

    // Include ONLINE + BULK_OFFLINE (bulk never goes through Delhivery).
    let qb = supabase
      .from('orders')
      .select('*, order_items(*), payments(*)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    const dateFrom = range?.from && /^\d{4}-\d{2}-\d{2}$/.test(range.from) ? range.from : undefined;
    const dateTo = range?.to && /^\d{4}-\d{2}-\d{2}$/.test(range.to) ? range.to : undefined;
    if (dateFrom) qb = qb.gte('created_at', `${dateFrom}T00:00:00+05:30`);
    if (dateTo) qb = qb.lte('created_at', `${dateTo}T23:59:59.999+05:30`);

    if (status === 'incomplete_payment') {
      qb = qb.eq('status', 'pending').not('razorpay_order_id', 'is', null);
    } else if (status === 'abandoned_payment') {
      qb = qb.eq('payment_close_reason', PAYMENT_CLOSE_ABANDONED);
    } else if (status === 'pending') {
      // Real pending only (COD) — unpaid Razorpay attempts use incomplete_payment.
      qb = qb.eq('status', 'pending').is('razorpay_order_id', null);
    } else if (status) {
      qb = qb.eq('status', status);
      // Keep real cancelled separate from abandoned payment rows when filtering cancelled.
      if (status === 'cancelled') {
        qb = qb.or('payment_close_reason.is.null,payment_close_reason.neq.payment_abandoned');
      }
    }

    const { data, error, count } = await qb;
    if (error) throw error;
    return {
      orders: (data ?? []).map((o) => withLifecycleFields(o as Record<string, unknown>)),
      meta: paginationMeta(count ?? 0, p, pp),
    };
  }

  /** Admin: full detail for one order including user profile. */
  async getForAdmin(orderId: string) {
    await this.expireAbandonedOnlinePending().catch((err) => {
      console.error('[orders] expire on getForAdmin', err);
    });

    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (error) throw error;
    if (!order) throw ApiError.notFound('Order not found');

    const [{ data: items }, { data: payments }, { data: user }] = await Promise.all([
      supabase
        .from('order_items')
        .select('id, snapshot_name, snapshot_slug, snapshot_image_url, quantity, unit_price_paise, line_total_paise')
        .eq('order_id', orderId),
      supabase
        .from('payments')
        .select('id, provider, provider_order_id, provider_payment_id, amount_paise, status, created_at, raw_webhook')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false }),
      order.user_id
        ? supabase
            .from('users')
            .select('id, email, full_name, avatar_url, phone, role, status')
            .eq('id', order.user_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    return {
      order: withLifecycleFields(order as Record<string, unknown>),
      items: items ?? [],
      payments: presentPayments(payments as Array<Record<string, unknown>> | null),
      user: user ?? null,
    };
  }

  async updateStatus(orderId: string, status: string) {
    if (!ADMIN_STATUSES.includes(status as (typeof ADMIN_STATUSES)[number])) {
      throw ApiError.badRequest('Invalid order status');
    }
    if (status === 'cancelled' || status === 'refunded') {
      throw ApiError.badRequest(
        'Use Cancel Management to cancel and Refund Management to refund. Direct status change is not saved.'
      );
    }

    const { data: existing, error: findErr } = await supabase
      .from('orders')
      .select('id, status, user_id, order_number')
      .eq('id', orderId)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!existing) throw ApiError.notFound('Order not found');

    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId)
      .select('*')
      .single();

    if (error) throw error;
    if (!data) throw ApiError.internal('Order status was not saved');

    if (existing.status !== status) {
      if (status === 'delivered') {
        const { fulfillmentService } = await import('../fulfillment/fulfillment.service.js');
        await fulfillmentService.settleCodPaymentOnDelivered(orderId);
      }
      await this.notifyStatusChange(data);
    }

    return data;
  }

  private async notifyStatusChange(order: {
    id: string;
    user_id: string;
    order_number: string;
    status: string;
    delhivery_waybill?: string | null;
    shipping_address?: unknown;
  }) {
    const map: Record<string, { type: string; title: string; body: string }> = {
      processing: {
        type: 'order_processing',
        title: 'Order is being prepared',
        body: `Order ${order.order_number} is now processing.`,
      },
      shipped: {
        type: 'order_shipped',
        title: 'Order shipped',
        body: `Order ${order.order_number} is on the way.`,
      },
      delivered: {
        type: 'order_delivered',
        title: 'Order delivered',
        body: `Order ${order.order_number} was delivered.`,
      },
      cancelled: {
        type: 'order_cancelled',
        title: 'Order cancelled',
        body: `Order ${order.order_number} was cancelled.`,
      },
      refunded: {
        type: 'order_refunded',
        title: 'Order refunded',
        body: `Order ${order.order_number} was refunded.`,
      },
    };

    const payload = map[order.status];
    if (!payload) return;

    const { notificationsService } = await import('../notifications/notifications.service.js');
    await notificationsService.safeCreate({
      userId: order.user_id,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      link: `/dashboard/orders/${order.id}`,
      metadata: { order_id: order.id, order_number: order.order_number, status: order.status },
    });

    if (order.status === 'shipped' || order.status === 'delivered') {
      const { sendOrderShippedEmailForOrder, sendOrderDeliveredEmailForOrder } =
        await import('../../lib/mailer/index.js');
      if (order.status === 'shipped') sendOrderShippedEmailForOrder(order);
      if (order.status === 'delivered') sendOrderDeliveredEmailForOrder(order);
    }
  }
}

export const ordersService = new OrdersService();
