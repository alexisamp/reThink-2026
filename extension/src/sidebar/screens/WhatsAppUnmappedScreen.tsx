import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { SidebarHeader } from '../App'
import { Avatar } from './WhatsAppMappedScreen'
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
  profile_photo_url: string | null
}

type Step = 'rethink_check' | 'new_contact_form'

export function WhatsAppUnmappedScreen({ phone, suggestedName, user, onMapped }: Props) {
  const [step, setStep] = useState<Step>('rethink_check')
  const [search, setSearch] = useState(suggestedName ?? '')
  const [results, setResults] = useState<ContactResult[]>([])
  const [searching, setSearching] = useState(false)
  const [linking, setLinking] = useState(false)

  // Form state
  const [newName, setNewName] = useState(suggestedName ?? '')
  const [category, setCategory] = useState('Peer')
  const [context, setContext] = useState('')
  const [linkedinInput, setLinkedinInput] = useState('')
  const [saving, setSaving] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const displayName = suggestedName || phone

  // Auto-search on mount if we have a suggested name
  useEffect(() => {
    if (suggestedName && step === 'rethink_check') {
      searchContacts(suggestedName)
    }
  }, [])

  // Debounced search
  useEffect(() => {
    if (step !== 'rethink_check') return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!search.trim()) { setResults([]); return }
    debounceRef.current = setTimeout(() => searchContacts(search), 300)
  }, [search, step])

  async function searchContacts(query: string) {
    setSearching(true)
    try {
      const { data } = await supabase
        .from('outreach_logs')
        .select('id, name, company, profile_photo_url')
        .eq('user_id', user.id)
        .ilike('name', `%${query.trim()}%`)
        .limit(6)
      setResults(data ?? [])
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  async function handleLink(contactId: string) {
    setLinking(true)
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
      alert('Error al vincular. Intentá de nuevo.')
    } finally {
      setLinking(false)
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
          personal_context: context.trim() || null,
        })
        .select()
        .single()

      if (contactError || !contact) throw contactError

      await supabase.from('contact_phone_mappings').insert({
        user_id: user.id,
        contact_id: contact.id,
        phone_number: phone,
        label: null,
      })

      onMapped()
    } catch {
      alert('Error al crear el contacto. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    fontSize: '13px',
    border: '1px solid #E3E3E3',
    borderRadius: '8px',
    outline: 'none',
    boxSizing: 'border-box',
    color: '#003720',
    fontFamily: 'inherit',
  }

  // ── STEP 1: reThink check ──────────────────────────────────────────────────
  if (step === 'rethink_check') {
    return (
      <div style={{ padding: '16px', background: 'white', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <SidebarHeader onSignOut={() => {}} />

        {/* Phone badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#F7FAF8', padding: '6px 10px', borderRadius: '8px', marginBottom: '16px' }}>
          <span style={{ fontSize: '16px' }}>💬</span>
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#536471' }}>{phone}</span>
        </div>

        {/* Question */}
        <p style={{ fontSize: '14px', fontWeight: 600, color: '#003720', margin: '0 0 12px 0' }}>
          ¿Ya tenés a {displayName} en reThink People?
        </p>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre..."
            style={inputStyle}
            autoFocus
          />
          {searching && (
            <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: '#536471' }}>...</span>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
            {results.map(c => (
              <div
                key={c.id}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', border: '1px solid #E3E3E3', borderRadius: '8px', cursor: linking ? 'not-allowed' : 'pointer', background: 'white' }}
                onClick={() => !linking && handleLink(c.id)}
              >
                <Avatar name={c.name} photoUrl={c.profile_photo_url} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#003720', margin: 0 }}>{c.name}</p>
                  {c.company && <p style={{ fontSize: '11px', color: '#536471', margin: 0 }}>{c.company}</p>}
                </div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#79D65E', whiteSpace: 'nowrap' }}>
                  {linking ? '...' : 'Sí, este →'}
                </span>
              </div>
            ))}
          </div>
        )}

        {search.trim() && results.length === 0 && !searching && (
          <p style={{ fontSize: '12px', color: '#536471', textAlign: 'center', margin: '0 0 16px 0' }}>
            No se encontraron contactos con ese nombre
          </p>
        )}

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0' }}>
          <div style={{ flex: 1, height: '1px', background: '#E3E3E3' }} />
          <span style={{ fontSize: '11px', color: '#536471' }}>o</span>
          <div style={{ flex: 1, height: '1px', background: '#E3E3E3' }} />
        </div>

        <button
          onClick={() => setStep('new_contact_form')}
          style={{
            width: '100%',
            padding: '11px',
            background: '#003720',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          No, agregar como nuevo contacto →
        </button>

        <button
          onClick={onMapped}
          style={{ width: '100%', marginTop: '8px', fontSize: '12px', color: '#536471', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Omitir por ahora
        </button>
      </div>
    )
  }

  // ── STEP 2: New contact form ────────────────────────────────────────────────
  return (
    <div style={{ padding: '16px', background: 'white', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <button
        onClick={() => setStep('rethink_check')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#536471', fontSize: '13px', padding: '0 0 12px 0' }}
      >
        ← Volver
      </button>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '20px' }}>
        <Avatar name={newName || suggestedName} size={52} />
        <div>
          <p style={{ fontSize: '12px', color: '#536471', margin: '0 0 2px 0' }}>Nuevo contacto</p>
          <p style={{ fontSize: '15px', fontWeight: 600, color: '#003720', margin: 0 }}>{newName || suggestedName || phone}</p>
          <p style={{ fontSize: '12px', color: '#536471', margin: '2px 0 0 0' }}>💬 {phone}</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <label style={labelStyle}>Nombre</label>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Nombre completo"
            style={inputStyle}
            onFocus={e => (e.target.style.borderColor = '#003720')}
            onBlur={e => (e.target.style.borderColor = '#E3E3E3')}
          />
        </div>

        <div>
          <label style={labelStyle}>Categoría</label>
          <CategoryPicker value={category} onChange={setCategory} />
        </div>

        <div>
          <label style={labelStyle}>¿Cuál es tu contexto con esta persona?</label>
          <textarea
            value={context}
            onChange={e => setContext(e.target.value)}
            placeholder="¿Cómo la conociste? ¿Qué oportunidad ves? ¿Cuál es el objetivo de esta relación?"
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            onFocus={e => (e.target.style.borderColor = '#003720')}
            onBlur={e => (e.target.style.borderColor = '#E3E3E3')}
          />
        </div>

        <div>
          <label style={labelStyle}>LinkedIn (opcional)</label>
          <input
            type="text"
            value={linkedinInput}
            onChange={e => setLinkedinInput(e.target.value)}
            placeholder="linkedin.com/in/nombre"
            style={inputStyle}
            onFocus={e => (e.target.style.borderColor = '#003720')}
            onBlur={e => (e.target.style.borderColor = '#E3E3E3')}
          />
        </div>
      </div>

      <button
        onClick={handleCreateNew}
        disabled={!newName.trim() || saving}
        style={{
          width: '100%',
          marginTop: '20px',
          padding: '12px',
          background: newName.trim() && !saving ? '#003720' : '#E3E3E3',
          color: newName.trim() && !saving ? 'white' : '#536471',
          border: 'none',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 600,
          cursor: newName.trim() && !saving ? 'pointer' : 'not-allowed',
        }}
      >
        {saving ? 'Guardando...' : 'Agregar a reThink →'}
      </button>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  color: '#536471',
  display: 'block',
  marginBottom: '4px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}
