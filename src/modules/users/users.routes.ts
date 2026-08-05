import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { loadUser } from '../../middleware/loadUser.js';
import { requireAdmin } from '../../middleware/requireAdmin.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { usersService } from './users.service.js';

const router = Router();

router.use(authenticate, loadUser, requireAdmin);

const adminUpdateUserSchema = z
  .object({
    role: z.enum(['user', 'admin']).optional(),
    status: z.enum(['active', 'inactive', 'banned']).optional(),
  })
  .strict();

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

/** PATCH /users/:id — admin: update role and/or status; role changes require super-admin */
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!userId) throw ApiError.badRequest('User ID required');

    const parsed = adminUpdateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid payload', parsed.error.flatten().fieldErrors);
    }

    const isSuperAdmin = !!(req.user as any)?.is_super_admin;
    const updated = await usersService.adminUpdate(userId, parsed.data, isSuperAdmin);
    res.json({ success: true, data: { user: updated } });
  })
);

export default router;
