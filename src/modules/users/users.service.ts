import { firebaseAuth } from '../../config/firebase.js';
import { supabase } from '../../config/supabase.js';
import type { AppUser, FirebaseUserClaims } from '../../types.js';
import { ApiError } from '../../utils/ApiError.js';

export interface UpdateAdminUserInput {
  role?: 'user' | 'admin';
  status?: 'active' | 'inactive' | 'banned';
}

export interface AdminDeleteResult {
  deleted: boolean;
  banned: boolean;
  firebaseDeleted: boolean;
  user: AppUser | null;
  message: string;
}

type FirebaseDeleteOutcome = 'deleted' | 'already_gone' | 'failed';

function firebaseErrorCode(err: unknown): string {
  if (!err || typeof err !== 'object') return '';
  const rec = err as { code?: string; errorInfo?: { code?: string } };
  return rec.code ?? rec.errorInfo?.code ?? '';
}

/** Removes the Firebase Auth user so they cannot sign in (and /auth/sync cannot recreate them). */
async function deleteFirebaseAuthUser(uid: string): Promise<FirebaseDeleteOutcome> {
  try {
    await firebaseAuth.revokeRefreshTokens(uid);
  } catch {
    // Missing SA or already-deleted user — deleteUser reports the same outcome.
  }

  try {
    await firebaseAuth.deleteUser(uid);
    return 'deleted';
  } catch (err) {
    const code = firebaseErrorCode(err);
    if (code === 'auth/user-not-found') return 'already_gone';
    return 'failed';
  }
}

const TABLE = 'users';

// Columns safe to return to the client (everything except internal-only fields).
const PUBLIC_COLUMNS =
  'id, firebase_uid, email, full_name, avatar_url, phone, role, provider, status, is_super_admin, last_login_at, created_at, updated_at';

export interface UpdateProfileInput {
  full_name?: string;
  phone?: string;
  avatar_url?: string;
}

