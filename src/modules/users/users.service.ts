import { supabase } from '../../config/supabase.js';
import type { AppUser, FirebaseUserClaims } from '../../types.js';
import { ApiError } from '../../utils/ApiError.js';

const TABLE = 'users';

// Columns safe to return to the client (everything except internal-only fields).
const PUBLIC_COLUMNS =
  'id, firebase_uid, email, full_name, avatar_url, phone, role, provider, status, last_login_at, created_at, updated_at';

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
   */
  async syncFromFirebase({ uid, email, name, picture, provider }: FirebaseUserClaims): Promise<AppUser> {
    if (!email) {
      throw ApiError.badRequest('An email address is required to create an ODI account');
    }

    const { data, error } = await supabase
      .from(TABLE)
      .upsert(
        {
          firebase_uid: uid,
          email: email.trim().toLowerCase(),
          // Only set profile fields Firebase actually knows about; a null name
          // must not wipe a name the user saved through the settings page.
          ...(name ? { full_name: name } : {}),
          ...(picture ? { avatar_url: picture } : {}),
          provider,
          last_login_at: new Date().toISOString(),
        },
        { onConflict: 'firebase_uid' }
      )
      .select(PUBLIC_COLUMNS)
      .single();

    if (error) throw new Error(`Supabase error (syncFromFirebase): ${error.message}`);
    return data as unknown as AppUser;
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
