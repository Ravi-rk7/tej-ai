import { supabase } from './supabaseClient';
import { getSafeInternalPath } from './authRedirect';
export const signInWithGithub = async (next = '/dashboard') => {
  if (!supabase) throw new Error('Live sign-in is not configured. You can explore the sample demo.');
  const callback = new URL('/auth/callback', window.location.origin);
  callback.searchParams.set('next', getSafeInternalPath(next));
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: callback.toString() } });
  if (error) throw new Error('GitHub sign-in could not be started. Please try again later.');
};
