import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { usersService } from '../users/users.service.js';

const router = Router();

/**
 * POST /auth/sync
 *
 * The frontend calls this once right after any Firebase sign-in
 * (Google popup OR email/password). It verifies the ID token and
 * creates/updates the user's profile row in Supabase, then returns it.
 */
router.post(
  '/sync',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await usersService.syncFromFirebase(req.firebaseUser!);
    res.status(200).json({ success: true, data: { user } });
  })
);

export default router;
