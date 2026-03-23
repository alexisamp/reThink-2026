// Phase 5: Full implementation
import { useState } from 'react'
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

export function LinkedInNewScreen({ profile, user, onSaved }: Props) {
  const [name, setName] = useState(profile?.name ?? '')
  const [category, setCategory] = useState('Peer')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const today = new Date().toISOString().split('T')[0]

      // Upload photo to Supabase Storage if available
      let photoUrl = profile?.profilePhotoUrl ?? null
      if (photoUrl && photoUrl.includes('media.licdn.com')) {
        photoUrl = await uploadPhoto(photoUrl, user.id, profile?.linkedinUrl ?? null)
      }

      const { data: contact, error: contactError } = await supabase
        .from('outreach_logs')
        .insert({
          user_id: user.id,
          name: name.trim(),
          status: 'PROSPECT',
          category,
          linkedin_url: profile?.linkedinUrl ?? null,
          phone: phone.trim() || null,
          health_score: 1,
          log_date: today,
          profile_photo_url: photoUrl,
          job_title: profile?.jobTitle ?? null,
          company: profile?.company ?? null,
        })
        .select()
        .single()

      if (contactError || !contact) throw contactError

      // Create phone mapping if phone provided
      if (phone.trim()) {
        await supabase.from('contact_phone_mappings').insert({
          user_id: user.id,
          contact_id: contact.id,
          phone_number: phone.trim(),
          label: null,
        })
      }

      onSaved()
    } catch (err) {
      console.error('Save error:', err)
      alert('Failed to save contact. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '16px', background: 'white', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <SidebarHeader onSignOut={() => {}} />

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
        <Avatar name={name || profile?.name} photoUrl={profile?.profilePhotoUrl} size={48} />
        <div>
          <p style={{ fontSize: '12px', color: '#536471', margin: '0 0 2px 0' }}>New contact</p>
          <p style={{ fontSize: '14px', fontWeight: 600, color: '#003720', margin: 0 }}>Save to reThink</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#536471', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Full name"
            style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid #E3E3E3', borderRadius: '8px', outline: 'none', boxSizing: 'border-box', color: '#003720' }}
            onFocus={e => (e.target.style.borderColor = '#003720')}
            onBlur={e => (e.target.style.borderColor = '#E3E3E3')}
          />
        </div>

        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#536471', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Category</label>
          <CategoryPicker value={category} onChange={setCategory} />
        </div>

        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#536471', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Already WhatsApping with them?
          </label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="Phone number (optional)"
            style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid #E3E3E3', borderRadius: '8px', outline: 'none', boxSizing: 'border-box', color: '#003720' }}
            onFocus={e => (e.target.style.borderColor = '#003720')}
            onBlur={e => (e.target.style.borderColor = '#E3E3E3')}
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={!name.trim() || saving}
        style={{
          width: '100%',
          marginTop: '16px',
          padding: '10px',
          background: name.trim() && !saving ? '#003720' : '#E3E3E3',
          color: name.trim() && !saving ? 'white' : '#536471',
          border: 'none',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 500,
          cursor: name.trim() && !saving ? 'pointer' : 'not-allowed',
        }}
      >
        {saving ? 'Saving...' : 'Save to reThink'}
      </button>
    </div>
  )
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

    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/contact-photos/${storagePath}`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': blob.type || 'image/jpeg',
          'x-upsert': 'true',
        },
        body: blob,
      }
    )

    if (uploadRes.ok) {
      return `${SUPABASE_URL}/storage/v1/object/public/contact-photos/${storagePath}`
    }
    return photoUrl
  } catch {
    return photoUrl
  }
}
