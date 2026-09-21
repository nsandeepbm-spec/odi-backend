import type { NextFunction, Request, Response } from 'express';
import { firebaseAuth } from '../config/firebase.js';
import { env } from '../config/env.js';
import { usersService } from '../modules/users/users.service.js';

/**
 * Like `authenticate`, but guests are allowed through with no `firebaseUser`.
 * Invalid/expired tokens are treated as guest (do not fail the request).
 */
export async function optionalAuthenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return next();
    }

    const decoded = await firebaseAuth.verifyIdToken(
      token,
      Boolean(env.firebase.serviceAccountPath)
    );

    req.firebaseUser = {
      uid: decoded.uid,
      email: decoded.email ?? null,
      name: (decoded.name as string | undefined) ?? null,
      picture: decoded.picture ?? null,
      provider: decoded.firebase?.sign_in_provider ?? 'password',
    };
    next();
  } catch {
    next();
  }
}

/**
 * Loads `req.user` when a Firebase user is present. Guests skip.
 */
export async function optionalLoadUser(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.firebaseUser?.uid) return next();
    const user = await usersService.findByFirebaseUid(req.firebaseUser.uid);
    if (user && user.status !== 'banned') {
      req.user = user;
    }
    next();
  } catch {
    next();
  }
}
