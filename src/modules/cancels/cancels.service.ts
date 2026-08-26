import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { clampPage, clampPerPage, paginationMeta } from '../../lib/pagination.js';
import { cancelDelhiveryShipment } from '../../lib/delhivery/cancel-shipment.js';
import { createRazorpayRefund } from '../../lib/razorpay.js';

type CancelStatus = 'pending' | 'approved' | 'rejected';
type RefundStatus = 'pending' | 'approved' | 'rejected' | 'completed';

const CANCEL_SELECT =
  'id, order_id, user_id, order_number, waybill, amount_paise, reason, status, admin_note, reviewed_by, reviewed_at, delhivery_raw, delhivery_error, delhivery_at, created_at, updated_at';

const REFUND_SELECT =
  'id, order_id, user_id, cancel_id, payment_id, order_number, amount_paise, currency, reason, status, admin_note, reviewed_by, reviewed_at, provider, provider_payment_id, provider_refund_id, provider_raw, provider_error, refunded_at, created_at, updated_at';

function serializeCancel(
  row: Record<string, unknown>,
  user?: { email?: string; full_name?: string | null } | null
) {
  return {
    id: row.id as string,
    orderId: row.order_id as string,
    userId: row.user_id as string,
    orderNumber: row.order_number as string,
    waybill: (row.waybill as string | null) ?? null,
    amountPaise: row.amount_paise as number,
    reason: (row.reason as string) ?? '',
    status: row.status as CancelStatus,
    adminNote: (row.admin_note as string | null) ?? null,
    reviewedBy: (row.reviewed_by as string | null) ?? null,
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    delhiveryError: (row.delhivery_error as string | null) ?? null,
    delhiveryAt: (row.delhivery_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    userEmail: user?.email ?? null,
    userName: user?.full_name ?? null,
  };
}

function serializeRefund(
  row: Record<string, unknown>,
  user?: { email?: string; full_name?: string | null } | null
) {
  return {
    id: row.id as string,
    orderId: row.order_id as string,
    userId: row.user_id as string,
    cancelId: (row.cancel_id as string | null) ?? null,
    paymentId: (row.payment_id as string | null) ?? null,
    orderNumber: row.order_number as string,
    amountPaise: row.amount_paise as number,
    currency: (row.currency as string) ?? 'INR',
    reason: (row.reason as string) ?? '',
    status: row.status as RefundStatus,
    adminNote: (row.admin_note as string | null) ?? null,
    reviewedBy: (row.reviewed_by as string | null) ?? null,
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    provider: (row.provider as string) ?? 'razorpay',
    providerPaymentId: (row.provider_payment_id as string | null) ?? null,
    providerRefundId: (row.provider_refund_id as string | null) ?? null,
    providerError: (row.provider_error as string | null) ?? null,
    refundedAt: (row.refunded_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    userEmail: user?.email ?? null,
    userName: user?.full_name ?? null,
  };
}

async function usersByIds(ids: string[]) {
  if (!ids.length) return new Map<string, { id: string; email: string; full_name: string | null }>();
  const { data, error } = await supabase.from('users').select('id, email, full_name').in('id', ids);
  if (error) {
    throw ApiError.badRequest(`Could not load customers: ${error.message}`);
  }
  return new Map((data ?? []).map((u) => [u.id as string, u]));
}

type DbError = { message?: string; code?: string } | null | undefined;

function failDb(context: string, error: DbError): never {
  throw ApiError.badRequest(`${context}: ${error?.message ?? 'database write failed'}`);
}

async function restoreStockForOrder(orderId: string) {
  const { data: items, error } = await supabase
    .from('order_items')
    .select('product_id, quantity')
    .eq('order_id', orderId);
  if (error) failDb('Could not load order items to restore stock', error);

  for (const item of items ?? []) {
    if (!item.product_id) continue;
    const { data: product, error: prodErr } = await supabase
      .from('products')
      .select('stock_qty')
      .eq('id', item.product_id)
      .maybeSingle();
    if (prodErr) failDb('Could not load product stock', prodErr);
    if (!product) continue;
    const next = (product.stock_qty as number) + (item.quantity as number);
    const { data: saved, error: updErr } = await supabase
      .from('products')
      .update({ stock_qty: next })
      .eq('id', item.product_id)
      .select('id')
      .maybeSingle();
    if (updErr) failDb('Could not restore product stock', updErr);
    if (!saved) failDb('Could not restore product stock', { message: 'product row was not updated' });
  }
}

async function notifyCustomerOrder(
  userId: string,
  orderId: string,
  orderNumber: string,
  kind: 'cancelled' | 'refunded'
) {
  const { notificationsService } = await import('../notifications/notifications.service.js');
  await notificationsService.safeCreate({
    userId,
    type: kind === 'cancelled' ? 'order_cancelled' : 'order_refunded',
    title: kind === 'cancelled' ? 'Order cancelled' : 'Refund sent',
    body:
      kind === 'cancelled'
        ? `Order ${orderNumber} was cancelled. Your refund is being processed.`
        : `Order ${orderNumber} refund has been sent to your original payment method.`,
    link: `/dashboard/orders/${orderId}`,
    metadata: { order_id: orderId, order_number: orderNumber },
  });
}

export class CancelsService {
  /** User: create cancel request for own order */
  async createForUser(userId: string, orderId: string, reason: string) {
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, order_number, user_id, status, total_paise, delhivery_waybill')
      .eq('id', orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order || order.user_id !== userId) throw ApiError.notFound('Order not found');

    const blocked = ['cancelled', 'refunded', 'delivered', 'pending'];
    if (blocked.includes(order.status as string)) {
      throw ApiError.badRequest(`Cannot cancel order in status "${order.status}"`);
    }

    const { data: existingPending, error: pendingErr } = await supabase
      .from('cancels')
      .select('id')
      .eq('order_id', orderId)
      .eq('status', 'pending')
      .maybeSingle();
    if (pendingErr) failDb('Could not check existing cancel request', pendingErr);
    if (existingPending) throw ApiError.badRequest('A cancel request is already pending for this order');

    const { data: existingApproved, error: approvedErr } = await supabase
      .from('cancels')
      .select('id')
      .eq('order_id', orderId)
      .eq('status', 'approved')
      .maybeSingle();
    if (approvedErr) failDb('Could not check existing cancel request', approvedErr);
    if (existingApproved) throw ApiError.badRequest('This order cancel was already approved');

    const { data, error: insErr } = await supabase
      .from('cancels')
      .insert({
        order_id: order.id,
        user_id: userId,
        order_number: order.order_number,
        waybill: order.delhivery_waybill ?? null,
        amount_paise: order.total_paise,
        reason: reason.trim() || 'Customer requested cancellation',
        status: 'pending',
      })
      .select(CANCEL_SELECT)
      .single();
    if (insErr) failDb('Could not save cancel request', insErr);
    return serializeCancel(data as Record<string, unknown>);
  }

  async getForOrderUser(userId: string, orderId: string) {
    const { data, error } = await supabase
      .from('cancels')
      .select(CANCEL_SELECT)
      .eq('order_id', orderId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? serializeCancel(data as Record<string, unknown>) : null;
  }

  async listAdmin(page = 1, perPage = 50, status?: string) {
    const p = clampPage(page);
    const pp = clampPerPage(perPage);
    const from = (p - 1) * pp;
    const to = from + pp - 1;

    let qb = supabase
      .from('cancels')
      .select(CANCEL_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (status && status !== 'all') qb = qb.eq('status', status);

    const { data, error, count } = await qb;
    if (error) throw error;

    const byId = await usersByIds([
      ...new Set((data ?? []).map((r) => r.user_id as string)),
    ]);

    return {
      cancels: (data ?? []).map((row) =>
        serializeCancel(row as Record<string, unknown>, byId.get(row.user_id as string) ?? null)
      ),
      meta: paginationMeta(count ?? 0, p, pp),
    };
  }

  /**
   * Admin approve/reject.
   * Approve → Delhivery cancel (if waybill) → order cancelled → create refunds row.
   */
  async review(cancelId: string, adminId: string, decision: 'approved' | 'rejected', adminNote?: string | null) {
    const { data: row, error } = await supabase
      .from('cancels')
      .select(CANCEL_SELECT)
      .eq('id', cancelId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw ApiError.notFound('Cancel request not found');
    if (row.status !== 'pending') throw ApiError.badRequest('Cancel request already reviewed');

    const now = new Date().toISOString();

    if (decision === 'rejected') {
      const { data: updated, error: updErr } = await supabase
        .from('cancels')
        .update({
          status: 'rejected',
          admin_note: adminNote?.trim() || null,
          reviewed_by: adminId,
          reviewed_at: now,
        })
        .eq('id', cancelId)
        .select(CANCEL_SELECT)
        .single();
      if (updErr) throw updErr;
      return serializeCancel(updated as Record<string, unknown>);
    }

    // Approve is manual in admin. Courier first (fail closed), persist each write to
    // the live database, then queue refund. Never mark approved unless the order row saved.
    let delhiveryRaw: Record<string, unknown> | null =
      (row.delhivery_raw as Record<string, unknown> | null) ?? null;
    let delhiveryAt: string | null = (row.delhivery_at as string | null) ?? null;
    const waybill = typeof row.waybill === 'string' ? row.waybill.trim() : '';

    const { data: currentOrder, error: orderReadErr } = await supabase
      .from('orders')
      .select('id, status, user_id, order_number')
      .eq('id', row.order_id)
      .maybeSingle();
    if (orderReadErr) failDb('Could not load order', orderReadErr);
    if (!currentOrder) throw ApiError.notFound('Order not found');

    const orderAlreadyCancelled =
      currentOrder.status === 'cancelled' || currentOrder.status === 'refunded';
    const courierAlreadyDone = Boolean(row.delhivery_at) && !row.delhivery_error;

    if (waybill && !orderAlreadyCancelled && !courierAlreadyDone) {
      try {
        const result = await cancelDelhiveryShipment(waybill);
        delhiveryRaw = result.raw;
        delhiveryAt = now;
      } catch (err) {
        const delhiveryError = err instanceof Error ? err.message : String(err);
        const { error: errSave } = await supabase
          .from('cancels')
          .update({
            delhivery_error: delhiveryError,
            delhivery_at: now,
          })
          .eq('id', cancelId);
        if (errSave) failDb('Could not save courier error', errSave);
        throw ApiError.badRequest(
          `Delhivery could not cancel this shipment. The order was not cancelled. ${delhiveryError}`
        );
      }

      const { data: courierSaved, error: courierSaveErr } = await supabase
        .from('cancels')
        .update({
          delhivery_raw: delhiveryRaw,
          delhivery_error: null,
          delhivery_at: delhiveryAt,
        })
        .eq('id', cancelId)
        .select('id')
        .maybeSingle();
      if (courierSaveErr) failDb('Courier cancelled but could not save that result', courierSaveErr);
      if (!courierSaved) {
        failDb('Courier cancelled but could not save that result', {
          message: 'cancel row was not updated',
        });
      }
    } else if (waybill && (orderAlreadyCancelled || courierAlreadyDone)) {
      delhiveryAt = delhiveryAt ?? now;
    }

    if (!orderAlreadyCancelled) {
      const orderUpdate: Record<string, unknown> = { status: 'cancelled' };
      if (waybill) orderUpdate.delhivery_status = 'cancelled';
      const { data: orderSaved, error: orderErr } = await supabase
        .from('orders')
        .update(orderUpdate)
        .eq('id', row.order_id)
        .select('id, status')
        .maybeSingle();
      if (orderErr) failDb('Could not save cancelled order', orderErr);
      if (!orderSaved || orderSaved.status !== 'cancelled') {
        failDb('Could not save cancelled order', { message: 'order row was not updated' });
      }
      await restoreStockForOrder(String(row.order_id));
    }

    const { data: openRefund, error: openRefundErr } = await supabase
      .from('refunds')
      .select('id')
      .eq('order_id', row.order_id)
      .in('status', ['pending', 'approved'])
      .maybeSingle();
    if (openRefundErr) failDb('Could not check existing refund', openRefundErr);

    if (!openRefund && (row.amount_paise as number) > 0) {
      const { data: payment, error: payReadErr } = await supabase
        .from('payments')
        .select('id, provider, provider_payment_id, status, amount_paise')
        .eq('order_id', row.order_id)
        .in('status', ['captured', 'authorized'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (payReadErr) failDb('Could not load payment for refund', payReadErr);

      const refundAmount =
        typeof payment?.amount_paise === 'number' && payment.amount_paise > 0
          ? payment.amount_paise
          : (row.amount_paise as number);

      const { error: refundErr } = await supabase.from('refunds').insert({
        order_id: row.order_id,
        user_id: row.user_id,
        cancel_id: row.id,
        payment_id: payment?.id ?? null,
        order_number: row.order_number,
        amount_paise: refundAmount,
        currency: 'INR',
        reason: `Refund after approved cancel: ${row.reason}`,
        status: 'pending',
        provider: payment?.provider ?? 'razorpay',
        provider_payment_id: payment?.provider_payment_id ?? null,
      });
      if (refundErr && refundErr.code !== '23505') {
        failDb('Order cancelled but refund request was not saved', refundErr);
      }
    }

    const { data: updated, error: updErr } = await supabase
      .from('cancels')
      .update({
        status: 'approved',
        admin_note: adminNote?.trim() || null,
        reviewed_by: adminId,
        reviewed_at: now,
        delhivery_raw: delhiveryRaw,
        delhivery_error: null,
        delhivery_at: delhiveryAt,
      })
      .eq('id', cancelId)
      .eq('status', 'pending')
      .select(CANCEL_SELECT)
      .maybeSingle();
    if (updErr) failDb('Could not save approved cancel', updErr);
    if (!updated) {
      failDb('Could not save approved cancel', { message: 'cancel was already reviewed' });
    }

    await notifyCustomerOrder(
      String(row.user_id),
      String(row.order_id),
      String(row.order_number),
      'cancelled'
    );

    return serializeCancel(updated as Record<string, unknown>);
  }

  async getRefundForOrderUser(userId: string, orderId: string) {
    const { data, error } = await supabase
      .from('refunds')
      .select(REFUND_SELECT)
      .eq('order_id', orderId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? serializeRefund(data as Record<string, unknown>) : null;
  }

  async getRefundAdmin(refundId: string) {
    const { data, error } = await supabase
      .from('refunds')
      .select(REFUND_SELECT)
      .eq('id', refundId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw ApiError.notFound('Refund not found');
    const byId = await usersByIds([data.user_id as string]);
    return serializeRefund(
      data as Record<string, unknown>,
      byId.get(data.user_id as string) ?? null
    );
  }

  async listRefundsAdmin(page = 1, perPage = 50, status?: string) {
    const p = clampPage(page);
    const pp = clampPerPage(perPage);
    const from = (p - 1) * pp;
    const to = from + pp - 1;

    let qb = supabase
      .from('refunds')
      .select(REFUND_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (status && status !== 'all') qb = qb.eq('status', status);

    const { data, error, count } = await qb;
    if (error) throw error;

    const byId = await usersByIds([
      ...new Set((data ?? []).map((r) => r.user_id as string)),
    ]);

    return {
      refunds: (data ?? []).map((row) =>
        serializeRefund(row as Record<string, unknown>, byId.get(row.user_id as string) ?? null)
      ),
      meta: paginationMeta(count ?? 0, p, pp),
    };
  }

  async reviewRefund(
    refundId: string,
    adminId: string,
    decision: 'approved' | 'rejected' | 'completed',
    adminNote?: string | null
  ) {
    const { data: row, error } = await supabase
      .from('refunds')
      .select(REFUND_SELECT)
      .eq('id', refundId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw ApiError.notFound('Refund not found');
    if (row.status === 'completed' || row.status === 'rejected') {
      throw ApiError.badRequest('Refund already closed');
    }

    const now = new Date().toISOString();

    if (decision === 'rejected') {
      const { data: updated, error: updErr } = await supabase
        .from('refunds')
        .update({
          status: 'rejected',
          admin_note: adminNote?.trim() || null,
          reviewed_by: adminId,
          reviewed_at: now,
        })
        .eq('id', refundId)
        .select(REFUND_SELECT)
        .single();
      if (updErr) throw updErr;
      return serializeRefund(updated as Record<string, unknown>);
    }

    // Approve / completed — Razorpay first, save refund id to the live DB, then mark completed.
    let providerRefundId: string | null = (row.provider_refund_id as string | null) ?? null;
    let providerRaw: Record<string, unknown> | null =
      (row.provider_raw as Record<string, unknown> | null) ?? null;
    let providerError: string | null = null;
    let refundedAt: string | null = (row.refunded_at as string | null) ?? null;

    const providerPaymentId =
      typeof row.provider_payment_id === 'string' ? row.provider_payment_id.trim() : '';
    const provider = (row.provider as string) || 'razorpay';

    if (provider === 'razorpay' && providerPaymentId && !providerRefundId) {
      try {
        const result = await createRazorpayRefund({
          paymentId: providerPaymentId,
          amountPaise: Math.trunc(Number(row.amount_paise)),
          receipt: String(row.id),
        });
        providerRefundId = result.refundId;
        providerRaw = result.raw;
        refundedAt = now;
      } catch (err) {
        providerError = err instanceof Error ? err.message : String(err);
        const { error: errSave } = await supabase
          .from('refunds')
          .update({
            provider_error: providerError,
            admin_note: adminNote?.trim() || null,
            reviewed_by: adminId,
            reviewed_at: now,
          })
          .eq('id', refundId);
        if (errSave) failDb('Razorpay failed and the error could not be saved', errSave);
        throw ApiError.badRequest(
          `Razorpay could not refund this payment. The refund stays under review. ${providerError}`
        );
      }

      const { data: idSaved, error: persistErr } = await supabase
        .from('refunds')
        .update({
          provider_refund_id: providerRefundId,
          provider_raw: providerRaw,
          provider_error: null,
        })
        .eq('id', refundId)
        .select('id, provider_refund_id')
        .maybeSingle();
      if (persistErr || !idSaved?.provider_refund_id) {
        throw ApiError.badRequest(
          `Razorpay refund ${providerRefundId} succeeded but was not saved to the database. Do not approve again until this id is stored. ${persistErr?.message ?? 'row was not updated'}`
        );
      }
    } else if (!providerRefundId) {
      refundedAt = now;
    } else {
      refundedAt = refundedAt ?? now;
    }

    const { data: updated, error: updErr } = await supabase
      .from('refunds')
      .update({
        status: 'completed',
        admin_note: adminNote?.trim() || null,
        reviewed_by: adminId,
        reviewed_at: now,
        provider_refund_id: providerRefundId,
        provider_raw: providerRaw,
        provider_error: null,
        refunded_at: refundedAt,
      })
      .eq('id', refundId)
      .select(REFUND_SELECT)
      .maybeSingle();
    if (updErr) failDb('Razorpay refund is recorded but refund status was not saved', updErr);
    if (!updated || updated.status !== 'completed') {
      failDb('Razorpay refund is recorded but refund status was not saved', {
        message: 'refund row was not updated',
      });
    }

    if (row.payment_id) {
      const { data: paySaved, error: payErr } = await supabase
        .from('payments')
        .update({ status: 'refunded' })
        .eq('id', row.payment_id)
        .select('id, status')
        .maybeSingle();
      if (payErr) failDb('Refund saved but payment status was not updated', payErr);
      if (!paySaved || paySaved.status !== 'refunded') {
        failDb('Refund saved but payment status was not updated', {
          message: 'payment row was not updated',
        });
      }
    }
    const { data: orderSaved, error: orderRefundErr } = await supabase
      .from('orders')
      .update({ status: 'refunded' })
      .eq('id', row.order_id)
      .select('id, status')
      .maybeSingle();
    if (orderRefundErr) failDb('Refund saved but order status was not updated', orderRefundErr);
    if (!orderSaved || orderSaved.status !== 'refunded') {
      failDb('Refund saved but order status was not updated', { message: 'order row was not updated' });
    }

    await notifyCustomerOrder(
      String(row.user_id),
      String(row.order_id),
      String(row.order_number),
      'refunded'
    );

    return serializeRefund(updated as Record<string, unknown>);
  }
}

export const cancelsService = new CancelsService();
