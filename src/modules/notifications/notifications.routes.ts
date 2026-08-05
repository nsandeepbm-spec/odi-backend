import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { param } from '../../lib/params.js';
import { notificationsService } from './notifications.service.js';
import { listNotificationsQuerySchema, previewQuerySchema } from './notifications.schema.js';

/** Mounted under /user — always scoped to req.user.id */
const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = listNotificationsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid query', parsed.error.flatten().fieldErrors);
    }
    const result = await notificationsService.list(req.user!.id, parsed.data);
    res.json({ success: true, data: result });
  })
);

router.get(
  '/preview',
  asyncHandler(async (req, res) => {
    const parsed = previewQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid query', parsed.error.flatten().fieldErrors);
    }
    const notifications = await notificationsService.preview(req.user!.id, parsed.data.limit);
    const unreadCount = await notificationsService.unreadCount(req.user!.id);
    res.json({ success: true, data: { notifications, unreadCount } });
  })
);

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const count = await notificationsService.unreadCount(req.user!.id);
    res.json({ success: true, data: { count } });
  })
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const result = await notificationsService.markAllRead(req.user!.id);
    res.json({ success: true, data: result });
  })
);

router.post(
  '/clear',
  asyncHandler(async (req, res) => {
    const result = await notificationsService.clearBell(req.user!.id);
    res.json({ success: true, data: result });
  })
);

router.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const notification = await notificationsService.markRead(
      req.user!.id,
      param(req.params.id, 'id')
    );
    res.json({ success: true, data: { notification } });
  })
);

export default router;
