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
