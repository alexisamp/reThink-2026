/**
 * PeopleFocus — the "manager view": a daily relationship brief inside People.
 *
 * People-primary, opportunities secondary. Ranks who to talk to today using the
 * shared useRelationshipBrief hook, and shows Jacob's single KPI (conversations
 * this week vs target). Each row links to the person's detail hub.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Lightning, Cake, Scales, ClockCountdown, ArrowsClockwise,
  Target, CaretRight, Minus, Plus,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useRelationshipBrief, type BriefItem, type BriefReason } from '@/hooks/useRelationshipBrief'
import { useUserSettings } from '@/lib/userSettings'
import type { Opportunity } from '@/types'

const REASON_TONE: Record<BriefReason, { text: string; bg: string }> = {
  overdue_next_step: { text: 'text-red-500', bg: 'bg-red-50' },
  cadence_overdue: { text: 'text-red-500', bg: 'bg-red-50' },
  value_owe: { text: 'text-red-500', bg: 'bg-red-50' },
  upcoming_next_step: { text: 'text-amber-600', bg: 'bg-amber-50' },
  cadence_due_soon: { text: 'text-amber-600', bg: 'bg-amber-50' },
  birthday_upcoming: { text: 'text-pastel', bg: 'bg-pastel/15' },
  mis_tiered: { text: 'text-shuttle', bg: 'bg-mercury/30' },
}

function ReasonIcon({ reason }: { reason: BriefReason }) {
  switch (reason) {
    case 'birthday_upcoming': return <Cake size={11} weight="bold" />
    case 'value_owe': return <Scales size={11} weight="bold" />
    case 'mis_tiered': return <ArrowsClockwise size={11} weight="bold" />
    case 'overdue_next_step':
    case 'upcoming_next_step': return <ClockCountdown size={11} weight="bold" />
    default: return <Lightning size={11} weight="bold" />
  }
}

function BriefRow({ item, onClick }: { item: BriefItem; onClick: () => void }) {
  const initials = item.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-mercury/10 border-b border-mercury/40 text-left transition-colors"
    >
      <span className="w-8 h-8 rounded-full bg-mercury/40 flex items-center justify-center text-[11px] font-medium text-shuttle overflow-hidden shrink-0">
        {item.avatar ? <img src={item.avatar} alt="" className="w-full h-full object-cover" /> : initials || '?'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium text-midnight truncate">{item.name}</span>
          {item.tier && (
            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-burnham/10 text-burnham shrink-0">T{item.tier}</span>
          )}
        </div>
        {item.company && <p className="text-[11px] text-shuttle/60 truncate">{item.company}</p>}
      </div>
      {/* reason chips (primary + up to one more) */}
      <div className="flex items-center gap-1 shrink-0">
        {item.reasons.slice(0, 2).map(r => {
          const tone = REASON_TONE[r]
          return (
            <span key={r} className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${tone.text} ${tone.bg}`}>
              <ReasonIcon reason={r} />
              {r === item.primaryReason && item.primaryReason === 'cadence_overdue' && item.daysSinceContact != null
                ? `${item.daysSinceContact}d cold`
                : r === 'birthday_upcoming' && item.birthdayInDays != null
                  ? `🎂 ${item.birthdayInDays}d`
                  : { overdue_next_step: 'Overdue', upcoming_next_step: 'Due', cadence_overdue: 'Cold', cadence_due_soon: 'Cooling', birthday_upcoming: 'Birthday', value_owe: 'You owe', mis_tiered: 'Re-tier' }[r]}
            </span>
          )
        })}
      </div>
      <CaretRight size={12} className="text-mercury shrink-0" />
    </button>
  )
}

export default function PeopleFocus({ userId }: { userId: string | null }) {
  const navigate = useNavigate()
  const { items, loading, convThisWeek, oweCount } = useRelationshipBrief(userId)
  const [settings, updateSettings] = useUserSettings()
  const target = settings.crmWeeklyConvTarget
  const [opps, setOpps] = useState<Opportunity[]>([])

  useEffect(() => {
    if (!userId) return
    supabase
      .from('opportunities')
      .select('*, company:companies(*)')
      .eq('user_id', userId)
      .in('stage', ['active', 'negotiating'])
      .order('target_date', { ascending: true, nullsFirst: false })
      .then(({ data }) => setOpps((data ?? []) as Opportunity[]))
  }, [userId])

  const convPct = target > 0 ? Math.min(100, Math.round((convThisWeek / target) * 100)) : 0

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* ── KPI bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 bg-white border border-mercury rounded-xl px-4 py-3">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-widest text-shuttle/50">Conversations this week</span>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-midnight tabular-nums">{convThisWeek} / {target}</span>
              <div className="flex items-center gap-0.5">
                <button onClick={() => updateSettings({ crmWeeklyConvTarget: Math.max(1, target - 1) })} className="p-0.5 text-shuttle/50 hover:text-burnham" title="Lower target"><Minus size={11} /></button>
                <button onClick={() => updateSettings({ crmWeeklyConvTarget: target + 1 })} className="p-0.5 text-shuttle/50 hover:text-burnham" title="Raise target"><Plus size={11} /></button>
              </div>
            </div>
          </div>
          <div className="h-1.5 bg-mercury/40 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${convThisWeek >= target ? 'bg-pastel' : 'bg-burnham'}`} style={{ width: `${convPct}%` }} />
          </div>
        </div>
        {oweCount > 0 && (
          <div className="flex flex-col items-center border-l border-mercury pl-4">
            <span className="text-[18px] font-semibold text-red-400 leading-none">{oweCount}</span>
            <span className="text-[10px] text-shuttle/60 mt-0.5">you owe</span>
          </div>
        )}
      </div>

      {/* ── Active opportunities (secondary) ────────────────────────── */}
      {opps.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-shuttle/50 mb-2 px-1">Active opportunities</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {opps.map(o => (
              <button
                key={o.id}
                onClick={() => navigate(`/people/opportunities/${o.id}`)}
                className="shrink-0 w-48 text-left bg-white border border-mercury rounded-lg px-3 py-2 hover:border-burnham/50 transition-colors"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Target size={11} weight="bold" className="text-burnham shrink-0" />
                  <span className="text-[12px] font-medium text-midnight truncate">{o.title}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-shuttle/60 truncate">{o.company?.name ?? o.type}</span>
                  <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${o.stage === 'negotiating' ? 'bg-pastel/20 text-burnham' : 'bg-burnham/10 text-burnham'}`}>{o.stage}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Who to talk to (primary) ────────────────────────────────── */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-shuttle/50 mb-2 px-1">Talk to these people</p>
        <div className="bg-white border border-mercury rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-24">
              <div className="w-5 h-5 border-[1.5px] border-mercury border-t-burnham rounded-full animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-shuttle/40">
              Nobody needs attention right now. Go give some value.
            </div>
          ) : (
            items.map(it => (
              <BriefRow key={it.contactId} item={it} onClick={() => navigate(`/people/${it.contactId}`)} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
