import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { consumeGoogleDriveScopeRequested, GOOGLE_OAUTH_SCOPES_STRING, markGoogleDriveScopeRequested, persistGoogleProviderSession } from '@/lib/googleDrive'
import type { User } from '@supabase/supabase-js'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      // Persist provider_token to user_metadata immediately on sign-in so the
      // Chrome extension can use it as fallback (provider_token vanishes after token refresh)
      if (event === 'SIGNED_IN' && session?.provider_token) {
        consumeGoogleDriveScopeRequested()
        void persistGoogleProviderSession(session)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const signInWithGoogle = () => {
    markGoogleDriveScopeRequested()
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: GOOGLE_OAUTH_SCOPES_STRING,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    })
  }

  const signOut = () => supabase.auth.signOut()

  return { user, loading, signInWithGoogle, signOut }
}
