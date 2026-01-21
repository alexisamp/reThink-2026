import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://amvezbymrnvrwcypivkf.supabase.co';
const supabaseKey = 'sb_publishable_mzZ9o2mLl-NhbhqfKSb38g_OIwQYKXZ';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Auth Helpers
export const signInWithEmail = async (email: string, password: string) => {
  return await supabase.auth.signInWithPassword({ email, password });
};

export const signUpWithEmail = async (email: string, password: string) => {
  return await supabase.auth.signUp({ email, password });
};

export const signOut = async () => {
  return await supabase.auth.signOut();
};
