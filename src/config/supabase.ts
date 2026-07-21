import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

// Server-side client using the service role key. RLS is bypassed, which is why
// this key must never reach the browser — all access control happens in the API.
export const supabase = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
