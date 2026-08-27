import { createClient } from "@supabase/supabase-js";
import env from "../config/env.js";

const createAuthClient = (clientIp) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase server auth credentials are not configured");
  }

  // Auth clients are request-scoped so concurrent logins never share in-memory
  // session state on the API server.
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: clientIp
      ? {
          headers: { "Sb-Forwarded-For": clientIp },
        }
      : undefined,
  });
};

export const signInWithPassword = async ({ email, password, clientIp }) =>
  createAuthClient(clientIp).auth.signInWithPassword({ email, password });

export const sendPasswordResetEmail = async ({ email, redirectTo, clientIp }) =>
  createAuthClient(clientIp).auth.resetPasswordForEmail(email, { redirectTo });

export const deleteAuthUser = async (userId) =>
  createAuthClient().auth.admin.deleteUser(userId, false);
