import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkSession()
  }, [])

  async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession()
    setUser(session?.user ?? null)
    setLoading(false)
  }

  async function handleGoogleSignIn() {
    try {
      // Use chrome.identity for OAuth flow
      const redirectURL = chrome.identity.getRedirectURL()
      const clientId = '652244567794-rjti1jj53ljnubdq0m6v0rmuji7521nq.apps.googleusercontent.com'
      const scopes = ['openid', 'email', 'profile']
      const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectURL)}&scope=${encodeURIComponent(scopes.join(' '))}`

      const responseUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true,
      })

      if (responseUrl) {
        // Extract access token from response URL
        const params = new URLSearchParams(responseUrl.split('#')[1])
        const accessToken = params.get('access_token')

        if (accessToken) {
          // Sign in to Supabase with Google token
          const { data, error } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: accessToken,
          })

          if (error) throw error
          setUser(data.user)
        }
      }
    } catch (error) {
      console.error('Sign in error:', error)
      alert('Failed to sign in. Please try again.')
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    setUser(null)
  }

  if (loading) {
    return (
      <div style={{ width: '320px', height: '384px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white' }}>
        <div style={{ width: '20px', height: '20px', border: '2px solid #E3E3E3', borderTop: '2px solid #003720', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
      </div>
    )
  }

  if (!user) {
    return (
      <div style={{ width: '320px', height: '384px', background: 'white', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#003720' }}>reThink Auto-Capture</h1>
        <p style={{ fontSize: '14px', color: '#536471', textAlign: 'center' }}>
          Sign in to automatically track your WhatsApp and LinkedIn conversations.
        </p>
        <button
          onClick={handleGoogleSignIn}
          style={{
            background: '#003720',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Sign in with Google
        </button>
      </div>
    )
  }

  return (
    <div style={{ width: '320px', height: '384px', background: 'white', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#003720' }}>reThink Auto-Capture</h1>
        <button
          onClick={handleSignOut}
          style={{ fontSize: '12px', color: '#536471', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'rgba(227, 227, 227, 0.4)', borderRadius: '8px' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#79D65E', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '12px', fontWeight: 'bold' }}>
          {user.email?.[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '14px', fontWeight: 500, color: '#003720', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.email}
          </p>
          <p style={{ fontSize: '12px', color: '#536471' }}>Connected</p>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#536471', fontSize: '12px', textAlign: 'center' }}>
        <p>Auto-capture is active on WhatsApp Web and LinkedIn.</p>
      </div>
    </div>
  )
}
