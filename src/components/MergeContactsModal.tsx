/**
 * MergeContactsModal — side-by-side preview before merging two contacts.
 *
 * Rule: survivor keeps its non-null fields; duplicate fills in the gaps
 * (WhatsApp context privileged, LinkedIn is supplement). All FKs
 * (interactions, channels, milestones, value_logs, todos, opportunities)
 * reassigned to survivor server-side via the merge_contacts RPC.
 *
 * Auto-suggests as survivor the row with:
 *   1. a phone (likely the WA-originated row)
 *   2. more interactions (heavier history)
 *   3. else: contactA (first selected)
 *
 * User can flip survivor via the "Keep this one" button on either card.
 */
import { useEffect, useMemo, useState } from 'react'
import { X, ArrowsLeftRight, WhatsappLogo, LinkedinLogo } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { Contact } from '@/types'

interface MergeContactsModalProps {
  contactA: Contact
  contactB: Contact
  onClose: () => void
  onMerge: (survivorId: string, duplicateId: string) => Promise<{ ok: true } | { ok: false; error: string }>
}

function daysSince(ts: string | null): number | null {
  if (!ts) return null
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
}

function formatAgo(d: number | null): string {
  if (d === null) return '—'
  if (d === 0) return 'Today'
  if (d === 1) return '1d ago'
  if (d < 7) return `${d}d ago`
  if (d < 30) return `${Math.floor(d / 7)}w ago`
  if (d < 365) return `${Math.floor(d / 30)}mo ago`
  return `${Math.floor(d / 365)}y ago`
}

