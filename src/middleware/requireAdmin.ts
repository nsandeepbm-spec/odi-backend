import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError.js';

/** Gate for admin-only routes. Requires `loadUser` to run first. */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    return next(ApiError.forbidden('Admin access required'));
  }
  next();
}
