import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { loadUser } from '../../middleware/loadUser.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { paymentsService } from './payments.service.js';

const router = Router();

const verifySchema = z
  .object({
    orderId: z.string().uuid(),
    razorpay_order_id: z.string().min(3),
    razorpay_payment_id: z.string().min(3),
    razorpay_signature: z.string().min(10),
  })
  .strict();

/**
 * POST /payments/webhook
 * Requires raw body on req (see app.ts) for HMAC verification.
 */
router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const signature = req.headers['x-razorpay-signature'] as string | undefined;
    const rawBody =
      typeof (req as { rawBody?: string }).rawBody === 'string'
        ? (req as { rawBody: string }).rawBody
        : JSON.stringify(req.body);

    const result = await paymentsService.handleWebhook(rawBody, signature, req.body);
    res.status(200).json({ success: true, data: result });
  })
);

/** POST /payments/verify — client confirmation after Razorpay Checkout modal */
router.post(
  '/verify',
  authenticate,
  loadUser,
  asyncHandler(async (req, res) => {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid verify payload', parsed.error.flatten().fieldErrors);
    }
    const result = await paymentsService.verifyClientPayment(req.user!.id, parsed.data);
    res.json({
      success: true,
      data: {
        order: result.order,
        alreadyPaid: result.alreadyPaid,
      },
    });
  })
);

export default router;