export default function MergeContactsModal({
  contactA,
  contactB,
  onClose,
  onMerge,
}: MergeContactsModalProps) {
  // Load per-contact stats so the user can tell which is the "heavier" row
  const [stats, setStats] = useState<Record<string, { interactions: number; channels: Array<string> }>>({})
  const [survivorId, setSurvivorId] = useState<string>('')
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const ids = [contactA.id, contactB.id]
      const [{ data: intRows }, { data: chRows }] = await Promise.all([
        supabase.from('interactions').select('contact_id').in('contact_id', ids),
        supabase.from('contact_channels').select('outreach_log_id, channel').in('outreach_log_id', ids),
      ])
      if (cancelled) return
      const next: Record<string, { interactions: number; channels: Array<string> }> = {
        [contactA.id]: { interactions: 0, channels: [] },
        [contactB.id]: { interactions: 0, channels: [] },
      }
      ;(intRows ?? []).forEach((r) => {
        const id = (r as { contact_id: string }).contact_id
        if (next[id]) next[id].interactions++
      })
      ;(chRows ?? []).forEach((r) => {
        const row = r as { outreach_log_id: string; channel: string }
        if (next[row.outreach_log_id]) next[row.outreach_log_id].channels.push(row.channel)
      })
      setStats(next)

      // Auto-suggest survivor: phone > more interactions > contactA
      const aHasPhone = !!contactA.phone || next[contactA.id].channels.includes('whatsapp')
      const bHasPhone = !!contactB.phone || next[contactB.id].channels.includes('whatsapp')
      if (aHasPhone && !bHasPhone) setSurvivorId(contactA.id)
      else if (bHasPhone && !aHasPhone) setSurvivorId(contactB.id)
      else if (next[contactA.id].interactions > next[contactB.id].interactions) setSurvivorId(contactA.id)
      else if (next[contactB.id].interactions > next[contactA.id].interactions) setSurvivorId(contactB.id)
      else setSurvivorId(contactA.id)
    })()
    return () => { cancelled = true }
  }, [contactA, contactB])

  // Escape closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !merging) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, merging])

  const duplicateId = useMemo(
    () => (survivorId === contactA.id ? contactB.id : contactA.id),
    [survivorId, contactA, contactB],
  )
  const survivor = survivorId === contactA.id ? contactA : contactB
  const duplicate = survivorId === contactA.id ? contactB : contactA

  const fieldsFilledFromDuplicate = useMemo(() => {
    const fields: Array<[keyof Contact, string]> = [
      ['linkedin_url', 'LinkedIn URL'],
      ['job_title', 'Job title'],
      ['company', 'Company'],
      ['location', 'Location'],
      ['about', 'About'],
      ['profile_photo_url', 'Photo'],
      ['email', 'Email'],
      ['phone', 'Phone'],
      ['personal_context', 'Personal context'],
      ['category', 'Category'],
      ['tier', 'Tier'],
      ['referred_by', 'Introduced by'],
    ]
    return fields.filter(([k]) => {
      const s = (survivor as unknown as Record<string, unknown>)[k as string]
      const d = (duplicate as unknown as Record<string, unknown>)[k as string]
      return (s === null || s === undefined || s === '') && d !== null && d !== undefined && d !== ''
    })
  }, [survivor, duplicate])

  const handleMerge = async () => {
    if (!survivorId) return
    setMerging(true)
    setError(null)
    const result = await onMerge(survivorId, duplicateId)
    setMerging(false)
    if (result.ok) onClose()
    else setError(result.error)
  }

  const renderCard = (c: Contact, isSurvivor: boolean) => {
    const s = stats[c.id]
    return (
      <div
        className={`flex-1 border rounded-xl p-4 transition-all ${
          isSurvivor ? 'border-pastel bg-pastel/5' : 'border-mercury bg-white'
        }`}
      >
        <div className="flex items-start gap-3 mb-3">
          {c.profile_photo_url ? (
            <img src={c.profile_photo_url} alt={c.name} className="w-10 h-10 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-burnham/10 flex items-center justify-center shrink-0">
              <span className="text-base font-semibold text-burnham">{c.name.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-burnham truncate">{c.name}</p>
            {c.company && <p className="text-[11px] text-shuttle/70 truncate">{c.job_title ?? '—'} · {c.company}</p>}
            {c.location && <p className="text-[11px] text-shuttle/50 truncate">{c.location}</p>}
          </div>
          {isSurvivor && (
            <span className="text-[9px] font-semibold bg-pastel text-burnham px-1.5 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap">
              Keep
            </span>
          )}
        </div>

        {/* Stats */}
        <div className="space-y-1 mb-3 text-[11px] font-mono text-shuttle/70">
          <div className="flex justify-between"><span>Interactions</span><span className="text-burnham font-semibold">{s?.interactions ?? '…'}</span></div>
          <div className="flex justify-between"><span>Last contact</span><span>{formatAgo(daysSince(c.last_interaction_at))}</span></div>
          <div className="flex justify-between"><span>Health</span><span>{c.health_score ?? '—'}/10</span></div>
          <div className="flex justify-between">
            <span>Channels</span>
            <span className="flex items-center gap-1">
              {s?.channels.includes('whatsapp') && <WhatsappLogo size={11} className="text-green-500" />}
              {s?.channels.includes('linkedin') && <LinkedinLogo size={11} className="text-blue-500" />}
              {(s?.channels.length ?? 0) === 0 && <span className="text-shuttle/40">none</span>}
            </span>
          </div>
          {c.tier && <div className="flex justify-between"><span>Tier</span><span>T{c.tier}</span></div>}
          {c.phone && <div className="flex justify-between"><span>Phone</span><span className="truncate max-w-[120px]">{c.phone}</span></div>}
          {c.linkedin_url && <div className="flex justify-between"><span>LinkedIn</span><span className="truncate max-w-[120px] text-blue-600">✓</span></div>}
        </div>

        {!isSurvivor && (
          <button
            onClick={() => setSurvivorId(c.id)}
            disabled={merging}
            className="w-full text-[11px] font-medium text-shuttle hover:text-burnham border border-mercury hover:border-burnham/40 rounded-lg py-1.5 transition-colors"
          >
            Keep this one instead
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-burnham/20 backdrop-blur-[2px] p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !merging) onClose() }}
    >
      <div className="bg-white border border-mercury rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-mercury shrink-0">
          <div>
            <p className="text-[10px] font-semibold text-burnham uppercase tracking-widest">Merge contacts</p>
            <p className="text-[11px] text-shuttle/60 mt-0.5">The kept row absorbs interactions, channels, todos, and fills missing fields from the other.</p>
          </div>
          <button onClick={onClose} disabled={merging} className="text-shuttle/40 hover:text-burnham transition-colors p-0.5">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex items-stretch gap-3 mb-4">
            {renderCard(contactA, survivorId === contactA.id)}
            <div className="flex items-center justify-center text-shuttle/40 shrink-0">
              <ArrowsLeftRight size={18} />
            </div>
            {renderCard(contactB, survivorId === contactB.id)}
          </div>

          {/* What gets filled */}
          {fieldsFilledFromDuplicate.length > 0 && (
            <div className="bg-gossip/20 border border-mercury rounded-lg p-3">
              <p className="text-[10px] font-semibold text-shuttle uppercase tracking-wide mb-1">
                Fields filled from the other row
              </p>
              <p className="text-[11px] text-shuttle/70 leading-snug">
                {fieldsFilledFromDuplicate.map(([, label]) => label).join(' · ')}
              </p>
            </div>
          )}

          <p className="text-[10px] text-shuttle/50 mt-3 font-mono">
            This action cannot be undone. Check the preview above before confirming.
          </p>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-mercury flex items-center justify-between bg-white">
          {error ? (
            <span className="text-[11px] text-red-500">Error: {error}</span>
          ) : (
            <span className="text-[11px] text-shuttle/50">
              {survivor.name} will absorb {duplicate.name}
            </span>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={merging}
              className="text-[12px] font-medium text-shuttle/60 hover:text-shuttle px-3 py-1.5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleMerge}
              disabled={merging || !survivorId}
              className="bg-burnham hover:bg-burnham/90 disabled:opacity-40 text-white text-[12px] font-medium px-4 py-1.5 rounded-lg transition-colors"
            >
              {merging ? 'Merging…' : 'Confirm merge'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
