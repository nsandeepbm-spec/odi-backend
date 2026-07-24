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

export class OrdersService {
  async listForUser(userId: string, page = 1, perPage = 20) {
    const p = clampPage(page);
    const pp = clampPerPage(perPage);
    const from = (p - 1) * pp;
    const to = from + pp - 1;

    const { data, error, count } = await supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;
    return { orders: data ?? [], meta: paginationMeta(count ?? 0, p, pp) };
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

    return { order, items: items ?? [], payments: payments ?? [] };
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

  async updateStatus(orderId: string, status: string) {
    if (!ADMIN_STATUSES.includes(status as (typeof ADMIN_STATUSES)[number])) {
      throw ApiError.badRequest('Invalid order status');
    }

    const { data: existing, error: findErr } = await supabase
      .from('orders')
      .select('id, status')
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
    return data;
  }
}

export const ordersService = new OrdersService();
