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
  const a = Buffer.from(expected);
  const b = Buffer.from(params.signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  if (!env.razorpay.webhookSecret) return false;
  const expected = crypto
    .createHmac('sha256', env.razorpay.webhookSecret)
    .update(rawBody)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function getRazorpayAccountSnapshot(): {
  mode: 'test' | 'live' | 'unset';
  webhookConfigured: boolean;
  webhookUrl: string;
} {
  const keyId = env.razorpay.keyId ?? '';
  const mode = keyId.startsWith('rzp_live_') ? 'live' : keyId.startsWith('rzp_test_') ? 'test' : 'unset';
  return {
    mode,
    webhookConfigured: Boolean(env.razorpay.webhookSecret),
    webhookUrl: env.razorpay.webhookUrl,
  };
}

const RAZORPAY_API = 'https://api.razorpay.com/v1';

type RazorpayErrorPayload = {
  error?: {
    code?: string;
    description?: string;
    reason?: string;
    field?: string;
    source?: string;
    step?: string;
  };
};

type RazorpayPayment = {
  id?: string;
  status?: string;
  captured?: boolean;
  amount?: number;
  amount_refunded?: number;
  refund_status?: string | null;
  currency?: string;
  method?: string;
};

type RazorpayRefund = {
  id?: string;
  status?: string;
  amount?: number;
  payment_id?: string;
};

function requireRazorpayKeys(): { keyId: string; keySecret: string } {
  const keyId = env.razorpay.keyId;
  const keySecret = env.razorpay.keySecret;
  if (!keyId || !keySecret) {
    throw ApiError.badRequest(
      'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env'
    );
  }
  return { keyId, keySecret };
}

function formatRazorpayError(status: number, body: RazorpayErrorPayload, fallback: string): string {
  const e = body.error;
  if (!e) return `${fallback} (HTTP ${status})`;
  const description = (e.description ?? '').trim();
  const reason = (e.reason ?? '').trim();

  // Razorpay often returns this empty NA payload when the merchant wallet
  // cannot fund the refund (test balance ₹0, or live refund credits empty).
  // Official docs: "Your account does not have enough balance to carry out the refund operation."
  const looksLikeEmptyWallet =
    /enough balance|not have enough/i.test(description) ||
    (description.toLowerCase() === 'invalid request sent' && (!reason || reason === 'NA'));
  if (looksLikeEmptyWallet) {
    const mode = env.razorpay.keyId?.startsWith('rzp_test_') ? 'Test Mode' : 'Live Mode';
    return (
      `Razorpay ${mode} does not have enough merchant balance to pay this refund. ` +
      `Checkout can succeed while refunds fail — refunds are paid from your Razorpay wallet, not from the customer’s original payment. ` +
      (mode === 'Test Mode'
        ? 'Open the Razorpay Dashboard in Test Mode and capture a few extra test payments (or wait for test settlement) so the test wallet is above ₹0, then Approve refund again.'
        : 'Add refund credits in Razorpay Dashboard → Account & Settings → Credits, then Approve refund again.')
    );
  }

  const parts = [
    description,
    reason && reason !== 'NA' && reason !== description ? reason : null,
    e.field ? `field: ${e.field}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : `${fallback} (HTTP ${status})`;
}

function isAlreadyRefundedMessage(message: string): boolean {
  return /fully refunded already|has been fully refunded|refund has already been processed|duplicate receipt/i.test(
    message
  );
}

async function razorpayFetch<T>(method: 'GET' | 'POST', path: string, body?: Record<string, number | string>): Promise<T> {
  const { keyId, keySecret } = requireRazorpayKeys();
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
    Accept: 'application/json',
  };
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${RAZORPAY_API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Razorpay returned a non-JSON response (HTTP ${res.status})`);
  }

  if (!res.ok) {
    throw new Error(formatRazorpayError(res.status, json as RazorpayErrorPayload, `Razorpay ${method} ${path} failed`));
  }
  return json as T;
}

