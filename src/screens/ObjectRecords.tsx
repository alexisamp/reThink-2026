import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { useAttioObjectBundle } from '@/hooks/useAttioObjects'
import { useCrmViews } from '@/hooks/useCrmViews'
import { useLists } from '@/hooks/useLists'
import CrmViewSurface from '@/components/crm/CrmViewSurface'
import {
  ACCESS_RANK,
  crmUrlPresentation,
  createCustomAttribute,
  createObjectRecord,
  fetchObjectRecord,
  fetchObjectRecords,
  getEffectiveAccess,
  saveRecordAttributeValue,
  type CreatableAttributeType,
  type CrmAttribute,
  type CrmAttributeOption,
  type CrmObject,
  type UnifiedRecord,
} from '@/lib/attioObjects'
import { addCrmListEntries, type CrmViewStageSetting } from '@/lib/crmViews'
import { Icon, Logo, type TodayIconName } from '@/screens/today/TodayIcons'
import ListGlyph from '@/components/crm/ListGlyph'
export { default as ObjectRecordDetail } from '@/components/crm/CrmRecordDetail'

function routeSlug(slug: string | undefined, pathname: string) {
  if (slug) return slug
  const first = pathname.split('/').filter(Boolean)[0]
  return ['companies', 'people', 'deals'].includes(first) ? first : undefined
}

function objectListPath(object: CrmObject) {
  if (['companies', 'people', 'deals'].includes(object.slug)) return `/${object.slug}/view/all`
  return `/records/${object.slug}`
}

function objectRecordPath(object: CrmObject, recordId: string) {
  if (['companies', 'people', 'deals'].includes(object.slug)) return `/${object.slug}/record/${recordId}`
  return `/records/${object.slug}/${recordId}`
}

function optionByValue(options: CrmAttributeOption[] | null | undefined, value: unknown) {
  const raw = String(value)
  return (options ?? []).find(option => option.id === raw || option.label === raw)
}

function optionChip(option: CrmAttributeOption | undefined, fallback: unknown) {
  const label = option?.label ?? String(fallback)
  return <span className={`chip attio-option-chip ${option?.color ?? 'gray'}`}><span className="dot" />{label}</span>
}

