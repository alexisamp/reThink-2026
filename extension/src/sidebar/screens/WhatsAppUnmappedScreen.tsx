import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { SidebarHeader } from '../App'
import { CategoryPicker } from '../components/CategoryPicker'

interface Props {
  phone: string
  suggestedName?: string
  user: User
  onMapped: () => void
}

interface ContactResult {
  id: string
  name: string
  company: string | null
}

export function WhatsAppUnmappedScreen({ phone, suggestedName, user, onMapped }: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ContactResult[]>([])
  const [searching, setSearching] = useState(false)
  const [newName, setNewName] = useState(suggestedName ?? '')
  const [category, setCategory] = useState('Peer')
  const [linkedinInput, setLinkedinInput] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(searchContacts, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  async function searchContacts() {
    setSearching(true)
    try {
      const { data } = await supabase
        .from('outreach_logs')
        .select('id, name, company')
        .eq('user_id', user.id)
        .ilike('name', `%${searchQuery.trim()}%`)
        .limit(8)
      setSearchResults(data ?? [])
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  async function handleSelectContact(contactId: string) {
    setSaving(true)
    try {
      const { error } = await supabase.from('contact_phone_mappings').insert({
        user_id: user.id,
        contact_id: contactId,
        phone_number: phone,
        label: null,
      })
      if (error && error.code !== '23505') throw error
      onMapped()
    } catch {
      alert('Failed to link contact. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateNew() {
    if (!newName.trim()) return
    setSaving(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const { data: contact, error: contactError } = await supabase
        .from('outreach_logs')
        .insert({
          user_id: user.id,
          name: newName.trim(),
          status: 'RECONNECT',
          category,
          linkedin_url: linkedinInput.trim() || null,
          phone,
          health_score: 1,
          log_date: today,
        })
        .select()
        .single()

      if (contactError || !contact) throw contactError

      const { error: mappingError } = await supabase.from('contact_phone_mappings').insert({
        user_id: user.id,
        contact_id: contact.id,
        phone_number: phone,
        label: null,
      })
      if (mappingError) throw mappingError

      onMapped()
    } catch {
      alert('Failed to create contact. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '16px', background: 'white', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <SidebarHeader onSignOut={() => {}} />

      <p style={{ fontSize: '12px', color: '#536471', margin: '0 0 4px 0' }}>📱 {phone}</p>
      <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#003720', margin: '0 0 16px 0' }}>Who is this person?</h2>

      {/* Search existing */}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ fontSize: '11px', fontWeight: 600, color: '#536471', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Search in reThink
        </label>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Type a name..."
          style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid #E3E3E3', borderRadius: '8px', outline: 'none', boxSizing: 'border-box', color: '#003720' }}
          onFocus={e => (e.target.style.borderColor = '#003720')}
          onBlur={e => (e.target.style.borderColor = '#E3E3E3')}
        />
      </div>

      {searching && <p style={{ fontSize: '12px', color: '#536471', textAlign: 'center', padding: '8px 0' }}>Searching...</p>}

      {!searching && searchResults.length > 0 && (
        <ul style={{ margin: '0 0 12px 0', padding: 0, listStyle: 'none', border: '1px solid #E3E3E3', borderRadius: '8px', overflow: 'hidden' }}>
          {searchResults.map((c, i) => (
            <li
              key={c.id}
              onClick={() => !saving && handleSelectContact(c.id)}
              style={{ padding: '10px 12px', borderBottom: i < searchResults.length - 1 ? '1px solid #E3E3E3' : 'none', cursor: saving ? 'not-allowed' : 'pointer', background: 'white' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F8FAF8')}
              onMouseLeave={e => (e.currentTarget.style.background = 'white')}
            >
              <p style={{ fontSize: '13px', fontWeight: 500, color: '#003720', margin: '0 0 1px 0' }}>{c.name}</p>
              {c.company && <p style={{ fontSize: '11px', color: '#536471', margin: 0 }}>{c.company}</p>}
            </li>
          ))}
        </ul>
      )}

      {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
        <p style={{ fontSize: '12px', color: '#536471', textAlign: 'center', padding: '8px 0 12px' }}>No matches found</p>
      )}

      {/* Create new */}
      <div style={{ paddingTop: '12px', borderTop: '1px solid #E3E3E3' }}>
        <p style={{ fontSize: '11px', fontWeight: 600, color: '#536471', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Or create new</p>
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Full name"
          style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid #E3E3E3', borderRadius: '8px', outline: 'none', marginBottom: '8px', boxSizing: 'border-box', color: '#003720' }}
          onFocus={e => (e.target.style.borderColor = '#003720')}
          onBlur={e => (e.target.style.borderColor = '#E3E3E3')}
        />
        <CategoryPicker value={category} onChange={setCategory} />
        <input
          type="text"
          value={linkedinInput}
          onChange={e => setLinkedinInput(e.target.value)}
          placeholder="LinkedIn URL (optional)"
          style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid #E3E3E3', borderRadius: '8px', outline: 'none', marginTop: '8px', marginBottom: '12px', boxSizing: 'border-box', color: '#003720' }}
          onFocus={e => (e.target.style.borderColor = '#003720')}
          onBlur={e => (e.target.style.borderColor = '#E3E3E3')}
        />
        <button
          onClick={handleCreateNew}
          disabled={!newName.trim() || saving}
          style={{
            width: '100%',
            padding: '10px',
            background: newName.trim() && !saving ? '#003720' : '#E3E3E3',
            color: newName.trim() && !saving ? 'white' : '#536471',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: newName.trim() && !saving ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? 'Saving...' : 'Create & Link'}
        </button>
        <button
          onClick={onMapped}
          style={{ width: '100%', marginTop: '8px', fontSize: '13px', color: '#536471', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
