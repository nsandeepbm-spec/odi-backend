import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { loadUser } from '../../middleware/loadUser.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { param } from '../../lib/params.js';
import { ordersService } from './orders.service.js';

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

/** GET /orders/:id */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await ordersService.getForUser(req.user!.id, param(req.params.id));
    res.json({ success: true, data: result });
  })
);

export default router;
