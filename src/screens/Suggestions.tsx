import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarBlank,
  CheckCircle,
  ChatCircle,
  Handshake,
  NotePencil,
  Sparkle,
  Trash,
} from '@phosphor-icons/react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import {
  approveInteractionSuggestion,
  dismissInteractionSuggestion,
} from '@/lib/interactionSuggestions'
import type { Contact, InteractionSuggestion } from '@/types'

type Filter = 'pending' | 'reviewed' | 'all'

const TARGET_LABEL: Record<InteractionSuggestion['target'], string> = {
  todo: 'Todo',
  contact_fact: 'Fact',
  key_date: 'Important date',
  value_log: 'Value',
  intro: 'Intro',
  next_step: 'Next step',
}

function iconFor(target: InteractionSuggestion['target']) {
  if (target === 'todo' || target === 'next_step') return <CheckCircle size={13} />
  if (target === 'key_date') return <CalendarBlank size={13} />
  if (target === 'intro' || target === 'value_log') return <Handshake size={13} />
  if (target === 'contact_fact') return <NotePencil size={13} />
  return <Sparkle size={13} />
}

function shortDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function compact(value: string | null | undefined, max = 190) {
  const clean = (value ?? '').replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}…` : clean
}

export default function Suggestions() {
  const { user } = useAuth()
  const [items, setItems] = useState<InteractionSuggestion[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [filter, setFilter] = useState<Filter>('pending')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [suggestionsRes, contactsRes] = await Promise.all([
      supabase
        .from('interaction_suggestions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase.from('outreach_logs').select('*').eq('user_id', user.id).order('name'),
    ])
    setItems((suggestionsRes.data ?? []) as InteractionSuggestion[])
    setContacts((contactsRes.data ?? []) as Contact[])
    setError(suggestionsRes.error?.message ?? null)
    setLoading(false)
  }, [user])

  useEffect(() => { void load() }, [load])

  const contactsById = useMemo(() => new Map(contacts.map(contact => [contact.id, contact])), [contacts])
  const visible = useMemo(() => items.filter(item => {
    if (filter === 'pending') return item.status === 'pending'
    if (filter === 'reviewed') return item.status !== 'pending'
    return true
  }), [filter, items])
  const pendingCount = items.filter(item => item.status === 'pending').length

  const grouped = useMemo(() => {
    const map = new Map<InteractionSuggestion['target'], InteractionSuggestion[]>()
    for (const item of visible) {
      const arr = map.get(item.target) ?? []
      arr.push(item)
      map.set(item.target, arr)
    }
    return [...map.entries()]
  }, [visible])

  async function approve(item: InteractionSuggestion) {
    setBusyId(item.id)
    const result = await approveInteractionSuggestion(item)
    setBusyId(null)
    if (!result.ok) {
      setError(result.error ?? 'Could not approve suggestion.')
      return
    }
    await load()
  }

  async function dismiss(item: InteractionSuggestion) {
    setBusyId(item.id)
    const result = await dismissInteractionSuggestion(item)
    setBusyId(null)
    if (!result.ok) {
      setError(result.error ?? 'Could not dismiss suggestion.')
      return
    }
    await load()
  }

  async function approveAll() {
    for (const item of visible.filter(row => row.status === 'pending')) {
      const result = await approveInteractionSuggestion(item)
      if (!result.ok) {
        setError(result.error ?? 'Could not approve all suggestions.')
        break
      }
    }
    await load()
  }

  return (
    <div className="ppl-page rv-page">
      <header className="rv-hd">
        <div className="rv-hd-l">
          <h1 className="ppl-title">Suggestions</h1>
          <p className="ppl-sub">AI-proposed actions from WhatsApp and LinkedIn interactions. Approve only what should become structured reThink data.</p>
        </div>
        <div className="rv-kpi" title="Pending suggestions">
          <Sparkle size={15} />
          <span className="rv-kpi-num"><b>{pendingCount}</b>/{items.length || 0}</span>
          <span className="rv-kpi-lbl">pending</span>
        </div>
      </header>

      <div className="rv-panel">
        <div className="rv-toolbar">
          <div className="rv-stats">
            <span className="rv-stat"><b>{visible.length}</b> suggestions</span>
            <span className="rv-stat"><b>{new Set(visible.map(item => item.contact_id).filter(Boolean)).size}</b> contacts</span>
          </div>
          <span className="rv-tb-grow" />
          <div className="rv-seg">
            {(['pending', 'reviewed', 'all'] as Filter[]).map(next => (
              <button key={next} className={`rv-segbtn${filter === next ? ' on' : ''}`} onClick={() => setFilter(next)}>
                {next === 'pending' ? 'Pending' : next === 'reviewed' ? 'Reviewed' : 'All'}
                {next === 'pending' && pendingCount > 0 && <span className="rv-seg-n">{pendingCount}</span>}
              </button>
            ))}
          </div>
          <button className="crm-tool primary rv-approveall" onClick={approveAll} disabled={pendingCount === 0}>
            <CheckCircle size={13} /> Approve all
          </button>
        </div>

        {error && <div className="rv-error">{error}</div>}

        <div className="rv-scroll">
          {loading && <div className="rv-empty"><Sparkle size={22} /><span>Loading suggestions...</span></div>}
          {!loading && grouped.length === 0 && <div className="rv-empty"><CheckCircle size={22} /><span>No suggestions here.</span></div>}

          {grouped.map(([target, rows]) => (
            <div className="rv-block open" key={target}>
              <div className="rv-day-hd">
                <span>{iconFor(target)} {TARGET_LABEL[target]}</span>
                <em>{rows.length}</em>
              </div>
              <div className="rv-day-items">
                {rows.map(item => {
                  const contact = item.contact_id ? contactsById.get(item.contact_id) : null
                  const sourceChannel = String(item.payload?.channel ?? '').toLowerCase()
                  const source = sourceChannel.includes('linkedin') ? 'LinkedIn interaction' : sourceChannel.includes('whatsapp') ? 'WhatsApp interaction' : 'Interaction'
                  return (
                    <div className={`rv-item ${item.status !== 'pending' ? 'done' : ''}`} key={item.id}>
                      <span className="rv-datum-ic">{iconFor(item.target)}</span>
                      <span className="rv-item-main">
                        <strong>{item.title}</strong>
                        <span>{compact(item.body) || compact(String(item.payload?.description ?? item.payload?.text ?? ''))}</span>
                        <em>
                          <ChatCircle size={11} /> {source} · {shortDate(item.created_at)}
                          {contact ? ` · ${contact.name}` : ''}
                          {item.confidence ? ` · ${item.confidence}` : ''}
                        </em>
                      </span>
                      <span className="rv-item-actions">
                        {item.status === 'pending' ? (
                          <>
                            <button className="rv-id-link" disabled={busyId === item.id} onClick={() => void approve(item)}>Approve</button>
                            <button className="rv-omit" disabled={busyId === item.id} onClick={() => void dismiss(item)}><Trash size={12} /></button>
                          </>
                        ) : (
                          <span className={`rv-stpill ${item.status === 'approved' ? 'approved' : 'omitted'}`}><span className="dot" /> {item.status}</span>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
