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
  const { data } = await supabase.from('users').select('id, email, full_name').in('id', ids);
  return new Map((data ?? []).map((u) => [u.id as string, u]));
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

    const { data: existingPending } = await supabase
      .from('cancels')
      .select('id')
      .eq('order_id', orderId)
      .eq('status', 'pending')
      .maybeSingle();
    if (existingPending) throw ApiError.badRequest('A cancel request is already pending for this order');

    const { data: existingApproved } = await supabase
      .from('cancels')
      .select('id')
      .eq('order_id', orderId)
      .eq('status', 'approved')
      .maybeSingle();
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
    if (insErr) throw insErr;
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

    // Approve — try Delhivery cancel when waybill exists
    let delhiveryRaw: Record<string, unknown> | null = null;
    let delhiveryError: string | null = null;
    let delhiveryAt: string | null = null;
    const waybill = typeof row.waybill === 'string' ? row.waybill.trim() : '';

    if (waybill) {
      try {
        const result = await cancelDelhiveryShipment(waybill);
        delhiveryRaw = result.raw;
        delhiveryAt = now;
      } catch (err) {
        delhiveryError = err instanceof Error ? err.message : String(err);
        delhiveryAt = now;
        // Still approve in-app; store error for admin visibility (shipment may already be uncancelable).
        console.warn('[cancels] Delhivery cancel failed', waybill, delhiveryError);
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
        delhivery_error: delhiveryError,
        delhivery_at: delhiveryAt,
      })
      .eq('id', cancelId)
      .select(CANCEL_SELECT)
      .single();
    if (updErr) throw updErr;

    const orderUpdate: Record<string, unknown> = { status: 'cancelled' };
    if (waybill) orderUpdate.delhivery_status = 'cancelled';
    await supabase.from('orders').update(orderUpdate).eq('id', row.order_id);

    // Queue refund if none open
    const { data: openRefund } = await supabase
      .from('refunds')
      .select('id')
      .eq('order_id', row.order_id)
      .in('status', ['pending', 'approved'])
      .maybeSingle();

    if (!openRefund && (row.amount_paise as number) > 0) {
      const { data: payment } = await supabase
        .from('payments')
        .select('id, provider, provider_payment_id, status, amount_paise')
        .eq('order_id', row.order_id)
        .in('status', ['captured', 'authorized'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      await supabase.from('refunds').insert({
        order_id: row.order_id,
        user_id: row.user_id,
        cancel_id: row.id,
        payment_id: payment?.id ?? null,
        order_number: row.order_number,
        amount_paise: row.amount_paise,
        currency: 'INR',
        reason: `Refund after approved cancel: ${row.reason}`,
        status: 'pending',
        provider: payment?.provider ?? 'razorpay',
        provider_payment_id: payment?.provider_payment_id ?? null,
      });
    }

    return serializeCancel(updated as Record<string, unknown>);
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

    if (decision === 'approved') {
      const { data: updated, error: updErr } = await supabase
        .from('refunds')
        .update({
          status: 'approved',
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

    // completed — call Razorpay when we have a provider payment id
    let providerRefundId: string | null = (row.provider_refund_id as string | null) ?? null;
    let providerRaw: Record<string, unknown> | null = null;
    let providerError: string | null = null;
    let refundedAt: string | null = null;

    const providerPaymentId =
      typeof row.provider_payment_id === 'string' ? row.provider_payment_id.trim() : '';
    const provider = (row.provider as string) || 'razorpay';

    if (provider === 'razorpay' && providerPaymentId) {
      try {
        const result = await createRazorpayRefund({
          paymentId: providerPaymentId,
          amountPaise: row.amount_paise as number,
          notes: {
            order_number: String(row.order_number),
            refund_id: String(row.id),
          },
        });
        providerRefundId = result.refundId;
        providerRaw = result.raw;
        refundedAt = now;
      } catch (err) {
        providerError = err instanceof Error ? err.message : String(err);
        const { data: failed, error: failErr } = await supabase
          .from('refunds')
          .update({
            provider_error: providerError,
            admin_note: adminNote?.trim() || null,
            reviewed_by: adminId,
            reviewed_at: now,
          })
          .eq('id', refundId)
          .select(REFUND_SELECT)
          .single();
        if (failErr) throw failErr;
        throw ApiError.internal(providerError, {
          refund: serializeRefund(failed as Record<string, unknown>),
        });
      }
    } else {
      // COD / no online payment — mark completed without Razorpay
      refundedAt = now;
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
        provider_error: providerError,
        refunded_at: refundedAt,
      })
      .eq('id', refundId)
      .select(REFUND_SELECT)
      .single();
    if (updErr) throw updErr;

    if (row.payment_id) {
      await supabase.from('payments').update({ status: 'refunded' }).eq('id', row.payment_id);
    }
    await supabase.from('orders').update({ status: 'refunded' }).eq('id', row.order_id);

    return serializeRefund(updated as Record<string, unknown>);
  }
}

export const cancelsService = new CancelsService();
