import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { verifyPaymentSignature, verifyWebhookSignature } from '../../lib/razorpay.js';
import { env } from '../../config/env.js';

export class PaymentsService {
  /**
   * Mark order paid exactly once: create/update payment, set order paid, decrement stock,
   * bump coupon used_count.
   */
  async markOrderPaid(params: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    signature?: string | null;
    rawWebhook?: unknown;
    amountPaise?: number;
  }) {
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .eq('razorpay_order_id', params.razorpayOrderId)
      .maybeSingle();

    if (orderErr) throw orderErr;
    if (!order) throw ApiError.notFound('Order not found for Razorpay order id');

    if (order.status === 'paid' || order.status === 'processing' || order.status === 'shipped' || order.status === 'delivered') {
      return { order, alreadyPaid: true };
    }
    if (order.status === 'cancelled' || order.status === 'refunded') {
      throw ApiError.badRequest(`Cannot pay order in status ${order.status}`);
    }

    // Idempotent by provider_payment_id
    if (params.razorpayPaymentId) {
      const { data: existingPayment } = await supabase
        .from('payments')
        .select('*')
        .eq('provider_payment_id', params.razorpayPaymentId)
        .maybeSingle();

      if (existingPayment?.status === 'captured') {
        return { order, alreadyPaid: true };
      }
    }

    const amount = params.amountPaise ?? order.total_paise;

    // Upsert payment row for this order
    const { data: paymentRows } = await supabase
      .from('payments')
      .select('id')
      .eq('order_id', order.id)
      .eq('provider_order_id', params.razorpayOrderId)
      .limit(1);

    const paymentId = paymentRows?.[0]?.id;
    if (paymentId) {
      await supabase
        .from('payments')
        .update({
          provider_payment_id: params.razorpayPaymentId,
          provider_signature: params.signature ?? null,
          amount_paise: amount,
          status: 'captured',
          raw_webhook: params.rawWebhook ?? null,
        })
        .eq('id', paymentId);
    } else {
      await supabase.from('payments').insert({
        order_id: order.id,
        provider: 'razorpay',
        provider_order_id: params.razorpayOrderId,
        provider_payment_id: params.razorpayPaymentId,
        provider_signature: params.signature ?? null,
        amount_paise: amount,
        currency: order.currency,
        status: 'captured',
        raw_webhook: params.rawWebhook ?? null,
      });
    }

    const { data: updatedOrder, error: updErr } = await supabase
      .from('orders')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', order.id)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();

    // Another worker won the race
    if (!updatedOrder) {
      const { data: current } = await supabase.from('orders').select('*').eq('id', order.id).single();
      return { order: current, alreadyPaid: true };
    }
    if (updErr) throw updErr;

    // Decrement stock
    const { data: items } = await supabase
      .from('order_items')
      .select('product_id, quantity')
      .eq('order_id', order.id);

    for (const item of items ?? []) {
      if (!item.product_id) continue;
      const { data: product } = await supabase
        .from('products')
        .select('stock_qty')
        .eq('id', item.product_id)
        .single();
      if (!product) continue;
      const next = Math.max(0, product.stock_qty - item.quantity);
      await supabase.from('products').update({ stock_qty: next }).eq('id', item.product_id);
    }

    if (order.coupon_id) {
      const { data: coupon } = await supabase
        .from('coupons')
        .select('used_count')
        .eq('id', order.coupon_id)
        .single();
      if (coupon) {
        await supabase
          .from('coupons')
          .update({ used_count: coupon.used_count + 1 })
          .eq('id', order.coupon_id);
      }
    }

    return { order: updatedOrder, alreadyPaid: false };
  }

  async verifyClientPayment(userId: string, body: {
    orderId: string;
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) {
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', body.orderId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!order) throw ApiError.notFound('Order not found');
    if (order.razorpay_order_id !== body.razorpay_order_id) {
      throw ApiError.badRequest('Razorpay order mismatch');
    }

    const ok = verifyPaymentSignature({
      orderId: body.razorpay_order_id,
      paymentId: body.razorpay_payment_id,
      signature: body.razorpay_signature,
    });

    if (!ok) throw ApiError.badRequest('Invalid payment signature');

    return this.markOrderPaid({
      razorpayOrderId: body.razorpay_order_id,
      razorpayPaymentId: body.razorpay_payment_id,
      signature: body.razorpay_signature,
    });
  }

  async handleWebhook(rawBody: string, signature: string | undefined, parsed: Record<string, unknown>) {
    if (!signature) throw ApiError.badRequest('Missing x-razorpay-signature');

    const valid = verifyWebhookSignature(rawBody, signature);
    if (!valid && env.isProd) {
      throw ApiError.forbidden('Invalid webhook signature');
    }
    if (!valid && !env.isProd) {
      console.warn('[payments] webhook signature invalid — allowing in non-production');
    }

    const event = String(parsed.event ?? '');
    if (event !== 'payment.captured' && event !== 'order.paid') {
      return { ignored: true, event };
    }

    const payload = parsed.payload as {
      payment?: { entity?: { id?: string; order_id?: string; amount?: number } };
      order?: { entity?: { id?: string; amount?: number } };
    };

    const paymentEntity = payload?.payment?.entity;
    const razorpayOrderId = paymentEntity?.order_id ?? payload?.order?.entity?.id;
    const razorpayPaymentId = paymentEntity?.id ?? `evt_${Date.now()}`;
    const amountPaise = paymentEntity?.amount ?? payload?.order?.entity?.amount;

    if (!razorpayOrderId) {
      throw ApiError.badRequest('Webhook missing order id');
    }

    const result = await this.markOrderPaid({
      razorpayOrderId,
      razorpayPaymentId,
      amountPaise,
      rawWebhook: parsed,
    });

    return { ignored: false, event, alreadyPaid: result.alreadyPaid, orderId: result.order?.id };
  }

  async listAdmin(page = 1, perPage = 50) {
    const { clampPage, clampPerPage, paginationMeta } = await import('../../lib/pagination.js');
    const p = clampPage(page);
    const pp = clampPerPage(perPage);
    const from = (p - 1) * pp;
    const to = from + pp - 1;

    const { data: payments, error, count } = await supabase
      .from('payments')
      .select('*, orders(order_number, shipping_address, user_id)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    const { data: allPayments, error: aggErr } = await supabase
      .from('payments')
      .select('amount_paise, status');

    if (aggErr) throw aggErr;

    let collectedPaise = 0;
    let pendingPaise = 0;
    let refundedPaise = 0;

    for (const p of allPayments ?? []) {
      if (p.status === 'captured') collectedPaise += p.amount_paise;
      else if (p.status === 'created' || p.status === 'authorized') pendingPaise += p.amount_paise;
      else if (p.status === 'refunded') refundedPaise += p.amount_paise;
    }

    return {
      payments: payments ?? [],
      kpis: { collectedPaise, pendingPaise, refundedPaise },
      meta: paginationMeta(count ?? 0, p, pp),
    };
  }
}

export const paymentsService = new PaymentsService();