function refundIdFrom(refund: RazorpayRefund | Record<string, unknown> | null | undefined): string {
  const id = refund && typeof refund === 'object' ? (refund as { id?: unknown }).id : null;
  if (typeof id === 'string' && id) return id;
  if (typeof id === 'number') return String(id);
  return '';
}

async function fetchExistingRefund(paymentId: string): Promise<{ refundId: string; raw: Record<string, unknown> } | null> {
  const list = await razorpayFetch<{ items?: RazorpayRefund[] }>('GET', `/payments/${encodeURIComponent(paymentId)}/refunds`);
  const existing = (list.items ?? []).find((item) => item.status === 'processed' || item.status === 'pending') ?? list.items?.[0];
  const refundId = refundIdFrom(existing);
  if (!refundId || !existing) return null;
  return { refundId, raw: existing as Record<string, unknown> };
}

/**
 * Official Create Normal Refund:
 * POST https://api.razorpay.com/v1/payments/:id/refund
 * body: { "amount": <integer paise> }
 * @see https://razorpay.com/docs/api/refunds/create-normal
 */
export async function createRazorpayRefund(params: {
  paymentId: string;
  amountPaise: number;
  receipt?: string;
}): Promise<{ refundId: string; raw: Record<string, unknown> }> {
  const paymentId = params.paymentId.trim();
  const amountPaise = Math.trunc(Number(params.amountPaise));

  if (!paymentId) throw ApiError.badRequest('Razorpay payment id is required');
  if (paymentId.startsWith('order_')) {
    throw ApiError.badRequest(
      'This id is a Razorpay order id (order_…), not a payment id (pay_…). Refunds need the payment id.'
    );
  }
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) {
    throw ApiError.badRequest(`Invalid Razorpay payment id: ${paymentId}`);
  }
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw ApiError.badRequest('Refund amount must be a positive integer (paise)');
  }

  let payment: RazorpayPayment;
  try {
    payment = await razorpayFetch<RazorpayPayment>('GET', `/payments/${encodeURIComponent(paymentId)}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load Razorpay payment';
    throw new Error(
      `${message}. Confirm RAZORPAY_KEY_ID / SECRET match the keys that captured this payment (test vs live).`
    );
  }

  const capturedAmount = Math.trunc(Number(payment.amount ?? 0));
  const alreadyRefunded = Math.trunc(Number(payment.amount_refunded ?? 0));
  const remaining = Math.max(0, capturedAmount - alreadyRefunded);
  const captured = payment.captured === true || payment.status === 'captured';

  if (!captured && remaining <= 0) {
    const existing = await fetchExistingRefund(paymentId).catch(() => null);
    if (existing) return existing;
  }

  if (!captured) {
    throw new Error(
      `Payment status is "${payment.status ?? 'unknown'}", not captured. Razorpay only refunds captured payments.`
    );
  }

  if (remaining <= 0) {
    const existing = await fetchExistingRefund(paymentId);
    if (existing) return existing;
    throw new Error('This payment has already been fully refunded on Razorpay.');
  }

  const refundAmount = Math.min(amountPaise, remaining);
  // Official curl: only `amount` (integer paise). `receipt` is the idempotency key.
  const body: Record<string, number | string> = { amount: refundAmount };
  const receipt = params.receipt?.trim().replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
  if (receipt) body.receipt = receipt;

  try {
    const refund = await razorpayFetch<RazorpayRefund>('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, body);
    const refundId = refundIdFrom(refund);
    if (!refundId) throw new Error('Razorpay refund response missing id');
    return { refundId, raw: refund as Record<string, unknown> };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Razorpay refund failed';
    if (isAlreadyRefundedMessage(message)) {
      const existing = await fetchExistingRefund(paymentId).catch(() => null);
      if (existing) return existing;
    }
    throw new Error(message);
  }
}
