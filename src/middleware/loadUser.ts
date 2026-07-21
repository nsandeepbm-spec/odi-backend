import type { NextFunction, Request, Response } from 'express';
import { usersService } from '../modules/users/users.service.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Loads the Supabase profile row for the authenticated Firebase user
 * and attaches it to `req.user`. Requires `authenticate` to run first.
 */
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const user = await usersService.findByFirebaseUid(req.firebaseUser!.uid);
    if (!user) {
      throw ApiError.notFound('User profile not found. Call POST /auth/sync after signing in.');
    }
    if (user.status === 'banned') {
      throw ApiError.forbidden('This account has been suspended');
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
