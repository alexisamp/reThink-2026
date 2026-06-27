import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { persistGoogleProviderSession } from '@/lib/googleDrive'

export interface AuthCallbackResult {
  handled: boolean
  session: Session | null
  error: string | null
}

function cleanAuthUrl() {
  window.history.replaceState({}, document.title, window.location.pathname)
}

export async function completeOAuthCallback(): Promise<AuthCallbackResult> {
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const message = search.get('error_description') || hash.get('error_description') || search.get('error') || hash.get('error')
  if (message) return { handled: true, session: null, error: message.replace(/\+/g, ' ') }

  const code = search.get('code')
  const accessToken = hash.get('access_token')
  const refreshToken = hash.get('refresh_token')

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      const { data: existing } = await supabase.auth.getSession()
      return { handled: true, session: existing.session, error: existing.session ? null : error.message }
    }
    if (data.session?.provider_token) await persistGoogleProviderSession(data.session)
    cleanAuthUrl()
    return { handled: true, session: data.session, error: null }
  }

  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (error) return { handled: true, session: null, error: error.message }
    if (data.session?.provider_token) await persistGoogleProviderSession(data.session)
    cleanAuthUrl()
    return { handled: true, session: data.session, error: null }
  }

  const { data } = await supabase.auth.getSession()
  return { handled: false, session: data.session, error: null }
}
