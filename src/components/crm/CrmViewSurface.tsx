import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import CrmPopFrame from '@/components/crm/CrmPopFrame'
import { crmUrlPresentation, type CrmAttribute, type CrmObject, type UnifiedRecord } from '@/lib/attioObjects'
import type {
  CreateCrmViewInput,
  CrmFilterOperator,
  CrmSavedView,
  CrmViewFilter,
  CrmViewSort,
  CrmViewStageSetting,
  CrmViewType,
} from '@/lib/crmViews'
import { Icon, Logo, type TodayIconName } from '@/screens/today/TodayIcons'

const PALETTE = ['#266DF0', '#407FF2', '#538BF3', '#BAD0FA', '#E4EDFF', '#1C1D1F', '#2E3238', '#505967', '#6F7988', '#8F99A8', '#CAD0D9', '#E4E7EC']

const OPERATORS: Record<string, CrmFilterOperator[]> = {
  Text: ['contains', 'does not contain', 'is', 'is not', 'is empty', 'is not empty'],
  Domain: ['contains', 'does not contain', 'is', 'is not', 'is empty', 'is not empty'],
  Email: ['contains', 'does not contain', 'is', 'is not', 'is empty', 'is not empty'],
  Phone: ['contains', 'does not contain', 'is', 'is not', 'is empty', 'is not empty'],
  URL: ['contains', 'does not contain', 'is', 'is not', 'is empty', 'is not empty'],
  Number: ['is', 'is not', 'greater than', 'less than', 'is empty', 'is not empty'],
  Currency: ['is', 'is not', 'greater than', 'less than', 'is empty', 'is not empty'],
  Date: ['is', 'is not', 'is before', 'is after', 'is empty', 'is not empty'],
  Select: ['is', 'is not', 'is empty', 'is not empty'],
  Status: ['is', 'is not', 'is empty', 'is not empty'],
  'Multi-select': ['contains', 'does not contain', 'is empty', 'is not empty'],
  Checkbox: ['is', 'is not'],
}

function attributeIcon(attribute: CrmAttribute): TodayIconName {
  if (attribute.is_relationship) return 'users'
  const type = attribute.attribute_type.toLowerCase()
  if (/domain|email|url/.test(type)) return 'globe'
  if (/currency/.test(type)) return 'dollar'
  if (/number|percent/.test(type)) return 'hash'
  if (/multi|tag/.test(type)) return 'tag'
  if (/location/.test(type)) return 'pin'
  if (/status|select/.test(type)) return 'status'
  if (/date|time/.test(type)) return 'calendar'
  if (/user|relationship/.test(type)) return 'users'
  return 'text'
}

function comparable(value: unknown): string | number | boolean {
  if (Array.isArray(value)) return value.join(', ')
  if (value && typeof value === 'object') {
    if ('amount' in value) return Number((value as { amount?: unknown }).amount ?? 0)
    return JSON.stringify(value)
  }
  return value as string | number | boolean ?? ''
}

function recordValue(record: UnifiedRecord, key: string) {
  const value = record.values[key]
  if ((value === null || value === undefined || value === '') && (key === 'name' || key === 'title')) return record.title
  return value
}

function normalizedComparable(value: unknown, attribute?: CrmAttribute): string | number | boolean {
  const raw = comparable(value)
  if (!attribute) return raw
  if (['Select', 'Status', 'Multi-select'].includes(attribute.attribute_type)) {
    const match = attribute.options?.find(option => option.id === String(raw) || option.label.toLowerCase() === String(raw).toLowerCase())
    return (match?.id ?? String(raw)).toLowerCase()
  }
  if (/date|timestamp/i.test(attribute.attribute_type)) {
    const date = new Date(String(raw))
    return Number.isNaN(date.getTime()) ? String(raw) : date.getTime()
  }
  return raw
}

function isEmpty(value: unknown) {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
}

function renderCell(value: unknown, attribute?: CrmAttribute): ReactNode {
  if (isEmpty(value)) return <span className="c-muted">—</span>
  if (typeof value === 'boolean') return value ? <Icon name="check" size={12} /> : <span className="c-muted">—</span>
  if (attribute?.is_relationship) return <span className="rel-chip"><Icon name="contact" size={11} />{String(value)}</span>
  if (attribute?.attribute_type === 'Select' || attribute?.attribute_type === 'Status') {
    const option = attribute.options?.find(item => item.id === String(value) || item.label === String(value))
    const color = option?.color || '#8A99A3'
    return <span className="chip" style={{ color, background: `color-mix(in oklab, ${color} 14%, transparent)` }}><span className="dot" style={{ background: color }} />{option?.label || String(value)}</span>
  }
  if (attribute?.attribute_type === 'Multi-select' || Array.isArray(value)) {
    const values = Array.isArray(value) ? value : String(value).split(',').filter(Boolean)
    return <span className="chipset">{values.slice(0, 3).map(item => {
      const option = attribute?.options?.find(candidate => candidate.id === String(item) || candidate.label === String(item))
      return <span className="cat-tag" key={String(item)} style={option?.color ? { color: option.color, background: `color-mix(in oklab, ${option.color} 14%, transparent)` } : undefined}>{option?.label || String(item)}</span>
    })}</span>
  }
  if (attribute?.attribute_type === 'Currency') {
    const amount = typeof value === 'object' && value && 'amount' in value ? Number((value as { amount?: unknown }).amount) : Number(value)
    const currency = typeof value === 'object' && value && 'currency' in value ? String((value as { currency?: unknown }).currency) : attribute.config?.currency?.currency || 'USD'
    return <span className="teamn">{Number.isFinite(amount) ? amount.toLocaleString(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }) : String(value)}</span>
  }
  if (/date|timestamp/i.test(attribute?.attribute_type ?? '')) {
    const raw = String(value)
    const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date(raw)
    return <span className="c-txt">{Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
  }
  if (attribute && ['URL', 'Domain', 'Email'].includes(attribute.attribute_type)) {
    const presentation = crmUrlPresentation(value, attribute.attribute_type)
    return <a className="c-domain" href={presentation.href} title={String(value)} target={attribute.attribute_type === 'Email' ? undefined : '_blank'} rel="noreferrer" onClick={event => event.stopPropagation()}>{presentation.label}</a>
  }
  return <span className="c-txt">{String(value)}</span>
}

function matchesFilter(record: UnifiedRecord, filter: CrmViewFilter, byKey: Map<string, CrmAttribute>) {
  const attribute = byKey.get(filter.key)
  const value = recordValue(record, filter.key)
  const empty = isEmpty(value)
  if (filter.operator === 'is empty') return empty
  if (filter.operator === 'is not empty') return !empty
  const raw = normalizedComparable(value, attribute)
  const expected = normalizedComparable(filter.value, attribute)
  switch (filter.operator) {
    case 'contains': return Array.isArray(value) ? value.some(item => normalizedComparable(item, attribute) === expected) : String(raw).toLowerCase().includes(String(expected).toLowerCase())
    case 'does not contain': return Array.isArray(value) ? !value.some(item => normalizedComparable(item, attribute) === expected) : !String(raw).toLowerCase().includes(String(expected).toLowerCase())
    case 'is': return ['Number', 'Currency'].includes(attribute?.attribute_type || '') ? Number(raw) === Number(expected) : String(raw).toLowerCase() === String(expected).toLowerCase()
    case 'is not': return ['Number', 'Currency'].includes(attribute?.attribute_type || '') ? Number(raw) !== Number(expected) : String(raw).toLowerCase() !== String(expected).toLowerCase()
    case 'greater than': return Number(raw) > Number(expected)
    case 'less than': return Number(raw) < Number(expected)
    case 'is before': return String(raw) < String(expected)
    case 'is after': return String(raw) > String(expected)
    default: return true
  }
}

