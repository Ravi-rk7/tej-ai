import { createClient } from "@supabase/supabase-js";
import env from "../config/env.js";

export const createAuthService = ({
  clientFactory = createClient,
  runtimeEnv = env,
} = {}) => {
  const createAuthClient = (clientIp) => {
    if (!runtimeEnv.SUPABASE_URL || !runtimeEnv.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase server auth credentials are not configured");
    }

    // Auth clients are request-scoped so concurrent logins never share
    // in-memory session state on the API server.
    return clientFactory(
      runtimeEnv.SUPABASE_URL,
      runtimeEnv.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: clientIp
          ? { headers: { "Sb-Forwarded-For": clientIp } }
          : undefined,
      },
    );
  };

  return Object.freeze({
    signInWithPassword: async ({ email, password, clientIp }) =>
      createAuthClient(clientIp).auth.signInWithPassword({ email, password }),
    sendPasswordResetEmail: async ({ email, redirectTo, clientIp }) =>
      createAuthClient(clientIp).auth.resetPasswordForEmail(email, {
        redirectTo,
      }),
    deleteAuthUser: async (userId) =>
      createAuthClient().auth.admin.deleteUser(userId, false),
  });
};

const defaultAuthService = createAuthService();

export const signInWithPassword = defaultAuthService.signInWithPassword;
export const sendPasswordResetEmail = defaultAuthService.sendPasswordResetEmail;
export const deleteAuthUser = defaultAuthService.deleteAuthUser;

export default defaultAuthService;
