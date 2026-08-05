// Shared domain types + Express request augmentation.

export type UserRole = 'user' | 'admin';
export type UserStatus = 'active' | 'inactive' | 'banned';

/** Row shape of the public.users table (public columns only). */
export interface AppUser {
  id: string;
  firebase_uid: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  role: UserRole;
  provider: string;
  status: UserStatus;
  is_super_admin: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Claims we keep from a verified Firebase ID token. */
export interface FirebaseUserClaims {
  uid: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  provider: string;
}

declare global {
  namespace Express {
    interface Request {
      firebaseUser?: FirebaseUserClaims;
      user?: AppUser;
      /** Raw JSON body string for Razorpay webhook HMAC */
      rawBody?: string;
    }
  }
}
