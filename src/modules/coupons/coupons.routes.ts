import { Router } from 'express';
import { optionalAuthenticate, optionalLoadUser } from '../../middleware/optionalAuth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { couponsService } from './coupons.service.js';
import { listOffersQuerySchema, validateCouponSchema } from './coupons.schema.js';

const router = Router();

/** Public list of checkout offers — guests OK. */
router.get(
  '/offers',
  optionalAuthenticate,
  optionalLoadUser,
  asyncHandler(async (req, res) => {
    const parsed = listOffersQuerySchema.safeParse({
      productId: typeof req.query.productId === 'string' ? req.query.productId : undefined,
      slug: typeof req.query.slug === 'string' ? req.query.slug : undefined,
      quantity: req.query.quantity,
    });
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid offers query', parsed.error.flatten().fieldErrors);
    }
    const result = await couponsService.listPublicOffers(req.user?.id ?? null, parsed.data);
    res.json({ success: true, data: result });
  })
);

/**
 * Preview apply — guests OK with `items` in the body.
 * Signed-in callers also get per-user redemption checks. Checkout still re-validates.
 */
router.post(
  '/validate',
  optionalAuthenticate,
  optionalLoadUser,
  asyncHandler(async (req, res) => {
    const parsed = validateCouponSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid coupon request', parsed.error.flatten().fieldErrors);
    }
    const userId = req.user?.id ?? null;
    if (!userId && !parsed.data.items?.length) {
      throw ApiError.badRequest('Provide items to preview a coupon, or sign in to use your cart');
    }
    const result = await couponsService.validateForUser(
      userId,
      parsed.data.code,
      parsed.data.items
    );
    res.json({ success: true, data: result });
  })
);

export default router;
