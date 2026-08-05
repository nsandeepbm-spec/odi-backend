import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { loadUser } from '../../middleware/loadUser.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { usersService } from '../users/users.service.js';
import addressesRoutes from '../addresses/addresses.routes.js';
import favoritesRoutes from '../favorites/favorites.routes.js';
import notifyMeRoutes from '../notify-me/notify-me.routes.js';
import notificationsRoutes from '../notifications/notifications.routes.js';
import supportRoutes from '../support/support.routes.js';
import userReviewsRoutes from '../reviews/user-reviews.routes.js';

const router = Router();

router.use(authenticate, loadUser);

router.use('/addresses', addressesRoutes);
router.use('/favorites', favoritesRoutes);
router.use('/notify-me', notifyMeRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/support-tickets', supportRoutes);
router.use('/reviews', userReviewsRoutes);

/** GET /user/me — current user's profile */
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: { user: req.user } });
  })
);

const updateMeSchema = z
  .object({
    full_name: z.string().min(1).max(120).optional(),
    phone: z.string().max(30).optional(),
    avatar_url: z.string().url().max(500).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one profile field is required',
  });

/** PATCH /user/me — update own profile */
router.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const parsed = updateMeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid profile data', parsed.error.flatten().fieldErrors);
    }
    const user = await usersService.updateProfile(req.firebaseUser!.uid, parsed.data);
    res.json({ success: true, data: { user } });
  })
);

export default router;
