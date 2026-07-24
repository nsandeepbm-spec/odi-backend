import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { loadUser } from '../../middleware/loadUser.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { param } from '../../lib/params.js';
import { reviewsService } from './reviews.service.js';
import { createReviewSchema } from './reviews.schema.js';

/**
 * Mounted at /products/:slug/reviews
 * req.params.slug comes from parent router.
 */
const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const slug = param(req.params.slug, 'slug');
    const page = Number(req.query.page ?? 1);
    const perPage = Number(req.query.perPage ?? 20);
    const result = await reviewsService.listBySlug(slug, page, perPage);
    res.json({ success: true, data: result });
  })
);

router.post(
  '/',
  authenticate,
  loadUser,
  asyncHandler(async (req, res) => {
    const parsed = createReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid review', parsed.error.flatten().fieldErrors);
    }
    const review = await reviewsService.create(
      param(req.params.slug, 'slug'),
      req.user!.id,
      parsed.data
    );
    res.status(201).json({ success: true, data: { review } });
  })
);

export default router;
