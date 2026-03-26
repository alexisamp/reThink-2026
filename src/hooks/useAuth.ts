import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
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
        const meta: Record<string, string> = { google_access_token: session.provider_token }
        if (session.provider_refresh_token) {
          meta.google_refresh_token = session.provider_refresh_token
        }
        supabase.auth.updateUser({ data: meta })
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const signInWithGoogle = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        scopes: [
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/calendar',
        ].join(' '),
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    })

  const signOut = () => supabase.auth.signOut()

  return { user, loading, signInWithGoogle, signOut }
}
