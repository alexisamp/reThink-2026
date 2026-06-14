import { useEffect, useRef, useState } from 'react'
import {
  At, Briefcase, Buildings, CaretDown, IdentificationCard, LinkedinLogo,
  MapPin, NotePencil, Plus, UserPlus, X,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { Contact, ContactCategory, ContactStatus, Goal } from '@/types'
import type { ContactInput } from '@/hooks/useContacts'
import { CATEGORY_LABELS } from '@/lib/funnelDefaults'

type ReferrerResult = Pick<Contact, 'id' | 'name' | 'company' | 'profile_photo_url'>

interface NewPersonPeekProps {
  open: boolean
  userId: string | null
  goals: Pick<Goal, 'id' | 'text' | 'alias'>[]
  onClose: () => void
  onSave: (input: ContactInput, todoText?: string | null) => Promise<void>
}

const STATUS_OPTIONS: { value: ContactStatus; label: string }[] = [
  { value: 'PROSPECT', label: 'Prospect' },
  { value: 'INTRO', label: 'Intro' },
  { value: 'CONNECTED', label: 'Connected' },
  { value: 'RECONNECT', label: 'Reconnect' },
  { value: 'ENGAGED', label: 'Engaged' },
  { value: 'NURTURING', label: 'Nurturing' },
  { value: 'DORMANT', label: 'Dormant' },
]

const CATEGORY_OPTIONS: { value: ContactCategory; label: string }[] = (
  Object.entries(CATEGORY_LABELS) as [ContactCategory, string][]
).map(([value, label]) => ({ value, label }))

function normalizeLinkedinUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('http')) return trimmed
  if (!trimmed.includes('/')) return `https://linkedin.com/in/${trimmed}`
  if (trimmed.startsWith('linkedin.com') || trimmed.startsWith('www.linkedin.com')) return `https://${trimmed}`
  return trimmed
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || '?'
}