export function applyCrmView(records: UnifiedRecord[], view: CrmSavedView, attributes: CrmAttribute[]) {
  const byKey = new Map(attributes.map(attribute => [attribute.key, attribute]))
  const filtered = view.filters.length ? records.filter(record => view.filters.every(filter => matchesFilter(record, filter, byKey))) : records
  if (!view.sorts.length) return filtered
  return [...filtered].sort((left, right) => {
    for (const sort of view.sorts) {
      const attribute = byKey.get(sort.key)
      const a = normalizedComparable(recordValue(left, sort.key), attribute)
      const b = normalizedComparable(recordValue(right, sort.key), attribute)
      const result = typeof a === 'number' || typeof b === 'number'
        ? Number(a) - Number(b)
        : String(a).localeCompare(String(b), undefined, { numeric: true })
      if (result) return sort.direction === 'desc' ? -result : result
    }
    return 0
  })
}

const PopFrame = CrmPopFrame

function fireConfetti() {
  const colors = PALETTE.slice(0, 8)
  for (let index = 0; index < 28; index += 1) {
    const piece = document.createElement('span')
    piece.className = 'confetti-pc'
    piece.style.left = `${35 + Math.random() * 50}%`
    piece.style.background = colors[index % colors.length]
    piece.style.animationDuration = `${0.8 + Math.random() * 0.8}s`
    piece.style.transform = `rotate(${Math.random() * 180}deg)`
    document.body.appendChild(piece)
    window.setTimeout(() => piece.remove(), 1800)
  }
}

function Toggle({ on, onChange }: { on: boolean; onChange: (next: boolean) => void }) {
  return <button className={`tg${on ? ' on' : ''}`} onClick={() => onChange(!on)}><span className="knob" /></button>
}

function AttributePicker({
  anchor, hidden, onClose, onAdd, onCreate,
}: {
  anchor: DOMRect
  hidden: CrmAttribute[]
  onClose: () => void
  onAdd: (key: string) => void
  onCreate: () => void
}) {
  const [query, setQuery] = useState('')
  const shown = hidden.filter(attribute => attribute.name.toLowerCase().includes(query.toLowerCase()))
  return <PopFrame anchor={anchor} width={260} onClose={onClose}><div className="pop-search"><span className="ico"><Icon name="search" size={13} /></span><input autoFocus placeholder="Search attributes..." value={query} onChange={event => setQuery(event.target.value)} /></div><div className="pop-group">Attributes</div><div style={{ maxHeight: 280, overflowY: 'auto' }}>{shown.length ? shown.map(attribute => <button key={attribute.id} className="pop-item" onClick={() => onAdd(attribute.key)}><span className="ico"><Icon name={attributeIcon(attribute)} size={14} /></span><span className="lbl">{attribute.name}</span></button>) : <div className="pop-empty">All attributes shown.</div>}</div><div className="pop-foot"><button className="pop-item" onClick={onCreate}><span className="ico"><Icon name="plus" size={13} /></span><span className="lbl">Create new attribute</span><span className="chev"><Icon name="chevron-right" size={12} /></span></button></div></PopFrame>
}

function CreateViewModal({
  object, attributes, initialType = 'table', listMode = false, onClose, onConfirm,
}: {
  object: CrmObject
  attributes: CrmAttribute[]
  initialType?: CrmViewType
  listMode?: boolean
  onClose: () => void
  onConfirm: (input: CreateCrmViewInput) => Promise<boolean> | boolean
}) {
  const [type, setType] = useState<CrmViewType>(initialType)
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const selectAttributes = attributes.filter(attribute => ['Select', 'Status'].includes(attribute.attribute_type))
  const [groupBy, setGroupBy] = useState(selectAttributes[0]?.key ?? '')
  const needsGroupBy = type === 'kanban' && !listMode
  const submit = useCallback(async () => {
    if (submitting || (needsGroupBy && !groupBy)) return
    setSubmitting(true)
    const saved = await onConfirm({
      title: title.trim() || `All ${object.plural_name} ${type === 'kanban' ? 'Kanban' : 'Table'}`,
      view_type: type,
      columns: type === 'kanban' ? [] : attributes.filter(attribute => !attribute.is_archived && !attribute.is_relationship).slice(0, 8).map(attribute => attribute.key),
      group_by_attribute_key: type === 'kanban' && !listMode ? groupBy || null : null,
      stage_settings: type === 'kanban' && !listMode ? (selectAttributes.find(attribute => attribute.key === groupBy)?.options ?? []).map((option, index) => ({ id: option.id, label: option.label, color: option.color || PALETTE[index % PALETTE.length] })) : [],
    })
    if (!saved) setSubmitting(false)
  }, [attributes, groupBy, listMode, needsGroupBy, object.plural_name, onConfirm, selectAttributes, submitting, title, type])
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Enter') void submit()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, submit])
  return <div className="scrim" onClick={onClose}><div className="modal sm" onClick={event => event.stopPropagation()}><div className="modal-hd">Create view<button className="x" onClick={onClose} aria-label="Close dialog"><Icon name="x" size={15} /></button></div><div className="modal-bd"><div className="field-lbl">View type</div><div className="pick-grid two">{([['table', 'Table', 'Organize your records on a table'], ['kanban', 'Kanban', 'Organize your records on a pipeline']] as const).map(([value, label, description]) => <button key={value} className={`pick${type === value ? ' on' : ''}`} onClick={() => setType(value)}><span className="pico neutral"><Icon name={value} size={15} /></span><span><span className="pt">{label}</span><span className="ps">{description}</span></span></button>)}</div><div className="field-lbl">Title</div><input className="txt" autoFocus placeholder="Enter a title for this view" value={title} onChange={event => setTitle(event.target.value)} />{type === 'kanban' && <><div className="field-lbl">Kanban Columns</div>{listMode ? <button type="button" className="txt kanban-stage-static"><span>Stage</span><Icon name="check" size={13} /></button> : <select className="txt" value={groupBy} onChange={event => setGroupBy(event.target.value)}>{selectAttributes.length ? selectAttributes.map(attribute => <option key={attribute.id} value={attribute.key}>{attribute.name}</option>) : <option value="">No status attributes found</option>}</select>}</>}</div><div className="modal-ft"><button className="btn btn-ghost" onClick={onClose}>Cancel<span className="kbd">ESC</span></button><button className="btn btn-primary" disabled={submitting || (needsGroupBy && !groupBy)} onClick={() => void submit()}>{submitting ? 'Creating...' : 'Confirm'}<span className="kbd">Enter</span></button></div></div></div>
}

function RenameViewModal({ view, onClose, onConfirm }: { view: CrmSavedView; onClose: () => void; onConfirm: (title: string) => void }) {
  const [title, setTitle] = useState(view.title)
  const submit = () => {
    const next = title.trim()
    if (!next || next === view.title) { onClose(); return }
    onConfirm(next)
  }
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Enter') {
        const next = title.trim()
        if (!next || next === view.title) onClose()
        else onConfirm(next)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, onConfirm, title, view.title])
  return <div className="scrim" onClick={onClose}><div className="modal sm rename-view-modal" onClick={event => event.stopPropagation()}><div className="modal-hd">Rename view<button className="x" onClick={onClose} aria-label="Close dialog"><Icon name="x" size={15} /></button></div><div className="modal-bd"><div className="field-lbl">View name</div><input className="txt" autoFocus value={title} onChange={event => setTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); submit() } }} /></div><div className="modal-ft"><button className="btn btn-ghost" onClick={onClose}>Cancel<span className="kbd">ESC</span></button><button className="btn btn-primary" disabled={!title.trim()} onClick={submit}>Save<span className="kbd">Enter</span></button></div></div></div>
}

function CreateAttributeModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, type: string) => Promise<void> | void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('Text')
  const [ai, setAi] = useState(false)
  const types = ['Text', 'Number', 'Date', 'Select', 'Multi-select', 'Checkbox', 'URL', 'Email', 'Phone', 'Currency']
  return <div className="scrim" onClick={onClose}><div className="modal sm" onClick={event => event.stopPropagation()}><div className="modal-hd">Create attribute<button className="x" onClick={onClose} aria-label="Close dialog"><Icon name="x" size={15} /></button></div><div className="modal-bd"><div className="field-lbl">Attribute name</div><input className="txt" autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="New attribute" /><div className="field-lbl">Type</div><select className="txt" value={type} onChange={event => setType(event.target.value)}>{types.map(item => <option key={item}>{item}</option>)}</select><div className="stage-toggle-row"><span className="ti"><Icon name="sparkle" size={14} /></span><span className="lbl">AI enrichment</span><Toggle on={ai} onChange={setAi} /></div>{ai && <div className="pop-empty">AI enrichment is illustrative and remains a product stub.</div>}</div><div className="modal-ft"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!name.trim()} onClick={() => void onCreate(name.trim(), type)}>Create attribute</button></div></div></div>
}

export interface CrmViewSurfaceProps {
  object: CrmObject
  attributes: CrmAttribute[]
  records: UnifiedRecord[]
  views: CrmSavedView[]
  activeView: CrmSavedView | null
  stages: CrmViewStageSetting[]
  canWrite: boolean
  loading?: boolean
  onSwitchView: (view: CrmSavedView) => void
  onCreateView: (input: CreateCrmViewInput) => Promise<CrmSavedView | null>
  onPatchView: (viewId: string, patch: Partial<CrmSavedView>) => Promise<unknown>
  onDuplicateView: (view: CrmSavedView) => Promise<CrmSavedView | null>
  onDeleteView: (view: CrmSavedView) => Promise<boolean>
  onCreateAttribute: (name: string, type: string) => Promise<CrmAttribute | null>
  onReloadAttributes: () => Promise<unknown> | unknown
  onAddRecords: (stageId?: string | null) => void
  onOpenRecord: (record: UnifiedRecord, order: string[]) => void
  onUpdateCell: (record: UnifiedRecord, attribute: CrmAttribute, value: unknown) => Promise<void>
  onMoveStage: (record: UnifiedRecord, stageId: string | null) => Promise<void>
  onStageSettingsChange: (stages: CrmViewStageSetting[]) => Promise<void>
  onRemoveRecords?: (recordIds: string[]) => Promise<void>
  onAddToList?: (recordIds: string[]) => void
  onOpenLinkedInBatch?: (records: UnifiedRecord[]) => void
  onNotify: (message: string, icon?: TodayIconName) => void
  listMode?: boolean
}

type PopState = { type: string; anchor: DOMRect; key?: string }