function currencyText(value: unknown, attribute?: CrmAttribute) {
  const config = attribute?.config?.currency
  const currency = config?.currency || 'USD'
  const decimals = config?.decimals ?? 2
  const display = config?.display ?? 'symbol'
  if (typeof value === 'object' && value && 'amount' in value) {
    const amount = Number((value as { amount?: unknown }).amount)
    const valueCurrency = String((value as { currency?: unknown }).currency || currency)
    if (!Number.isFinite(amount)) return String(value)
    if (display === 'code') return `${valueCurrency} ${amount.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
    return amount.toLocaleString(undefined, { style: 'currency', currency: valueCurrency, minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  }
  const amount = Number(value)
  if (!Number.isFinite(amount)) return String(value)
  if (display === 'code') return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
  return amount.toLocaleString(undefined, { style: 'currency', currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function formatRecordDate(value: unknown) {
  if (!value) return ''
  const raw = String(value)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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

function renderValue(value: unknown, attribute?: CrmAttribute) {
  if (value === null || value === undefined || value === '') return <span className="c-muted">—</span>
  if (typeof value === 'boolean') return value ? <Icon name="check" size={12} /> : <span className="c-muted">—</span>
  if (attribute?.is_relationship) return <span className="rel-chip"><Icon name="contact" size={11} />{String(value)}</span>
  if (attribute?.attribute_type === 'Select') return optionChip(optionByValue(attribute.options, value), value)
  if (attribute?.attribute_type === 'Multi-select') {
    const values = Array.isArray(value) ? value : String(value).split(',').filter(Boolean)
    return (
      <span className="chipset">
        {values.slice(0, 3).map(item => {
          const option = optionByValue(attribute.options, item)
          return <span key={String(item)} className={`cat-tag attio-option-chip ${option?.color ?? 'gray'}`}>{option?.label ?? String(item)}</span>
        })}
      </span>
    )
  }
  if (attribute?.attribute_type === 'URL' || attribute?.attribute_type === 'Domain' || attribute?.attribute_type === 'Email') {
    const presentation = crmUrlPresentation(value, attribute.attribute_type)
    return <a className="c-domain" href={presentation.href} title={String(value)} target={attribute.attribute_type === 'Email' ? undefined : '_blank'} rel="noreferrer" onClick={event => event.stopPropagation()}>{presentation.label}</a>
  }
  if (attribute?.attribute_type === 'Status') return <span className="chip"><span className="dot" />{String(value)}</span>
  if (attribute?.attribute_type === 'Currency') return <span className="teamn">{currencyText(value, attribute)}</span>
  if (/date|timestamp/i.test(attribute?.attribute_type ?? '')) return <span className="c-txt">{formatRecordDate(value)}</span>
  if (Array.isArray(value)) return <span className="chipset">{value.slice(0, 3).map(item => <span className="cat-tag" key={String(item)}>{String(item)}</span>)}</span>
  return <span className="c-txt">{String(value)}</span>
}

function NewRecordRow({ object, onCreate }: { object: CrmObject; onCreate: (title: string) => void }) {
  const [title, setTitle] = useState('')
  return (
    <div className="attio-new-row">
      <input
        value={title}
        onChange={event => setTitle(event.target.value)}
        placeholder={`New ${object.singular_name.toLowerCase()}...`}
        autoFocus
        onKeyDown={event => {
          if (event.key === 'Enter' && title.trim()) onCreate(title)
          if (event.key === 'Escape') setTitle('')
        }}
      />
      <button className="attio-btn primary" disabled={!title.trim()} onClick={() => onCreate(title)}>Create</button>
    </div>
  )
}

export default function ObjectRecords() {
  const { slug, viewId } = useParams<{ slug: string; viewId: string }>()
  const location = useLocation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const activeSlug = routeSlug(slug, location.pathname)
  const { object, attributes, permissions, loading, reload: reloadBundle } = useAttioObjectBundle(user?.id, activeSlug)
  const [records, setRecords] = useState<UnifiedRecord[]>([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [newStageId, setNewStageId] = useState<string | null>(null)
  const [addToListIds, setAddToListIds] = useState<string[] | null>(null)
  const [toast, setToast] = useState<{ icon: TodayIconName; text: string } | null>(null)
  const { lists } = useLists(user?.id)
  const effectiveAccess = getEffectiveAccess(permissions)
  const canWrite = ACCESS_RANK[effectiveAccess] >= ACCESS_RANK.read_write
  const viewStore = useCrmViews({ userId: user?.id, object, attributes })
  const activeView = useMemo(() => {
    if (!viewStore.views.length) return null
    if (!viewId || viewId === 'all') return viewStore.views.find(view => view.is_default || view.legacy_key === 'all') ?? viewStore.views[0]
    return viewStore.views.find(view => view.id === viewId || view.legacy_key === viewId) ?? viewStore.views[0]
  }, [viewId, viewStore.views])
  const stages = useMemo<CrmViewStageSetting[]>(() => {
    if (!activeView) return []
    if (activeView.stage_settings.length) return activeView.stage_settings
    const attribute = attributes.find(item => item.key === activeView.group_by_attribute_key)
    return (attribute?.options ?? []).map((option, index) => ({ id: option.id, label: option.label, color: option.color || ['#E4EDFF', '#BAD0FA', '#538BF3', '#266DF0'][index % 4] }))
  }, [activeView, attributes])

  const notify = (icon: TodayIconName, text: string) => {
    setToast({ icon, text })
    window.setTimeout(() => setToast(null), 2200)
  }

  const loadRecords = useCallback(async () => {
    if (!user || !object) return
    setRecordsLoading(true)
    try {
      setRecords(await fetchObjectRecords(user.id, object))
    } finally {
      setRecordsLoading(false)
    }
  }, [object, user])

  useEffect(() => { void loadRecords() }, [loadRecords])

  const addRecord = async (title: string) => {
    if (!user || !object || !canWrite) return
    const id = await createObjectRecord(user.id, object, title)
    if (id && newStageId && activeView?.group_by_attribute_key) {
      const created = await fetchObjectRecord(user.id, object, id)
      const attribute = attributes.find(item => item.key === activeView.group_by_attribute_key)
      if (created && attribute) await saveRecordAttributeValue(user.id, object, created, attribute, newStageId)
    }
    setNewStageId(null)
    setShowNew(false)
    await loadRecords()
    if (id) navigate(objectRecordPath(object, id))
  }

  if (loading || recordsLoading) return <div className="attio-record-page"><div className="attio-empty">Loading...</div></div>
  if (!object) return <div className="attio-record-page"><div className="attio-empty">Object not found.</div></div>

  return (
    <div className="handoff-records">
      <CrmViewSurface
        object={object}
        attributes={attributes}
        records={records}
        views={viewStore.views}
        activeView={activeView}
        stages={stages}
        canWrite={canWrite}
        loading={viewStore.loading}
        onSwitchView={next => navigate(`/${object.slug}/view/${next.is_default || next.legacy_key === 'all' ? 'all' : next.id}`)}
        onCreateView={viewStore.create}
        onPatchView={(id, patch) => viewStore.patch(id, patch)}
        onDuplicateView={viewStore.duplicate}
        onDeleteView={async target => { const removed = await viewStore.remove(target.id); if (removed) navigate(`/${object.slug}/view/all`); return removed }}
        onCreateAttribute={async (name, type) => {
          if (!user) return null
          const { attribute, error } = await createCustomAttribute(user.id, object, { name, attribute_type: type as CreatableAttributeType })
          if (error) notify('x', error.message)
          return attribute
        }}
        onReloadAttributes={reloadBundle}
        onAddRecords={stageId => { setNewStageId(stageId ?? null); setShowNew(true) }}
        onOpenRecord={(record) => navigate(objectRecordPath(object, record.id))}
        onUpdateCell={async (record, attribute, value) => { if (!user) return; const { error } = await saveRecordAttributeValue(user.id, object, record, attribute, value); if (error) notify('x', error.message); else await loadRecords() }}
        onMoveStage={async (record, stageId) => { if (!user || !activeView?.group_by_attribute_key) return; const attribute = attributes.find(item => item.key === activeView.group_by_attribute_key); if (!attribute) return; const { error } = await saveRecordAttributeValue(user.id, object, record, attribute, stageId); if (error) notify('x', error.message); else await loadRecords() }}
        onStageSettingsChange={async nextStages => {
          if (!activeView) return
          const removed = stages.filter(stage => !nextStages.some(next => next.id === stage.id)).map(stage => stage.id)
          if (removed.length && activeView.group_by_attribute_key && user) {
            const attribute = attributes.find(item => item.key === activeView.group_by_attribute_key)
            if (attribute) await Promise.all(records.filter(record => removed.includes(String(record.values[attribute.key]))).map(record => saveRecordAttributeValue(user.id, object, record, attribute, null)))
          }
          await viewStore.patch(activeView.id, { stage_settings: nextStages })
          await loadRecords()
        }}
        onAddToList={recordIds => setAddToListIds(recordIds)}
        onNotify={(text, icon = 'article') => notify(icon, text)}
      />

      {showNew && <div className="scrim" onClick={() => setShowNew(false)}><div className="modal sm" onClick={event => event.stopPropagation()}><div className="modal-hd">Add {object.singular_name}<button className="x" onClick={() => setShowNew(false)} aria-label="Close add record dialog"><Icon name="x" size={15} /></button></div><div className="modal-bd"><NewRecordRow object={object} onCreate={addRecord} /></div></div></div>}
      {addToListIds && <div className="scrim" onClick={() => setAddToListIds(null)}><div className="modal sm" onClick={event => event.stopPropagation()}><div className="modal-hd">Add to list<button className="x" onClick={() => setAddToListIds(null)} aria-label="Close add to list dialog"><Icon name="x" size={15} /></button></div><div className="modal-bd"><div className="pop-group">{object.plural_name} lists</div>{lists.filter(list => (list.object_slug || 'people') === object.slug).map(list => <button className="rec-item list-destination" key={list.id} onClick={async () => { if (!user) return; await addCrmListEntries(user.id, list.id, object.slug, addToListIds, list.stages[0]?.key ?? null); notify('list', `${addToListIds.length} ${addToListIds.length === 1 ? 'record' : 'records'} added to ${list.name}`); setAddToListIds(null) }}><ListGlyph value={list.icon} /><span className="rname">{list.name}</span><span className="cl-badge">{list.stages.length} stages</span></button>)}{lists.filter(list => (list.object_slug || 'people') === object.slug).length === 0 && <div className="pop-empty">No {object.plural_name.toLowerCase()} lists yet.</div>}</div><div className="modal-ft"><button className="btn btn-ghost" onClick={() => setAddToListIds(null)}>Cancel</button><button className="btn btn-primary" onClick={() => navigate(`/lists?new=1&object=${object.slug}`)}><Icon name="plus" size={12} />New list</button></div></div></div>}
      {(toast || viewStore.error) && <div className="toast"><span className="em"><Icon name={toast?.icon ?? 'x'} size={13} /></span>{toast?.text ?? viewStore.error}</div>}
    </div>
  )
}

function draftFromValue(attribute: CrmAttribute, value: unknown) {
  if (value === null || value === undefined) return ''
  if (/date|timestamp/i.test(attribute.attribute_type)) return String(value).slice(0, 10)
  if (attribute.attribute_type === 'Currency' && typeof value === 'object' && value && 'amount' in value) return String((value as { amount?: unknown }).amount ?? '')
  if (attribute.attribute_type === 'Multi-select' && Array.isArray(value)) return value.map(item => String(item)).join(',')
  if (attribute.attribute_type === 'Checkbox') return Boolean(value)
  return String(value)
}

function AttributeValueEditor({
  attribute,
  value,
  disabled,
  alwaysEditing = false,
  onSave,
}: {
  attribute: CrmAttribute
  value: unknown
  disabled: boolean
  alwaysEditing?: boolean
  onSave: (value: unknown) => void
}) {
  const [draft, setDraft] = useState<unknown>(draftFromValue(attribute, value))
  const [editing, setEditing] = useState(alwaysEditing)
  useEffect(() => setDraft(draftFromValue(attribute, value)), [attribute, value])
  useEffect(() => setEditing(alwaysEditing), [alwaysEditing])
  const placeholder = `Set ${attribute.name}...`

  const commit = (next: unknown = draft) => {
    if (attribute.attribute_type === 'Multi-select' && Array.isArray(next)) {
      onSave(next)
      if (!alwaysEditing) setEditing(false)
      return
    }
    if (attribute.attribute_type === 'Checkbox') {
      onSave(Boolean(next))
      if (!alwaysEditing) setEditing(false)
      return
    }
    onSave(typeof next === 'string' ? next.trim() || null : next)
    if (!alwaysEditing) setEditing(false)
  }

  const control = () => {
    if (attribute.attribute_type === 'Checkbox') {
      return <input type="checkbox" checked={Boolean(draft)} disabled={disabled} onChange={event => { setDraft(event.target.checked); commit(event.target.checked) }} />
    }
    if (attribute.attribute_type === 'Select') {
      return (
        <select value={String(draft ?? '')} disabled={disabled} onChange={event => { setDraft(event.target.value); commit(event.target.value || null) }}>
          <option value="">{placeholder}</option>
          {(attribute.options ?? []).map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      )
    }
    if (attribute.attribute_type === 'Multi-select') {
      const selected = new Set(String(draft ?? '').split(',').filter(Boolean))
      return (
        <select
          value=""
          disabled={disabled}
          onChange={event => {
            const next = event.target.value
            if (!next) return
            if (selected.has(next)) selected.delete(next)
            else selected.add(next)
            const values = Array.from(selected)
            setDraft(values.join(','))
            commit(values)
          }}
        >
          <option value="">{selected.size ? `${selected.size} selected` : placeholder}</option>
          {(attribute.options ?? []).map(option => <option key={option.id} value={option.id}>{selected.has(option.id) ? '* ' : ''}{option.label}</option>)}
        </select>
      )
    }
    return (
      <input
        autoFocus={!alwaysEditing}
        type={attribute.attribute_type === 'Number' || attribute.attribute_type === 'Currency' ? 'number' : /date|timestamp/i.test(attribute.attribute_type) ? 'date' : attribute.attribute_type === 'Email' ? 'email' : attribute.attribute_type === 'URL' ? 'url' : 'text'}
        value={String(draft ?? '')}
        disabled={disabled}
        placeholder={placeholder}
        onChange={event => setDraft(event.target.value)}
        onBlur={() => commit()}
        onKeyDown={event => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setDraft(draftFromValue(attribute, value))
            event.currentTarget.blur()
          }
        }}
      />
    )
  }

  return (
    <div className="rp-attr-row">
      <span className="rp-attr-lbl"><Icon name={attributeIcon(attribute)} size={13} />{attribute.name}</span>
      <span className="rp-attr-val rp-real-editor">
        {editing ? control() : (
          <button
            type="button"
            className={`rp-value-button${value === null || value === undefined || value === '' ? ' empty' : ''}`}
            disabled={disabled}
            onClick={() => !disabled && setEditing(true)}
          >
            {value === null || value === undefined || value === '' ? placeholder : renderValue(value, attribute)}
          </button>
        )}
      </span>
    </div>
  )
}

export function LegacyObjectRecordDetail() {
  const { slug, recordId } = useParams<{ slug: string; recordId: string }>()
  const location = useLocation()
  const { user } = useAuth()
  const { lists } = useLists(user?.id)
  const navigate = useNavigate()
  const activeSlug = routeSlug(slug, location.pathname)
  const { object, attributes, permissions, loading } = useAttioObjectBundle(user?.id, activeSlug)
  const [record, setRecord] = useState<UnifiedRecord | null>(null)
  const [showAllValues, setShowAllValues] = useState(false)
  const [attributeSearch, setAttributeSearch] = useState('')
  const [tab, setTab] = useState<'overview' | 'activity' | 'emails' | 'calls' | 'notes' | 'tasks' | 'files'>('overview')
  const [tasks, setTasks] = useState<Array<{ id: string; text: string; completed: boolean; date: string | null }>>([])
  const [notes, setNotes] = useState<Array<{ id: string; title: string; body: string | null; created_at: string }>>([])
  const [activities, setActivities] = useState<Array<{ id: string; type: string; notes: string | null; interaction_date: string }>>([])
  const [memberLists, setMemberLists] = useState<Array<{ id: string; name: string; icon: string | null; current_stage: string }>>([])
  const [modal, setModal] = useState<'task' | 'note' | 'compose' | 'meeting' | 'edit' | 'add-list' | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [meetingStart, setMeetingStart] = useState('09:00')
  const [meetingEnd, setMeetingEnd] = useState('09:30')
  const [meetingParticipant, setMeetingParticipant] = useState('')
  const [toast, setToast] = useState<{ icon: TodayIconName; text: string } | null>(null)
  const [leftWidth, setLeftWidth] = useState(438)
  const effectiveAccess = getEffectiveAccess(permissions)
  const canWrite = ACCESS_RANK[effectiveAccess] >= ACCESS_RANK.read_write
  const activeAttributes = useMemo(() => attributes.filter(attribute => !attribute.is_archived && !attribute.is_relationship), [attributes])
  const detailAttrs = useMemo(() => {
    const base = showAllValues ? activeAttributes : activeAttributes.slice(0, 14)
    const needle = attributeSearch.trim().toLowerCase()
    if (!showAllValues || !needle) return base
    return base.filter(attribute =>
      attribute.name.toLowerCase().includes(needle) ||
      attribute.key.toLowerCase().includes(needle) ||
      attribute.attribute_type.toLowerCase().includes(needle)
    )
  }, [activeAttributes, attributeSearch, showAllValues])

  const load = useCallback(async () => {
    if (!user || !object || !recordId) return
    setRecord(await fetchObjectRecord(user.id, object, recordId))
  }, [object, recordId, user])
  useEffect(() => { void load() }, [load])

  const loadRelated = useCallback(async () => {
    if (!user || !object || !recordId) return
    const relationKey = object.backing_source === 'people' ? 'contact_id' : object.backing_source === 'companies' ? 'company_id' : object.backing_source === 'deals' ? 'opportunity_id' : null
    const taskQuery = supabase.from('todos').select('id,text,completed,date').eq('user_id', user.id)
    const { data: taskRows } = relationKey ? await taskQuery.eq(relationKey, recordId).order('created_at', { ascending: false }) : { data: [] }
    setTasks((taskRows ?? []) as Array<{ id: string; text: string; completed: boolean; date: string | null }>)
    const { data: noteRows } = await supabase.from('captures').select('id,title,body,created_at').eq('user_id', user.id).eq('linked_record_slug', object.slug).eq('linked_record_id', recordId).order('created_at', { ascending: false })
    setNotes((noteRows ?? []) as Array<{ id: string; title: string; body: string | null; created_at: string }>)
    if (object.backing_source === 'people') {
      const { data: interactionRows } = await supabase.from('interactions').select('id,type,notes,interaction_date').eq('user_id', user.id).eq('contact_id', recordId).order('interaction_date', { ascending: false }).limit(50)
      setActivities((interactionRows ?? []) as Array<{ id: string; type: string; notes: string | null; interaction_date: string }>)
    } else setActivities([])
    const { data: memberships } = await supabase.from('crm_list_entries').select('current_stage,list:lists(id,name,icon)').eq('user_id', user.id).eq('object_slug', object.slug).eq('record_id', recordId)
    setMemberLists((memberships ?? []).flatMap(row => {
      const linked = Array.isArray(row.list) ? row.list[0] : row.list
      return linked ? [{ id: linked.id, name: linked.name, icon: linked.icon, current_stage: row.current_stage || 'No stage' }] : []
    }))
  }, [object, recordId, user])
  useEffect(() => { void loadRelated() }, [loadRelated])

  const notify = (icon: TodayIconName, text: string) => {
    setToast({ icon, text })
    window.setTimeout(() => setToast(null), 2200)
  }

  const createTask = async () => {
    if (!user || !object || !recordId || !draftTitle.trim()) return
    const relationKey = object.backing_source === 'people' ? 'contact_id' : object.backing_source === 'companies' ? 'company_id' : object.backing_source === 'deals' ? 'opportunity_id' : null
    if (!relationKey) return
    const today = new Date().toISOString().slice(0, 10)
    const { error } = await supabase.from('todos').insert({ user_id: user.id, text: draftTitle.trim(), date: today, [relationKey]: recordId })
    if (error) notify('x', error.message)
    else { setDraftTitle(''); setModal(null); await loadRelated(); notify('checkcircle', 'Task created') }
  }

  const createNote = async () => {
    if (!user || !object || !recordId || !draftTitle.trim()) return
    const { error } = await supabase.from('captures').insert({ user_id: user.id, type: 'idea', title: draftTitle.trim(), body: draftBody.trim() || null, captured_date: new Date().toISOString().slice(0, 10), linked_record_slug: object.slug, linked_record_id: recordId })
    if (error) notify('x', error.message)
    else { setDraftTitle(''); setDraftBody(''); setModal(null); await loadRelated(); notify('article', 'Note created') }
  }

  const openMeeting = () => {
    const email = record?.values.email
    setDraftTitle('')
    setMeetingParticipant(typeof email === 'string' ? email : '')
    setModal('meeting')
  }

  const createMeeting = async () => {
    if (!user || !object || !recordId || !draftTitle.trim()) return
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.provider_token || (session?.user.user_metadata?.google_access_token as string | undefined)
    if (!token) { notify('calendar', 'Reconnect Google Calendar to create this meeting'); return }
    const date = new Date().toISOString().slice(0, 10)
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const attendees = meetingParticipant.trim() ? [{ email: meetingParticipant.trim() }] : []
    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: draftTitle.trim(),
        description: `Linked reThink ${object.singular_name}: ${record?.title ?? recordId}`,
        start: { dateTime: `${date}T${meetingStart}:00`, timeZone },
        end: { dateTime: `${date}T${meetingEnd}:00`, timeZone },
        attendees,
        conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
      }),
    })
    if (!response.ok) { notify('x', `Google Calendar could not create the meeting (${response.status})`); return }
    if (object.backing_source === 'people') {
      await supabase.from('interactions').insert({ user_id: user.id, contact_id: recordId, type: 'meeting', direction: 'outbound', notes: draftTitle.trim(), interaction_date: date })
    }
    setDraftTitle(''); setModal(null); await loadRelated(); notify('calendar', 'Meeting created in Google Calendar')
  }

  const save = async (attribute: CrmAttribute, value: unknown) => {
    if (!user || !object || !record || !canWrite || !attribute.is_editable) return
    await saveRecordAttributeValue(user.id, object, record, attribute, value)
    await load()
  }

  if (loading) return <div className="attio-record-detail"><div className="attio-empty">Loading...</div></div>
  if (!object || !record) return <div className="attio-record-detail"><div className="attio-empty">Record not found.</div></div>

  const tabs = [
    ['overview', 'grid', 'Overview'], ['activity', 'activity', 'Activity'], ['emails', 'chat', 'Emails'],
    ['calls', 'clock', 'Calls'], ['notes', 'article', 'Notes'], ['tasks', 'checkcircle', 'Tasks'], ['files', 'folder', 'Files'],
  ] as const
  const highlighted = activeAttributes.filter(attribute => record.values[attribute.key] != null && record.values[attribute.key] !== '').slice(0, 6)
  const emptyState = (icon: TodayIconName, title: string, sub: string, cta?: string, action?: () => void) => <div className="rp-empty"><div className="rp-empty-ill"><Icon name={icon} size={30} /></div><h3>{title}</h3><p>{sub}</p>{cta && action && <button className="btn btn-primary" onClick={action}><Icon name="plus" size={13} />{cta}</button>}</div>

  return (
    <div className="rp handoff-record-detail">
      <div className="rp-cols">
        <div className="rp-left" style={{ width: leftWidth }}>
          <div className="rp-left-top"><button className="rp-x" onClick={() => navigate(objectListPath(object))} aria-label={`Close ${object.singular_name} record`}><Icon name="x" size={15} /></button><span className="rp-nav"><button disabled aria-label="Previous record"><Icon name="caretUp" size={11} /></button><button disabled aria-label="Next record"><Icon name="caretDown" size={11} /></button></span></div>
          <div className="rp-header"><span className="rp-hdr-ico"><Icon name="record" size={15} /></span><h1>{record.title}</h1><button className="rp-hicon" title="Edit record" onClick={() => setModal('edit')}><Icon name="pencil" size={13} /></button><button className="rp-hicon" title="Favorite" onClick={() => notify('star', 'Favorites are a product stub')}><Icon name="star" size={15} /></button></div>
          <div className="rp-actions"><button className="rp-act-btn" onClick={() => setModal('compose')}><Icon name="chat" size={13} />Compose email</button><button className="rp-act-btn" onClick={() => setModal('add-list')}><Icon name="list" size={13} />Add to list</button><button className="rp-ico-btn sm" title="New note" onClick={() => setModal('note')}><Icon name="article" size={13} /></button><button className="rp-ico-btn sm" title="Run workflow" onClick={() => notify('relation', 'Run workflow is a product stub')}><Icon name="relation" size={13} /></button><button className="rp-ico-btn sm" title="New task" onClick={() => setModal('task')}><Icon name="checkcircle" size={13} /></button></div>
          <div className="rp-left-scroll">
            {showAllValues ? <><div className="rp-panel-hd"><button className="rp-collapse" onClick={() => { setShowAllValues(false); setAttributeSearch('') }} aria-label="Back to record details"><Icon name="caretLeft" size={13} /></button><div className="pop-search" style={{ flex: 1, border: '1px solid var(--border-1)', borderRadius: 'var(--rc)' }}><span className="ico"><Icon name="search" size={13} /></span><input autoFocus value={attributeSearch} onChange={event => setAttributeSearch(event.target.value)} placeholder="Search attributes..." /></div></div><div className="rp-attrlist">{detailAttrs.map(attribute => <AttributeValueEditor key={attribute.id} attribute={attribute} value={record.values[attribute.key]} disabled={!canWrite || !attribute.is_editable} onSave={value => save(attribute, value)} />)}</div></> : <>
              <div className="rp-sec-hd"><span>Record Details</span><Icon name="caretDown" size={11} /></div><div className="rp-attrlist">{detailAttrs.slice(0, 6).map(attribute => <AttributeValueEditor key={attribute.id} attribute={attribute} value={record.values[attribute.key]} disabled={!canWrite || !attribute.is_editable} onSave={value => save(attribute, value)} />)}</div><button className="rp-viewall" onClick={() => setShowAllValues(true)}>View all values</button>
              <div className="rp-sec-hd border"><span>Lists <b className="n">{memberLists.length}</b></span><span className="rp-sec-acts"><button title="Add to list" onClick={() => setModal('add-list')}><Icon name="plus" size={13} /></button></span></div>{memberLists.length === 0 ? <div className="rp-none">This record has not been added to any lists</div> : memberLists.map(list => <div key={list.id} className="rp-list-card"><div className="rp-list-hd"><ListGlyph value={list.icon} /><span className="rp-list-name" onClick={() => navigate(`/lists/${list.id}`)}>{list.name}</span></div><div className="rp-attr-row"><span className="rp-attr-lbl"><Icon name="status" size={13} />Stage</span><span className="rp-attr-val"><span className="rp-stage-plain"><span className="dot" />{list.current_stage}</span></span></div></div>)}
            </>}
          </div>
        </div>
        <div className="rp-divider" onMouseDown={event => { const startX = event.clientX; const start = leftWidth; const move = (next: MouseEvent) => setLeftWidth(Math.max(320, Math.min(640, start + next.clientX - startX))); const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up) }; document.addEventListener('mousemove', move); document.addEventListener('mouseup', up) }}><span className="rp-divider-line" /></div>
        <div className="rp-right">
          <div className="rp-tabs">{tabs.map(([key, icon, label]) => <button key={key} className={`rp-tab${tab === key ? ' on' : ''}`} onClick={() => setTab(key)}><Icon name={icon} size={13} />{label}{key === 'notes' && <span className="rp-tab-n">{notes.length}</span>}{key === 'tasks' && <span className="rp-tab-n">{tasks.length}</span>}</button>)}</div>
          <div className="rp-main">
            {tab === 'overview' && <><div className="rp-h-row"><h2>Highlights</h2></div><div className="rp-highlights-grid">{highlighted.length > 0 ? highlighted.map(attribute => <div key={attribute.id} className="rp-hi-card"><div className="rp-hi-top"><span>{attribute.name}</span><Icon name={attributeIcon(attribute)} size={14} /></div><div className="rp-hi-val">{renderValue(record.values[attribute.key], attribute)}</div></div>) : <div className="rp-none">No populated highlights yet.</div>}</div><div className="rp-h-row"><h2>Activity</h2><button className="rp-viewall-r" onClick={() => setTab('activity')}>View all</button></div><div className="rp-activity-feed">{activities.slice(0, 4).map(activity => <div key={activity.id} className="rp-act-row"><Logo id={record.imageUrl || record.title} size={20} sq={false} /><span className="rp-act-txt"><b>{activity.type}</b>{activity.notes ? ` · ${activity.notes}` : ''}</span><span className="rp-act-when">{activity.interaction_date}</span></div>)}{activities.length === 0 && <div className="rp-none">No activity captured yet.</div>}</div>{notes.length > 0 && <><div className="rp-h-row"><h2>Notes<span className="rp-h-n">{notes.length}</span></h2></div><div className="rp-line-list">{notes.slice(0, 3).map(note => <div className="rp-line-row" key={note.id}><Icon name="article" size={14} /><span className="rp-line-title">{note.title}</span><span className="rp-line-sub">{note.body || 'This note has no content'}</span></div>)}</div></>}{tasks.length > 0 && <><div className="rp-h-row"><h2>Tasks<span className="rp-h-n">{tasks.length}</span></h2></div><div className="rp-line-list">{tasks.slice(0, 4).map(task => <div className="rp-line-row" key={task.id}><span className={`cb cbr${task.completed ? ' on' : ''}`}>{task.completed && <Icon name="check" size={10} />}</span><span className="rp-line-title task">{task.text}</span><span className="rp-line-today"><Icon name="calendar" size={11} />{task.date || 'Backlog'}</span></div>)}</div></>}</>}
            {tab === 'activity' && <><div className="rp-tabhd"><h2>Activity</h2><button className="rp-tab-btn" onClick={openMeeting}><Icon name="plus" size={13} />Add meeting</button></div>{activities.length ? <div className="rp-act-group">{activities.map(activity => <div key={activity.id} className="rp-act-row"><Logo id={record.imageUrl || record.title} size={20} sq={false} /><span className="rp-act-txt"><b>{activity.type}</b>{activity.notes ? ` · ${activity.notes}` : ''}</span><span className="rp-act-when">{activity.interaction_date}</span></div>)}</div> : emptyState('activity', 'No activity yet', 'Interactions and record updates will show up here.')}</>}
            {tab === 'emails' && emptyState('chat', 'No emails', "This record doesn't have any visible emails.", 'Compose email', () => setModal('compose'))}
            {tab === 'calls' && emptyState('clock', 'No calls yet', 'Call recordings and transcripts for this record will show up here.')}
            {tab === 'notes' && <>{notes.length ? <><div className="rp-tabhd"><h2>Notes</h2><button className="rp-tab-btn" onClick={() => setModal('note')}><Icon name="plus" size={13} />Create note</button></div><div className="rp-line-list">{notes.map(note => <div className="rp-line-row" key={note.id}><Icon name="article" size={14} /><span className="rp-line-title">{note.title}</span><span className="rp-line-sub">{note.body || 'This note has no content'}</span><span className="rp-line-when">{new Date(note.created_at).toLocaleDateString()}</span></div>)}</div></> : emptyState('article', 'No notes', 'Add a note to keep track of important details.', 'New note', () => setModal('note'))}</>}
            {tab === 'tasks' && <>{tasks.length ? <><div className="rp-tabhd"><h2>Tasks</h2><button className="rp-tab-btn" onClick={() => setModal('task')}><Icon name="plus" size={13} />Add task</button></div><div className="rp-line-list">{tasks.map(task => <div className="rp-line-row" key={task.id}><button className={`cb cbr${task.completed ? ' on' : ''}`} onClick={async () => { await supabase.from('todos').update({ completed: !task.completed }).eq('id', task.id); await loadRelated() }} aria-label={`${task.completed ? 'Mark incomplete' : 'Mark complete'}: ${task.text}`}>{task.completed && <Icon name="check" size={10} />}</button><span className="rp-line-title task">{task.text}</span><span className="rp-line-today"><Icon name="calendar" size={11} />{task.date || 'Backlog'}</span></div>)}</div></> : emptyState('checkcircle', 'No tasks', 'Create a task to track follow-ups on this record.', 'Add task', () => setModal('task'))}</>}
            {tab === 'files' && emptyState('folder', 'No files', 'Drag a file here or choose one from your computer.')}
          </div>
        </div>
      </div>

      {(modal === 'task' || modal === 'note') && <div className="scrim top" onClick={() => setModal(null)}><div className="rm rm-task" onClick={event => event.stopPropagation()}><div className="rm-hd sm"><span className="rm-title"><Icon name={modal === 'task' ? 'checkcircle' : 'article'} size={15} />{modal === 'task' ? 'Create task' : 'New note'}</span><button className="rm-ico" onClick={() => setModal(null)} aria-label="Close dialog"><Icon name="x" size={15} /></button></div><div className="rm-task-body"><span className="rm-atchip">@{record.title}</span><input autoFocus className="rm-task-input" placeholder={modal === 'task' ? 'Task title' : 'Note title'} value={draftTitle} onChange={event => setDraftTitle(event.target.value)} /></div>{modal === 'note' && <div className="rm-note-inline"><textarea placeholder="Start typing your note" value={draftBody} onChange={event => setDraftBody(event.target.value)} /></div>}<div className="rm-task-foot"><span className="rm-spacer" /><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" disabled={!draftTitle.trim()} onClick={() => void (modal === 'task' ? createTask() : createNote())}>Save</button></div></div></div>}
      {modal === 'edit' && <div className="scrim" onClick={() => setModal(null)}><div className="rm rm-edit" onClick={event => event.stopPropagation()}><div className="rm-hd"><span className="rm-title"><Icon name="pencil" size={15} />Edit {object.singular_name}</span><button className="rm-ico" onClick={() => setModal(null)} aria-label="Close dialog"><Icon name="x" size={15} /></button></div><div className="rm-edit-body"><div className="rm-edit-head"><Logo id={record.imageUrl || record.title} size={30} /><h2>{record.title}</h2></div><div className="rp-attrlist">{activeAttributes.map(attribute => <AttributeValueEditor key={attribute.id} attribute={attribute} value={record.values[attribute.key]} disabled={!canWrite || !attribute.is_editable} onSave={value => save(attribute, value)} />)}</div></div><div className="rm-foot right"><button className="btn btn-primary" onClick={() => setModal(null)}>Finished editing</button></div></div></div>}
      {modal === 'compose' && <div className="scrim" onClick={() => setModal(null)}><div className="modal sm" onClick={event => event.stopPropagation()}><div className="modal-hd"><Icon name="chat" size={15} />Compose email<button className="x" onClick={() => setModal(null)} aria-label="Close dialog"><Icon name="x" size={15} /></button></div><div className="modal-bd"><div className="field-lbl">Linked record</div><div className="rec-item"><Logo id={record.imageUrl || record.title} size={22} /><span className="rname">{record.title}</span></div><div className="pop-empty">Email delivery requires the Gmail send scope, which is not currently granted.</div></div><div className="modal-ft"><button className="btn btn-ghost" onClick={() => setModal(null)}>Close</button></div></div></div>}
      {modal === 'meeting' && <div className="scrim" onClick={() => setModal(null)}><div className="rm rm-meeting" onClick={event => event.stopPropagation()}><div className="rm-hd"><span className="rm-title"><Icon name="calendar" size={15} />New meeting</span><button className="rm-ico" onClick={() => setModal(null)} aria-label="Close dialog"><Icon name="x" size={15} /></button></div><div className="rm-meeting-body"><input autoFocus className="rm-meeting-title" placeholder="Meeting title" value={draftTitle} onChange={event => setDraftTitle(event.target.value)} /><div className="rm-meeting-desc">Linked to {record.title}</div><div className="rm-sec">Date and time</div><div className="rm-meeting-dt"><b>Today</b><input className="pill" type="time" value={meetingStart} onChange={event => setMeetingStart(event.target.value)} /><Icon name="arrowRight" size={13} /><input className="pill" type="time" value={meetingEnd} onChange={event => setMeetingEnd(event.target.value)} /></div><div className="rm-sec">Participant</div><div className="rm-part"><Logo id={record.imageUrl || record.title} size={26} sq={false} /><b>{record.title}</b><input className="rm-participant-input" type="email" value={meetingParticipant} onChange={event => setMeetingParticipant(event.target.value)} placeholder={String(record.values.email ?? 'Email address')} /></div></div><div className="rm-foot"><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" disabled={!draftTitle.trim() || meetingEnd <= meetingStart} onClick={() => void createMeeting()}>Create meeting</button></div></div></div>}
      {modal === 'add-list' && <div className="scrim" onClick={() => setModal(null)}><div className="modal sm" onClick={event => event.stopPropagation()}><div className="modal-hd"><Icon name="list" size={15} />Add to list<button className="x" onClick={() => setModal(null)} aria-label="Close dialog"><Icon name="x" size={15} /></button></div><div className="modal-bd">{lists.filter(list => (list.object_slug || 'people') === object.slug && !memberLists.some(member => member.id === list.id)).map(list => <button className="rec-item list-destination" key={list.id} onClick={async () => { if (!user || !recordId) return; await addCrmListEntries(user.id, list.id, object.slug, [recordId], list.stages[0]?.key ?? null); await loadRelated(); setModal(null); notify('list', `Added to ${list.name}`) }}><ListGlyph value={list.icon} /><span className="rname">{list.name}</span></button>)}{lists.filter(list => (list.object_slug || 'people') === object.slug && !memberLists.some(member => member.id === list.id)).length === 0 && <div className="pop-empty">No available lists for this record.</div>}</div><div className="modal-ft"><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={() => navigate(`/lists?new=1&object=${object.slug}`)}><Icon name="plus" size={12} />New list</button></div></div></div>}
      {toast && <div className="toast"><span className="em"><Icon name={toast.icon} size={13} /></span>{toast.text}</div>}
    </div>
  )
}
