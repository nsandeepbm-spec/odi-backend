import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { loadUser } from '../../middleware/loadUser.js';
import { requireAdmin } from '../../middleware/requireAdmin.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { usersService } from './users.service.js';

const router = Router();

router.use(authenticate, loadUser, requireAdmin);

/** GET /users — admin: paginated list of all users */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.min(100, Math.max(1, Number(req.query.perPage) || 20));
    const result = await usersService.listUsers({ page, perPage });
    res.json({ success: true, data: result });
  })
);

export default router;
