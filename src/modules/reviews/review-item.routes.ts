import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { loadUser } from '../../middleware/loadUser.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { param } from '../../lib/params.js';
import { reviewsService } from './reviews.service.js';
import { updateReviewSchema } from './reviews.schema.js';

/** Mounted at /reviews — customer edit own; admin edit/delete any */
const router = Router();

router.patch(
  '/:id',
  authenticate,
  loadUser,
  asyncHandler(async (req, res) => {
    const parsed = updateReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid review update', parsed.error.flatten().fieldErrors);
    }
    const isAdmin = req.user!.role === 'admin';
    const review = await reviewsService.update(
      param(req.params.id),
      req.user!.id,
      parsed.data,
      isAdmin
    );
    res.json({ success: true, data: { review } });
  })
);

router.delete(
  '/:id',
  authenticate,
  loadUser,
  asyncHandler(async (req, res) => {
    const isAdmin = req.user!.role === 'admin';
    await reviewsService.remove(param(req.params.id), isAdmin);
    res.json({ success: true, data: { deleted: true } });
  })
);

export default router;
