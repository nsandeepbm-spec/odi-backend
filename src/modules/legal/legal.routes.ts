import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { param } from '../../lib/params.js';
import { legalService } from './legal.service.js';
import { legalSlugSchema } from './legal.schema.js';

/** Mounted at /legal — public, no auth */
const router = Router();

router.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const parsed = legalSlugSchema.safeParse(param(req.params.slug, 'slug'));
    if (!parsed.success) throw ApiError.notFound('Legal page not found');
    const result = await legalService.getPublic(parsed.data);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: result });
  })
);

export default router;
