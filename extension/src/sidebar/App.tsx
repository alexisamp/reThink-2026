import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'
import { WhatsAppMappedScreen } from './screens/WhatsAppMappedScreen'
import { WhatsAppUnmappedScreen } from './screens/WhatsAppUnmappedScreen'
import { LinkedInKnownScreen } from './screens/LinkedInKnownScreen'
import { LinkedInNewScreen } from './screens/LinkedInNewScreen'
import { DailyProgress } from './components/DailyProgress'

// ===== TYPES =====

type SidebarState =
  | 'loading'
  | 'unauthenticated'
  | 'default'
  | 'whatsapp_mapped'
  | 'whatsapp_unmapped'
  | 'linkedin_known'
  | 'linkedin_new'

export interface CurrentContact {
  // WhatsApp
  phone?: string
  // LinkedIn
  linkedinUrl?: string
  linkedinName?: string
  // Resolved reThink data
  reThinkId?: string
  name?: string
  company?: string | null
  jobTitle?: string | null
  healthScore?: number
  status?: string
  lastInteractionAt?: string | null
  profilePhotoUrl?: string | null
  pendingTodosCount?: number
  personalContext?: string | null
  category?: string | null
}

export interface LinkedInProfile {
  name?: string | null
  linkedinUrl?: string | null
  jobTitle?: string | null
  company?: string | null
  location?: string | null
  profilePhotoUrl?: string | null
  connections?: string | null
}

// ===== MAIN APP =====

export default function App() {
  const [sidebarState, setSidebarState] = useState<SidebarState>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [currentContact, setCurrentContact] = useState<CurrentContact | null>(null)
  const [linkedInProfile, setLinkedInProfile] = useState<LinkedInProfile | null>(null)

  useEffect(() => {
    determineState()

    const onStorageChange = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.currentWhatsAppContact || changes.currentLinkedInProfile) {
        determineState()
      }
    }
    chrome.storage.onChanged.addListener(onStorageChange)
    return () => chrome.storage.onChanged.removeListener(onStorageChange)
  }, [])

  async function determineState() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setSidebarState('unauthenticated')
      setUser(null)
      return
    }
    setUser(session.user)

    const stored = await chrome.storage.local.get(['currentWhatsAppContact', 'currentLinkedInProfile'])

    if (stored.currentWhatsAppContact?.phone) {
      const contact = await findContactByPhone(session.user.id, stored.currentWhatsAppContact.phone)
      if (contact) {
        setCurrentContact({ phone: stored.currentWhatsAppContact.phone, ...contact })
        setSidebarState('whatsapp_mapped')
      } else {
        setCurrentContact({
          phone: stored.currentWhatsAppContact.phone,
          linkedinName: stored.currentWhatsAppContact.name,
        })
        setSidebarState('whatsapp_unmapped')
      }
    } else if (stored.currentLinkedInProfile?.linkedinUrl) {
      const profile = stored.currentLinkedInProfile as LinkedInProfile
      setLinkedInProfile(profile)
      const contact = await findContactByLinkedInUrl(session.user.id, profile.linkedinUrl!)
      if (contact) {
        setCurrentContact({ linkedinUrl: profile.linkedinUrl!, linkedinName: profile.name ?? undefined, ...contact })
        setSidebarState('linkedin_known')
      } else {
        setCurrentContact({ linkedinUrl: profile.linkedinUrl!, linkedinName: profile.name ?? undefined })
        setSidebarState('linkedin_new')
      }
    } else {
      setCurrentContact(null)
      setSidebarState('default')
    }
  }

  async function handleGoogleSignIn() {
    try {
      const redirectURL = chrome.identity.getRedirectURL()
      const clientId = '652244567794-rjti1jj53ljnubdq0m6v0rmuji7521nq.apps.googleusercontent.com'
      const scopes = ['openid', 'email', 'profile']

      // 1. Generate plain nonce
      const nonce = crypto.randomUUID()

      // 2. Hash the nonce with SHA-256 for Google
      const encoder = new TextEncoder()
      const data = encoder.encode(nonce)
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashedNonce = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

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
          // 4. Pass PLAIN nonce to Supabase (not hashed)
          const { data: authData, error } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: idToken,
            nonce: nonce,
          })

          if (error) {
            console.error('Supabase error:', error)
            throw error
          }
          setUser(authData.user)
          determineState()
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
    setSidebarState('unauthenticated')
  }

  switch (sidebarState) {
    case 'loading':
      return <LoadingSpinner />

    case 'unauthenticated':
      return <LoginScreen onSignIn={handleGoogleSignIn} />

    case 'default':
      return <DefaultScreen user={user!} onSignOut={handleSignOut} />

    case 'whatsapp_mapped':
      return (
        <WhatsAppMappedScreen
          contact={currentContact!}
          user={user!}
          onSignOut={handleSignOut}
        />
      )

    case 'whatsapp_unmapped':
      return (
        <WhatsAppUnmappedScreen
          phone={currentContact?.phone ?? ''}
          suggestedName={currentContact?.linkedinName}
          user={user!}
          onMapped={() => determineState()}
        />
      )

    case 'linkedin_known':
      return (
        <LinkedInKnownScreen
          contact={currentContact!}
          user={user!}
          onSignOut={handleSignOut}
        />
      )

    case 'linkedin_new':
      return (
        <LinkedInNewScreen
          profile={linkedInProfile}
          user={user!}
          onSaved={() => determineState()}
        />
      )

    default:
      return <LoadingSpinner />
  }
}

