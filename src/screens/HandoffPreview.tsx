import { useMemo, useState } from 'react'
import { Icon } from '@/screens/today/TodayIcons'

const STATES = [
  ['01-today-home.png', 'Today home', '/today', 'rethink-today.jsx'],
  ['02-companies-table.png', 'Companies table', '/companies/view/all', 'lists-views.jsx'],
  ['03-people-table.png', 'People table', '/people/view/all', 'lists-views.jsx'],
  ['04-record-page-overview.png', 'Record overview', '/companies/view/all', 'lists-record.jsx'],
  ['05-kanban-board.png', 'Kanban board', '/lists', 'lists-views.jsx'],
  ['06-view-switcher-dropdown.png', 'View switcher', '/companies/view/all', 'lists-views.jsx'],
  ['07-kanban-board-2.png', 'Kanban compact', '/lists', 'lists-views.jsx'],
  ['08-compose-email-modal.png', 'Compose email', '/people/view/all', 'lists-record-modals.jsx'],
  ['09-today-default.png', 'Today default', '/today', 'rethink-today.jsx'],
  ['10-closeday-recap.png', 'Close Day recap', '/today', 'today-recap.jsx'],
  ['11-closeday-plan-tomorrow.png', 'Plan tomorrow', '/today', 'today-recap.jsx'],
  ['12-milestones-panel.png', 'Milestones panel', '/today', 'rethink-today.jsx'],
  ['13-recurring-panel.png', 'Recurring panel', '/today', 'today-recurring.jsx'],
  ['14-backlog-empty.png', 'Backlog empty', '/today', 'rethink-today.jsx'],
  ['15-command-palette.png', 'Command palette', '/today', 'rethink-today.jsx'],
  ['16-focus-popover.png', 'Focus popover', '/today', 'rethink-today.jsx'],
  ['17-meeting-modal.png', 'Meeting modal', '/today', 'lists-record-modals.jsx'],
  ['18-dark-mode.png', 'Dark mode', '/today', 'lists.css + today.css'],
  ['19-funnel-hover-people.png', 'Funnel people hover', '/today', 'rethink-today.jsx'],
  ['20-objective-link-popover.png', 'Objective link', '/today', 'rethink-today.jsx'],
  ['21-block-hovercard.png', 'Block hovercard', '/today', 'rethink-today.jsx'],
  ['22-schedule-timepicker.png', 'Schedule time picker', '/today', 'rethink-today.jsx'],
] as const

export default function HandoffPreview() {
  const [selected, setSelected] = useState(0)
  const [mode, setMode] = useState<'split' | 'reference' | 'live'>('split')
  const state = STATES[selected]
  const referenceUrl = `/handoff-reference/screenshots/${state[0]}`
  const label = useMemo(() => `${String(selected + 1).padStart(2, '0')} / ${STATES.length}`, [selected])

  return <div className="handoff-preview">
    <aside className="hp-index"><div className="hp-index-hd"><Icon name="grid" size={14} /><span>Handoff states</span><b>{STATES.length}</b></div>{STATES.map((item, index) => <button key={item[0]} className={selected === index ? 'on' : ''} onClick={() => setSelected(index)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item[1]}</strong></button>)}</aside>
    <section className="hp-main"><header className="hp-toolbar"><div><span className="hp-count">{label}</span><h1>{state[1]}</h1><small>{state[3]}</small></div><div className="hp-modes"><button className={mode === 'reference' ? 'on' : ''} onClick={() => setMode('reference')}>Reference</button><button className={mode === 'split' ? 'on' : ''} onClick={() => setMode('split')}>Split</button><button className={mode === 'live' ? 'on' : ''} onClick={() => setMode('live')}>Live</button></div><a className="btn btn-primary" href={state[2]} target="_blank" rel="noreferrer"><Icon name="arrowUpRight" size={12} />Open live</a></header>
      <div className={`hp-stage ${mode}`}>
        {mode !== 'live' && <figure><figcaption>Handoff reference · 924x540</figcaption><img src={referenceUrl} alt={`${state[1]} handoff reference`} width={924} height={540} /></figure>}
        {mode !== 'reference' && <figure><figcaption>Current implementation · 924x540</figcaption><iframe key={`${selected}-${state[2]}`} title={`${state[1]} live preview`} src={state[2]} width={924} height={540} /></figure>}
      </div>
    </section>
  </div>
}
