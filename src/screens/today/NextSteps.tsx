// NextSteps — people feed that nourishes the This Week KPIs.
//  🟢 scheduled  : a contact with a planned next step this week (interactions.next_step_date)
//  🟠 reach-out  : a Tier 1/2 contact overdue per cadence (last_interaction_at vs tier cadence)
// Each action logs an interaction today → auto-feeds the weekly KPIs (interactions / tier touches).
import { useCallback, useEffect, useState } from 'react'
import { Check, PaperPlaneTilt } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'

interface NSItem {
  contactId: string
  name: string
  avatar: string | null
  status: 'scheduled' | 'reach-out'
  when: string
  feeds: string
  sortKey: number   // lower = more urgent / sooner
}

const DEFAULT_CADENCE: Record<number, number> = { 1: 14, 2: 30, 3: 90 }

function fmtWhen(dateStr: string, today: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const t = new Date(today + 'T12:00:00')
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff > 1 && diff < 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface Props {
  userId: string
  today: string
  weekEnd: string
  onActioned?: () => void
}

export default function NextSteps({ userId, today, weekEnd, onActioned }: Props) {
  const [items, setItems] = useState<NSItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!userId) return

    // tier cadence config from profile (fallback to defaults)
    const { data: profile } = await supabase
      .from('profiles').select('tier_cadence_config').eq('id', userId).maybeSingle()
    const cadenceCfg = (profile?.tier_cadence_config ?? null) as Record<string, { days: number }> | null
    const cadenceFor = (tier: number) =>
      cadenceCfg?.[String(tier)]?.days ?? DEFAULT_CADENCE[tier] ?? 60

    // 1) scheduled — interactions with a next step this week
    const { data: scheduledRows } = await supabase
      .from('interactions')
      .select('contact_id, next_step, next_step_date')
      .eq('user_id', userId)
      .not('next_step_date', 'is', null)
      .gte('next_step_date', today)
      .lte('next_step_date', weekEnd)
      .order('next_step_date')

    const scheduledIds = [...new Set((scheduledRows ?? []).map(r => r.contact_id).filter(Boolean))] as string[]

    // 2) reach-out — Tier 1/2 contacts overdue per cadence
    const { data: contactRows } = await supabase
      .from('outreach_logs')
      .select('id, name, profile_photo_url, tier, last_interaction_at')
      .eq('user_id', userId)
      .in('tier', [1, 2])

    // resolve names/avatars for scheduled contacts
    const contactById = new Map<string, { name: string; avatar: string | null; tier: number | null }>()
    ;(contactRows ?? []).forEach(c => contactById.set(c.id, { name: c.name, avatar: c.profile_photo_url ?? null, tier: c.tier }))
    const missing = scheduledIds.filter(id => !contactById.has(id))
    if (missing.length) {
      const { data: extra } = await supabase
        .from('outreach_logs').select('id, name, profile_photo_url, tier').in('id', missing)
      ;(extra ?? []).forEach(c => contactById.set(c.id, { name: c.name, avatar: c.profile_photo_url ?? null, tier: c.tier }))
    }

    const out: NSItem[] = []
    const seen = new Set<string>()

    // scheduled first
    ;(scheduledRows ?? []).forEach(r => {
      if (!r.contact_id || seen.has(r.contact_id)) return
      const c = contactById.get(r.contact_id)
      if (!c) return
      seen.add(r.contact_id)
      const d = new Date((r.next_step_date as string) + 'T12:00:00')
      out.push({
        contactId: r.contact_id, name: c.name, avatar: c.avatar,
        status: 'scheduled', when: fmtWhen(r.next_step_date as string, today),
        feeds: 'Convos', sortKey: d.getTime(),
      })
    })

    // reach-out
    const reachOut: NSItem[] = []
    ;(contactRows ?? []).forEach(c => {
      if (seen.has(c.id)) return
      const tier = c.tier ?? 3
      const cad = cadenceFor(tier)
      let daysSince: number
      if (!c.last_interaction_at) daysSince = 9999
      else daysSince = Math.floor((Date.now() - new Date(c.last_interaction_at).getTime()) / 86400000)
      if (daysSince <= cad) return  // not yet due
      reachOut.push({
        contactId: c.id, name: c.name, avatar: c.profile_photo_url ?? null,
        status: 'reach-out',
        when: daysSince >= 9999 ? 'New' : `Cold ${daysSince}d`,
        feeds: 'Tier 1/2',
        sortKey: -daysSince,   // most overdue first
      })
    })
    reachOut.sort((a, b) => a.sortKey - b.sortKey)

    setItems([...out, ...reachOut.slice(0, 4)])
    setLoading(false)
  }, [userId, today, weekEnd])

  useEffect(() => { load() }, [load])

  const logTouch = async (item: NSItem) => {
    await supabase.from('interactions').insert({
      user_id: userId,
      contact_id: item.contactId,
      type: item.status === 'scheduled' ? 'virtual_coffee' : 'linkedin_msg',
      direction: 'outbound',
      interaction_date: today,
    })
    await supabase.from('outreach_logs').update({ last_interaction_at: new Date().toISOString() }).eq('id', item.contactId)
    setItems(prev => prev.filter(i => i.contactId !== item.contactId))
    onActioned?.()
  }

  if (loading) return <div className="td-ns-empty">Loading…</div>
  if (items.length === 0) return <div className="td-ns-empty">Nobody waiting. Plan a follow-up.</div>

  return (
    <div className="td-ns-rows">
      {items.map(it => (
        <div className={`td-ns-row ${it.status}`} key={it.contactId}>
          <span className="av">{it.avatar ? <img src={it.avatar} alt="" /> : (it.name[0] || '?')}</span>
          <div className="who-wrap">
            <span className="who">{it.name}</span>
            <span className="meta">
              <span className={`status-dot ${it.status}`} />
              <span className="when">{it.when}</span>
              <span className="feeds">→ {it.feeds}</span>
            </span>
          </div>
          <button
            className="ns-log"
            title={it.status === 'scheduled' ? 'Mark talked' : 'Log touch'}
            onClick={() => logTouch(it)}
          >
            {it.status === 'scheduled' ? <Check size={12} /> : <PaperPlaneTilt size={12} />}
          </button>
        </div>
      ))}
    </div>
  )
}
