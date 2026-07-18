import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { PencilSimple, Plus, Repeat, TrashSimple, X } from '@phosphor-icons/react'

const REC_LSK = 'rethink.today.recurring.v1'

export type RecurringFormMode = 'create' | 'convert' | 'series' | 'occurrence'
export type RecurringScopeAction = 'edit' | 'delete'
export type RecurringScope = 'occurrence' | 'series'

export interface RecurringSeries {
  id: string
  active: boolean
  name: string
  dur: number
  time: number | null
  days: number[]
  startDate: string
  endType: 'never' | 'date' | 'count'
  endDate: string | null
  endCount: number | null
}

export type RecurringFormFields = Omit<RecurringSeries, 'id' | 'active'>

export const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]
const DOW_LABEL: Record<number, string> = { 1: 'M', 2: 'T', 3: 'W', 4: 'T', 5: 'F', 6: 'S', 0: 'S' }
const DOW_NAME: Record<number, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' }

export function loadRecurSeries() {
  try { return JSON.parse(localStorage.getItem(REC_LSK) ?? '{}')?.series || [] } catch { return [] }
}

export function saveRecurSeries(series: RecurringSeries[]) {
  try { localStorage.setItem(REC_LSK, JSON.stringify({ series })) } catch {}
}

export function recNid() {
  return `rs${crypto.randomUUID()}`
}

export function dateKey(d: Date) { return d.toISOString().slice(0, 10) }

export function seriesAppliesOn(series: RecurringSeries, date: Date) {
  if (!series.active) return false;
  if (!series.days.includes(date.getDay())) return false;
  const ds = new Date(series.startDate + 'T00:00:00');
  const d0 = new Date(date); d0.setHours(0, 0, 0, 0);
  if (d0 < ds) return false;
  if (series.endType === 'date' && series.endDate) {
    const de = new Date(series.endDate + 'T23:59:59');
    if (d0 > de) return false;
  }
  if (series.endType === 'count' && series.endCount) {
    let count = 0, d = new Date(ds);
    while (d <= d0) { if (series.days.includes(d.getDay())) count++; d.setDate(d.getDate() + 1); }
    if (count > series.endCount) return false;
  }
  return true;
}

export function daysSummary(days: number[]) {
  const set = new Set(days)
  if (DOW_ORDER.every((d) => set.has(d))) return 'Every day'
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d)) && !set.has(0) && !set.has(6)) return 'Weekdays'
  return DOW_ORDER.filter((d) => set.has(d)).map((d) => DOW_NAME[d]).join(' · ')
}

export function minToHHMM(m: number) { return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }
export function hhmmToMin(s: string) { const [h, m] = s.split(':').map(Number); return h * 60 + m }

function DurationChips({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const opts = [15, 30, 45, 60, 90]
  return (
    <div className="rp-chips">
      {opts.map((m) => (
        <button key={m} type="button" className={`rp-chip${value === m ? ' on' : ''}`} onClick={() => onChange(m)}>{m}m</button>
      ))}
      <div className="rp-chip-custom">
        <input type="number" min="5" step="5" value={value} onChange={(e) => onChange(Math.max(5, Number(e.target.value) || 5))} />
        <span>min</span>
      </div>
    </div>
  )
}

function DayPills({ value, onChange }: { value: number[]; onChange: (value: number[]) => void }) {
  return (
    <div className="rp-days">
      {DOW_ORDER.map((d) => (
        <button key={d} type="button" className={`rp-day${value.includes(d) ? ' on' : ''}`}
          title={DOW_NAME[d]} onClick={() => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d])}>
          {DOW_LABEL[d]}
        </button>
      ))}
    </div>
  )
}