export default function CrmViewSurface(props: CrmViewSurfaceProps) {
  const { object, attributes, records, views, activeView: view, stages } = props
  const [pop, setPop] = useState<PopState | null>(null)
  const [createView, setCreateView] = useState<CrmViewType | null>(null)
  const [renameView, setRenameView] = useState<CrmSavedView | null>(null)
  const [createAttribute, setCreateAttribute] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [viewQuery, setViewQuery] = useState('')
  const [editing, setEditing] = useState<{ recordId: string; key: string; value: unknown } | null>(null)
  const [context, setContext] = useState<{ x: number; y: number; record: UnifiedRecord } | null>(null)
  const dragColumn = useRef<string | null>(null)
  const dragStage = useRef<string | null>(null)
  const [newStage, setNewStage] = useState(false)
  const [newStageName, setNewStageName] = useState('')
  const [transientWidths, setTransientWidths] = useState<Record<string, number>>({})

  useEffect(() => { setSelected(new Set()); setEditing(null); setPop(null); setTransientWidths({}) }, [view?.id])

  const activeAttributes = useMemo(() => attributes.filter(attribute => !attribute.is_archived && !attribute.is_relationship), [attributes])
  const byKey = useMemo(() => new Map(activeAttributes.map(attribute => [attribute.key, attribute])), [activeAttributes])
  const visibleAttributes = useMemo(() => (view?.columns ?? []).map(key => byKey.get(key)).filter((attribute): attribute is CrmAttribute => Boolean(attribute)), [byKey, view?.columns])
  const hiddenAttributes = useMemo(() => activeAttributes.filter(attribute => !view?.columns.includes(attribute.key)), [activeAttributes, view?.columns])
  const displayed = useMemo(() => {
    if (!view) return []
    const needle = query.trim().toLowerCase()
    const searched = needle ? records.filter(record => [record.title, record.subtitle, ...Object.values(record.values)].some(value => String(comparable(value)).toLowerCase().includes(needle))) : records
    return applyCrmView(searched, view, attributes)
  }, [attributes, query, records, view])
  const shownViews = useMemo(() => {
    const needle = viewQuery.trim().toLowerCase()
    const sorted = [...views].sort((left, right) => Number(right.is_favorite) - Number(left.is_favorite) || left.position - right.position)
    return needle ? sorted.filter(item => item.title.toLowerCase().includes(needle)) : sorted
  }, [viewQuery, views])

  if (props.loading || !view) {
    return <div className="lv"><div className="tbl-empty"><div className="glyph"><Icon name={views.length ? 'table' : 'grid'} size={30} /></div><h3>{views.length ? 'Loading view' : 'Start with a view'}</h3><p>{views.length ? 'Loading records and settings.' : `Organize and visualize your ${object.plural_name.toLowerCase()}.`}</p>{!views.length && <div className="sv-cards"><button className="sv-card" onClick={() => setCreateView('table')}><Icon name="table" size={18} /><h3>Table</h3></button><button className="sv-card" onClick={() => setCreateView('kanban')}><Icon name="kanban" size={18} /><h3>Kanban</h3></button></div>}</div>{createView && <CreateViewModal object={object} attributes={attributes} listMode={props.listMode} initialType={createView} onClose={() => setCreateView(null)} onConfirm={async input => { const created = await props.onCreateView(input); if (!created) { props.onNotify('Could not create view', 'x'); return false } props.onSwitchView(created); setCreateView(null); return true }} />}</div>
  }

  const open = (type: string, event: ReactMouseEvent<HTMLElement>, key?: string) => {
    event.stopPropagation()
    const anchor = event.currentTarget.getBoundingClientRect()
    setPop(current => current?.type === type && current.key === key ? null : { type, anchor, key })
  }
  const close = () => setPop(null)
  const patch = (updates: Partial<CrmSavedView>) => props.onPatchView(view.id, updates)
  const setColumns = (columns: string[]) => void patch({ columns })
  const reorderColumn = (from: string, to: string) => {
    const next = [...view.columns]
    const fromIndex = next.indexOf(from)
    const toIndex = next.indexOf(to)
    if (fromIndex < 0 || toIndex < 0) return
    next.splice(toIndex, 0, next.splice(fromIndex, 1)[0])
    setColumns(next)
  }
  const allSelected = displayed.length > 0 && displayed.every(record => selected.has(record.id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(displayed.map(record => record.id)))
  const toggleOne = (id: string) => setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const widths = { ...view.column_widths, ...transientWidths }
  const primaryWidth = widths.__primary || 240
  const template = `36px ${primaryWidth}px ${visibleAttributes.map(attribute => `${widths[attribute.key] || 168}px`).join(' ')} 120px`
  const isKanban = view.view_type === 'kanban'
  const groupKey = view.list_id ? '__stage' : view.group_by_attribute_key || '__stage'
  const resolvedStages = [{ id: null, label: 'No stage', color: 'transparent' }, ...stages.filter(stage => stage.id !== null)]

  const startResize = (event: ReactMouseEvent, key: string) => {
    event.preventDefault(); event.stopPropagation()
    const startX = event.clientX
    const startWidth = widths[key] || (key === '__primary' ? 240 : 168)
    let nextWidth = startWidth
    const move = (next: MouseEvent) => { nextWidth = Math.max(key === '__primary' ? 180 : 90, startWidth + next.clientX - startX); setTransientWidths(current => ({ ...current, [key]: nextWidth })) }
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); void props.onPatchView(view.id, { column_widths: { ...view.column_widths, [key]: nextWidth } }) }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }

  const commitEdit = async (record: UnifiedRecord, attribute: CrmAttribute, value: unknown) => {
    setEditing(null)
    await props.onUpdateCell(record, attribute, value)
  }

  const toolbar = <><div className="lv-toolbar"><button className={`viewpill${pop?.type === 'views' ? ' on' : ''}`} onClick={event => open('views', event)}><span className={`vm${isKanban ? ' vm-kanban' : ''}`}><Icon name={isKanban ? 'kanban' : 'table'} size={11} /></span><span>{view.title}</span><span className="caret"><Icon name="caretDown" size={11} /></span></button><button className={`vs-btn${pop?.type === 'settings' ? ' on' : ''}`} onClick={event => open('settings', event)}><Icon name="sliders" size={13} /><span>View settings</span><span className="caret"><Icon name="caretDown" size={11} /></span></button><div className="lv-tools-r">{props.onOpenLinkedInBatch && object.slug === 'people' && <button className="vs-btn linkedin-batch-btn" onClick={() => props.onOpenLinkedInBatch?.(displayed)}><Icon name="linkedin" size={13} /><span>Open LinkedIn profiles</span></button>}<button className={`vs-btn${pop?.type === 'import' ? ' on' : ''}`} onClick={event => open('import', event)}><Icon name="export" size={13} /><span>Import / Export</span><span className="caret"><Icon name="caretDown" size={11} /></span></button><button className="btn btn-primary" disabled={!props.canWrite} onClick={() => props.onAddRecords()}><Icon name="plus" size={13} />Add {object.singular_name}</button></div></div><div className="subbar">{isKanban ? <button className="chipbtn" onClick={() => props.onNotify(`Grouped by ${byKey.get(groupKey)?.name || 'Stage'}`, 'columns')}><Icon name="columns" size={12} /><span>Group by</span><strong>{byKey.get(groupKey)?.name || 'Stage'}</strong></button> : <button className={`chipbtn${view.sorts.length ? ' applied' : ''}`} onClick={event => open('sort', event)}><Icon name="sort" size={12} /><span>{view.sorts.length ? 'Sorted by' : 'Sort'}</span>{view.sorts.length > 0 && <strong>{byKey.get(view.sorts[0].key)?.name}{view.sorts.length > 1 ? ` +${view.sorts.length - 1}` : ''}</strong>}</button>}<button className={`chipbtn${view.filters.length ? ' applied' : ''}`} onClick={event => open('filter', event)}><Icon name="funnel" size={12} /><span>Filter</span>{view.filters.length > 0 && <strong>{view.filters.length}</strong>}</button><div className="handoff-list-search"><Icon name="search" size={12} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${object.plural_name.toLowerCase()}`} /></div><span className="subbar-grow" />{isKanban ? <div className="viewmode"><button className={view.density === 'standard' ? 'on' : ''} onClick={() => void patch({ density: 'standard' })}><Icon name="kanban" size={13} /></button><button className={view.density === 'compact' ? 'on' : ''} onClick={() => void patch({ density: 'compact' })}><Icon name="rows" size={13} /></button></div> : <span className="subbar-count">{displayed.length} {object.plural_name.toLowerCase()}</span>}</div></>

  const table = <div className={`tbl-wrap${view.density === 'compact' ? ' density-compact' : ''}`}><div className="tbl"><div className="trow thead" style={{ gridTemplateColumns: template }}><div className="tcell check"><span className={`cb head-cb${allSelected ? ' on' : ''}`} onClick={toggleAll}>{allSelected && <Icon name="check" size={10} sw={2.2} />}</span></div><div className="tcell primary-col"><button className="colhd"><span className="cico"><Icon name="contact" size={13} /></span><span className="lbl">{object.singular_name}</span></button><button className="rowplus" title={`Add ${object.singular_name}`} onClick={() => props.onAddRecords()}><Icon name="plus" size={13} /></button><span className="col-resize" draggable={false} onMouseDown={event => startResize(event, '__primary')} /></div>{visibleAttributes.map(attribute => <div key={attribute.id} draggable onDragStart={event => { dragColumn.current = attribute.key; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/crm-column', attribute.key) }} onDragOver={event => { if (dragColumn.current && dragColumn.current !== attribute.key) event.preventDefault() }} onDrop={event => { event.preventDefault(); const from = dragColumn.current || event.dataTransfer.getData('text/crm-column'); if (from) reorderColumn(from, attribute.key); dragColumn.current = null }} className={`tcell draggable-col${attribute.is_enriched ? ' enrich' : ''}`}><button className={`colhd${pop?.type === 'column' && pop.key === attribute.key ? ' on' : ''}`} onClick={event => open('column', event, attribute.key)}><span className="cico"><Icon name={attributeIcon(attribute)} size={13} /></span><span className="lbl">{attribute.name}</span><span className="caret"><Icon name="caretDown" size={10} /></span></button>{attribute.is_enriched && <span className="col-bolt"><Icon name="bolt" size={11} /></span>}<span className="col-resize" draggable={false} onMouseDown={event => startResize(event, attribute.key)} /></div>)}<div className="tcell addcol-hd"><button className="addcol-btn" onClick={event => open('add-column', event)}><Icon name="plus" size={13} /><span>Add column</span></button></div></div>{displayed.map(record => <div key={record.id} className={`trow body${selected.has(record.id) ? ' picked' : ''}`} style={{ gridTemplateColumns: template }} onClick={() => props.onOpenRecord(record, displayed.map(item => item.id))} onContextMenu={event => { event.preventDefault(); setContext({ x: event.clientX, y: event.clientY, record }) }}><div className="tcell check" onClick={event => event.stopPropagation()}><span className={`cb${selected.has(record.id) ? ' on' : ''}`} onClick={() => toggleOne(record.id)}>{selected.has(record.id) && <Icon name="check" size={10} sw={2.2} />}</span></div><div className="tcell"><span className="c-name"><Logo id={record.imageUrl || record.title} size={22} sq={object.slug !== 'people'} /><span className="link">{record.title}</span></span></div>{visibleAttributes.map(attribute => { const active = editing?.recordId === record.id && editing.key === attribute.key; const value = record.values[attribute.key]; return <div key={attribute.id} className={`tcell${attribute.is_enriched ? ' enrich' : ''}${!isEmpty(value) ? ' filled' : ''}${attribute.is_editable ? ' editable' : ''}`} onClick={event => { if (!attribute.is_editable || !props.canWrite) return; event.stopPropagation(); setEditing({ recordId: record.id, key: attribute.key, value: comparable(value) }) }}>{active ? attribute.attribute_type === 'Select' ? <select className="cell-edit sel" autoFocus value={String(editing.value ?? '')} onChange={event => void commitEdit(record, attribute, event.target.value)} onBlur={() => setEditing(null)}><option value="">No value</option>{attribute.options?.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select> : <input className="cell-edit" type={attribute.attribute_type === 'Date' ? 'date' : ['Number', 'Currency'].includes(attribute.attribute_type) ? 'number' : 'text'} autoFocus value={String(editing.value ?? '')} onChange={event => setEditing(current => current ? { ...current, value: event.target.value } : current)} onBlur={() => void commitEdit(record, attribute, editing.value)} onKeyDown={event => { if (event.key === 'Enter') void commitEdit(record, attribute, editing.value); if (event.key === 'Escape') setEditing(null) }} /> : renderCell(value, attribute)}</div>})}<div className="tcell"><button className="rowplus" title="Open record" onClick={event => { event.stopPropagation(); props.onOpenRecord(record, displayed.map(item => item.id)) }}><Icon name="arrowUpRight" size={12} /></button></div></div>)}<div className="trow tfoot" style={{ gridTemplateColumns: template }}><div className="tcell check" /><div className="tcell">{displayed.length} count</div>{visibleAttributes.map(attribute => <div className="tcell" key={attribute.id}><span className="calc" onClick={() => props.onNotify('Calculations are a product stub', 'plus')}><Icon name="plus" size={10} /> Add calculation</span></div>)}<div className="tcell" /></div></div>{displayed.length === 0 && <div className="tbl-empty"><div className="glyph"><Icon name="contact" size={30} /></div><h3>No records</h3><p>No records match this view.</p><button className="btn btn-primary" onClick={() => props.onAddRecords()}><Icon name="plus" size={13} />Add {object.singular_name}</button></div>}</div>

  const kanban = <div className={`kanban${view.density === 'compact' ? ' compact' : ''}`}>{resolvedStages.map(stage => { const stageRecords = displayed.filter(record => String(record.values[groupKey] ?? '') === String(stage.id ?? '')); return <div className="kcol" key={stage.id ?? 'none'} onDragOver={event => event.preventDefault()} onDrop={event => { if (dragStage.current && stage.id !== null) { const from = stages.findIndex(item => String(item.id) === dragStage.current); const to = stages.findIndex(item => item.id === stage.id); if (from >= 0 && to >= 0) { const next = [...stages]; next.splice(to, 0, next.splice(from, 1)[0]); void props.onStageSettingsChange(next) } dragStage.current = null; return } const id = event.dataTransfer.getData('text/crm-record'); const record = displayed.find(item => item.id === id); if (record) { void props.onMoveStage(record, stage.id); if (stage.confetti) fireConfetti() } }}><div className="kcol-hd"><span className={`kdot${stage.id === null ? ' hollow' : ''}`} style={{ background: stage.id === null ? undefined : stage.color }} /><span className="kname">{stage.label}</span><span className="kn">{stageRecords.length}</span>{stage.id !== null && <span className="kacts"><button title="Add" onClick={() => props.onAddRecords(stage.id)}><Icon name="plus" size={13} /></button><button title="Options" draggable onDragStart={event => { event.stopPropagation(); dragStage.current = String(stage.id); event.dataTransfer.setData('text/crm-stage', String(stage.id)) }} onClick={event => open('stage', event, String(stage.id))}><Icon name="grip" size={13} /></button></span>}</div><div className="kstack">{stageRecords.map(record => { const days = Number(record.values.__stageDays ?? 0); return <div key={record.id} className="kcard" draggable onDragStart={event => event.dataTransfer.setData('text/crm-record', record.id)} onClick={() => props.onOpenRecord(record, displayed.map(item => item.id))}><div className="kcard-top"><Logo id={record.imageUrl || record.title} size={20} sq={object.slug !== 'people'} /><span className="link">{record.title}</span><button className="kcard-menu" onClick={event => open('card', event, record.id)}><Icon name="grip" size={13} /></button></div>{view.density === 'standard' && <div className="kcard-meta"><span className="mi"><Icon name="article" size={13} /></span><span className="mi"><Icon name="checkcircle" size={13} /></span><span className="mi"><Icon name="chat" size={13} /></span><span className={`time${days > 10 ? ' warn' : ''}`}><Icon name="clock" size={12} />{days}d</span></div>}</div>})}<button className="kcard-add" onClick={() => props.onAddRecords(stage.id)}><Icon name="plus" size={12} />Add {object.singular_name}</button></div></div>})}<div className="kadd-col"><button title="Add stage" onClick={() => setNewStage(true)}><Icon name="plus" size={15} /></button></div></div>

  return <div className="lv crm-view-surface">{toolbar}{isKanban ? kanban : table}
    {selected.size > 0 && createPortal(<div className="bulkbar"><span className="bulk-n">{selected.size} Selected</span><button className="bulk-x" onClick={() => setSelected(new Set())} aria-label="Clear selection"><Icon name="x" size={13} /></button><span className="bulk-sep" /><button className="bulk-act" onClick={() => props.onAddToList?.([...selected])}><Icon name="list" size={13} />Add to list</button><button className="bulk-act" disabled><Icon name="chat" size={13} />Send email</button><button className="bulk-act" disabled><Icon name="sparkle" size={13} />Run workflow</button>{props.onRemoveRecords && <button className="bulk-act danger" onClick={() => void props.onRemoveRecords?.([...selected]).then(() => setSelected(new Set()))}><Icon name="trash" size={13} />Remove from list</button>}</div>, document.body)}
    {pop?.type === 'views' && <PopFrame anchor={pop.anchor} width={280} onClose={() => { setViewQuery(''); close() }}><div className="pop-search"><span className="ico"><Icon name="search" size={13} /></span><input autoFocus placeholder="Search views..." value={viewQuery} onChange={event => setViewQuery(event.target.value)} /></div>{shownViews.map(item => <div key={item.id} className={`pop-item view-switch-row${item.id === view.id ? ' sel' : ''}`} onClick={() => { props.onSwitchView(item); setViewQuery(''); close() }}><span className="ico"><Icon name={item.view_type === 'kanban' ? 'kanban' : 'table'} size={14} /></span><span className="lbl">{item.title}</span>{item.is_favorite && <span className="view-favorite" title="Favorite"><Icon name="star" size={12} fill /></span>}{item.id === view.id && <Icon name="check" size={13} />}<button type="button" className="rowmenu" aria-label={`Options for ${item.title}`} onClick={event => open('view-row', event, item.id)}><Icon name="dots" size={14} style={{ transform: 'rotate(90deg)' }} /></button></div>)}{shownViews.length === 0 && <div className="pop-empty">No matching views.</div>}<div className="pop-foot"><button className="pop-item" onClick={() => { setViewQuery(''); close(); setCreateView('table') }}><span className="ico"><Icon name="plus" size={13} /></span><span className="lbl">Create new view</span></button></div></PopFrame>}
    {pop?.type === 'view-row' && <PopFrame anchor={pop.anchor} width={190} onClose={close}><button className="pop-item" onClick={() => { const item = views.find(candidate => candidate.id === pop.key); if (item) void props.onPatchView(item.id, { is_favorite: !item.is_favorite }); close() }}><span className="ico"><Icon name="star" size={14} /></span><span className="lbl">{views.find(item => item.id === pop.key)?.is_favorite ? 'Remove from favorites' : 'Add to favorites'}</span></button><button className="pop-item" onClick={() => { const item = views.find(candidate => candidate.id === pop.key); if (item) setRenameView(item); close() }}><span className="ico"><Icon name="pencil" size={14} /></span><span className="lbl">Rename</span></button><button className="pop-item" onClick={async () => { const item = views.find(candidate => candidate.id === pop.key); if (item) { const copy = await props.onDuplicateView(item); if (copy) props.onSwitchView(copy) } close() }}><span className="ico"><Icon name="copy" size={14} /></span><span className="lbl">Duplicate</span></button><div className="pop-sep" /><button className="pop-item danger" disabled={!view.list_id && views.length <= 1} onClick={async () => { const item = views.find(candidate => candidate.id === pop.key); if (item) await props.onDeleteView(item); close() }}><span className="ico"><Icon name="trash" size={14} /></span><span className="lbl">Delete</span></button></PopFrame>}
    {pop?.type === 'settings' && <PopFrame anchor={pop.anchor} width={260} onClose={close}><div className="eyebrow-pop"><Icon name="columns" size={12} /><span>Columns</span><span className="cnt">{visibleAttributes.length} shown</span></div><div className="vs-chip"><span className="grip"><Icon name="lock" size={11} /></span><span className="ico"><Icon name="contact" size={13} /></span><span className="lbl">{object.singular_name}</span></div>{visibleAttributes.map(attribute => <div key={attribute.id} className="vs-chip" draggable onDragStart={() => { dragColumn.current = attribute.key }} onDragOver={event => event.preventDefault()} onDrop={() => { if (dragColumn.current) reorderColumn(dragColumn.current, attribute.key); dragColumn.current = null }}><span className="grip"><Icon name="grip" size={13} /></span><span className="ico"><Icon name={attributeIcon(attribute)} size={13} /></span><span className="lbl">{attribute.name}</span><button className="eye on" title="Hide column" onClick={() => setColumns(view.columns.filter(key => key !== attribute.key))}><Icon name="eye" size={13} /></button></div>)}{hiddenAttributes.length > 0 && <div className="pop-group">Hidden</div>}{hiddenAttributes.map(attribute => <div key={attribute.id} className="vs-chip hidden"><span className="grip"><Icon name="grip" size={13} /></span><span className="ico"><Icon name={attributeIcon(attribute)} size={13} /></span><span className="lbl">{attribute.name}</span><button className="eye" title="Show column" onClick={() => setColumns([...view.columns, attribute.key])}><Icon name="eyeOff" size={13} /></button></div>)}<div className="pop-sep" /><button className="pop-item" onClick={() => void patch({ density: view.density === 'standard' ? 'compact' : 'standard' })}><span className="lbl">{view.density === 'standard' ? 'Standard' : 'Compact'}</span><Icon name="check" size={12} /></button><div className="vs-toggle-row"><span className="lbl">Show attribute name</span><Toggle on={view.show_attribute_names} onChange={next => void patch({ show_attribute_names: next })} /></div><div className="pop-foot"><button className="pop-item" onClick={event => open('add-column', event)}><span className="ico"><Icon name="plus" size={13} /></span><span className="lbl">Add attribute to view</span><span className="chev"><Icon name="chevron-right" size={12} /></span></button></div></PopFrame>}
    {pop?.type === 'add-column' && <AttributePicker anchor={pop.anchor} hidden={hiddenAttributes} onClose={close} onAdd={key => setColumns(view.columns.includes(key) ? view.columns : [...view.columns, key])} onCreate={() => { close(); setCreateAttribute(true) }} />}
    {pop?.type === 'import' && <PopFrame anchor={pop.anchor} width={200} align="right" onClose={close}><button className="pop-item" onClick={() => { props.onNotify('Export CSV is a product stub', 'export'); close() }}><span className="ico"><Icon name="export" size={14} /></span><span className="lbl">Export as CSV</span></button><button className="pop-item" onClick={() => { props.onNotify('Import CSV is a product stub', 'export'); close() }}><span className="ico"><Icon name="export" size={14} /></span><span className="lbl">Import from CSV</span></button></PopFrame>}
    {pop?.type === 'column' && <PopFrame anchor={pop.anchor} width={200} onClose={close}><button className="pop-item" onClick={() => { void patch({ sorts: [{ key: pop.key!, direction: 'asc' }] }); close() }}><span className="ico"><Icon name="sort" size={14} /></span><span className="lbl">Sort ascending</span></button><button className="pop-item" onClick={() => { void patch({ sorts: [{ key: pop.key!, direction: 'desc' }] }); close() }}><span className="ico"><Icon name="sort" size={14} /></span><span className="lbl">Sort descending</span></button><button className="pop-item" onClick={event => open('settings', event)}><span className="ico"><Icon name="columns" size={14} /></span><span className="lbl">Manage columns</span></button><div className="pop-sep" /><button className="pop-item danger" onClick={() => { setColumns(view.columns.filter(key => key !== pop.key)); close() }}><span className="ico"><Icon name="eyeOff" size={14} /></span><span className="lbl">Hide column</span></button></PopFrame>}
    {pop?.type === 'filter' && <FilterPop anchor={pop.anchor} attributes={activeAttributes} filters={view.filters} onChange={filters => void patch({ filters })} onClose={close} />}
    {pop?.type === 'sort' && <SortPop anchor={pop.anchor} attributes={activeAttributes} sorts={view.sorts} onChange={sorts => void patch({ sorts })} onClose={close} />}
    {pop?.type === 'card' && <PopFrame anchor={pop.anchor} width={190} onClose={close}><button className="pop-item" onClick={() => { const record = records.find(item => item.id === pop.key); if (record) props.onOpenRecord(record, displayed.map(item => item.id)); close() }}><span className="ico"><Icon name="arrowUpRight" size={14} /></span><span className="lbl">Open record</span></button><button className="pop-item" onClick={() => { if (pop.key) props.onAddToList?.([pop.key]); close() }}><span className="ico"><Icon name="list" size={14} /></span><span className="lbl">Add to another list</span></button>{props.onRemoveRecords && <><div className="pop-sep" /><button className="pop-item danger" onClick={() => { if (pop.key) void props.onRemoveRecords?.([pop.key]); close() }}><span className="ico"><Icon name="trash" size={14} /></span><span className="lbl">Remove from list</span></button></>}</PopFrame>}
    {pop?.type === 'stage' && <StagePop anchor={pop.anchor} stage={stages.find(item => String(item.id) === pop.key)!} stages={stages} onChange={props.onStageSettingsChange} onClose={close} />}
    {context && <PopFrame anchor={new DOMRect(context.x, context.y, 0, 0)} width={210} onClose={() => setContext(null)}><button className="pop-item" onClick={() => { props.onOpenRecord(context.record, displayed.map(item => item.id)); setContext(null) }}><span className="ico"><Icon name="arrowUpRight" size={14} /></span><span className="lbl">Open record</span></button><button className="pop-item" onClick={() => { props.onAddToList?.([context.record.id]); setContext(null) }}><span className="ico"><Icon name="list" size={14} /></span><span className="lbl">Add to another list</span></button><button className="pop-item" onClick={() => { navigator.clipboard?.writeText(window.location.href); props.onNotify('Record link copied', 'copy'); setContext(null) }}><span className="ico"><Icon name="copy" size={14} /></span><span className="lbl">Copy record link</span></button>{props.onRemoveRecords && <><div className="pop-sep" /><button className="pop-item danger" onClick={() => { void props.onRemoveRecords?.([context.record.id]); setContext(null) }}><span className="ico"><Icon name="trash" size={14} /></span><span className="lbl">Remove from list</span></button></>}</PopFrame>}
    {createView && <CreateViewModal object={object} attributes={attributes} listMode={props.listMode} initialType={createView} onClose={() => setCreateView(null)} onConfirm={async input => { const created = await props.onCreateView(input); if (!created) { props.onNotify('Could not create view', 'x'); return false } props.onSwitchView(created); setCreateView(null); return true }} />}
    {renameView && <RenameViewModal view={renameView} onClose={() => setRenameView(null)} onConfirm={title => { void props.onPatchView(renameView.id, { title }); setRenameView(null) }} />}
    {createAttribute && <CreateAttributeModal onClose={() => setCreateAttribute(false)} onCreate={async (name, type) => { const attribute = await props.onCreateAttribute(name, type); if (attribute) { await props.onReloadAttributes(); setColumns([...view.columns, attribute.key]); setCreateAttribute(false) } }} />}
    {newStage && <div className="scrim" onClick={() => setNewStage(false)}><div className="stage-pop" onClick={event => event.stopPropagation()}><div className="stage-name-wrap"><span className="stage-dot-btn" style={{ background: PALETTE[stages.length % PALETTE.length] }} /><input className="stage-name" autoFocus placeholder="New stage name" value={newStageName} onChange={event => setNewStageName(event.target.value)} /><button className="stage-enter" disabled={!newStageName.trim()} onClick={() => { const label = newStageName.trim(); void props.onStageSettingsChange([...stages, { id: label.toLowerCase().replace(/\s+/g, '-'), label, color: PALETTE[stages.length % PALETTE.length] }]); setNewStageName(''); setNewStage(false) }} aria-label="Create stage"><Icon name="enter" size={12} /></button></div></div></div>}
  </div>
}

function AttributeChoicePop({ anchor, attributes, onPick, onClose }: { anchor: DOMRect; attributes: CrmAttribute[]; onPick: (key: string) => void; onClose: () => void }) {
  return <PopFrame anchor={anchor} width={220} onClose={onClose}><div className="pop-group">Attributes</div><div className="condition-choice-list">{attributes.map(attribute => <button type="button" className="pop-item" key={attribute.id} onClick={() => { onPick(attribute.key); onClose() }}><span className="ico"><Icon name={attributeIcon(attribute)} size={14} /></span><span className="lbl">{attribute.name}</span></button>)}</div></PopFrame>
}

function OperatorChoicePop({ anchor, operators, onPick, onClose }: { anchor: DOMRect; operators: CrmFilterOperator[]; onPick: (operator: CrmFilterOperator) => void; onClose: () => void }) {
  return <PopFrame anchor={anchor} width={190} onClose={onClose}>{operators.map(operator => <button type="button" className="pop-item" key={operator} onClick={() => { onPick(operator); onClose() }}><span className="lbl">{operator}</span></button>)}</PopFrame>
}

function ValueChoicePop({ anchor, attribute, value, onPick, onClose }: { anchor: DOMRect; attribute: CrmAttribute; value: unknown; onPick: (value: unknown) => void; onClose: () => void }) {
  if (attribute.attribute_type === 'Checkbox') {
    return <PopFrame anchor={anchor} width={170} onClose={onClose}>{[['true', 'Checked'], ['false', 'Unchecked']].map(([next, label]) => <button type="button" className="pop-item" key={next} onClick={() => { onPick(next === 'true'); onClose() }}><span className={`cb${String(value) === next ? ' on' : ''}`}>{String(value) === next && <Icon name="check" size={10} />}</span><span className="lbl">{label}</span></button>)}</PopFrame>
  }
  const options = attribute.options ?? []
  const selected = Array.isArray(value) ? value.map(String) : []
  return <PopFrame anchor={anchor} width={210} onClose={onClose}>{options.map(option => {
    const checked = attribute.attribute_type === 'Multi-select' && selected.includes(option.id)
    return <button type="button" className="pop-item" key={option.id} onClick={() => {
      if (attribute.attribute_type === 'Multi-select') onPick(checked ? selected.filter(item => item !== option.id) : [...selected, option.id])
      else { onPick(option.id); onClose() }
    }}>{attribute.attribute_type === 'Multi-select' ? <span className={`cb${checked ? ' on' : ''}`}>{checked && <Icon name="check" size={10} />}</span> : <span className="dot" style={{ width: 8, height: 8, borderRadius: 999, background: option.color || '#8A99A3' }} />}<span className="lbl">{option.label}</span></button>
  })}{options.length === 0 && <div className="pop-empty">No options available.</div>}</PopFrame>
}

function filterValueLabel(attribute: CrmAttribute, value: unknown) {
  if (attribute.attribute_type === 'Checkbox') return value === true ? 'Checked' : value === false ? 'Unchecked' : 'Choose...'
  if (attribute.attribute_type === 'Multi-select') {
    const values = Array.isArray(value) ? value.map(String) : []
    return values.length ? values.map(item => attribute.options?.find(option => option.id === item)?.label ?? item).join(', ') : 'Choose...'
  }
  return attribute.options?.find(option => option.id === String(value))?.label ?? 'Choose...'
}

function FilterConditionRow({ filter, attributes, onChange, onRemove }: { filter: CrmViewFilter; attributes: CrmAttribute[]; onChange: (next: CrmViewFilter) => void; onRemove: () => void }) {
  const [sub, setSub] = useState<{ type: 'attribute' | 'operator' | 'value'; anchor: DOMRect } | null>(null)
  const attribute = attributes.find(item => item.key === filter.key) ?? attributes[0]
  if (!attribute) return null
  const operators = OPERATORS[attribute.attribute_type] ?? ['is', 'is empty', 'is not empty']
  const needsValue = !['is empty', 'is not empty'].includes(filter.operator)
  const usesPicker = ['Select', 'Status', 'Multi-select', 'Checkbox'].includes(attribute.attribute_type)
  return <div className="filt-row">
    <button type="button" className="filt-attr" onClick={event => setSub({ type: 'attribute', anchor: event.currentTarget.getBoundingClientRect() })}><Icon name={attributeIcon(attribute)} size={13} /><span>{attribute.name}</span><Icon name="caretDown" size={10} /></button>
    <button type="button" className="filt-op" onClick={event => setSub({ type: 'operator', anchor: event.currentTarget.getBoundingClientRect() })}><span>{filter.operator}</span><Icon name="caretDown" size={10} /></button>
    {needsValue && <div className="filt-val">{usesPicker ? <button type="button" className="fv-lbl" onClick={event => setSub({ type: 'value', anchor: event.currentTarget.getBoundingClientRect() })}>{filterValueLabel(attribute, filter.value)}</button> : <input type={['Number', 'Currency'].includes(attribute.attribute_type) ? 'number' : /date/i.test(attribute.attribute_type) ? 'date' : 'text'} value={String(filter.value ?? '')} placeholder={['Number', 'Currency'].includes(attribute.attribute_type) ? '0' : 'Enter value...'} onChange={event => onChange({ ...filter, value: event.target.value })} />}</div>}
    <button type="button" className="filt-more" aria-label="Remove filter" onClick={onRemove}><Icon name="x" size={12} /></button>
    {sub?.type === 'attribute' && <AttributeChoicePop anchor={sub.anchor} attributes={attributes} onClose={() => setSub(null)} onPick={key => { const nextAttribute = attributes.find(item => item.key === key)!; onChange({ key, operator: (OPERATORS[nextAttribute.attribute_type] ?? ['is'])[0], value: null }) }} />}
    {sub?.type === 'operator' && <OperatorChoicePop anchor={sub.anchor} operators={operators} onClose={() => setSub(null)} onPick={operator => onChange({ ...filter, operator, value: ['is empty', 'is not empty'].includes(operator) ? null : filter.value })} />}
    {sub?.type === 'value' && <ValueChoicePop anchor={sub.anchor} attribute={attribute} value={filter.value} onClose={() => setSub(null)} onPick={value => onChange({ ...filter, value })} />}
  </div>
}

function FilterPop({ anchor, attributes, filters, onChange, onClose }: { anchor: DOMRect; attributes: CrmAttribute[]; filters: CrmViewFilter[]; onChange: (next: CrmViewFilter[]) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<CrmViewFilter[]>(() => filters.map(filter => ({ ...filter })))
  useEffect(() => { setDraft(filters.map(filter => ({ ...filter }))) }, [filters])
  const add = () => {
    const attribute = attributes.find(item => !draft.some(filter => filter.key === item.key)) ?? attributes[0]
    if (attribute) setDraft(current => [...current, { key: attribute.key, operator: (OPERATORS[attribute.attribute_type] ?? ['is'])[0], value: null }])
  }
  const apply = () => { onChange(draft); onClose() }
  const clear = () => { onChange([]); onClose() }
  return <PopFrame anchor={anchor} width={360} onClose={onClose} className="filter-pop"><div className="pop-group">Filter</div>{draft.length === 0 && <div className="pop-empty">No filter conditions yet.</div>}{draft.map((filter, index) => <FilterConditionRow key={`${filter.key}-${index}`} filter={filter} attributes={attributes} onChange={next => setDraft(current => current.map((item, itemIndex) => itemIndex === index ? next : item))} onRemove={() => setDraft(current => current.filter((_, itemIndex) => itemIndex !== index))} />)}<div className="pop-foot filter-foot"><button type="button" className="pop-item" onClick={add}><span className="ico"><Icon name="plus" size={13} /></span><span className="lbl">Add filter condition</span></button><span className="pop-actions"><button type="button" className="btn btn-ghost" disabled={!draft.length && !filters.length} onClick={clear}>Clear</button><button type="button" className="btn btn-primary" onClick={apply}>Apply</button></span></div></PopFrame>
}

function SortConditionRow({ sort, attributes, onChange, onRemove }: { sort: CrmViewSort; attributes: CrmAttribute[]; onChange: (next: CrmViewSort) => void; onRemove: () => void }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const attribute = attributes.find(item => item.key === sort.key) ?? attributes[0]
  if (!attribute) return null
  return <div className="sort-row"><button type="button" className="filt-attr" onClick={event => setAnchor(event.currentTarget.getBoundingClientRect())}><Icon name={attributeIcon(attribute)} size={13} /><span>{attribute.name}</span><Icon name="caretDown" size={10} /></button><div className="sort-dir"><button type="button" className={sort.direction === 'asc' ? 'on' : ''} onClick={() => onChange({ ...sort, direction: 'asc' })}>Ascending</button><button type="button" className={sort.direction === 'desc' ? 'on' : ''} onClick={() => onChange({ ...sort, direction: 'desc' })}>Descending</button></div><button type="button" className="filt-more" aria-label="Remove sort" onClick={onRemove}><Icon name="x" size={12} /></button>{anchor && <AttributeChoicePop anchor={anchor} attributes={attributes} onPick={key => onChange({ ...sort, key })} onClose={() => setAnchor(null)} />}</div>
}

function SortPop({ anchor, attributes, sorts, onChange, onClose }: { anchor: DOMRect; attributes: CrmAttribute[]; sorts: CrmViewSort[]; onChange: (next: CrmViewSort[]) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<CrmViewSort[]>(() => sorts.map(sort => ({ ...sort })))
  useEffect(() => { setDraft(sorts.map(sort => ({ ...sort }))) }, [sorts])
  const add = () => {
    const attribute = attributes.find(item => !draft.some(sort => sort.key === item.key)) ?? attributes[0]
    if (attribute) setDraft(current => [...current, { key: attribute.key, direction: 'asc' }])
  }
  const apply = () => { onChange(draft); onClose() }
  const clear = () => { onChange([]); onClose() }
  return <PopFrame anchor={anchor} width={320} onClose={onClose} className="filter-pop"><div className="pop-group">Sort by</div>{draft.length === 0 && <div className="pop-empty">No sorts applied.</div>}{draft.map((sort, index) => <SortConditionRow key={`${sort.key}-${index}`} sort={sort} attributes={attributes} onChange={next => setDraft(current => current.map((item, itemIndex) => itemIndex === index ? next : item))} onRemove={() => setDraft(current => current.filter((_, itemIndex) => itemIndex !== index))} />)}<div className="pop-foot filter-foot"><button type="button" className="pop-item" onClick={add}><span className="ico"><Icon name="plus" size={13} /></span><span className="lbl">Add sort</span></button><span className="pop-actions"><button type="button" className="btn btn-ghost" disabled={!draft.length && !sorts.length} onClick={clear}>Clear</button><button type="button" className="btn btn-primary" onClick={apply}>Apply</button></span></div></PopFrame>
}

function StagePop({ anchor, stage, stages, onChange, onClose }: { anchor: DOMRect; stage: CrmViewStageSetting; stages: CrmViewStageSetting[]; onChange: (next: CrmViewStageSetting[]) => Promise<void>; onClose: () => void }) {
  const [renaming, setRenaming] = useState(false)
  const [label, setLabel] = useState(stage.label)
  const update = (patch: Partial<CrmViewStageSetting>) => void onChange(stages.map(item => item.id === stage.id ? { ...item, ...patch } : item))
  const commit = () => {
    const next = label.trim()
    if (next && next !== stage.label) update({ label: next })
    setRenaming(false)
  }
  return <PopFrame anchor={anchor} width={230} onClose={onClose}>{renaming ? <div className="stage-rename-row"><input className="txt" autoFocus value={label} onChange={event => setLabel(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') commit(); if (event.key === 'Escape') setRenaming(false) }} /><button className="stage-enter" disabled={!label.trim()} onClick={commit} aria-label="Save stage name"><Icon name="enter" size={12} /></button></div> : <button className="pop-item" onClick={() => setRenaming(true)}><span className="ico"><Icon name="pencil" size={14} /></span><span className="lbl">Rename stage</span></button>}<div className="pop-group">Color</div><div className="color-grid" style={{ boxShadow: 'none', border: 0 }}>{PALETTE.map(color => <button key={color} className={stage.color === color ? 'on' : ''} style={{ background: color }} onClick={() => update({ color })} aria-label={`Set stage color ${color}`} />)}</div><div className="stage-toggle-row"><span className="ti"><Icon name="clock" size={14} /></span><span className="lbl">Track time in stage</span><Toggle on={Boolean(stage.trackTime)} onChange={trackTime => update({ trackTime })} /></div><div className="stage-toggle-row"><span className="ti"><Icon name="sparkle" size={14} /></span><span className="lbl">Confetti</span><Toggle on={Boolean(stage.confetti)} onChange={confetti => update({ confetti })} /></div><div className="pop-sep" /><button className="pop-item danger" onClick={() => { void onChange(stages.filter(item => item.id !== stage.id)); onClose() }}><span className="ico"><Icon name="trash" size={14} /></span><span className="lbl">Delete stage</span></button></PopFrame>
}
