import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { getRazorpayAccountSnapshot, verifyPaymentSignature, verifyWebhookSignature } from '../../lib/razorpay.js';
import { env } from '../../config/env.js';
import { applyStockDeltaForOrder } from '../../lib/stock.js';

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

    if (
      typeof params.amountPaise === 'number' &&
      Number.isFinite(params.amountPaise) &&
      params.amountPaise !== order.total_paise
    ) {
      throw ApiError.badRequest(
        `Paid amount does not match order total (${params.amountPaise} vs ${order.total_paise} paise)`
      );
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

    const amount = order.total_paise;

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

    if (updErr) throw updErr;

    // Another worker won the race
    if (!updatedOrder) {
      const { data: current } = await supabase.from('orders').select('*').eq('id', order.id).single();
      return { order: current, alreadyPaid: true };
    }

    try {
      await applyStockDeltaForOrder(updatedOrder.id, 'decrement');
    } catch (err) {
      console.error('[payments] stock decrement failed after capture', updatedOrder.id, err);
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

    const { cartService } = await import('../cart/cart.service.js');
    await cartService.clear(updatedOrder.user_id).catch((err) => {
      console.error('[payments] cart clear failed after pay', updatedOrder.id, err);
    });

    const { sendOrderPlacedEmailForOrder } = await import('../../lib/mailer/index.js');
    sendOrderPlacedEmailForOrder(updatedOrder, false);

    await this.notifyOrderPaid(updatedOrder);

    const { fulfillmentService } = await import('../fulfillment/fulfillment.service.js');
    fulfillmentService.tryCreateShipment(updatedOrder.id);

    return { order: updatedOrder, alreadyPaid: false };
  }

  async notifyOrderPaid(order: {
    id: string;
    user_id: string;
    order_number: string;
    total_paise: number;
  }) {
    const { notificationsService } = await import('../notifications/notifications.service.js');
    const amountInr = (order.total_paise / 100).toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    });
    await notificationsService.safeCreate({
      userId: order.user_id,
      type: 'order_paid',
      title: 'Payment received',
      body: `Order ${order.order_number} · ${amountInr}`,
      link: `/dashboard/orders/${order.id}`,
      metadata: { order_id: order.id, order_number: order.order_number },
    });
    await notificationsService.notifyAdmins(
      {
        type: 'admin_order_paid',
        title: 'New paid order',
        body: `${order.order_number} · ${amountInr}`,
        link: `/dashboard/admin/orders/${order.id}`,
        metadata: { order_id: order.id, order_number: order.order_number, user_id: order.user_id },
      },
      { excludeUserId: order.user_id }
    );
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
    if (!env.razorpay.webhookSecret) {
      throw ApiError.badRequest(
        'RAZORPAY_WEBHOOK_SECRET is not set. Create the webhook at RAZORPAY_WEBHOOK_URL in Razorpay Dashboard and paste that secret here.'
      );
    }
    if (!signature) throw ApiError.badRequest('Missing x-razorpay-signature');

    const valid = verifyWebhookSignature(rawBody, signature);
    if (!valid) {
      throw ApiError.forbidden('Invalid webhook signature');
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
      razorpay: getRazorpayAccountSnapshot(),
      meta: paginationMeta(count ?? 0, p, pp),
    };
  }

  async getAdmin(id: string) {
    const { data: payment, error } = await supabase
      .from('payments')
      .select(
        'id, order_id, provider, provider_order_id, provider_payment_id, amount_paise, currency, status, created_at, updated_at, orders(id, order_number, status, total_paise, subtotal_paise, discount_paise, coupon_code, shipping_address, user_id, created_at, paid_at)'
      )
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!payment) throw ApiError.notFound('Payment not found');

    const order = (payment as { orders?: { user_id?: string } | null }).orders ?? null;
    let user = null;
    if (order?.user_id) {
      const { data: profile } = await supabase
        .from('users')
        .select('id, email, full_name, avatar_url, phone, role, status')
        .eq('id', order.user_id)
        .maybeSingle();
      user = profile ?? null;
    }

    const { orders: orderRow, ...paymentRow } = payment as typeof payment & {
      orders?: unknown;
    };

    return {
      payment: paymentRow,
      order: orderRow ?? null,
      user,
    };
  }
}

export const paymentsService = new PaymentsService();
