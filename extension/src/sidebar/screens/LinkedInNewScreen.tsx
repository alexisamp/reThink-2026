import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import type { LinkedInProfile } from '../App'
import { SidebarHeader } from '../App'
import { Avatar } from './WhatsAppMappedScreen'
import { CategoryPicker } from '../components/CategoryPicker'
import { supabase } from '../../lib/supabase'

const SUPABASE_URL = 'https://amvezbymrnvrwcypivkf.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtdmV6Ynltcm52cndjeXBpdmtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTIxNTgsImV4cCI6MjA4NDU4ODE1OH0.6qgaygMynKaKYB9TlcJAlyLMt87wc7D8PbA5ZeDGDUg'

interface Props {
  profile: LinkedInProfile | null
  user: User
  onSaved: () => void
}

interface ContactResult {
  id: string
  name: string
  company: string | null
  profile_photo_url: string | null
}

type Step = 'whatsapp_check' | 'new_contact_form'

export function LinkedInNewScreen({ profile, user, onSaved }: Props) {
  const [step, setStep] = useState<Step>('whatsapp_check')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<ContactResult[]>([])
  const [searching, setSearching] = useState(false)
  const [linking, setLinking] = useState(false)

  const [name, setName] = useState(profile?.name ?? '')
  const [category, setCategory] = useState('peer')
  const [context, setContext] = useState('')
  const [saving, setSaving] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firstName = profile?.name?.split(' ')[0] ?? ''
  const hasName = !!(profile?.name)

  useEffect(() => {
    if (step !== 'whatsapp_check') return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!search.trim()) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase
        .from('outreach_logs')
        .select('id, name, company, profile_photo_url')
        .eq('user_id', user.id)
        .ilike('name', `%${search.trim()}%`)
        .limit(5)
      setResults((data ?? []) as ContactResult[])
      setSearching(false)
    }, 300)
  }, [search, step, user.id])

  async function handleLink(contact: ContactResult) {
    setLinking(true)
    try {
      await supabase
        .from('outreach_logs')
        .update({
          linkedin_url: profile?.linkedinUrl ?? null,
          job_title: profile?.jobTitle ?? null,
          company: profile?.company ?? contact.company,
          profile_photo_url: contact.profile_photo_url ?? profile?.profilePhotoUrl ?? null,
        })
        .eq('id', contact.id)
        .eq('user_id', user.id)
      onSaved()
    } catch (err: any) {
      console.error('Link error:', err)
      const msg = err?.message ?? err?.details ?? String(err)
      alert(`Failed to link contact: ${msg}`)
    } finally {
      setLinking(false)
    }
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      let photoUrl = profile?.profilePhotoUrl ?? null
      if (photoUrl?.includes('media.licdn.com')) {
        photoUrl = await uploadPhoto(photoUrl, user.id, profile?.linkedinUrl ?? null)
      }

      const { error } = await supabase
        .from('outreach_logs')
        .insert({
          user_id: user.id,
          name: name.trim(),
          status: 'RECONNECT',
          contact_type: 'networking',
          category,
          linkedin_url: profile?.linkedinUrl ?? null,
          health_score: 1,
          log_date: new Date().toISOString().split('T')[0],
          profile_photo_url: photoUrl,
          job_title: profile?.jobTitle ?? null,
          company: profile?.company ?? null,
          personal_context: context.trim() || null,
        })

      if (error) throw error

      // Trigger prospecting habit update in service worker (non-blocking)
      chrome.runtime.sendMessage({ type: 'UPDATE_PROSPECTING_HABIT' }).catch(() => {})

      onSaved()
    } catch (err: any) {
      console.error('Save error:', err)
      const msg = err?.message ?? err?.details ?? String(err)
      alert(`Failed to save contact: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', fontSize: '13px',
    border: '1px solid #E3E3E3', borderRadius: '8px', outline: 'none',
    boxSizing: 'border-box', color: '#003720', fontFamily: 'inherit',
  }

  // ── STEP 1: WhatsApp check ─────────────────────────────────────────────────
  if (step === 'whatsapp_check') {
    return (
      <div style={{ padding: '16px', background: 'white', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <SidebarHeader onSignOut={() => {}} />

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '20px', padding: '12px', background: '#F7FAF8', borderRadius: '10px' }}>
          <Avatar name={profile?.name} photoUrl={profile?.profilePhotoUrl} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#003720', margin: '0 0 2px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile?.name ?? '—'}
            </p>
            {(profile?.jobTitle || profile?.company) && (
              <p style={{ fontSize: '12px', color: '#536471', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {[profile?.jobTitle, profile?.company].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>

        <p style={{ fontSize: '14px', fontWeight: 600, color: '#003720', margin: '0 0 12px 0' }}>
          Already talking with {firstName || 'them'} on WhatsApp?
        </p>

        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search "${firstName || 'contact'}" in reThink...`}
            style={inputStyle}
            autoFocus
          />
          {searching && <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: '#536471' }}>...</span>}
        </div>

        {results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
            {results.map(c => (
              <div
                key={c.id}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', border: '1px solid #E3E3E3', borderRadius: '8px', cursor: linking ? 'not-allowed' : 'pointer' }}
                onClick={() => !linking && handleLink(c)}
              >
                <Avatar name={c.name} photoUrl={c.profile_photo_url} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#003720', margin: 0 }}>{c.name}</p>
                  {c.company && <p style={{ fontSize: '11px', color: '#536471', margin: 0 }}>{c.company}</p>}
                </div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#79D65E', whiteSpace: 'nowrap' }}>{linking ? '...' : 'Link →'}</span>
              </div>
            ))}
          </div>
        )}

        {search.trim() && results.length === 0 && !searching && (
          <p style={{ fontSize: '12px', color: '#536471', textAlign: 'center', margin: '0 0 16px 0' }}>No contacts found</p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0' }}>
          <div style={{ flex: 1, height: '1px', background: '#E3E3E3' }} />
          <span style={{ fontSize: '11px', color: '#536471' }}>or</span>
          <div style={{ flex: 1, height: '1px', background: '#E3E3E3' }} />
        </div>

        <button
          onClick={() => setStep('new_contact_form')}
          style={{ width: '100%', padding: '11px', background: '#003720', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}
        >
          No, add {firstName || 'them'} as new contact →
        </button>
      </div>
    )
  }

  // ── STEP 2: New contact form ────────────────────────────────────────────────
  return (
    <div style={{ padding: '16px', background: 'white', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <button onClick={() => setStep('whatsapp_check')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#536471', fontSize: '13px', padding: '0 0 12px 0' }}>
        ← Back
      </button>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '20px' }}>
        <Avatar name={name || profile?.name} photoUrl={profile?.profilePhotoUrl} size={52} />
        <div>
          <p style={{ fontSize: '12px', color: '#536471', margin: '0 0 2px 0' }}>New contact</p>
          <p style={{ fontSize: '15px', fontWeight: 600, color: '#003720', margin: 0 }}>{name || profile?.name || '—'}</p>
          {(profile?.jobTitle || profile?.company) && (
            <p style={{ fontSize: '12px', color: '#536471', margin: '2px 0 0 0' }}>
              {[profile?.jobTitle, profile?.company].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {!hasName && (
          <div>
            <label style={labelStyle}>Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Full name" style={inputStyle} autoFocus
              onFocus={e => (e.target.style.borderColor = '#003720')} onBlur={e => (e.target.style.borderColor = '#E3E3E3')} />
          </div>
        )}

        <div>
          <label style={labelStyle}>Category</label>
          <CategoryPicker value={category} onChange={setCategory} />
        </div>

        <div>
          <label style={labelStyle}>Your context with {firstName || 'them'}</label>
          <textarea
            value={context}
            onChange={e => setContext(e.target.value)}
            placeholder="How did you meet? What's the opportunity? What's your goal with this relationship?"
            rows={4}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            onFocus={e => (e.target.style.borderColor = '#003720')}
            onBlur={e => (e.target.style.borderColor = '#E3E3E3')}
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={!name.trim() || saving}
        style={{
          width: '100%', marginTop: '20px', padding: '12px',
          background: name.trim() && !saving ? '#003720' : '#E3E3E3',
          color: name.trim() && !saving ? 'white' : '#536471',
          border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
          cursor: name.trim() && !saving ? 'pointer' : 'not-allowed',
        }}
      >
        {saving ? 'Saving...' : `Add ${firstName || name.trim() || 'contact'} to reThink →`}
      </button>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: '11px', fontWeight: 600, color: '#536471', display: 'block',
  marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em',
}

async function uploadPhoto(photoUrl: string, userId: string, linkedinUrl: string | null): Promise<string | null> {
  try {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token
    if (!token) return photoUrl
    const res = await fetch(photoUrl, { credentials: 'include' })
    if (!res.ok) return photoUrl
    const blob = await res.blob()
    const slug = linkedinUrl?.match(/\/in\/([^/?#]+)/)?.[1] ?? 'photo'
    const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg'
    const storagePath = `${userId}/${slug}.${ext}`
    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/contact-photos/${storagePath}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': blob.type || 'image/jpeg', 'x-upsert': 'true' },
      body: blob,
    })
    if (uploadRes.ok) return `${SUPABASE_URL}/storage/v1/object/public/contact-photos/${storagePath}`
    return photoUrl
  } catch {
    return photoUrl
  }
}
