import { supabase } from './supabaseClient';
import { getSafeInternalPath } from './authRedirect';
export const signInWithProvider = async (provider, next = '/dashboard') => {
  if (!['github', 'google'].includes(provider)) throw new Error('Unsupported sign-in provider.');
  if (!supabase) throw new Error('Live sign-in is not configured. You can explore the sample demo.');
  const callback = new URL('/auth/callback', window.location.origin);
  callback.searchParams.set('next', getSafeInternalPath(next));
  const { error } = await supabase.auth.signInWithOAuth({ provider, options: {
    redirectTo: callback.toString(),
    ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}),
  } });
  if (error) throw new Error('Sign-in could not be started. Please try again later.');
};
export const signInWithGithub = next => signInWithProvider('github', next);
export const signInWithGoogle = next => signInWithProvider('google', next);
