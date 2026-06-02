import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowSquareOut, Check, LinkSimple, MagnifyingGlass, PencilSimple, X } from '@phosphor-icons/react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import {
  acceptReviewItem,
  dismissReviewItem,
  REVIEW_TARGET_LABELS,
  REVIEW_TARGETS,
  type ReviewPayload,
} from '@/lib/reviewQueue'
import type { Contact, ReviewItem, ReviewStatus, ReviewTarget } from '@/types'

type Filter = 'pending' | 'reviewed' | 'all'

function prettyJson(value: Record<string, unknown>) {
  return JSON.stringify(value ?? {}, null, 2)
}

function sourceLabel(source: ReviewItem['source']) {
  return source === 'notion' ? 'Notion' : 'Conversations'
}

function statusClass(status: ReviewStatus) {
  if (status === 'accepted') return 'bg-gossip text-burnham'
  if (status === 'dismissed') return 'bg-mercury/60 text-shuttle'
  return 'bg-yellow-100 text-yellow-800'
}

export default function ReviewQueue() {
  const { user } = useAuth()
  const [items, setItems] = useState<ReviewItem[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [filter, setFilter] = useState<Filter>('pending')
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [draftPayloads, setDraftPayloads] = useState<Record<string, string>>({})
  const [draftTargets, setDraftTargets] = useState<Record<string, ReviewTarget>>({})
  const [draftContacts, setDraftContacts] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errorById, setErrorById] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [itemsRes, contactsRes] = await Promise.all([
      supabase
        .from('review_items')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('outreach_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('name'),
    ])
    const nextItems = (itemsRes.data ?? []) as ReviewItem[]
    setItems(nextItems)
    setContacts((contactsRes.data ?? []) as Contact[])
    setDraftPayloads(prev => {
      const next = { ...prev }
      for (const item of nextItems) if (!next[item.id]) next[item.id] = prettyJson(item.proposed_payload)
      return next
    })
    setDraftTargets(prev => {
      const next = { ...prev }
      for (const item of nextItems) if (!next[item.id]) next[item.id] = item.proposed_target
      return next
    })
    setDraftContacts(prev => {
      const next = { ...prev }
      for (const item of nextItems) if (!(item.id in next)) next[item.id] = item.contact_id ?? ''
      return next
    })
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter(item => {
      if (filter === 'pending' && item.status !== 'pending') return false
      if (filter === 'reviewed' && item.status === 'pending') return false
      if (!q) return true
      return `${item.title} ${item.body ?? ''} ${item.source}`.toLowerCase().includes(q)
    })
  }, [items, filter, query])

  const pendingCount = items.filter(i => i.status === 'pending').length

  const parsePayload = (item: ReviewItem): ReviewPayload | null => {
    try {
      const parsed = JSON.parse(draftPayloads[item.id] || '{}')
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Payload must be a JSON object.')
      setErrorById(prev => ({ ...prev, [item.id]: '' }))
      return parsed as ReviewPayload
    } catch (err) {
      setErrorById(prev => ({ ...prev, [item.id]: err instanceof Error ? err.message : 'Invalid JSON payload.' }))
      return null
    }
  }

  const accept = async (item: ReviewItem) => {
    const payload = parsePayload(item)
    if (!payload) return
    setBusyId(item.id)
    const target = draftTargets[item.id] ?? item.proposed_target
    const contactId = draftContacts[item.id] || null
    const result = await acceptReviewItem({ ...item, proposed_target: target }, payload, contactId)
    if (!result.ok) {
      setErrorById(prev => ({ ...prev, [item.id]: result.error ?? 'Could not accept item.' }))
    } else {
      await load()
    }
    setBusyId(null)
  }

  const dismiss = async (item: ReviewItem) => {
    setBusyId(item.id)
    const result = await dismissReviewItem(item)
    if (!result.ok) setErrorById(prev => ({ ...prev, [item.id]: result.error ?? 'Could not dismiss item.' }))
    else await load()
    setBusyId(null)
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <div className="sticky top-0 z-10 bg-white border-b border-mercury px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-midnight">Review Queue</h1>
            <p className="text-xs text-shuttle mt-0.5">
              {pendingCount} pending item{pendingCount === 1 ? '' : 's'} from Notion and Conversations
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(['pending', 'reviewed', 'all'] as Filter[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={[
                  'px-3 py-1.5 rounded-lg text-xs capitalize transition-colors',
                  filter === f ? 'bg-burnham text-gossip' : 'bg-white border border-mercury text-shuttle hover:bg-mercury/40',
                ].join(' ')}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 relative max-w-md">
          <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-shuttle/50" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search review items..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-mercury text-sm focus:outline-none focus:border-burnham bg-white"
          />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-5">
        {loading ? (
          <div className="py-16 text-center text-sm text-shuttle">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center bg-white border border-mercury rounded-lg">
            <p className="text-sm font-medium text-burnham">Nothing to review</p>
            <p className="text-xs text-shuttle mt-1">New Notion and Conversations suggestions will land here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(item => {
              const isPending = item.status === 'pending'
              const selectedContact = contacts.find(c => c.id === (draftContacts[item.id] || item.contact_id || ''))
              return (
                <article key={item.id} className="bg-white border border-mercury rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-mercury/70 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] uppercase tracking-widest text-shuttle/60 font-mono">{sourceLabel(item.source)}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusClass(item.status)}`}>{item.status}</span>
                        <span className="text-[10px] text-shuttle/40">{new Date(item.created_at).toLocaleDateString()}</span>
                      </div>
                      <h2 className="text-sm font-semibold text-midnight truncate">{item.title}</h2>
                      {item.body && <p className="text-xs text-shuttle mt-1 line-clamp-2">{item.body}</p>}
                    </div>
                    {item.source_url && (
                      <a
                        href={item.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 inline-flex items-center gap-1 text-xs text-burnham hover:underline"
                      >
                        <ArrowSquareOut size={13} /> Open source
                      </a>
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 p-4">
                    <div className="space-y-3">
                      <label className="block">
                        <span className="block text-[10px] uppercase tracking-widest text-shuttle/50 font-mono mb-1">Target</span>
                        <select
                          disabled={!isPending}
                          value={draftTargets[item.id] ?? item.proposed_target}
                          onChange={e => setDraftTargets(prev => ({ ...prev, [item.id]: e.target.value as ReviewTarget }))}
                          className="w-full text-xs border border-mercury rounded-lg px-2 py-2 bg-white focus:outline-none focus:border-burnham disabled:bg-mercury/20"
                        >
                          {REVIEW_TARGETS.map(target => (
                            <option key={target} value={target}>{REVIEW_TARGET_LABELS[target]}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="block text-[10px] uppercase tracking-widest text-shuttle/50 font-mono mb-1">Contact</span>
                        <select
                          disabled={!isPending}
                          value={draftContacts[item.id] ?? item.contact_id ?? ''}
                          onChange={e => setDraftContacts(prev => ({ ...prev, [item.id]: e.target.value }))}
                          className="w-full text-xs border border-mercury rounded-lg px-2 py-2 bg-white focus:outline-none focus:border-burnham disabled:bg-mercury/20"
                        >
                          <option value="">No contact linked</option>
                          {contacts.map(contact => (
                            <option key={contact.id} value={contact.id}>
                              {contact.name}{contact.company ? ` · ${contact.company}` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      {selectedContact && (
                        <div className="flex items-center gap-2 text-xs text-shuttle bg-[#FAFAFA] border border-mercury rounded-lg px-2 py-2">
                          <LinkSimple size={13} />
                          <span className="truncate">Merging into {selectedContact.name}</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <PencilSimple size={13} className="text-shuttle/50" />
                        <span className="text-[10px] uppercase tracking-widest text-shuttle/50 font-mono">Payload</span>
                      </div>
                      <textarea
                        disabled={!isPending}
                        value={draftPayloads[item.id] ?? prettyJson(item.proposed_payload)}
                        onChange={e => setDraftPayloads(prev => ({ ...prev, [item.id]: e.target.value }))}
                        rows={8}
                        spellCheck={false}
                        className="w-full rounded-lg border border-mercury bg-[#FCFCFC] px-3 py-2 font-mono text-xs text-midnight focus:outline-none focus:border-burnham disabled:bg-mercury/20"
                      />
                      {errorById[item.id] && (
                        <p className="mt-2 text-xs text-red-500">{errorById[item.id]}</p>
                      )}
                    </div>
                  </div>

                  {isPending && (
                    <div className="px-4 py-3 border-t border-mercury/70 bg-[#FAFAFA] flex justify-end gap-2">
                      <button
                        onClick={() => dismiss(item)}
                        disabled={busyId === item.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-mercury text-xs text-shuttle hover:bg-white disabled:opacity-50"
                      >
                        <X size={13} /> Dismiss
                      </button>
                      <button
                        onClick={() => accept(item)}
                        disabled={busyId === item.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-burnham text-gossip text-xs font-medium disabled:opacity-50"
                      >
                        <Check size={13} weight="bold" /> {busyId === item.id ? 'Accepting...' : 'Accept'}
                      </button>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
