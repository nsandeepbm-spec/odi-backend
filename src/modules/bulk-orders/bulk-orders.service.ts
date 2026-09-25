import { randomUUID } from 'crypto';
import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { clampPage, clampPerPage, paginationMeta } from '../../lib/pagination.js';
import { generateBulkOrderNumber } from '../../lib/money.js';
import { applyStockDeltaForOrder } from '../../lib/stock.js';
import { productsService } from '../products/products.service.js';
import type { CreateBulkOrderInput, MarkBulkOrderPaidInput } from './bulk-orders.schema.js';

export const ORDER_CHANNEL_ONLINE = 'ONLINE';
export const ORDER_CHANNEL_BULK_OFFLINE = 'BULK_OFFLINE';

function assertNotBulkChannel(channel: string | null | undefined) {
  if (channel === ORDER_CHANNEL_BULK_OFFLINE) {
    throw ApiError.badRequest('Bulk / offline orders do not use delivery or shipping');
  }
}

/** Call from Delhivery/fulfillment entry points — never ship bulk orders. */
export async function assertOrderAllowsShipping(orderId: string) {
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, channel')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  if (!order) throw ApiError.notFound('Order not found');
  assertNotBulkChannel(order.channel as string | null);
  return order;
}

function paymentProviderFromMethod(method: string): string {
  const key = method.toLowerCase().replace(/\s+/g, '_');
  return `bulk_${key}`;
}

