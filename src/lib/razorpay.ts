import Razorpay from 'razorpay';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

let client: Razorpay | null = null;

export function getRazorpay(): Razorpay {
  if (!env.razorpay.keyId || !env.razorpay.keySecret) {
    throw ApiError.badRequest(
      'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env'
    );
  }
  if (!client) {
    client = new Razorpay({
      key_id: env.razorpay.keyId,
      key_secret: env.razorpay.keySecret,
    });
  }
  return client;
}

export function verifyPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  if (!env.razorpay.keySecret) return false;
  const body = `${params.orderId}|${params.paymentId}`;
  const expected = crypto
    .createHmac('sha256', env.razorpay.keySecret)
    .update(body)
    .digest('hex');
  return expected === params.signature;
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  if (!env.razorpay.webhookSecret) return false;
  const expected = crypto
    .createHmac('sha256', env.razorpay.webhookSecret)
    .update(rawBody)
    .digest('hex');
  return expected === signature;
}

/**
 * Razorpay Refund API — refund a captured payment (full or partial, amount in paise).
 * @see https://razorpay.com/docs/api/refunds/
 */
export async function createRazorpayRefund(params: {
  paymentId: string;
  amountPaise: number;
  notes?: Record<string, string>;
}): Promise<{ refundId: string; raw: Record<string, unknown> }> {
  const rz = getRazorpay();
  const paymentId = params.paymentId.trim();
  if (!paymentId) throw ApiError.badRequest('Razorpay payment id is required');
  if (!Number.isInteger(params.amountPaise) || params.amountPaise <= 0) {
    throw ApiError.badRequest('Refund amount must be a positive integer (paise)');
  }

  try {
    const refund = (await rz.payments.refund(paymentId, {
      amount: params.amountPaise,
      notes: params.notes,
    })) as unknown as Record<string, unknown>;

    const refundId =
      typeof refund.id === 'string'
        ? refund.id
        : typeof refund.id === 'number'
          ? String(refund.id)
          : '';
    if (!refundId) {
      throw ApiError.internal('Razorpay refund response missing id', { razorpay: refund });
    }
    return { refundId, raw: refund };
  } catch (err) {
    const message =
      err && typeof err === 'object' && 'error' in err
        ? String((err as { error?: { description?: string } }).error?.description ?? err)
        : err instanceof Error
          ? err.message
          : 'Razorpay refund failed';
    throw ApiError.internal(message, {
      razorpayPaymentId: paymentId,
      amountPaise: params.amountPaise,
    });
  }
}
