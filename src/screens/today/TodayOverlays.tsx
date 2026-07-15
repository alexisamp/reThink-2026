import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Todo } from '@/types'
import type { Mention } from './types'
import { Icon, Logo, type TodayIconName } from './TodayIcons'
import { SegmentText, toEditorSegments } from './TodayHandoffEditor'
import { minToHHMM } from './Recurring'

const DAY_START = 7 * 60
const DAY_END = 23 * 60
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export interface TodayCommand {
  key: string
  label: string
  hint?: string
  icon: TodayIconName
  run: () => void
}

export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: TodayCommand[] }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  useEffect(() => { if (open) { setQuery(''); setActive(0) } }, [open])
  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return commands.filter(command => command.label.toLowerCase().includes(q) || command.hint?.toLowerCase().includes(q))
  }, [commands, query])
  if (!open) return null
  const run = (command?: TodayCommand) => {
    if (!command) return
    onClose()
    window.setTimeout(command.run, 0)
  }
  return createPortal(
    <div className="cmdk-scrim" onClick={onClose}>
      <div className="cmdk" onClick={event => event.stopPropagation()}>
        <div className="cmdk-in"><Icon name="search" size={15} /><input autoFocus value={query} placeholder="Type a command…" onChange={event => { setQuery(event.target.value); setActive(0) }} onKeyDown={event => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setActive(value => Math.min(filtered.length - 1, value + 1)) }
          else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(value => Math.max(0, value - 1)) }
          else if (event.key === 'Enter') { event.preventDefault(); run(filtered[active]) }
          else if (event.key === 'Escape') { event.preventDefault(); onClose() }
        }} /><span className="cmdk-esc">esc</span></div>
        <div className="cmdk-list">
          {filtered.length === 0 && <div className="cmdk-empty">No commands</div>}
          {filtered.map((command, index) => <button key={command.key} className={`cmdk-row${index === active ? ' on' : ''}`} onMouseEnter={() => setActive(index)} onClick={() => run(command)}><span className="cmdk-ic"><Icon name={command.icon} size={15} /></span><span className="cmdk-lbl">{command.label}</span>{command.hint && <span className="cmdk-hint">{command.hint}</span>}</button>)}
        </div>
      </div>
    </div>, document.body,
  )
}

export interface MeetingDetail {
  id: string
  title: string
  start: number
  dur: number
  logo?: string | null
  attendees: Array<{ name: string; email?: string | null; you?: boolean; logo?: string | null }>
  conferenceUrl?: string | null
  platform?: string | null
}

export function MeetingModal({ meeting, onClose }: { meeting: MeetingDetail; onClose: () => void }) {
  return createPortal(<div className="scrim" onClick={onClose}><div className="modal sm meeting-modal" onClick={event => event.stopPropagation()}>
    <div className="modal-hd"><Logo id={meeting.logo || meeting.title} size={22} sq /><span>{meeting.title}</span><button className="x" onClick={onClose}><Icon name="x" size={15} /></button></div>
    <div className="modal-bd"><div className="field-lbl">When</div><div className="meeting-when">{minToHHMM(meeting.start)}–{minToHHMM(meeting.start + meeting.dur)} · {meeting.dur}m</div><div className="field-lbl">Participants</div><div className="meeting-attendees">
      {meeting.attendees.length === 0 && <span className="meeting-empty">No attendee details available.</span>}
      {meeting.attendees.map((attendee, index) => <div className="meeting-attendee" key={`${attendee.email}-${index}`}><Logo id={attendee.logo || attendee.name} size={26} sq={false} /><div><span>{attendee.name}{attendee.you ? ' (you)' : ''}</span>{attendee.email && <small>{attendee.email}</small>}</div></div>)}
    </div></div>
    <div className="modal-ft"><button className="btn btn-ghost" onClick={onClose}>Close</button>{meeting.conferenceUrl && <a className="btn btn-primary" href={meeting.conferenceUrl} target="_blank" rel="noreferrer"><Icon name="caretRight" size={12} /> Join {meeting.platform || 'meeting'}</a>}</div>
  </div></div>, document.body)
}

export function TimePickPop({ rect, initial, onClose, onPick }: { rect: DOMRect; initial: number; onClose: () => void; onPick: (minutes: number) => void }) {
  const [value, setValue] = useState(minToHHMM(initial))
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [onClose])
  const submit = () => {
    const [hours, minutes] = value.split(':').map(Number)
    if (!Number.isNaN(hours)) onPick(clamp(hours * 60 + (minutes || 0), DAY_START, DAY_END - 10))
    onClose()
  }
  const style = { position: 'fixed' as const, top: rect.bottom + 6, left: clamp(rect.left - 160, 8, window.innerWidth - 220) }
  return createPortal(<><div className="pop-scrim" onClick={onClose} /><div className="pop timepick" style={style}><div className="field-lbl">Set time</div><div className="timepick-row"><input type="time" autoFocus value={value} onChange={event => setValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') submit() }} /><button className="btn btn-primary" onClick={submit}>Set</button></div></div></>, document.body)
}

export function ObjLinkPop({ rect, options, onClose, onPick }: { rect: DOMRect; options: Mention[]; onClose: () => void; onPick: (mention: Mention) => void }) {
  const [query, setQuery] = useState('')
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [onClose])
  const filtered = options.filter(option => `${option.name} ${option.sub || ''}`.toLowerCase().includes(query.toLowerCase())).slice(0, 12)
  const style = { position: 'fixed' as const, top: rect.bottom + 6, left: clamp(rect.left, 8, window.innerWidth - 264), width: 250 }
  return createPortal(<><div className="pop-scrim" onClick={onClose} /><div className="pop objlink-pop" style={style}><div className="pop-search"><span className="ico"><Icon name="search" size={13} /></span><input autoFocus placeholder="Link a record…" value={query} onChange={event => setQuery(event.target.value)} /></div>{filtered.map(option => <button className="pop-item" key={`${option.kind}:${option.id}`} onClick={() => { onPick(option); onClose() }}><Logo id={option.imageUrl || option.name} size={22} sq={option.kind !== 'person'} /><span className="lbl"><strong>{option.name}</strong><small>{option.sub}</small></span></button>)}</div></>, document.body)
}

