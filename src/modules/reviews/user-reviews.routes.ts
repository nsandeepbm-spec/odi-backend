import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { reviewsService } from '../reviews/reviews.service.js';

/** Mounted under /user with authenticate + loadUser already applied */
const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const reviews = await reviewsService.listForUser(req.user!.id);
    res.json({ success: true, data: { reviews } });
  })
);

export default router;