function splitContactName(name: string): { first_name: string; last_name: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

function billingAddressFromCustomer(customer: CreateBulkOrderInput['customer']) {
  const { first_name, last_name } = splitContactName(customer.contact_name);
  return {
    first_name,
    last_name,
    organization_name: customer.organization_name,
    email: customer.email ?? '',
    phone: customer.phone,
    gstin: customer.gstin ?? '',
    street: customer.street ?? customer.organization_name,
    city: customer.city ?? '',
    state: customer.state ?? '',
    postal_code: customer.postal_code ?? '',
    country: customer.country?.trim() || 'India',
  };
}

export class BulkOrdersService {
  async create(adminUserId: string, input: CreateBulkOrderInput) {
    const product = await productsService.getById(input.productId);
    if (!product) throw ApiError.notFound('Product not found');
    if (product.status === 'archived') {
      throw ApiError.badRequest('Archived products cannot be sold in bulk orders');
    }
    if (product.stock_qty < input.quantity) {
      throw ApiError.badRequest(
        `Insufficient stock. Available: ${product.stock_qty}, requested: ${input.quantity}`
      );
    }

    const discountPaise = input.discountPaise ?? 0;
    const taxPaise = input.taxPaise ?? 0;
    const subtotalPaise = input.unitPricePaise * input.quantity;
    const totalPaise = Math.max(0, subtotalPaise - discountPaise + taxPaise);
    const isPaid = input.paymentStatus === 'paid';
    const orderNumber = generateBulkOrderNumber();
    const idempotencyKey =
      input.idempotencyKey?.trim() ||
      `bulk:${adminUserId}:${input.productId}:${input.quantity}:${input.unitPricePaise}:${Date.now()}:${randomUUID().slice(0, 8)}`;

    const cardImage =
      (product.images as Array<{ kind?: string; url?: string }> | undefined)?.find((img) => img.kind === 'card')
        ?.url ??
      (product.images as Array<{ url?: string }> | undefined)?.[0]?.url ??
      product.media?.card?.url ??
      null;

    const shippingAddress = billingAddressFromCustomer(input.customer);

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        user_id: null,
        channel: ORDER_CHANNEL_BULK_OFFLINE,
        status: isPaid ? 'paid' : 'pending',
        subtotal_paise: subtotalPaise,
        discount_paise: discountPaise,
        tax_paise: taxPaise,
        shipping_paise: 0,
        total_paise: totalPaise,
        currency: 'INR',
        coupon_id: null,
        coupon_code: null,
        shipping_address: shippingAddress,
        razorpay_order_id: null,
        idempotency_key: idempotencyKey,
        paid_at: isPaid ? new Date().toISOString() : null,
        bulk_payment_method: input.paymentMethod,
        bulk_notes: input.notes?.trim() || null,
        created_by_admin_id: adminUserId,
      })
      .select('*')
      .single();

    if (orderError) {
      if (orderError.code === '23505') {
        throw ApiError.badRequest('Duplicate bulk order (idempotency key already used)');
      }
      throw orderError;
    }

    const { error: itemsError } = await supabase.from('order_items').insert({
      order_id: order.id,
      product_id: product.id,
      snapshot_name: product.name,
      snapshot_slug: product.slug,
      snapshot_image_url: cardImage,
      unit_price_paise: input.unitPricePaise,
      quantity: input.quantity,
      line_total_paise: subtotalPaise,
    });

    if (itemsError) {
      await supabase.from('orders').delete().eq('id', order.id);
      throw itemsError;
    }

    try {
      await applyStockDeltaForOrder(order.id, 'decrement');
    } catch (err) {
      await supabase.from('orders').delete().eq('id', order.id);
      throw err;
    }

    const { error: payError } = await supabase.from('payments').insert({
      order_id: order.id,
      provider: paymentProviderFromMethod(input.paymentMethod),
      amount_paise: totalPaise,
      currency: 'INR',
      status: isPaid ? 'captured' : 'created',
      provider_payment_id: null,
      provider_order_id: null,
    });

    if (payError) {
      await applyStockDeltaForOrder(order.id, 'increment').catch(() => undefined);
      await supabase.from('orders').delete().eq('id', order.id);
      throw payError;
    }

    // Never call Delhivery / fulfillment for bulk orders.
    return this.getDetail(order.id);
  }

  async list(
    page = 1,
    perPage = 20,
    opts: {
      paymentStatus?: 'paid' | 'pending' | 'all';
      q?: string;
      from?: string;
      to?: string;
    } = {}
  ) {
    const p = clampPage(page);
    const pp = clampPerPage(perPage);
    const from = (p - 1) * pp;
    const to = from + pp - 1;

    let qb = supabase
      .from('orders')
      .select(
        'id, order_number, channel, status, subtotal_paise, discount_paise, tax_paise, shipping_paise, total_paise, currency, shipping_address, bulk_payment_method, bulk_notes, paid_at, created_at, updated_at, created_by_admin_id, order_items(id, snapshot_name, snapshot_slug, snapshot_image_url, quantity, unit_price_paise, line_total_paise), payments(id, provider, status, amount_paise, created_at)',
        { count: 'exact' }
      )
      .eq('channel', ORDER_CHANNEL_BULK_OFFLINE)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (opts.paymentStatus === 'paid') {
      qb = qb.eq('status', 'paid');
    } else if (opts.paymentStatus === 'pending') {
      qb = qb.eq('status', 'pending');
    }

    if (opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from)) {
      qb = qb.gte('created_at', `${opts.from}T00:00:00+05:30`);
    }
    if (opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to)) {
      qb = qb.lte('created_at', `${opts.to}T23:59:59.999+05:30`);
    }

    const q = opts.q?.trim();
    if (q) {
      // Order number / org / contact / phone / email search (client-side filter after fetch is weak for pagination).
      // Prefer order_number ILIKE; also match shipping_address text via filter on order_number OR cast.
      qb = qb.or(
        `order_number.ilike.%${q}%,shipping_address->>organization_name.ilike.%${q}%,shipping_address->>first_name.ilike.%${q}%,shipping_address->>last_name.ilike.%${q}%,shipping_address->>phone.ilike.%${q}%,shipping_address->>email.ilike.%${q}%`
      );
    }

    const { data, error, count } = await qb;
    if (error) throw error;

    return {
      orders: data ?? [],
      meta: paginationMeta(count ?? 0, p, pp),
    };
  }

  async getDetail(orderId: string) {
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (error) throw error;
    if (!order) throw ApiError.notFound('Order not found');
    if (order.channel !== ORDER_CHANNEL_BULK_OFFLINE) {
      throw ApiError.badRequest('Not a bulk / offline order');
    }

    const adminResult = order.created_by_admin_id
      ? await supabase
          .from('users')
          .select('id, email, full_name')
          .eq('id', order.created_by_admin_id)
          .maybeSingle()
      : { data: null as { id: string; email: string; full_name: string | null } | null };

    const [{ data: items }, { data: payments }] = await Promise.all([
      supabase
        .from('order_items')
        .select(
          'id, product_id, snapshot_name, snapshot_slug, snapshot_image_url, quantity, unit_price_paise, line_total_paise'
        )
        .eq('order_id', orderId),
      supabase
        .from('payments')
        .select('id, provider, provider_order_id, provider_payment_id, amount_paise, status, created_at')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false }),
    ]);

    return {
      order,
      items: items ?? [],
      payments: payments ?? [],
      created_by: adminResult.data ?? null,
    };
  }

  /**
   * Record offline collection later (Cash / UPI / Bank / etc.).
   * Idempotent if already paid. Never triggers Delhivery.
   */
  async markPaid(orderId: string, adminUserId: string, input: MarkBulkOrderPaidInput = {}) {
    const detail = await this.getDetail(orderId);
    if (detail.order.status === 'paid') {
      // Allow correcting method/notes even after paid, without changing paid_at.
      if (input.paymentMethod || input.notes !== undefined) {
        const patch: Record<string, unknown> = {};
        if (input.paymentMethod) patch.bulk_payment_method = input.paymentMethod;
        if (input.notes !== undefined) patch.bulk_notes = input.notes?.trim() || null;
        const { error: patchErr } = await supabase.from('orders').update(patch).eq('id', orderId);
        if (patchErr) throw patchErr;
        if (input.paymentMethod) {
          const openOrLatest = (detail.payments as Array<{ id: string }>).find(Boolean);
          if (openOrLatest) {
            await supabase
              .from('payments')
              .update({ provider: paymentProviderFromMethod(input.paymentMethod) })
              .eq('id', openOrLatest.id);
          }
        }
        return this.getDetail(orderId);
      }
      return detail;
    }

    if (detail.order.status !== 'pending') {
      throw ApiError.badRequest('Only pending bulk orders can be marked paid');
    }

    const method = input.paymentMethod || detail.order.bulk_payment_method || 'Other';
    let paidAt = new Date().toISOString();
    if (input.paidAt) {
      const parsedPaidAt = new Date(input.paidAt);
      if (Number.isNaN(parsedPaidAt.getTime())) {
        throw ApiError.badRequest('Invalid paidAt timestamp');
      }
      paidAt = parsedPaidAt.toISOString();
    }
    const orderPatch: Record<string, unknown> = {
      status: 'paid',
      paid_at: paidAt,
      bulk_payment_method: method,
    };
    if (input.notes !== undefined) {
      orderPatch.bulk_notes = input.notes?.trim() || null;
    }

    const { error } = await supabase
      .from('orders')
      .update(orderPatch)
      .eq('id', orderId)
      .eq('channel', ORDER_CHANNEL_BULK_OFFLINE)
      .eq('status', 'pending');

    if (error) throw error;

    const openPayment = (detail.payments as Array<{ id: string; status: string }>).find(
      (p) => p.status === 'created'
    );
    if (openPayment) {
      await supabase
        .from('payments')
        .update({
          status: 'captured',
          provider: paymentProviderFromMethod(method),
        })
        .eq('id', openPayment.id);
    } else {
      await supabase.from('payments').insert({
        order_id: orderId,
        provider: paymentProviderFromMethod(method),
        amount_paise: detail.order.total_paise,
        currency: 'INR',
        status: 'captured',
      });
    }

    // Audit trail via created_by stays on create; mark-paid is ops collection only.
    void adminUserId;
    return this.getDetail(orderId);
  }
}

export const bulkOrdersService = new BulkOrdersService();
