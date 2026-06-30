import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, CaretDown, Check, DotsThree, Export, Funnel, MagnifyingGlass, Plus,
  Rows, ShareNetwork, SlidersHorizontal, Sparkle, X,
} from '@phosphor-icons/react'
import { useAuth } from '@/hooks/useAuth'
import { useAttioObjectBundle } from '@/hooks/useAttioObjects'
import {
  ACCESS_RANK,
  createObjectRecord,
  fetchObjectRecord,
  fetchObjectRecords,
  getEffectiveAccess,
  updateObjectRecord,
  type CrmAttribute,
  type CrmObject,
  type UnifiedRecord,
} from '@/lib/attioObjects'

function ObjectPill({ object }: { object: CrmObject }) {
  return <span className="record-object-pill"><span>{object.icon || object.plural_name[0]}</span>{object.plural_name}</span>
}

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

function renderValue(value: unknown, attribute?: CrmAttribute) {
  if (value === null || value === undefined || value === '') return <span className="attio-empty-value">—</span>
  if (typeof value === 'boolean') return value ? <Check size={12} /> : <span className="attio-empty-value">—</span>
  if (attribute?.is_relationship) return <span className="attio-rel-pill">{String(value)}</span>
  if (attribute?.attribute_type === 'URL' || attribute?.attribute_type === 'Domain' || attribute?.attribute_type === 'Email') return <span className="attio-linkish">{String(value)}</span>
  if (attribute?.attribute_type === 'Status') return <span className="attio-status-pill">{String(value)}</span>
  if (attribute?.attribute_type === 'Currency') return <span className="attio-mono">{typeof value === 'number' ? `$${value.toLocaleString()}` : String(value)}</span>
  if (Array.isArray(value)) return <span className="attio-chip-list">{value.slice(0, 3).map(item => <span key={String(item)}>{String(item)}</span>)}</span>
  return <span>{String(value)}</span>
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
  const { slug } = useParams<{ slug: string }>()
  const location = useLocation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const activeSlug = routeSlug(slug, location.pathname)
  const { object, attributes, permissions, loading } = useAttioObjectBundle(user?.id, activeSlug)
  const [records, setRecords] = useState<UnifiedRecord[]>([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showViewSettings, setShowViewSettings] = useState(false)
  const [showFilter, setShowFilter] = useState(false)
  const [query, setQuery] = useState('')
  const effectiveAccess = getEffectiveAccess(permissions)
  const canWrite = ACCESS_RANK[effectiveAccess] >= ACCESS_RANK.read_write
  const visibleAttrs = useMemo(() => {
    if (object?.slug === 'companies') {
      const liveOrder = ['last_interaction', 'connection_strength', 'sector', 'domain', 'linkedin_url', 'twitter_url', 'twitter_follower_count', 'founded_year', 'hq_location', 'country', 'description']
      const byKey = new Map(attributes.map(attribute => [attribute.key, attribute]))
      return liveOrder.map(key => byKey.get(key)).filter((attribute): attribute is CrmAttribute => Boolean(attribute))
    }
    return attributes.filter(attribute => !['record_id', 'list_entries', 'next_due_task', 'created_by'].includes(attribute.key)).slice(0, 8)
  }, [attributes, object?.slug])

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
    setShowNew(false)
    await loadRecords()
    if (id) navigate(objectRecordPath(object, id))
  }

  const filteredRecords = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return records
    return records.filter(record => {
      const searchable = [
        record.title,
        record.subtitle,
        ...visibleAttrs.map(attribute => record.values[attribute.key]),
      ]
      return searchable.some(value => String(value ?? '').toLowerCase().includes(needle))
    })
  }, [query, records, visibleAttrs])

  if (loading || recordsLoading) return <div className="attio-record-page"><div className="attio-empty">Loading...</div></div>
  if (!object) return <div className="attio-record-page"><div className="attio-empty">Object not found.</div></div>

  return (
    <div className="attio-record-page">
      <header className="records-top attio-records-topbar">
        <div className="records-title">
          <h1>{object.plural_name}</h1>
        </div>
        <div className="records-actions">
          <button className="attio-btn"><ShareNetwork size={13} /> Share</button>
          <button className="attio-btn icon-only" aria-label="Comments"><Rows size={13} /></button>
          <button className="attio-btn icon-only" aria-label="Help">?</button>
          <button className="attio-btn icon-only" aria-label="Show menu"><DotsThree size={13} /></button>
          <button className="attio-btn ask-attio"><Sparkle size={13} /> Ask Attio</button>
        </div>
      </header>
      <section className="records-viewbar">
        <div className="records-view-left">
          <button className="records-view-title"><ObjectPill object={object} /> All {object.plural_name}<CaretDown size={12} /></button>
          <div className="attio-menu-wrap">
            <button className={`attio-btn ${showViewSettings ? 'active' : ''}`} onClick={() => setShowViewSettings(value => !value)}><SlidersHorizontal size={13} /> View settings</button>
            {showViewSettings && (
              <div className="records-view-settings-menu">
                {[...visibleAttrs].reverse().map(attribute => (
                  <button key={attribute.id}><Rows size={13} /> {attribute.name}<DotsThree size={13} /></button>
                ))}
                <div className="attio-menu-sep" />
                <button><Plus size={13} /> Add attribute to view</button>
              </div>
            )}
          </div>
        </div>
        <div className="records-actions">
          <button className="attio-btn"><Export size={13} /> Import / Export</button>
          <button className="attio-btn primary" disabled={!canWrite} onClick={() => setShowNew(v => !v)}><Plus size={13} /> New {object.singular_name}</button>
        </div>
      </section>
      {showNew && <NewRecordRow object={object} onCreate={addRecord} />}
      <section className="records-toolbar">
        <button className="records-sort-pill">Sorted by <strong>{object.slug === 'companies' ? 'Twitter follower count' : 'Created at'}</strong></button>
        <div className="attio-menu-wrap">
          <button className={`attio-btn ${showFilter ? 'active' : ''}`} onClick={() => setShowFilter(value => !value)}><Funnel size={13} /> Filter</button>
          {showFilter && (
            <div className="records-filter-menu">
              <button>Reset filters</button>
              <div className="attio-menu-sep" />
              {visibleAttrs.slice(0, 12).map(attribute => <label key={attribute.id}><input type="checkbox" readOnly /> {attribute.name}</label>)}
              <label><input type="checkbox" readOnly /> Hide archived</label>
              <label><input type="checkbox" readOnly /> Hide system</label>
            </div>
          )}
        </div>
        <div className="attio-search records-search"><MagnifyingGlass size={13} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${object.plural_name.toLowerCase()}`} /></div>
      </section>
      <section className="attio-grid-table">
        <div className="attio-grid-head" style={{ gridTemplateColumns: `34px minmax(230px,1.2fr) repeat(${visibleAttrs.length}, minmax(140px, 1fr)) 40px` }}>
          <span className="attio-check" />
          <span>{object.singular_name}</span>
          {visibleAttrs.map(attribute => <span key={attribute.id} className={attribute.is_enriched ? 'enriched' : ''}>{attribute.is_enriched && <Sparkle size={11} />}{attribute.name}</span>)}
          <span><Plus size={13} /></span>
        </div>
        {filteredRecords.map(record => (
          <button key={record.id} className="attio-grid-row" style={{ gridTemplateColumns: `34px minmax(230px,1.2fr) repeat(${visibleAttrs.length}, minmax(140px, 1fr)) 40px` }} onClick={() => navigate(objectRecordPath(object, record.id))}>
            <span className="attio-check" />
            <span className="record-primary">
              {record.imageUrl ? <img src={record.imageUrl} alt="" /> : <span>{record.title.slice(0, 1).toUpperCase()}</span>}
              <strong>{record.title}</strong>
            </span>
            {visibleAttrs.map(attribute => <span key={attribute.id} className={attribute.is_enriched ? 'enriched-cell' : ''}>{renderValue(record.values[attribute.key], attribute)}</span>)}
            <span><DotsThree size={14} /></span>
          </button>
        ))}
        {filteredRecords.length === 0 && <div className="attio-empty table-empty">{records.length === 0 ? 'No records yet.' : 'No records match your search.'}</div>}
        <div className="attio-grid-foot" style={{ gridTemplateColumns: `34px minmax(230px,1.2fr) repeat(${visibleAttrs.length}, minmax(140px, 1fr)) 40px` }}>
          <span />
          <span>{filteredRecords.length} count</span>
          {visibleAttrs.map(attribute => <span key={attribute.id}>Add calculation</span>)}
          <span />
        </div>
      </section>
    </div>
  )
}

function EditableValue({ label, value, disabled, onSave }: { label: string; value: unknown; disabled: boolean; onSave: (value: string | null) => void }) {
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  useEffect(() => setDraft(value == null ? '' : String(value)), [value])
  return (
    <div className="record-field-row">
      <span>{label}</span>
      <input
        value={draft}
        disabled={disabled}
        onChange={event => setDraft(event.target.value)}
        onBlur={() => onSave(draft.trim() || null)}
        onKeyDown={event => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setDraft(value == null ? '' : String(value))
            event.currentTarget.blur()
          }
        }}
      />
    </div>
  )
}

export function ObjectRecordDetail() {
  const { slug, recordId } = useParams<{ slug: string; recordId: string }>()
  const location = useLocation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const activeSlug = routeSlug(slug, location.pathname)
  const { object, attributes, permissions, loading } = useAttioObjectBundle(user?.id, activeSlug)
  const [record, setRecord] = useState<UnifiedRecord | null>(null)
  const effectiveAccess = getEffectiveAccess(permissions)
  const canWrite = ACCESS_RANK[effectiveAccess] >= ACCESS_RANK.read_write
  const detailAttrs = attributes.filter(attribute => !attribute.is_relationship).slice(0, 14)

  const load = useCallback(async () => {
    if (!user || !object || !recordId) return
    setRecord(await fetchObjectRecord(user.id, object, recordId))
  }, [object, recordId, user])
  useEffect(() => { void load() }, [load])

  const save = async (attribute: CrmAttribute, value: string | null) => {
    if (!user || !object || !record || !canWrite || !attribute.is_editable) return
    if (attribute.key === 'name' || attribute.key === 'title') await updateObjectRecord(user.id, object, record.id, { [attribute.key]: value, ...(attribute.key === 'title' ? { title: value } : {}) })
    else if (object.backing_source === 'generic') await updateObjectRecord(user.id, object, record.id, { ...record.values, [attribute.key]: value })
    else await updateObjectRecord(user.id, object, record.id, { [attribute.key]: value })
    await load()
  }

  if (loading) return <div className="attio-record-detail"><div className="attio-empty">Loading...</div></div>
  if (!object || !record) return <div className="attio-record-detail"><div className="attio-empty">Record not found.</div></div>

  return (
    <div className="attio-record-detail">
      <div className="record-detail-topbar">
        <button onClick={() => navigate(objectListPath(object))}><ArrowLeft size={14} /></button>
        <span>{object.plural_name}</span>
        <button className="ml-auto" onClick={() => navigate(objectListPath(object))}><X size={14} /></button>
      </div>
      <div className="record-detail-shell">
        <aside className="record-left">
          <div className="record-id-block">
            <div className="record-avatar">{record.imageUrl ? <img src={record.imageUrl} alt="" /> : record.title[0]?.toUpperCase()}</div>
            <div><h1>{record.title}</h1>{record.subtitle && <p>{record.subtitle}</p>}</div>
          </div>
          <section className="record-details-panel">
            <header><span>Record Details</span></header>
            {detailAttrs.map(attribute => (
              <EditableValue key={attribute.id} label={attribute.name} value={record.values[attribute.key]} disabled={!canWrite || !attribute.is_editable} onSave={value => save(attribute, value)} />
            ))}
          </section>
        </aside>
        <main className="record-main">
          <nav className="record-tabs">
            <span className="active">Overview</span>
          </nav>
          <div className="record-main-body">
            <div className="record-overview">
              <h3>Overview</h3>
              <p className="attio-muted">This record page is generated from the object definition and its record label configuration.</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