// ===== SUPABASE HELPERS =====

async function findContactByPhone(userId: string, phone: string): Promise<Partial<CurrentContact> | null> {
  // Build all plausible phone variants to handle legacy stored formats
  const digits = phone.replace(/\D/g, '')
  const variants = Array.from(new Set([
    phone,
    digits,
    '+' + digits,
    ...(digits.startsWith('52') && digits.length > 10 ? ['+' + digits.slice(2), digits.slice(2)] : []),
    ...(digits.startsWith('1') && digits.length === 11 ? ['+' + digits.slice(1), digits.slice(1)] : []),
  ])).filter(Boolean)

  const { data, error } = await supabase
    .from('contact_phone_mappings')
    .select(`
      contact_id,
      outreach_logs!inner (
        id,
        name,
        company,
        health_score,
        status,
        profile_photo_url,
        personal_context,
        category
      )
    `)
    .eq('user_id', userId)
    .in('phone_number', variants)
    .maybeSingle()

  if (error || !data) return null

  const contact = data.outreach_logs as any
  return {
    reThinkId: contact.id,
    name: contact.name,
    company: contact.company,
    healthScore: contact.health_score,
    status: contact.status,
    profilePhotoUrl: contact.profile_photo_url,
    personalContext: contact.personal_context,
    category: contact.category,
  }
}

async function findContactByLinkedInUrl(userId: string, linkedinUrl: string): Promise<Partial<CurrentContact> | null> {
  const { data, error } = await supabase
    .from('outreach_logs')
    .select('id, name, company, health_score, status, profile_photo_url, personal_context, category')
    .eq('user_id', userId)
    .eq('linkedin_url', linkedinUrl)
    .maybeSingle()

  if (error || !data) return null

  return {
    reThinkId: data.id,
    name: data.name,
    company: data.company,
    healthScore: data.health_score,
    status: data.status,
    profilePhotoUrl: data.profile_photo_url,
    personalContext: data.personal_context,
    category: data.category,
  }
}

// ===== SHARED COMPONENTS =====

function LoadingSpinner() {
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white' }}>
      <div style={{ width: '20px', height: '20px', border: '2px solid #E3E3E3', borderTop: '2px solid #003720', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function LoginScreen({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'white', gap: '16px' }}>
      <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#003720', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#79D65E', fontSize: '24px', fontWeight: 700 }}>r</span>
      </div>
      <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#003720', textAlign: 'center', margin: 0 }}>reThink People</h1>
      <p style={{ fontSize: '14px', color: '#536471', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
        Sign in to automatically track your WhatsApp and LinkedIn conversations.
      </p>
      <button
        onClick={onSignIn}
        style={{
          background: '#003720',
          color: 'white',
          padding: '10px 20px',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 500,
          border: 'none',
          cursor: 'pointer',
          marginTop: '8px',
        }}
      >
        Sign in with Google
      </button>
    </div>
  )
}

function DefaultScreen({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  return (
    <div style={{ padding: '16px', background: 'white', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <SidebarHeader onSignOut={onSignOut} />
      <DailyProgress userId={user.id} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 16px', color: '#536471', fontSize: '13px', textAlign: 'center' }}>
        <p style={{ margin: 0, lineHeight: 1.5 }}>Open a WhatsApp conversation or LinkedIn profile to get started.</p>
      </div>
    </div>
  )
}

export function SidebarHeader({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
      <span style={{ fontSize: '14px', fontWeight: 600, color: '#003720' }}>reThink People</span>
      <button
        onClick={onSignOut}
        style={{ fontSize: '12px', color: '#536471', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}
      >
        Sign out
      </button>
    </div>
  )
}
