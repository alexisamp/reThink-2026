// NextSteps — people feed that nourishes the This Week KPIs.
//  🟢 scheduled  : a contact with a planned/overdue next step (interactions.next_step)
//  🟠 reach-out  : a contact overdue per cadence, birthday soon, or value owed
// Data comes from the shared useRelationshipBrief hook (same source the People → Focus tab uses).
// Each action logs an interaction today → auto-feeds the weekly KPIs (interactions / tier touches).
import { Check, PaperPlaneTilt, UsersThree } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useRelationshipBrief, type BriefItem } from '@/hooks/useRelationshipBrief'

interface NSItem {
  contactId: string
  name: string
  avatar: string | null
  status: 'scheduled' | 'reach-out'
  when: string
  feeds: string
}

function fmtWhen(dateStr: string, today: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const t = new Date(today + 'T12:00:00')
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff < 0) return `${-diff}d late`
  if (diff > 1 && diff < 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Map a BriefItem from the shared hook into the existing NextSteps row shape. */
function toNSItem(b: BriefItem, today: string): NSItem {
  const scheduled = b.primaryReason === 'overdue_next_step' || b.primaryReason === 'upcoming_next_step'
  let when = b.reasonLabel
  if (scheduled && b.nextStepDate) when = fmtWhen(b.nextStepDate, today)
  else if (b.primaryReason === 'cadence_overdue') when = b.daysSinceContact != null ? `Cold ${b.daysSinceContact}d` : 'New'
  else if (b.primaryReason === 'birthday_upcoming' && b.birthdayInDays != null) when = `🎂 ${b.birthdayInDays}d`
  return {
    contactId: b.contactId,
    name: b.name,
    avatar: b.avatar,
    status: scheduled ? 'scheduled' : 'reach-out',
    when,
    feeds: b.reasonLabel,
  }
}

interface Props {
  userId: string
  today: string
  weekEnd: string
  onActioned?: () => void
  onManage?: () => void
}

export default function NextSteps({ userId, today, weekEnd, onActioned, onManage }: Props) {
  const { items: brief, loading, reload } = useRelationshipBrief(userId, { limit: 5, today, weekEnd })
  const items = brief.map(b => toNSItem(b, today))

  const logTouch = async (item: NSItem) => {
    await supabase.from('interactions').insert({
      user_id: userId,
      contact_id: item.contactId,
      type: item.status === 'scheduled' ? 'virtual_coffee' : 'linkedin_msg',
      direction: 'outbound',
      interaction_date: today,
    })
    await supabase.from('outreach_logs').update({ last_interaction_at: new Date().toISOString() }).eq('id', item.contactId)
    onActioned?.()
    reload()
  }

  return (
    <div className="td-ns-rows">
      {loading && <div className="td-ns-empty">Loading…</div>}
      {!loading && items.length === 0 && <div className="td-ns-empty">Nobody waiting. Plan a follow-up.</div>}
      {!loading && items.map(it => (
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
      {onManage && (
        <div className="td-tw-foot">
          <button onClick={onManage}>
            <UsersThree size={11} />
            <span>Manage people</span>
          </button>
        </div>
      )}
    </div>
  )
}
