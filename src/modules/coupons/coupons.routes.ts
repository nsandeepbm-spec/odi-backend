import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { loadUser } from '../../middleware/loadUser.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { couponsService } from './coupons.service.js';
import { validateCouponSchema } from './coupons.schema.js';

const router = Router();

router.post(
  '/validate',
  authenticate,
  loadUser,
  asyncHandler(async (req, res) => {
    const parsed = validateCouponSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid coupon request', parsed.error.flatten().fieldErrors);
    }
    const result = await couponsService.validateForUser(
      req.user!.id,
      parsed.data.code,
      parsed.data.items
    );
    res.json({ success: true, data: result });
  })
);

export default router;
