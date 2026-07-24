import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { loadUser } from '../../middleware/loadUser.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { checkoutService } from './checkout.service.js';
import { checkoutSessionSchema } from './checkout.schema.js';

const router = Router();

/** POST /checkout/sessions */
router.post(
  '/sessions',
  authenticate,
  loadUser,
  asyncHandler(async (req, res) => {
    const idempotencyKey = String(req.headers['idempotency-key'] ?? '').trim();
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 120) {
      throw ApiError.badRequest('Idempotency-Key header is required (8–120 chars)');
    }

    const parsed = checkoutSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid checkout session', parsed.error.flatten().fieldErrors);
    }

    // Refine: need exactly one of address sources
    if (!parsed.data.addressId && !parsed.data.shippingAddress) {
      throw ApiError.badRequest('Provide addressId or shippingAddress');
    }

    const session = await checkoutService.createSession(
      req.user!.id,
      req.user!.email,
      parsed.data,
      idempotencyKey
    );

    res.status(201).json({ success: true, data: session });
  })
);

export default router;
