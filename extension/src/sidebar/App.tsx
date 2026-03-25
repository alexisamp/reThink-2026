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
  name?: string | null
  company?: string | null
  jobTitle?: string | null
  healthScore?: number
  status?: string
  lastInteractionAt?: string | null
  profilePhotoUrl?: string | null
  pendingTodosCount?: number
  personalContext?: string | null
  category?: string | null
  birthday?: string | null        // MM-DD format
  links?: Array<{ url: string; label: string; type?: string; created_at?: string }>
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
    try {
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
    } catch (err) {
      console.error('reThink: determineState error', err)
      setSidebarState('unauthenticated')
    }
  }

  async function handleGoogleSignIn() {
    try {
      const redirectURL = chrome.identity.getRedirectURL()
      const clientId = '652244567794-rjti1jj53ljnubdq0m6v0rmuji7521nq.apps.googleusercontent.com'
      const scopes = ['openid', 'email', 'profile']

      const nonce = crypto.randomUUID()

      const encoder = new TextEncoder()
      const data = encoder.encode(nonce)
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashedNonce = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&response_type=id_token&redirect_uri=${encodeURIComponent(redirectURL)}&scope=${encodeURIComponent(scopes.join(' '))}&nonce=${hashedNonce}`

      const responseUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true,
      })

      if (responseUrl) {
        const params = new URLSearchParams(responseUrl.split('#')[1])
        const idToken = params.get('id_token')

        if (idToken) {
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
        id, name, company, job_title, health_score, status, profile_photo_url,
        personal_context, category, last_interaction_at, birthday, links
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
    jobTitle: contact.job_title,
    healthScore: contact.health_score,
    status: contact.status,
    profilePhotoUrl: contact.profile_photo_url,
    personalContext: contact.personal_context,
    category: contact.category,
    lastInteractionAt: contact.last_interaction_at,
    birthday: contact.birthday,
    links: contact.links ?? [],
  }
}

async function findContactByLinkedInUrl(userId: string, linkedinUrl: string): Promise<Partial<CurrentContact> | null> {
  const normalized = linkedinUrl.replace(/\/$/, '')
  const withSlash = normalized + '/'
  const { data, error } = await supabase
    .from('outreach_logs')
    .select('id, name, company, job_title, health_score, status, profile_photo_url, personal_context, category, last_interaction_at, birthday, links')
    .eq('user_id', userId)
    .in('linkedin_url', [normalized, withSlash])
    .maybeSingle()

  if (error || !data) return null

  return {
    reThinkId: data.id,
    name: data.name,
    company: data.company,
    jobTitle: data.job_title,
    healthScore: data.health_score,
    status: data.status,
    profilePhotoUrl: data.profile_photo_url,
    personalContext: data.personal_context,
    category: data.category,
    lastInteractionAt: data.last_interaction_at,
    birthday: (data as any).birthday,
    links: (data as any).links ?? [],
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

// ===== DEFAULT SCREEN: TODAY'S BRIEFING =====

interface MilestoneCard {
  contactName: string
  label: string
  daysUntil: number
  emoji: string
}

interface ReminderCard {
  text: string
  contactName: string | null
}

function milestoneEmoji(type: string): string {
  if (type === 'birthday_contact') return '🎂'
  if (type === 'birthday_child') return '👶'
  if (type === 'birthday_partner') return '💑'
  if (type.startsWith('anniversary')) return '🎉'
  return '⭐'
}

function daysUntilMmDd(mmdd: string): number {
  const today = new Date()
  const [m, d] = mmdd.split('-').map(Number)
  const target = new Date(today.getFullYear(), m - 1, d)
  const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (target < todayNorm) target.setFullYear(today.getFullYear() + 1)
  return Math.round((target.getTime() - todayNorm.getTime()) / 86400000)
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function DefaultScreen({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [milestoneCards, setMilestoneCards] = useState<MilestoneCard[]>([])
  const [reminderCards, setReminderCards] = useState<ReminderCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadBriefing()
  }, [user.id])

  async function loadBriefing() {
    setLoading(true)
    try {
      // Load upcoming milestones (all contacts)
      const { data: milestones } = await supabase
        .from('contact_milestones')
        .select('type, label, date_mm_dd, show_days_before, contact_id')
        .eq('user_id', user.id)
        .not('date_mm_dd', 'is', null)

      const upcomingIds = (milestones ?? [])
        .filter(m => {
          if (!m.date_mm_dd) return false
          const days = daysUntilMmDd(m.date_mm_dd)
          return days <= (m.show_days_before ?? 7)
        })
        .map(m => m.contact_id)

      let contactNames: Record<string, string> = {}
      if (upcomingIds.length > 0) {
        const { data: contacts } = await supabase
          .from('outreach_logs')
          .select('id, name')
          .in('id', upcomingIds)
        ;(contacts ?? []).forEach((c: any) => { contactNames[c.id] = c.name })
      }

      const cards: MilestoneCard[] = (milestones ?? [])
        .filter(m => {
          if (!m.date_mm_dd) return false
          const days = daysUntilMmDd(m.date_mm_dd)
          return days <= (m.show_days_before ?? 7)
        })
        .map(m => ({
          contactName: contactNames[m.contact_id] ?? 'Unknown',
          label: m.label,
          daysUntil: daysUntilMmDd(m.date_mm_dd!),
          emoji: milestoneEmoji(m.type),
        }))
        .sort((a, b) => a.daysUntil - b.daysUntil)

      setMilestoneCards(cards)

      // Load active reminders
      const todayStr = new Date().toISOString().split('T')[0]
      const { data: reminders } = await (supabase as any)
        .from('contact_reminders')
        .select('text, contact_id')
        .eq('user_id', user.id)
        .lte('show_from', todayStr)
        .gte('show_until', todayStr)

      let reminderContactNames: Record<string, string> = {}
      const reminderContactIds = [...new Set((reminders ?? []).map((r: any) => r.contact_id).filter(Boolean))]
      if (reminderContactIds.length > 0) {
        const { data: rContacts } = await supabase
          .from('outreach_logs')
          .select('id, name')
          .in('id', reminderContactIds)
        ;(rContacts ?? []).forEach((c: any) => { reminderContactNames[c.id] = c.name })
      }

      setReminderCards(
        (reminders ?? []).map((r: any) => ({
          text: r.text,
          contactName: r.contact_id ? (reminderContactNames[r.contact_id] ?? null) : null,
        }))
      )
    } catch {
      // Fail silently
    } finally {
      setLoading(false)
    }
  }

  const hasContent = milestoneCards.length > 0 || reminderCards.length > 0

  return (
    <div style={{ padding: '16px', background: 'white', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <SidebarHeader onSignOut={onSignOut} />

      <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#003720', margin: '0 0 16px 0' }}>
        {greeting()}
      </h2>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <div style={{ width: '16px', height: '16px', border: '2px solid #E3E3E3', borderTop: '2px solid #003720', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      ) : (
        <>
          {milestoneCards.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <p style={{ fontSize: '10px', fontWeight: 600, color: '#536471', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Coming up
              </p>
              {milestoneCards.map((card, i) => (
                <div
                  key={i}
                  style={{ padding: '10px 12px', background: '#E5F9BD', borderRadius: '10px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}
                >
                  <span style={{ fontSize: '20px' }}>{card.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#003720', margin: '0 0 1px 0' }}>
                      {card.contactName}
                    </p>
                    <p style={{ fontSize: '12px', color: '#536471', margin: 0 }}>
                      {card.label}
                    </p>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: card.daysUntil === 0 ? '#003720' : '#536471', whiteSpace: 'nowrap' }}>
                    {card.daysUntil === 0 ? 'today!' : `in ${card.daysUntil}d`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {reminderCards.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <p style={{ fontSize: '10px', fontWeight: 600, color: '#536471', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Active reminders
              </p>
              {reminderCards.map((card, i) => (
                <div
                  key={i}
                  style={{ padding: '10px 12px', background: '#F8FAF8', borderRadius: '10px', marginBottom: '6px' }}
                >
                  <p style={{ fontSize: '13px', color: '#003720', margin: '0 0 2px 0' }}>{card.text}</p>
                  {card.contactName && (
                    <p style={{ fontSize: '11px', color: '#536471', margin: 0 }}>{card.contactName}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {!hasContent && (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <p style={{ fontSize: '13px', color: '#536471', margin: '0 0 4px 0' }}>All clear — no upcoming milestones this week.</p>
              <p style={{ fontSize: '12px', color: '#536471', margin: 0, lineHeight: 1.5 }}>Open a WhatsApp conversation or LinkedIn profile to get started.</p>
            </div>
          )}

          <DailyProgress userId={user.id} />
        </>
      )}
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