export interface CloseDayStats {
  tasksDone: number
  tasksTotal: number
  mustDoDone: number
  mustDoTotal: number
  meetingsAttended: number
  meetingsTotal: number
  objective: string
  objectiveLink?: Mention | null
  funnel: Array<{ id: string; label: string; value: number; target: number }>
}

export function CloseDayFlow({ stats, unfinished, saving, onClose, onCommit }: { stats: CloseDayStats; unfinished: Todo[]; saving: boolean; onClose: () => void; onCommit: (payload: { carryIds: string[]; objective: string }) => void }) {
  const [step, setStep] = useState<'recap' | 'plan'>('recap')
  const [carry, setCarry] = useState(() => new Set(unfinished.map(todo => todo.id)))
  const [objective, setObjective] = useState('')
  const pct = stats.tasksTotal ? Math.round(stats.tasksDone / stats.tasksTotal * 100) : 100
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [onClose])
  const toggle = (id: string) => setCarry(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  return createPortal(<div className="closeday-screen"><div className="cd-top"><span className="cd-steps"><span className={`cd-dot${step === 'recap' ? ' on' : ''}`} /><span className={`cd-dot${step === 'plan' ? ' on' : ''}`} /></span><button className="x" onClick={onClose}><Icon name="x" size={16} /></button></div>
    {step === 'recap' ? <div className="cd-wrap"><div className="cd-hd"><span className="cd-ico"><Icon name="checkcircle" size={22} /></span><h1>Nice work today</h1><p className="cd-sub">Here's how it went.</p></div>{stats.objective && <div className="recap-obj"><span className="lbl">Today's objective</span><span className="txt">{stats.objective}{stats.objectiveLink && <span className="link"> · {stats.objectiveLink.name}</span>}</span></div>}<div className="recap-grid">
      <div className="recap-stat"><span className="ico"><Icon name="checkcircle" size={16} /></span><div className="body"><span className="v">{stats.tasksDone}/{stats.tasksTotal}</span><span className="l">Tasks completed</span></div><span className="sub">{pct}%</span></div>
      <div className="recap-stat"><span className="ico"><Icon name="star" size={16} /></span><div className="body"><span className="v">{stats.mustDoDone}/{stats.mustDoTotal}</span><span className="l">Must-dos</span></div></div>
      <div className="recap-stat"><span className="ico"><Icon name="calendar" size={16} /></span><div className="body"><span className="v">{stats.meetingsAttended}/{stats.meetingsTotal}</span><span className="l">Meetings attended</span></div></div>
    </div><div className="field-lbl recap-funnel-label">Funnel</div><div className="recap-funnel">{stats.funnel.map(stage => <div key={stage.id} className={`recap-fstage${stage.value >= stage.target ? ' hit' : ''}`}><span className="dot" /><span className="l">{stage.label}</span><span className="v">{stage.value}<span className="tg">/{stage.target}</span></span></div>)}</div><div className="cd-ft"><button className="btn btn-ghost" onClick={onClose}>Close</button><button className="btn btn-primary" onClick={() => setStep('plan')}><Icon name="caretRight" size={12} /> Plan tomorrow</button></div></div>
      : <div className="cd-wrap"><div className="cd-hd"><span className="cd-ico"><Icon name="target" size={22} /></span><h1>Plan tomorrow</h1><p className="cd-sub">{unfinished.length ? `${unfinished.length} task${unfinished.length === 1 ? '' : 's'} left open. Choose what carries over.` : 'Everything is wrapped up — set an objective and you’re set.'}</p></div>{unfinished.length > 0 && <div className="carry-list">{unfinished.map(todo => <label className={`carry-row${carry.has(todo.id) ? ' on' : ''}`} key={todo.id}><button type="button" className={`tp-check${carry.has(todo.id) ? ' on' : ''}`} onClick={event => { event.preventDefault(); toggle(todo.id) }}>{carry.has(todo.id) && <Icon name="check" size={10} sw={2.4} />}</button><span className="txt"><SegmentText segments={toEditorSegments(todo.content_segments, todo.text)} /></span>{todo.must_do && <span className="carry-flag"><Icon name="star" size={11} fill /></span>}</label>)}</div>}<div className="field-lbl tomorrow-label">Tomorrow's objective</div><input className="cd-obj-input" autoFocus value={objective} onChange={event => setObjective(event.target.value)} placeholder="What's the one thing that matters most tomorrow?" /><div className="cd-ft"><button className="btn btn-ghost" onClick={() => setStep('recap')}><Icon name="caretLeft" size={12} /> Back</button><button className="btn btn-primary" disabled={saving} onClick={() => onCommit({ carryIds: [...carry], objective })}><Icon name="check" size={12} sw={2.2} /> {saving ? 'Saving…' : 'Done — see you tomorrow'}</button></div></div>}
  </div>, document.body)
}