export function RecurringForm({
  mode,
  initial,
  onClose,
  onSave,
  onDeleteSeries,
}: {
  mode: RecurringFormMode
  initial?: Partial<RecurringFormFields> | null
  onClose: () => void
  onSave: (fields: RecurringFormFields) => void
  onDeleteSeries?: () => void
}) {
  const isOccurrence = mode === 'occurrence'
  const [name, setName] = useState(initial?.name || '')
  const [dur, setDur] = useState(initial?.dur || 30)
  const [time, setTime] = useState(initial?.time != null ? minToHHMM(initial.time) : '')
  const [days, setDays] = useState(initial?.days || [1, 2, 3, 4, 5])
  const [startDate, setStartDate] = useState(initial?.startDate || dateKey(new Date()))
  const [endType, setEndType] = useState<RecurringFormFields['endType']>(initial?.endType || 'never')
  const [endDate, setEndDate] = useState(initial?.endDate || '')
  const [endCount, setEndCount] = useState(initial?.endCount || 10)
  const nameRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => { nameRef.current?.focus() }, [])

  const valid = name.trim().length > 0 && (isOccurrence || days.length > 0)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    onSave({
      name: name.trim(), dur, time: time ? hhmmToMin(time) : null,
      days, startDate, endType, endDate: endType === 'date' ? endDate : null, endCount: endType === 'count' ? endCount : null,
    })
  }

  return createPortal(
    <div className="rec-scrim" onClick={onClose}>
      <form className="rec-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="rec-hd">
          <Repeat size={15} />
          <h3>{isOccurrence ? 'Edit this occurrence' : mode === 'convert' ? 'Make recurring' : (mode === 'series' ? 'Edit recurring task' : 'New recurring task')}</h3>
          <button type="button" className="x" onClick={onClose} aria-label="Close recurring task dialog"><X size={13} /></button>
        </div>

        <label className="rec-field">
          <span className="lab">Name</span>
          <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Inbox zero" autoComplete="off" />
        </label>

        <label className="rec-field">
          <span className="lab">Duration</span>
          <DurationChips value={dur} onChange={setDur} />
        </label>

        {!isOccurrence && (
          <label className="rec-field">
            <span className="lab">Repeats on</span>
            <DayPills value={days} onChange={setDays} />
          </label>
        )}

        <div className="rec-row2">
          <label className="rec-field">
            <span className="lab">Time <small>(optional)</small></span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          {!isOccurrence && (
            <label className="rec-field">
              <span className="lab">Starts</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
          )}
        </div>

        {!isOccurrence && (
          <label className="rec-field">
            <span className="lab">Ends</span>
            <div className="rp-end-opts">
              <button type="button" className={endType === 'never' ? 'on' : ''} onClick={() => setEndType('never')}>Never</button>
              <button type="button" className={endType === 'date' ? 'on' : ''} onClick={() => setEndType('date')}>On date</button>
              <button type="button" className={endType === 'count' ? 'on' : ''} onClick={() => setEndType('count')}>After N</button>
            </div>
            {endType === 'date' && <input type="date" className="rp-end-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />}
            {endType === 'count' && (
              <div className="rp-end-input rp-end-count"><input type="number" min="1" value={endCount} onChange={(e) => setEndCount(Math.max(1, Number(e.target.value) || 1))} /><span>occurrences</span></div>
            )}
          </label>
        )}

        <div className="rec-ft">
          {!isOccurrence && initial && onDeleteSeries && (
            <button type="button" className="rec-danger" onClick={onDeleteSeries}><TrashSimple size={12} /> Delete series</button>
          )}
          <span className="sp" />
          <button type="button" className="rec-cancel" onClick={onClose}>Cancel</button>
          <button type="submit" className="rec-save" disabled={!valid}>Save</button>
        </div>
      </form>
    </div>, document.body
  )
}

export function ScopeMenu({ rect, onPick, onClose }: {
  rect: DOMRect
  onPick: (action: RecurringScopeAction, scope: RecurringScope) => void
  onClose: () => void
}) {
  const style = { position: 'fixed' as const, top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 240) }
  return createPortal(
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={onClose} />
      <div className="rec-scopemenu" style={style}>
        <div className="rec-sm-h">Edit</div>
        <button onClick={() => onPick('edit', 'occurrence')}><PencilSimple size={12} /> This occurrence</button>
        <button onClick={() => onPick('edit', 'series')}><Repeat size={12} /> All future occurrences</button>
        <div className="rec-sm-sep" />
        <div className="rec-sm-h">Delete</div>
        <button className="danger" onClick={() => onPick('delete', 'occurrence')}><X size={12} /> This occurrence</button>
        <button className="danger" onClick={() => onPick('delete', 'series')}><TrashSimple size={12} /> All future occurrences</button>
      </div>
    </>, document.body
  )
}

export function RecurringPanel({ rect, series, onClose, onNew, onEdit, onDelete }: {
  rect: DOMRect
  series: RecurringSeries[]
  onClose: () => void
  onNew: () => void
  onEdit: (series: RecurringSeries) => void
  onDelete: (series: RecurringSeries) => void
}) {
  const style = { top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 336) }
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 139 }} onClick={onClose} />
      <div className="rec-panel" style={style}>
        <div className="rec-panel-hd"><Repeat size={14} /><h3>Recurring tasks</h3></div>
        {series.length === 0 && <div className="rec-panel-empty">No recurring tasks yet.</div>}
        {series.map((s) => (
          <div key={s.id} className="rec-panel-item">
            <div className="rpi-top">
              <span className="nm">{s.name}</span>
              <button className="ic" title="Edit" onClick={() => onEdit(s)}><PencilSimple size={12} /></button>
              <button className="ic" title="Delete" onClick={() => onDelete(s)}><TrashSimple size={12} /></button>
            </div>
            <div className="rpi-meta">{daysSummary(s.days)} · {s.dur}m{s.time != null ? ` · ${minToHHMM(s.time)}` : ''}</div>
          </div>
        ))}
        <button className="rec-panel-new" onClick={onNew}><Plus size={13} /> New recurring task</button>
      </div>
    </>
  )
}
