import { useState } from 'react'
import {
  ArrowDownLeft, ArrowUpRight, CheckSquare, ChatCircle, Copy, Info, Scales, X,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { Contact, Interaction } from '@/types'

interface ConversationsDrawerProps {
  open: boolean
  userId: string
  contact: Contact | null
  channel?: Interaction['channel']
  context?: string
  onClose: () => void
  onCreated?: () => void
}

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function ConversationsDrawer({
  open,
  userId,
  contact,
  channel = 'other',
  context,
  onClose,
  onCreated,
}: ConversationsDrawerProps) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  if (!open || !contact) return null

  const opener = draft || `Hi ${contact.name.split(' ')[0]}, thought of you because ${context || 'there is something worth following up on'}.`

  const create = async (kind: 'interaction' | 'gave' | 'got' | 'todo' | 'fact') => {
    setBusy(true)
    setDone(null)
    const body = draft.trim() || context || `Follow up with ${contact.name}`
    if (kind === 'interaction') {
      await supabase.from('interactions').insert({
        user_id: userId,
        contact_id: contact.id,
        type: channel === 'email' ? 'email' : channel === 'call' ? 'call' : channel === 'in_person' ? 'in_person' : channel === 'linkedin' ? 'linkedin_msg' : 'whatsapp',
        direction: 'outbound',
        notes: body,
        interaction_date: today(),
        channel,
      })
      await supabase.from('outreach_logs').update({ last_interaction_at: new Date().toISOString() }).eq('id', contact.id).eq('user_id', userId)
      setDone('conversation logged')
    }
    if (kind === 'gave' || kind === 'got') {
      await supabase.from('value_logs').insert({
        user_id: userId,
        outreach_log_id: contact.id,
        type: 'other',
        description: body,
        date: today(),
        direction: kind === 'gave' ? 'given' : 'received',
      })
      setDone(kind === 'gave' ? 'value given' : 'value received')
    }
    if (kind === 'todo') {
      await supabase.from('todos').insert({
        user_id: userId,
        contact_id: contact.id,
        text: body,
        date: today(),
      })
      setDone('follow-up added to Today')
    }
    if (kind === 'fact') {
      await supabase.from('contact_facts').insert({
        user_id: userId,
        contact_id: contact.id,
        category: 'other',
        value: body,
        source: 'manual',
      })
      setDone('fact saved')
    }
    setBusy(false)
    onCreated?.()
  }

  const copy = async () => {
    await navigator.clipboard.writeText(opener)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="fixed inset-0 z-[190]">
      <button className="absolute inset-0 cursor-default bg-burnham/10" onClick={onClose} aria-label="Close conversation drawer" />
      <aside className="absolute right-0 top-0 flex h-full w-[420px] max-w-[94vw] flex-col border-l border-mercury bg-white shadow-[var(--shadow-pop)]">
        <header className="flex items-start gap-3 border-b border-mercury/70 bg-gossip/20 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-burnham text-sm font-semibold text-white">
            {contact.profile_photo_url ? <img src={contact.profile_photo_url} alt="" className="h-full w-full rounded-full object-cover" /> : contact.name[0]}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold text-burnham">{contact.name}</h2>
            <p className="mt-1 line-clamp-2 text-[11px] text-shuttle">{context || contact.company || 'Relationship action'}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-shuttle hover:bg-mercury/40 hover:text-burnham"><X size={14} /></button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="mb-4 rounded-lg border border-mercury bg-[#FAFAFA] px-3 py-2">
            <div className="mb-2 flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-shuttle/50">
              <ChatCircle size={12} />
              Capture
              {done && <span className="ml-auto normal-case tracking-normal text-burnham">{done}</span>}
            </div>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={4}
              placeholder="Write the note, value, fact, or follow-up..."
              className="w-full resize-none rounded-lg border border-mercury bg-white px-3 py-2 text-[12px] text-burnham outline-none focus:border-burnham/40"
            />
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <button disabled={busy} onClick={() => create('interaction')} className="td-mini-btn justify-center"><ChatCircle size={12} /> Log convo</button>
              <button disabled={busy} onClick={() => create('gave')} className="td-mini-btn justify-center"><ArrowUpRight size={12} /> Gave</button>
              <button disabled={busy} onClick={() => create('got')} className="td-mini-btn justify-center"><ArrowDownLeft size={12} /> Got</button>
              <button disabled={busy} onClick={() => create('todo')} className="td-mini-btn justify-center"><CheckSquare size={12} /> Follow-up</button>
              <button disabled={busy} onClick={() => create('fact')} className="td-mini-btn justify-center"><Info size={12} /> Fact</button>
              <button disabled={busy} onClick={() => create('gave')} className="td-mini-btn justify-center"><Scales size={12} /> Value</button>
            </div>
          </div>

          <div className="rounded-lg border border-mercury bg-white px-3 py-2">
            <div className="mb-2 font-mono text-[9px] uppercase tracking-widest text-shuttle/50">Suggested opener</div>
            <textarea
              value={opener}
              onChange={e => setDraft(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-lg border border-mercury bg-[#FAFAFA] px-3 py-2 text-[12px] text-burnham outline-none focus:border-burnham/40"
            />
            <button onClick={copy} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-burnham px-3 py-1.5 text-[11px] font-medium text-white">
              <Copy size={12} />
              {copied ? 'Copied' : 'Copy opener'}
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}
