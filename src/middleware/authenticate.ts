import type { NextFunction, Request, Response } from 'express';
import { firebaseAuth } from '../config/firebase.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Verifies the Firebase ID token sent as `Authorization: Bearer <token>`
 * and attaches the decoded claims to `req.firebaseUser`.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw ApiError.unauthorized('Missing Authorization header (expected: Bearer <idToken>)');
    }

    const decoded = await firebaseAuth.verifyIdToken(token);

    req.firebaseUser = {
      uid: decoded.uid,
      email: decoded.email ?? null,
      name: (decoded.name as string | undefined) ?? null,
      picture: decoded.picture ?? null,
      // 'google.com' for Google sign-in, 'password' for email/password
      provider: decoded.firebase?.sign_in_provider ?? 'password',
    };

    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    return next(ApiError.unauthorized('Invalid or expired token'));
  }
}
