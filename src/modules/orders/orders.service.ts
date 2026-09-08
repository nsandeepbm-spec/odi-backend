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

export class OrdersService {
  async listForUser(userId: string, page = 1, perPage = 20) {
    const p = clampPage(page);
    const pp = clampPerPage(perPage);
    const from = (p - 1) * pp;
    const to = from + pp - 1;

    const { data, error, count } = await supabase
      .from('orders')
      .select(
        'id, order_number, status, subtotal_paise, discount_paise, shipping_paise, total_paise, currency, coupon_code, shipping_address, razorpay_order_id, paid_at, created_at, updated_at, delhivery_waybill, delhivery_status, delhivery_pickup_token, order_items(id, snapshot_name, snapshot_slug, snapshot_image_url, quantity, unit_price_paise, line_total_paise)',
        { count: 'exact' }
      )
      .eq('user_id', userId)
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
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!order) throw ApiError.notFound('Order not found');

    const { data: items, error: itemsErr } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);

    if (itemsErr) throw itemsErr;

    const { data: payments } = await supabase
      .from('payments')
      .select('id, provider, provider_order_id, provider_payment_id, amount_paise, status, created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    const refunds = await latestRefundByOrderIds([orderId]);
    return {
      order: withRefundFields(order as Record<string, unknown>, refunds.get(orderId)),
      items: items ?? [],
      payments: payments ?? [],
    };
  }

  async listAdmin(page = 1, perPage = 20, status?: string) {
    const p = clampPage(page);
    const pp = clampPerPage(perPage);
    const from = (p - 1) * pp;
    const to = from + pp - 1;

    let qb = supabase
      .from('orders')
      .select('*, order_items(*), payments(*)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status) qb = qb.eq('status', status);

    const { data, error, count } = await qb;
    if (error) throw error;
    return { orders: data ?? [], meta: paginationMeta(count ?? 0, p, pp) };
  }

  /** Admin: full detail for one order including user profile. */
  async getForAdmin(orderId: string) {
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
        .select('id, provider, provider_order_id, provider_payment_id, amount_paise, status, created_at')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false }),
      supabase
        .from('users')
        .select('id, email, full_name, avatar_url, phone, role, status')
        .eq('id', order.user_id)
        .maybeSingle(),
    ]);

    return { order, items: items ?? [], payments: payments ?? [], user: user ?? null };
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
