import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { param } from '../../lib/params.js';
import { favoritesService } from './favorites.service.js';
import { favoriteBodySchema } from './favorites.schema.js';

/** Mounted under /user with authenticate + loadUser already applied */
const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const favorites = await favoritesService.list(req.user!.id);
    res.json({ success: true, data: { favorites } });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = favoriteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid favorite', parsed.error.flatten().fieldErrors);
    }
    const favorite = await favoritesService.add(req.user!.id, parsed.data.slug);
    res.status(201).json({ success: true, data: { favorite } });
  })
);

router.delete(
  '/:slug',
  asyncHandler(async (req, res) => {
    await favoritesService.remove(req.user!.id, param(req.params.slug, 'slug'));
    res.json({ success: true, data: { deleted: true } });
  })
);

export default router;
