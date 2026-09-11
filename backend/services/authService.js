import { createClient } from '@supabase/supabase-js';
import env from '../config/env.js';

export const createAuthService = ({ clientFactory = createClient, runtimeEnv = env } = {}) => ({
  deleteAuthUser: async userId => {
    if (!runtimeEnv.SUPABASE_URL || !runtimeEnv.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase server auth credentials are not configured');
    }
    const client = clientFactory(runtimeEnv.SUPABASE_URL, runtimeEnv.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return client.auth.admin.deleteUser(userId, false);
  },
});
export const deleteAuthUser = createAuthService().deleteAuthUser;
