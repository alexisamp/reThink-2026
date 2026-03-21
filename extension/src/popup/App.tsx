import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

type Mode = 'default' | 'map-contact'

interface Contact {
  id: string
  name: string
  company: string | null
  linkedin_url: string | null
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<Mode>('default')

  useEffect(() => {
    checkSession()
    checkMode()
  }, [])

  async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession()
    setUser(session?.user ?? null)
    setLoading(false)
  }

  function checkMode() {
    // Check URL hash for mode
    const hash = window.location.hash.slice(1) // Remove #
    if (hash === 'map-contact') {
      setMode('map-contact')
    }
  }

  async function handleGoogleSignIn() {
    try {
      const redirectURL = chrome.identity.getRedirectURL()
      const clientId = '652244567794-rjti1jj53ljnubdq0m6v0rmuji7521nq.apps.googleusercontent.com'
      const scopes = ['openid', 'email', 'profile']

      // 1. Generate plain nonce
      const nonce = crypto.randomUUID()
      console.log('🔑 Plain nonce:', nonce)

      // 2. Hash the nonce with SHA-256 for Google
      const encoder = new TextEncoder()
      const data = encoder.encode(nonce)
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashedNonce = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
      console.log('🔐 Hashed nonce for Google:', hashedNonce)

      // 3. Send HASHED nonce to Google
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&response_type=id_token&redirect_uri=${encodeURIComponent(redirectURL)}&scope=${encodeURIComponent(scopes.join(' '))}&nonce=${hashedNonce}`

      const responseUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true,
      })

      if (responseUrl) {
        const params = new URLSearchParams(responseUrl.split('#')[1])
        const idToken = params.get('id_token')

        if (idToken) {
          // Decode token to verify
          const parts = idToken.split('.')
          const payload = JSON.parse(atob(parts[1]))
          console.log('🔍 Nonce in token:', payload.nonce)
          console.log('🔍 Matches hashed?', payload.nonce === hashedNonce)

          // 4. Pass PLAIN nonce to Supabase (not hashed)
          const { data: authData, error } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: idToken,
            nonce: nonce,  // Original unhashed nonce
          })

          if (error) {
            console.error('❌ Supabase error:', error)
            throw error
          }
          console.log('✅ Sign in successful!')
          setUser(authData.user)
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
      <div style={{ width: '400px', height: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white' }}>
        <div style={{ width: '20px', height: '20px', border: '2px solid #E3E3E3', borderTop: '2px solid #003720', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
      </div>
    )
  }

  if (!user) {
    return <LoginScreen onSignIn={handleGoogleSignIn} />
  }

  if (mode === 'map-contact') {
    return <ContactMappingScreen user={user} />
  }

  return <DefaultScreen user={user} onSignOut={handleSignOut} />
}

// ===== LOGIN SCREEN =====

function LoginScreen({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div style={{ width: '320px', height: '384px', background: 'white', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
      <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#003720' }}>reThink Auto-Capture</h1>
      <p style={{ fontSize: '14px', color: '#536471', textAlign: 'center' }}>
        Sign in to automatically track your WhatsApp and LinkedIn conversations.
      </p>
      <button
        onClick={onSignIn}
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

// ===== DEFAULT SCREEN =====

function DefaultScreen({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  return (
    <div style={{ width: '320px', height: '384px', background: 'white', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#003720' }}>reThink Auto-Capture</h1>
        <button
          onClick={onSignOut}
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

// ===== CONTACT MAPPING SCREEN =====

function ContactMappingScreen({ user }: { user: User }) {
  const [pendingPhone, setPendingPhone] = useState<string | null>(null)
  const [pendingLinkedInUrl, setPendingLinkedInUrl] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Contact[]>([])
  const [searching, setSearching] = useState(false)
  const [newContactName, setNewContactName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadPendingData()
  }, [])

  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      const timeout = setTimeout(searchContacts, 300) // Debounce 300ms
      return () => clearTimeout(timeout)
    } else {
      setSearchResults([])
    }
  }, [searchQuery])

  async function loadPendingData() {
    const data = await chrome.storage.local.get(['pendingPhone', 'pendingLinkedInUrl'])
    setPendingPhone(data.pendingPhone ?? null)
    setPendingLinkedInUrl(data.pendingLinkedInUrl ?? null)
  }

  async function searchContacts() {
    if (!searchQuery.trim()) return

    setSearching(true)
    try {
      const { data, error } = await supabase
        .from('outreach_logs')
        .select('id, name, company, linkedin_url')
        .eq('user_id', user.id)
        .ilike('name', `%${searchQuery.trim()}%`)
        .limit(10)

      if (error) throw error
      setSearchResults(data ?? [])
    } catch (error) {
      console.error('Search error:', error)
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  async function handleSelectContact(contactId: string) {
    setSaving(true)
    try {
      if (pendingPhone) {
        // Create phone mapping
        const { error } = await supabase
          .from('contact_phone_mappings')
          .insert({
            user_id: user.id,
            contact_id: contactId,
            phone_number: pendingPhone,
            label: null,
          })

        if (error) throw error
      }

      if (pendingLinkedInUrl) {
        // Update contact with LinkedIn URL (if not already set)
        const { error } = await supabase
          .from('outreach_logs')
          .update({ linkedin_url: pendingLinkedInUrl })
          .eq('id', contactId)
          .is('linkedin_url', null)

        if (error && error.code !== '23505') throw error // Ignore unique constraint (already has URL)
      }

      // Clear pending data
      await chrome.storage.local.remove(['pendingPhone', 'pendingLinkedInUrl'])

      // Close tab
      window.close()
    } catch (error) {
      console.error('Save error:', error)
      alert('Failed to save mapping. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateNewContact() {
    if (!newContactName.trim()) return

    setSaving(true)
    try {
      // Create new contact
      const { data: contact, error: contactError } = await supabase
        .from('outreach_logs')
        .insert({
          user_id: user.id,
          name: newContactName.trim(),
          linkedin_url: pendingLinkedInUrl,
          phone: pendingPhone,
          status: 'PROSPECT',
          category: null,
          health_score: 1,
          log_date: new Date().toISOString().split('T')[0],
        })
        .select()
        .single()

      if (contactError || !contact) throw contactError

      // Create phone mapping if needed
      if (pendingPhone) {
        const { error: mappingError } = await supabase
          .from('contact_phone_mappings')
          .insert({
            user_id: user.id,
            contact_id: contact.id,
            phone_number: pendingPhone,
            label: null,
          })

        if (mappingError) throw mappingError
      }

      // Clear pending data
      await chrome.storage.local.remove(['pendingPhone', 'pendingLinkedInUrl'])

      // Close tab
      window.close()
    } catch (error) {
      console.error('Create error:', error)
      alert('Failed to create contact. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSkip() {
    // Clear pending data and close
    await chrome.storage.local.remove(['pendingPhone', 'pendingLinkedInUrl'])
    window.close()
  }

  return (
    <div style={{ width: '400px', minHeight: '500px', background: 'white', padding: '24px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#003720', marginBottom: '8px' }}>Unknown Contact</h2>
      <p style={{ fontSize: '14px', color: '#536471', marginBottom: '16px' }}>
        {pendingPhone ? `WhatsApp: ${pendingPhone}` : `LinkedIn: ${pendingLinkedInUrl}`}
      </p>

      {/* Search */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ fontSize: '12px', fontWeight: 500, color: '#536471', marginBottom: '4px', display: 'block' }}>
          Search in reThink
        </label>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Type name to search..."
          style={{
            width: '100%',
            padding: '8px 12px',
            fontSize: '14px',
            border: '1px solid #E3E3E3',
            borderRadius: '8px',
            outline: 'none',
          }}
          onFocus={(e) => (e.target.style.borderColor = '#003720')}
          onBlur={(e) => (e.target.style.borderColor = '#E3E3E3')}
        />
      </div>

      {/* Search results */}
      {searching && (
        <div style={{ textAlign: 'center', padding: '16px', color: '#536471', fontSize: '12px' }}>
          Searching...
        </div>
      )}

      {!searching && searchResults.length > 0 && (
        <ul style={{ marginBottom: '16px', maxHeight: '200px', overflowY: 'auto', border: '1px solid #E3E3E3', borderRadius: '8px', padding: 0, margin: 0, listStyle: 'none' }}>
          {searchResults.map((contact, index) => (
            <li
              key={contact.id}
              onClick={() => !saving && handleSelectContact(contact.id)}
              style={{
                padding: '12px',
                borderBottom: index < searchResults.length - 1 ? '1px solid #E3E3E3' : 'none',
                cursor: saving ? 'not-allowed' : 'pointer',
                background: 'white',
              }}
              onMouseEnter={(e) => !saving && (e.currentTarget.style.background = 'rgba(227, 227, 227, 0.2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
            >
              <p style={{ fontSize: '14px', fontWeight: 500, color: '#003720', marginBottom: '4px' }}>{contact.name}</p>
              {contact.company && (
                <p style={{ fontSize: '12px', color: '#536471' }}>{contact.company}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
        <div style={{ textAlign: 'center', padding: '16px', color: '#536471', fontSize: '12px', marginBottom: '16px' }}>
          No matches found
        </div>
      )}

      {/* Create new */}
      <div style={{ paddingTop: '16px', borderTop: '1px solid #E3E3E3' }}>
        <p style={{ fontSize: '12px', color: '#536471', marginBottom: '8px' }}>Or create a new contact:</p>
        <input
          type="text"
          value={newContactName}
          onChange={(e) => setNewContactName(e.target.value)}
          placeholder="Full name"
          style={{
            width: '100%',
            padding: '8px 12px',
            fontSize: '14px',
            border: '1px solid #E3E3E3',
            borderRadius: '8px',
            marginBottom: '12px',
            outline: 'none',
          }}
          onFocus={(e) => (e.target.style.borderColor = '#003720')}
          onBlur={(e) => (e.target.style.borderColor = '#E3E3E3')}
        />
        <button
          onClick={handleCreateNewContact}
          disabled={!newContactName.trim() || saving}
          style={{
            width: '100%',
            background: !newContactName.trim() || saving ? '#E3E3E3' : '#003720',
            color: !newContactName.trim() || saving ? '#536471' : 'white',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 500,
            border: 'none',
            cursor: !newContactName.trim() || saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Creating...' : 'Create & Link'}
        </button>
      </div>

      {/* Skip */}
      <button
        onClick={handleSkip}
        disabled={saving}
        style={{
          width: '100%',
          marginTop: '12px',
          fontSize: '14px',
          color: '#536471',
          background: 'none',
          border: 'none',
          cursor: saving ? 'not-allowed' : 'pointer',
          textDecoration: 'underline',
        }}
        onMouseEnter={(e) => !saving && (e.currentTarget.style.color = '#003720')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#536471')}
      >
        Skip for now
      </button>
    </div>
  )
}
