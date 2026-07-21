import { readFileSync } from 'node:fs';
import { initializeApp, getApps, getApp, cert, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { env } from './env.js';

// Verifying ID tokens only needs the project ID (public certs are fetched
// automatically). A service account unlocks extra features like revocation
// checks and user management, so we load one when provided.
function initFirebase(): App {
  if (getApps().length) return getApp();

  if (env.firebase.serviceAccountPath) {
    const serviceAccount = JSON.parse(readFileSync(env.firebase.serviceAccountPath, 'utf8'));
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: env.firebase.projectId,
    });
  }

  return initializeApp({ projectId: env.firebase.projectId });
}

export const firebaseAuth = getAuth(initFirebase());