export default function NewPersonPeek({ open, userId, goals, onClose, onSave }: NewPersonPeekProps) {
  const [name, setName] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [company, setCompany] = useState('')
  const [location, setLocation] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [goalId, setGoalId] = useState('')
  const [category, setCategory] = useState<ContactCategory>('peer')
  const [status, setStatus] = useState<ContactStatus>('PROSPECT')
  const [referredBy, setReferredBy] = useState<ReferrerResult | null>(null)
  const [referrerQuery, setReferrerQuery] = useState('')
  const [referrerResults, setReferrerResults] = useState<ReferrerResult[]>([])
  const [referrerSearching, setReferrerSearching] = useState(false)
  const [todoText, setTodoText] = useState('')
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState(false)
  const nameRef = useRef<HTMLInputElement | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setLinkedinUrl('')
    setJobTitle('')
    setCompany('')
    setLocation('')
    setEmail('')
    setNotes('')
    setGoalId('')
    setCategory('peer')
    setStatus('PROSPECT')
    setReferredBy(null)
    setReferrerQuery('')
    setReferrerResults([])
    setTodoText('')
    setSaving(false)
    setNameError(false)
    setTimeout(() => nameRef.current?.focus(), 80)
  }, [open])

  useEffect(() => {
    if (!open || referredBy) return
    const query = referrerQuery.trim()
    if (query.length < 2 || !userId) {
      setReferrerResults([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setReferrerSearching(true)
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('outreach_logs')
        .select('id, name, company, profile_photo_url')
        .eq('user_id', userId)
        .ilike('name', `%${query}%`)
        .limit(6)
      setReferrerResults((data ?? []) as ReferrerResult[])
      setReferrerSearching(false)
    }, 220)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [open, referredBy, referrerQuery, userId])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, open])

  const save = async () => {
    if (!name.trim()) {
      setNameError(true)
      return
    }
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        linkedin_url: normalizeLinkedinUrl(linkedinUrl) || null,
        job_title: jobTitle.trim() || null,
        company: company.trim() || null,
        location: location.trim() || null,
        email: email.trim() || null,
        notes: notes.trim() || null,
        goal_id: goalId || null,
        category,
        status,
        referred_by: referredBy?.id ?? null,
      }, todoText.trim() || null)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <>
      <div className="peek-bg" onClick={onClose} />
      <aside className="peek" role="dialog" aria-label="New person">
        <div className="peek-topbar">
          <button className="peek-x" onClick={onClose} aria-label="Close"><X size={14} /></button>
          <span className="peek-pos">New person</span>
          <span className="spk-top-grow" />
          <button className="spk-use" onClick={save} disabled={saving}>
            <Plus size={12} /> {saving ? 'Saving...' : 'Create'}
          </button>
        </div>

        <div className="peek-split">
          <aside className="peek-left">
            <div className="peek-id">
              <div className="peek-avatar"><span className="peek-avatar-fallback">{initials(name || 'New person')}</span></div>
              <div className="peek-id-txt">
                <span className="peek-type">Person</span>
                <h1 className="peek-name">{name || 'Untitled person'}</h1>
                <p className="peek-sub">{[jobTitle, company].filter(Boolean).join(' · ') || 'Create a relationship record'}</p>
              </div>
            </div>

            <div className="peek-actions">
              <button className="peek-primary" onClick={save} disabled={saving}><Plus size={13} /> Create person</button>
              <button className="peek-icn sq" aria-label="LinkedIn"><LinkedinLogo size={13} /></button>
              <button className="peek-icn sq" aria-label="Note"><NotePencil size={13} /></button>
            </div>

            <div className="peek-section">
              <div className="peek-section-hd"><span>Record details</span><button className="peek-icn"><CaretDown size={12} /></button></div>
              <div className="peek-fields">
                <div className="peek-field">
                  <span className="pf-label"><IdentificationCard size={12} /> Name</span>
                  <span className="pf-value"><input ref={nameRef} className="peek-inline-input" value={name} onChange={e => { setName(e.target.value); setNameError(false) }} placeholder="Full name" /></span>
                </div>
                {nameError && <p className="spk-empty">Name is required.</p>}
                <div className="peek-field">
                  <span className="pf-label"><At size={12} /> Email</span>
                  <span className="pf-value"><input className="peek-inline-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@company.com" /></span>
                </div>
                <div className="peek-field">
                  <span className="pf-label"><Buildings size={12} /> Company</span>
                  <span className="pf-value"><input className="peek-inline-input" value={company} onChange={e => setCompany(e.target.value)} placeholder="Company" /></span>
                </div>
                <div className="peek-field">
                  <span className="pf-label"><Briefcase size={12} /> Role</span>
                  <span className="pf-value"><input className="peek-inline-input" value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="Set role..." /></span>
                </div>
                <div className="peek-field">
                  <span className="pf-label"><MapPin size={12} /> Location</span>
                  <span className="pf-value"><input className="peek-inline-input" value={location} onChange={e => setLocation(e.target.value)} placeholder="City" /></span>
                </div>
              </div>
            </div>

            <div className="peek-section">
              <div className="peek-section-hd"><span>Lists</span><button className="peek-icn"><CaretDown size={12} /></button></div>
              <div className="peek-lists">
                <span className="spk-chip">Network</span>
                <span className="spk-chip">{status}</span>
              </div>
            </div>
          </aside>

          <section className="peek-main">
            <div className="peek-tabs">
              <button className="peek-tab active">Overview</button>
            </div>
            <div className="peek-scroll">
              <div className="peek-body">
                <div className="peek-block-label spaced">Relationship setup</div>
                <div className="peek-fields">
                  <div className="peek-field">
                    <span className="pf-label"><LinkedinLogo size={12} /> LinkedIn</span>
                    <span className="pf-value"><input className="peek-inline-input" value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} placeholder="linkedin.com/in/..." /></span>
                  </div>
                  <div className="peek-field">
                    <span className="pf-label">Category</span>
                    <span className="pf-value">
                      <select className="peek-inline-input" value={category} onChange={e => setCategory(e.target.value as ContactCategory)}>
                        {CATEGORY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </span>
                  </div>
                  <div className="peek-field">
                    <span className="pf-label">Status</span>
                    <span className="pf-value">
                      <select className="peek-inline-input" value={status} onChange={e => setStatus(e.target.value as ContactStatus)}>
                        {STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </span>
                  </div>
                  <div className="peek-field">
                    <span className="pf-label">Goal</span>
                    <span className="pf-value">
                      <select className="peek-inline-input" value={goalId} onChange={e => setGoalId(e.target.value)}>
                        <option value="">No goal linked</option>
                        {goals.map(goal => <option key={goal.id} value={goal.id}>{goal.alias ?? goal.text?.slice(0, 42)}</option>)}
                      </select>
                    </span>
                  </div>
                </div>

                <div className="peek-block-label spaced">Introduced by</div>
                {referredBy ? (
                  <div className="pk-person">
                    <span className="crm-av" style={{ width: 28, height: 28, fontSize: 11 }}>
                      {referredBy.profile_photo_url ? <img src={referredBy.profile_photo_url} alt="" /> : initials(referredBy.name)}
                    </span>
                    <span className="pk-person-txt">
                      <span className="pk-person-name">{referredBy.name}</span>
                      <span className="pk-person-role">{referredBy.company || 'Network'}</span>
                    </span>
                    <button className="peek-icn" onClick={() => setReferredBy(null)}><X size={12} /></button>
                  </div>
                ) : (
                  <div className="peek-fields">
                    <div className="peek-field wide">
                      <span className="pf-label"><UserPlus size={12} /> Search</span>
                      <span className="pf-value"><input className="peek-inline-input" value={referrerQuery} onChange={e => setReferrerQuery(e.target.value)} placeholder="Who introduced you?" /></span>
                    </div>
                  </div>
                )}
                {!referredBy && referrerQuery.trim().length >= 2 && (
                  <div className="peek-linked">
                    {referrerSearching ? <p className="spk-empty">Searching...</p> : referrerResults.map(result => (
                      <button className="pk-person clickable" key={result.id} onClick={() => { setReferredBy(result); setReferrerQuery(''); setReferrerResults([]) }}>
                        <span className="crm-av" style={{ width: 26, height: 26, fontSize: 10 }}>
                          {result.profile_photo_url ? <img src={result.profile_photo_url} alt="" /> : initials(result.name)}
                        </span>
                        <span className="pk-person-txt">
                          <span className="pk-person-name">{result.name}</span>
                          <span className="pk-person-role">{result.company || 'Network'}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="peek-block-label spaced">Notes</div>
                <textarea className="spk-edit-textarea" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Useful context, source, or why this person matters..." />

                <div className="peek-block-label spaced">Create a Today todo</div>
                <div className="peek-fields">
                  <div className="peek-field wide">
                    <span className="pf-label"><Plus size={12} /> Todo</span>
                    <span className="pf-value"><input className="peek-inline-input" value={todoText} onChange={e => setTodoText(e.target.value)} placeholder="Optional next move" /></span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </aside>
    </>
  )
}
