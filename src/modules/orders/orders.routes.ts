import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { loadUser } from '../../middleware/loadUser.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { param } from '../../lib/params.js';
import { ordersService } from './orders.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { createCancelSchema } from '../cancels/cancels.schema.js';
import { cancelsService } from '../cancels/cancels.service.js';

const router = Router();
router.use(authenticate, loadUser);

/** GET /orders */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Number(req.query.page ?? 1);
    const perPage = Number(req.query.perPage ?? 20);
    const result = await ordersService.listForUser(req.user!.id, page, perPage);
    res.json({ success: true, data: result });
  })
);

/** GET /orders/:id/tracking — Delhivery package scans for the signed-in owner's order */
router.get(
  '/:id/tracking',
  asyncHandler(async (req, res) => {
    const { fulfillmentService } = await import('../fulfillment/fulfillment.service.js');
    const tracking = await fulfillmentService.getTrackingForOrder(param(req.params.id), {
      userId: req.user!.id,
    });
    res.json({ success: true, data: { tracking } });
  })
);

/** GET /orders/:id/cancel — latest cancel for this order (owner) */
router.get(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const cancel = await cancelsService.getForOrderUser(req.user!.id, param(req.params.id));
    res.json({ success: true, data: { cancel } });
  })
);

/** GET /orders/:id/refund — latest refund for this order (owner) */
router.get(
  '/:id/refund',
  asyncHandler(async (req, res) => {
    const refund = await cancelsService.getRefundForOrderUser(req.user!.id, param(req.params.id));
    res.json({ success: true, data: { refund } });
  })
);

/** POST /orders/:id/cancel — user cancel request */
router.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const parsed = createCancelSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid cancel request', parsed.error.flatten().fieldErrors);
    }
    const cancel = await cancelsService.createForUser(
      req.user!.id,
      param(req.params.id),
      parsed.data.reason ?? ''
    );
    res.status(201).json({ success: true, data: { cancel } });
  })
);

/** GET /orders/:id */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await ordersService.getForUser(req.user!.id, param(req.params.id));
    res.json({ success: true, data: result });
  })
);

export default router;
