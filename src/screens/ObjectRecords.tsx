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
  saveRecordAttributeValue,
  type CrmAttribute,
  type CrmAttributeOption,
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

function optionByValue(options: CrmAttributeOption[] | null | undefined, value: unknown) {
  const raw = String(value)
  return (options ?? []).find(option => option.id === raw || option.label === raw)
}

function optionChip(option: CrmAttributeOption | undefined, fallback: unknown) {
  const label = option?.label ?? String(fallback)
  return <span className={`attio-option-chip ${option?.color ?? 'gray'}`}>{label}</span>
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

function renderValue(value: unknown, attribute?: CrmAttribute) {
  if (value === null || value === undefined || value === '') return <span className="attio-empty-value">—</span>
  if (typeof value === 'boolean') return value ? <Check size={12} /> : <span className="attio-empty-value">—</span>
  if (attribute?.is_relationship) return <span className="attio-rel-pill">{String(value)}</span>
  if (attribute?.attribute_type === 'Select') return optionChip(optionByValue(attribute.options, value), value)
  if (attribute?.attribute_type === 'Multi-select') {
    const values = Array.isArray(value) ? value : String(value).split(',').filter(Boolean)
    return (
      <span className="attio-chip-list">
        {values.slice(0, 3).map(item => {
          const option = optionByValue(attribute.options, item)
          return <span key={String(item)} className={`attio-option-chip ${option?.color ?? 'gray'}`}>{option?.label ?? String(item)}</span>
        })}
      </span>
    )
  }
  if (attribute?.attribute_type === 'URL' || attribute?.attribute_type === 'Domain' || attribute?.attribute_type === 'Email') return <span className="attio-linkish">{String(value)}</span>
  if (attribute?.attribute_type === 'Status') return <span className="attio-status-pill">{String(value)}</span>
  if (attribute?.attribute_type === 'Currency') return <span className="attio-mono">{currencyText(value, attribute)}</span>
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
  const [showAddAttribute, setShowAddAttribute] = useState(false)
  const [visibleAttributeKeys, setVisibleAttributeKeys] = useState<string[] | null>(null)
  const [showFilter, setShowFilter] = useState(false)
  const [query, setQuery] = useState('')
  const effectiveAccess = getEffectiveAccess(permissions)
  const canWrite = ACCESS_RANK[effectiveAccess] >= ACCESS_RANK.read_write
  const activeAttributes = useMemo(() => attributes.filter(attribute => !attribute.is_archived && !attribute.is_relationship), [attributes])
  const defaultVisibleKeys = useMemo(() => {
    if (object?.slug === 'companies') {
      const liveOrder = ['last_interaction', 'connection_strength', 'sector', 'domain', 'linkedin_url', 'twitter_url', 'twitter_follower_count', 'founded_year', 'hq_location', 'country', 'description']
      const keys = liveOrder.filter(key => activeAttributes.some(attribute => attribute.key === key))
      return keys.length ? keys : activeAttributes.slice(0, 8).map(attribute => attribute.key)
    }
    return activeAttributes.filter(attribute => !['record_id', 'list_entries', 'next_due_task', 'created_by'].includes(attribute.key)).slice(0, 8).map(attribute => attribute.key)
  }, [activeAttributes, object?.slug])
  const viewStorageKey = object ? `rethink.attio.objectView.${object.id}.columns` : ''
  const visibleAttrs = useMemo(() => {
    const byKey = new Map(activeAttributes.map(attribute => [attribute.key, attribute]))
    const keys = visibleAttributeKeys ?? defaultVisibleKeys
    return keys.map(key => byKey.get(key)).filter((attribute): attribute is CrmAttribute => Boolean(attribute))
  }, [activeAttributes, defaultVisibleKeys, visibleAttributeKeys])
  const hiddenAttrs = useMemo(() => {
    const visible = new Set(visibleAttrs.map(attribute => attribute.key))
    return activeAttributes.filter(attribute => !visible.has(attribute.key))
  }, [activeAttributes, visibleAttrs])

  useEffect(() => {
    if (!viewStorageKey) return
    const stored = window.localStorage.getItem(viewStorageKey)
    try {
      const parsed = stored ? JSON.parse(stored) : null
      setVisibleAttributeKeys(Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : null)
    } catch {
      setVisibleAttributeKeys(null)
    }
  }, [viewStorageKey])

  const persistVisibleKeys = (keys: string[]) => {
    setVisibleAttributeKeys(keys)
    if (viewStorageKey) window.localStorage.setItem(viewStorageKey, JSON.stringify(keys))
  }

  const addAttributeToView = (attribute: CrmAttribute) => {
    persistVisibleKeys([...(visibleAttributeKeys ?? defaultVisibleKeys), attribute.key])
    setShowAddAttribute(false)
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
                <button onClick={() => setShowAddAttribute(value => !value)}><Plus size={13} /> Add attribute to view</button>
                {showAddAttribute && (
                  <div className="records-add-attr-list">
                    {hiddenAttrs.map(attribute => (
                      <button key={attribute.id} onClick={() => addAttributeToView(attribute)}>
                        <span className="attr-type-icon">{attribute.attribute_type.slice(0, 1)}</span>
                        {attribute.name}
                      </button>
                    ))}
                    {hiddenAttrs.length === 0 && <span className="records-menu-empty">All attributes are visible.</span>}
                  </div>
                )}
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
          <span className="attio-menu-wrap">
            <button className="records-add-col-btn" aria-label="Add attribute to view" onClick={event => { event.stopPropagation(); setShowViewSettings(true); setShowAddAttribute(true) }}><Plus size={13} /></button>
          </span>
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

function draftFromValue(attribute: CrmAttribute, value: unknown) {
  if (value === null || value === undefined) return ''
  if (attribute.attribute_type === 'Currency' && typeof value === 'object' && value && 'amount' in value) return String((value as { amount?: unknown }).amount ?? '')
  if (attribute.attribute_type === 'Multi-select' && Array.isArray(value)) return value.map(item => String(item)).join(',')
  if (attribute.attribute_type === 'Checkbox') return Boolean(value)
  return String(value)
}

function AttributeValueEditor({
  attribute,
  value,
  disabled,
  onSave,
}: {
  attribute: CrmAttribute
  value: unknown
  disabled: boolean
  onSave: (value: unknown) => void
}) {
  const [draft, setDraft] = useState<unknown>(draftFromValue(attribute, value))
  useEffect(() => setDraft(draftFromValue(attribute, value)), [attribute, value])
  const placeholder = `Set ${attribute.name}...`

  const commit = (next: unknown = draft) => {
    if (attribute.attribute_type === 'Multi-select' && Array.isArray(next)) {
      onSave(next)
      return
    }
    if (attribute.attribute_type === 'Checkbox') {
      onSave(Boolean(next))
      return
    }
    onSave(typeof next === 'string' ? next.trim() || null : next)
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
        type={attribute.attribute_type === 'Number' || attribute.attribute_type === 'Currency' ? 'number' : attribute.attribute_type === 'Date' ? 'date' : attribute.attribute_type === 'Email' ? 'email' : attribute.attribute_type === 'URL' ? 'url' : 'text'}
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
    <div className="record-field-row">
      <span>{attribute.name}</span>
      {control()}
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
  const [showAllValues, setShowAllValues] = useState(false)
  const [attributeSearch, setAttributeSearch] = useState('')
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

  const save = async (attribute: CrmAttribute, value: unknown) => {
    if (!user || !object || !record || !canWrite || !attribute.is_editable) return
    await saveRecordAttributeValue(user.id, object, record, attribute, value)
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
            <header>
              {showAllValues ? (
                <button className="record-values-back" onClick={() => { setShowAllValues(false); setAttributeSearch('') }}><ArrowLeft size={12} /> Back</button>
              ) : (
                <span>Record Details</span>
              )}
            </header>
            {showAllValues && <div className="attio-search record-attr-search"><MagnifyingGlass size={12} /><input value={attributeSearch} onChange={event => setAttributeSearch(event.target.value)} placeholder="Search attributes..." /></div>}
            {detailAttrs.map(attribute => (
              <AttributeValueEditor key={attribute.id} attribute={attribute} value={record.values[attribute.key]} disabled={!canWrite || !attribute.is_editable} onSave={value => save(attribute, value)} />
            ))}
            {detailAttrs.length === 0 && <div className="attio-empty record-empty">No attributes match.</div>}
            {!showAllValues && <button className="record-view-all-values" onClick={() => setShowAllValues(true)}>View all values</button>}
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
