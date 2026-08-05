import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { param } from '../../lib/params.js';
import { notifyMeService } from './notify-me.service.js';
import { notifyMeBodySchema } from './notify-me.schema.js';

/** Mounted under /user with authenticate + loadUser already applied */
const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const requests = await notifyMeService.list(req.user!.id);
    res.json({ success: true, data: { requests } });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = notifyMeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid notify request', parsed.error.flatten().fieldErrors);
    }
    const request = await notifyMeService.subscribe(req.user!.id, parsed.data.slug);
    res.status(201).json({ success: true, data: { request } });
  })
);

router.delete(
  '/:slug',
  asyncHandler(async (req, res) => {
    await notifyMeService.unsubscribe(req.user!.id, param(req.params.slug, 'slug'));
    res.json({ success: true, data: { deleted: true } });
  })
);

export default router;
