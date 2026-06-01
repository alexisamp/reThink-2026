// MilestoneRows — compact right-rail milestone rows (emoji + name colored by goal
// + fraction + due chip + progress bar). Click opens the milestone detail panel.
// Visual contract ported from the design bundle (MilestoneRail.jsx rows).
import { CaretRight, Gear } from '@phosphor-icons/react'

export interface MilestoneRowData {
  id: string
  name: string
  emoji: string | null
  color: string        // hex / css color for --c
  due: string | null   // formatted, e.g. "12d" / "May 23"
  urgent: boolean
  done: number
  total: number
}

interface Props {
  rows: MilestoneRowData[]
  activeId: string | null
  onExpand: (id: string) => void
  onManage?: () => void
}

export default function MilestoneRows({ rows, activeId, onExpand, onManage }: Props) {
  return (
    <div className="td-ms-rows">
      {rows.length === 0 && (
        <div className="td-ms-empty">No focused milestones yet. Pick a few in Manage milestones.</div>
      )}
      {rows.map(m => {
        const pct = m.total > 0 ? (m.done / m.total) * 100 : 0
        return (
          <div
            key={m.id}
            className={`td-ms-item${activeId === m.id ? ' active' : ''}`}
            style={{ ['--c' as string]: m.color }}
            onClick={() => onExpand(m.id)}
            title="Open milestone detail"
          >
            <div className="td-ms-row">
              <span className="emoji">{m.emoji || '🎯'}</span>
              <span className="name">{m.name}</span>
              <span className="frac">{m.done}/{m.total}</span>
              <span className={`due${m.urgent ? ' urgent' : ''}`}>{m.due ?? '—'}</span>
              <span className="ms-go"><CaretRight size={11} /></span>
            </div>
            <div className="td-ms-bar"><span style={{ width: `${pct}%` }} /></div>
          </div>
        )
      })}
      {onManage && (
        <div className="td-tw-foot">
          <button onClick={onManage}>
            <Gear size={11} />
            <span>Manage milestones</span>
          </button>
        </div>
      )}
    </div>
  )
}