export const usersService = {
  async findByFirebaseUid(firebaseUid: string): Promise<AppUser | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select(PUBLIC_COLUMNS)
      .eq('firebase_uid', firebaseUid)
      .maybeSingle();

    if (error) throw new Error(`Supabase error (findByFirebaseUid): ${error.message}`);
    return data as AppUser | null;
  },

  /**
   * Called right after Firebase sign-in / registration.
   * Creates the profile row on first login, refreshes it on later logins.
   * Welcome email is sent only when the insert succeeds (new account),
   * so concurrent /auth/sync calls cannot double-send.
   */
  async syncFromFirebase({ uid, email, name, picture, provider }: FirebaseUserClaims): Promise<AppUser> {
    if (!email) {
      throw ApiError.badRequest('An email address is required to create an ODI account');
    }

    const emailNorm = email.trim().toLowerCase();
    const now = new Date().toISOString();
    const baseRow = {
      firebase_uid: uid,
      email: emailNorm,
      ...(name ? { full_name: name } : {}),
      ...(picture ? { avatar_url: picture } : {}),
      provider,
      last_login_at: now,
    };

    // Insert-first: only a brand-new row triggers welcome email.
    const { data: created, error: insertError } = await supabase
      .from(TABLE)
      .insert(baseRow)
      .select(PUBLIC_COLUMNS)
      .maybeSingle();

    if (!insertError && created) {
      const user = created as unknown as AppUser;
      const { sendWelcomeEmail } = await import('../../lib/mailer/index.js');
      sendWelcomeEmail({ to: user.email, name: user.full_name });
      return user;
    }

    // Unique violation (user already exists) — update login fields only.
    const isConflict =
      insertError?.code === '23505' ||
      (insertError?.message ?? '').toLowerCase().includes('duplicate');

    if (!isConflict && insertError) {
      throw new Error(`Supabase error (syncFromFirebase insert): ${insertError.message}`);
    }

    const { data, error } = await supabase
      .from(TABLE)
      .upsert(
        {
          firebase_uid: uid,
          email: emailNorm,
          ...(name ? { full_name: name } : {}),
          ...(picture ? { avatar_url: picture } : {}),
          provider,
          last_login_at: now,
        },
        { onConflict: 'firebase_uid' }
      )
      .select(PUBLIC_COLUMNS)
      .single();

    if (error) throw new Error(`Supabase error (syncFromFirebase upsert): ${error.message}`);
    const user = data as unknown as AppUser;
    if (user.status === 'banned') {
      throw ApiError.forbidden('This account has been suspended');
    }
    return user;
  },

  async updateProfile(firebaseUid: string, input: UpdateProfileInput): Promise<AppUser> {
    const patch: Record<string, string> = {};
    if (input.full_name !== undefined) patch.full_name = input.full_name;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.avatar_url !== undefined) patch.avatar_url = input.avatar_url;

    if (Object.keys(patch).length === 0) {
      throw ApiError.badRequest('At least one profile field is required');
    }

    const { data, error } = await supabase
      .from(TABLE)
      .update(patch)
      .eq('firebase_uid', firebaseUid)
      .select(PUBLIC_COLUMNS)
      .single();

    if (error) throw new Error(`Supabase error (updateProfile): ${error.message}`);
    return data as unknown as AppUser;
  },

  /** Admin: update a user's role and/or status.
   *  Role changes are only permitted when `requesterIsSuperAdmin` is true.
   */
  async adminUpdate(
    userId: string,
    patch: { role?: string; status?: string },
    requesterIsSuperAdmin: boolean
  ): Promise<AppUser> {
    const update: Record<string, string> = {};
    if (patch.status) update.status = patch.status;
    if (patch.role) {
      if (!requesterIsSuperAdmin) {
        throw new ApiError(403, 'Only a super-admin can change user roles');
      }
      update.role = patch.role;
    }
    if (Object.keys(update).length === 0) {
      throw ApiError.badRequest('Nothing to update');
    }
    const { data, error } = await supabase
      .from(TABLE)
      .update(update)
      .eq('id', userId)
      .select(PUBLIC_COLUMNS)
      .single();
    if (error) throw new Error(`Supabase error (adminUpdate): ${error.message}`);
    return data as unknown as AppUser;
  },

  /**
   * Permanently remove a customer:
   * 1. Delete Firebase Auth (so login + /auth/sync cannot recreate them).
   * 2. Delete the Supabase row if they have no orders (cart/addresses cascade).
   * 3. If they have orders (FK RESTRICT), keep the row and set status=banned.
   * If Firebase delete fails (no service account), the row is banned — never dropped —
   * otherwise the next login would insert a fresh active profile.
   */
  async adminDelete(userId: string, requester: AppUser): Promise<AdminDeleteResult> {
    const { data: target, error: findError } = await supabase
      .from(TABLE)
      .select(PUBLIC_COLUMNS)
      .eq('id', userId)
      .maybeSingle();

    if (findError) throw new Error(`Supabase error (adminDelete find): ${findError.message}`);
    if (!target) throw ApiError.notFound('User not found');
    const user = target as unknown as AppUser;

    if (user.id === requester.id) {
      throw ApiError.badRequest('You cannot delete your own account');
    }
    if (user.is_super_admin) {
      throw ApiError.forbidden('Cannot delete a super-admin');
    }
    if (user.role === 'admin' && !requester.is_super_admin) {
      throw ApiError.forbidden('Only a super-admin can delete an admin');
    }

    const firebase = await deleteFirebaseAuthUser(user.firebase_uid);
    const firebaseDeleted = firebase !== 'failed';

    const { count, error: orderErr } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (orderErr) throw new Error(`Supabase error (adminDelete orders): ${orderErr.message}`);
    const hasOrders = (count ?? 0) > 0;

    const canHardDelete = firebaseDeleted && !hasOrders;
    if (canHardDelete) {
      const { error: delErr } = await supabase.from(TABLE).delete().eq('id', userId);
      if (!delErr) {
        return {
          deleted: true,
          banned: false,
          firebaseDeleted: true,
          user: null,
          message: 'Customer login and profile were permanently removed.',
        };
      }
    }

    const { data: banned, error: banErr } = await supabase
      .from(TABLE)
      .update({ status: 'banned' })
      .eq('id', userId)
      .select(PUBLIC_COLUMNS)
      .single();
    if (banErr) throw new Error(`Supabase error (adminDelete ban): ${banErr.message}`);

    const bannedUser = banned as unknown as AppUser;
    if (!firebaseDeleted) {
      return {
        deleted: false,
        banned: true,
        firebaseDeleted: false,
        user: bannedUser,
        message:
          'Profile is banned, but Firebase login is still active. Set FIREBASE_SERVICE_ACCOUNT_PATH (or delete the user in Firebase Console → Authentication), then delete again.',
      };
    }

    return {
      deleted: false,
      banned: true,
      firebaseDeleted: true,
      user: bannedUser,
      message:
        'Login was removed. The profile was banned so order history stays in the database.',
    };
  },

  /** Admin: list all users (simple pagination). */
  async listUsers({ page = 1, perPage = 20 }: { page?: number; perPage?: number }) {
    const from = (page - 1) * perPage;
    const { data, error, count } = await supabase
      .from(TABLE)
      .select(PUBLIC_COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + perPage - 1);

    if (error) throw new Error(`Supabase error (listUsers): ${error.message}`);
    return { users: (data ?? []) as AppUser[], total: count ?? 0, page, perPage };
  },
};
