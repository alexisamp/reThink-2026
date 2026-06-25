import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  CaretDown, Check, Columns, DotsSixVertical, Export, Eye, EyeSlash, Funnel,
  Kanban, LockSimple, MagnifyingGlass, Plus, Rows, SortAscending, SquaresFour,
  Stack, X,
} from '@phosphor-icons/react'

export interface CrmColumn<T> {
  key: string
  label: string
  icon?: ReactNode
  width?: string
  align?: 'left' | 'right'
  locked?: boolean
  defaultOff?: boolean
  render: (row: T) => ReactNode
}

export interface CrmKanbanStage {
  id: string | null
  label: string
  color?: string | null
}

export interface CrmKanbanConfig<T> {
  stages: CrmKanbanStage[]
  groupLabel: string
  groupValue: (row: T) => string | null
  groupAttr?: keyof T | string
  cardColumns?: string[]
  onMove?: (row: T, stage: string | null) => void | Promise<void>
}

type TableView = { id: string; label: string; type: 'table' | 'kanban' }

interface CrmTableProps<T extends { id: string }> {
  entity: string
  title?: string
  viewName: string
  addLabel?: string
  sortLabel?: string
  rows: T[]
  columns: CrmColumn<T>[]
  selectedId?: string | null
  onRowClick?: (row: T) => void
  onAdd?: () => void
  views?: TableView[]
  view?: string
  onViewChange?: (view: string) => void
  kanban?: CrmKanbanConfig<T>
  storageKey?: string
}

function configKey(entity: string, storageKey?: string) {
  return `rethink.crm.columns.${storageKey ?? entity}`
}

function viewKey(entity: string, storageKey?: string) {
  return `rethink.crm.views.${storageKey ?? entity}`
}

function stateKey(entity: string, storageKey?: string) {
  return `rethink.crm.state.${storageKey ?? entity}`
}

type TableConfig = { order: string[]; hidden: string[]; widths: Record<string, number> }
type TableState = { filterQuery: string; filterKey: string; sortKey: string; sortDir: 'asc' | 'desc' }

function columnDefaultWidth(width?: string) {
  if (!width) return 168
  const px = width.match(/(\d+)px/)
  if (px) return Number(px[1])
  const minmax = width.match(/minmax\((\d+)px/)
  if (minmax) return Number(minmax[1])
  return width.includes('1fr') ? 260 : 168
}

export default function CrmTable<T extends { id: string }>({
  entity,
  title,
  viewName,
  addLabel = 'New record',
  sortLabel = 'Updated',
  rows,
  columns,
  selectedId,
  onRowClick,
  onAdd,
  views,
  view = 'table',
  onViewChange,
  kanban,
  storageKey,
}: CrmTableProps<T>) {
  const lockedKey = columns.find(c => c.locked)?.key ?? columns[0]?.key
  const allKeys = useMemo(() => columns.map(c => c.key), [columns])
  const defaultConfig = () => ({
    order: [...allKeys],
    hidden: columns.filter(c => c.defaultOff).map(c => c.key),
    widths: Object.fromEntries(columns.map(c => [c.key, columnDefaultWidth(c.width)])),
  })
  const [config, setConfig] = useState<TableConfig>(() => {
    try {
      const raw = localStorage.getItem(configKey(entity, storageKey))
      if (!raw) return defaultConfig()
      const parsed = JSON.parse(raw) as Partial<TableConfig>
      const known = new Set(allKeys)
      const order = (parsed.order ?? []).filter(k => known.has(k))
      allKeys.forEach(k => { if (!order.includes(k)) order.push(k) })
      const savedWidths = parsed.widths ?? {}
      return {
        order,
        hidden: (parsed.hidden ?? columns.filter(c => c.defaultOff).map(c => c.key)).filter(k => known.has(k)),
        widths: Object.fromEntries(columns.map(c => [
          c.key,
          Math.max(92, Number(savedWidths[c.key] ?? columnDefaultWidth(c.width))),
        ])),
      }
    } catch {
      return defaultConfig()
    }
  })
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [dragged, setDragged] = useState<T | null>(null)
  const [pop, setPop] = useState<
    | { type: 'settings' | 'views' | 'add' | 'col' | 'filter' | 'sort' | 'io'; rect: DOMRect; key?: string; locked?: boolean; align?: 'left' | 'right' }
    | null
  >(null)
  const [createColumnOpen, setCreateColumnOpen] = useState(false)
  const [createViewOpen, setCreateViewOpen] = useState(false)
  const [internalView, setInternalView] = useState(view)
  const [modalColumnKey, setModalColumnKey] = useState('')
  const [newViewName, setNewViewName] = useState('')
  const [newViewType, setNewViewType] = useState<'table' | 'kanban'>('table')
  const [columnSearch, setColumnSearch] = useState('')
  const [addColumnSearch, setAddColumnSearch] = useState('')
  const [createMoreColumns, setCreateMoreColumns] = useState(false)
  const [notice, setNotice] = useState('')
  const [localViews, setLocalViews] = useState<TableView[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(viewKey(entity, storageKey)) ?? '[]') as TableView[]
    } catch {
      return []
    }
  })
  const [tableState, setTableState] = useState<TableState>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(stateKey(entity, storageKey)) ?? '{}') as Partial<TableState>
      return {
        filterQuery: parsed.filterQuery ?? '',
        filterKey: parsed.filterKey ?? 'all',
        sortKey: parsed.sortKey ?? sortLabel,
        sortDir: parsed.sortDir ?? 'asc',
      }
    } catch {
      return { filterQuery: '', filterKey: 'all', sortKey: sortLabel, sortDir: 'asc' }
    }
  })
  const colDrag = useRef<string | null>(null)
  const noticeRef = useRef<number | null>(null)

  useEffect(() => {
    setInternalView(view)
  }, [view])

  useEffect(() => {
    try {
      localStorage.setItem(configKey(entity, storageKey), JSON.stringify(config))
    } catch {
      // ignore storage failures
    }
  }, [config, entity, storageKey])

  useEffect(() => {
    try {
      localStorage.setItem(viewKey(entity, storageKey), JSON.stringify(localViews))
    } catch {
      // ignore storage failures
    }
  }, [entity, localViews, storageKey])

  useEffect(() => {
    try {
      localStorage.setItem(stateKey(entity, storageKey), JSON.stringify(tableState))
    } catch {
      // ignore storage failures
    }
  }, [entity, storageKey, tableState])

  useEffect(() => {
    if (pop?.type !== 'settings') setColumnSearch('')
    if (pop?.type !== 'add') setAddColumnSearch('')
  }, [pop?.type])

  const byKey = useMemo(() => new Map(columns.map(c => [c.key, c])), [columns])
  const hidden = new Set(config.hidden)
  const visibleKeys = [lockedKey, ...config.order.filter(k => k !== lockedKey && byKey.has(k) && !hidden.has(k))]
  const visibleColumns = visibleKeys.map(k => byKey.get(k)).filter(Boolean) as CrmColumn<T>[]
  const hiddenColumns = config.order.map(k => byKey.get(k)).filter((c): c is CrmColumn<T> => Boolean(c && c.key !== lockedKey && hidden.has(c.key)))
  const columnSearchTerm = columnSearch.trim().toLowerCase()
  const addColumnSearchTerm = addColumnSearch.trim().toLowerCase()
  const searchableColumns = config.order
    .map(key => byKey.get(key))
    .filter((c): c is CrmColumn<T> => Boolean(c && (!columnSearchTerm || c.label.toLowerCase().includes(columnSearchTerm) || c.key.toLowerCase().includes(columnSearchTerm))))
  const searchableHiddenColumns = hiddenColumns
    .filter(c => !addColumnSearchTerm || c.label.toLowerCase().includes(addColumnSearchTerm) || c.key.toLowerCase().includes(addColumnSearchTerm))
  const baseViews = views?.length ? views : [{ id: 'table', label: viewName, type: 'table' as const }]
  const effectiveView = onViewChange ? view : internalView
  const allViews = [...baseViews, ...localViews]
  const baseViewIds = new Set(baseViews.map(v => v.id))
  const activeView = allViews.find(v => v.id === effectiveView)
  const showKanban = Boolean(activeView?.type === 'kanban' && kanban)
  const template = `32px ${visibleColumns.map(c => `${Math.max(92, config.widths[c.key] ?? columnDefaultWidth(c.width))}px`).join(' ')} minmax(80px, 1fr)`
  const sortColumn = byKey.get(tableState.sortKey) ?? byKey.get(lockedKey)
  const visibleRows = useMemo(() => {
    const q = tableState.filterQuery.trim().toLowerCase()
    const filtered = q ? rows.filter(row => {
      if (tableState.filterKey === 'all') return JSON.stringify(row).toLowerCase().includes(q)
      return String((row as Record<string, unknown>)[tableState.filterKey] ?? '').toLowerCase().includes(q)
    }) : rows
    if (!sortColumn) return filtered
    return [...filtered].sort((a, b) => {
      const av = String((a as Record<string, unknown>)[sortColumn.key] ?? '').toLowerCase()
      const bv = String((b as Record<string, unknown>)[sortColumn.key] ?? '').toLowerCase()
      const result = av.localeCompare(bv, undefined, { numeric: true })
      return tableState.sortDir === 'desc' ? -result : result
    })
  }, [rows, sortColumn, tableState.filterKey, tableState.filterQuery, tableState.sortDir])

  const toggleHidden = (key: string) => {
    if (key === lockedKey) return
    setConfig(prev => {
      const next = new Set(prev.hidden)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return { ...prev, hidden: [...next] }
    })
  }

  const reorder = (from: string, to: string) => {
    if (from === to || from === lockedKey || to === lockedKey) return
    setConfig(prev => {
      const order = prev.order.filter(k => k !== lockedKey)
      const fromIdx = order.indexOf(from)
      const toIdx = order.indexOf(to)
      if (fromIdx < 0 || toIdx < 0) return prev
      order.splice(toIdx, 0, order.splice(fromIdx, 1)[0])
      return { ...prev, order: [lockedKey, ...order] }
    })
  }

  const addColumn = (key: string) => {
    setConfig(prev => ({ ...prev, hidden: prev.hidden.filter(k => k !== key) }))
    if (!createMoreColumns) {
      setPop(null)
      setCreateColumnOpen(false)
    }
    setModalColumnKey('')
    setAddColumnSearch('')
  }

  const showNotice = (message: string) => {
    setNotice(message)
    if (noticeRef.current) window.clearTimeout(noticeRef.current)
    noticeRef.current = window.setTimeout(() => setNotice(''), 2200)
  }

  const shareCurrentView = async () => {
    const url = `${window.location.origin}${window.location.pathname}#${entity}:${activeView?.id ?? effectiveView}`
    try {
      await navigator.clipboard?.writeText(url)
      showNotice('View link copied')
    } catch {
      showNotice('Share link ready')
    }
  }

  const hideColumn = (key: string) => {
    if (key === lockedKey) return
    setConfig(prev => ({ ...prev, hidden: [...new Set([...prev.hidden, key])] }))
    setPop(null)
  }

  const openPop = (type: NonNullable<typeof pop>['type'], event: React.MouseEvent<HTMLElement>, extra: Partial<NonNullable<typeof pop>> = {}) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setPop(prev => prev?.type === type && prev.key === extra.key ? null : { type, rect, ...extra })
  }

  const startResize = (key: string, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = Math.max(92, config.widths[key] ?? columnDefaultWidth(byKey.get(key)?.width))
    document.body.classList.add('crm-resizing')
    const onMove = (moveEvent: MouseEvent) => {
      const width = Math.max(92, startWidth + moveEvent.clientX - startX)
      setConfig(prev => ({ ...prev, widths: { ...prev.widths, [key]: width } }))
    }
    const onUp = () => {
      document.body.classList.remove('crm-resizing')
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const togglePicked = (id: string) => {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const visibleIds = visibleRows.map(row => row.id)
  const allVisiblePicked = visibleIds.length > 0 && visibleIds.every(id => picked.has(id))
  const toggleAllVisible = () => {
    setPicked(prev => {
      const next = new Set(prev)
      if (allVisiblePicked) visibleIds.forEach(id => next.delete(id))
      else visibleIds.forEach(id => next.add(id))
      return next
    })
  }

  const exportCsv = () => {
    const selected = rows.filter(row => picked.has(row.id))
    const sourceRows = selected.length ? selected : visibleRows
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const header = visibleColumns.map(column => escape(column.label)).join(',')
    const body = sourceRows.map(row => visibleColumns.map(column => escape((row as Record<string, unknown>)[column.key])).join(',')).join('\n')
    const blob = new Blob([[header, body].filter(Boolean).join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${entity}-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const changeView = (id: string) => {
    setInternalView(id)
    onViewChange?.(id)
  }

  const createView = () => {
    const label = newViewName.trim()
    if (!label) return
    const id = `local-${Date.now()}`
    const type = newViewType === 'kanban' && kanban ? 'kanban' : 'table'
    setLocalViews(prev => [...prev, { id, label, type }])
    changeView(id)
    setNewViewName('')
    setNewViewType('table')
    setCreateViewOpen(false)
    setPop(null)
  }

  const deleteLocalView = (id: string) => {
    setLocalViews(prev => prev.filter(item => item.id !== id))
    if (effectiveView === id) changeView(baseViews[0]?.id ?? 'table')
  }

  const renderCard = (row: T) => {
    const primary = byKey.get(lockedKey)
    const cardCols = (kanban?.cardColumns ?? visibleColumns.slice(1, 4).map(c => c.key))
      .map(k => byKey.get(k))
      .filter(Boolean) as CrmColumn<T>[]
    return (
      <button
        key={row.id}
        draggable={Boolean(kanban?.onMove)}
        onDragStart={() => setDragged(row)}
        onDragEnd={() => setDragged(null)}
        onClick={() => onRowClick?.(row)}
        className={`kb-card${selectedId === row.id ? ' active' : ''}`}
      >
        <div className="kb-card-top">{primary?.render(row)}</div>
        {cardCols.length > 0 && (
          <div className="kb-card-rows">
            {cardCols.map(c => (
              <div key={c.key} className="kb-card-row">
                {c.icon}
                <span className="kb-card-val">{c.render(row)}</span>
              </div>
            ))}
          </div>
        )}
      </button>
    )
  }

  const popoverStyle = (rect: DOMRect, align: 'left' | 'right' = 'left'): CSSProperties => {
    const style: CSSProperties = { position: 'fixed', top: rect.bottom + 6, zIndex: 1201 }
    if (align === 'right') style.right = window.innerWidth - rect.right
    else style.left = rect.left
    return style
  }

  const popover = pop ? createPortal(
    <>
      <div className="crm-pop-bg" onClick={() => setPop(null)} />
      <div className="crm-pop" style={popoverStyle(pop.rect, pop.align)} onClick={e => e.stopPropagation()}>
        {pop.type === 'settings' && (
          <div className="colmgr">
            <div className="crm-pop-hd"><Columns size={12} /><span>Columns</span><span className="crm-pop-count">{visibleColumns.length - 1} shown</span></div>
            <div className="crm-pop-search"><MagnifyingGlass size={12} /><input autoFocus value={columnSearch} onChange={e => setColumnSearch(e.target.value)} placeholder="Find an attribute..." /></div>
            <div className="crm-pop-list">
              {searchableColumns.length === 0 ? <div className="ac-empty">No attributes match.</div> : searchableColumns.map(c => {
                const key = c.key
                const locked = key === lockedKey
                const on = locked || !hidden.has(key)
                return (
                  <div
                    key={key}
                    className={`cm-row${on ? ' on' : ''}${locked ? ' locked' : ''}`}
                    draggable={!locked}
                    onDragStart={() => { colDrag.current = key }}
                    onDragOver={e => { if (!locked) e.preventDefault() }}
                    onDrop={() => { if (!locked && colDrag.current) reorder(colDrag.current, key); colDrag.current = null }}
                  >
                    <span className="cm-grip">{locked ? <LockSimple size={11} /> : <DotsSixVertical size={12} />}</span>
                    {c.icon}
                    <span className="cm-label">{c.label}</span>
                    {locked
                      ? <span className="cm-lock"><LockSimple size={11} /></span>
                      : <button className={`cm-eye${on ? ' on' : ''}`} onClick={() => toggleHidden(key)}>{on ? <Eye size={13} /> : <EyeSlash size={13} />}</button>}
                  </div>
                )
              })}
            </div>
            <div className="crm-pop-foot"><button onClick={() => setConfig(defaultConfig())}>Reset to default</button></div>
          </div>
        )}
        {pop.type === 'views' && allViews.length > 0 && (
          <div className="crm-viewmenu">
            <div className="crm-pop-hd"><Stack size={12} /><span>Views</span></div>
            {allViews.map(v => (
              <div key={v.id} className={`vm-row-wrap${v.id === (activeView?.id ?? effectiveView) ? ' on' : ''}`}>
                <button
                  className="vm-row"
                  onClick={() => { changeView(v.id); setPop(null) }}
                >
                  {v.type === 'kanban' ? <Kanban size={13} /> : <Rows size={13} />}
                  <span className="vm-label">{v.label}</span>
                  {v.id === (activeView?.id ?? effectiveView) && <Check size={12} />}
                </button>
                {!baseViewIds.has(v.id) && (
                  <button
                    className="vm-delete"
                    aria-label={`Delete ${v.label}`}
                    onClick={event => {
                      event.stopPropagation()
                      deleteLocalView(v.id)
                    }}
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            ))}
            <div className="crm-pop-foot"><button onClick={() => { setCreateViewOpen(true); setPop(null) }}><Plus size={11} /> Create new view</button></div>
          </div>
        )}
        {pop.type === 'io' && (
          <div className="crm-viewmenu">
            <div className="crm-pop-hd"><Export size={12} /><span>Import / Export</span></div>
            <button className="vm-row" onClick={() => { exportCsv(); setPop(null); showNotice('CSV exported') }}>
              <Export size={13} />
              <span className="vm-label">Export CSV</span>
            </button>
            <button className="vm-row" onClick={() => showNotice('CSV import is not connected yet')}>
              <Plus size={13} />
              <span className="vm-label">Import CSV</span>
            </button>
          </div>
        )}
        {pop.type === 'filter' && (
          <div className="crm-filtermenu">
            <div className="crm-pop-hd"><Funnel size={12} /><span>Filter</span></div>
            <div className="crm-filter-form">
              <label>
                <span>Attribute</span>
                <select value={tableState.filterKey} onChange={e => setTableState(prev => ({ ...prev, filterKey: e.target.value }))}>
                  <option value="all">Any attribute</option>
                  {columns.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </label>
              <label>
                <span>Condition</span>
                <div className="crm-filter-cond">contains</div>
              </label>
            </div>
            <div className="crm-pop-search"><MagnifyingGlass size={12} /><input autoFocus value={tableState.filterQuery} onChange={e => setTableState(prev => ({ ...prev, filterQuery: e.target.value }))} placeholder="Set a value..." /></div>
            <div className="crm-pop-foot">
              <button onClick={() => setTableState(prev => ({ ...prev, filterQuery: '', filterKey: 'all' }))}>Clear filter</button>
            </div>
          </div>
        )}
        {pop.type === 'sort' && (
          <div className="crm-viewmenu">
            <div className="crm-pop-hd"><SortAscending size={12} /><span>Sort by</span></div>
            {visibleColumns.map(c => (
              <button
                key={c.key}
                className={`vm-row${(sortColumn?.key ?? lockedKey) === c.key ? ' on' : ''}`}
                onClick={() => {
                  setTableState(prev => ({
                    ...prev,
                    sortKey: c.key,
                    sortDir: prev.sortKey === c.key && prev.sortDir === 'asc' ? 'desc' : 'asc',
                  }))
                  setPop(null)
                }}
              >
                {c.icon}
                <span className="vm-label">{c.label}</span>
                {(sortColumn?.key ?? lockedKey) === c.key && <span className="vm-sort-state">{tableState.sortDir === 'desc' ? 'Z-A' : 'A-Z'}</span>}
              </button>
            ))}
          </div>
        )}
        {pop.type === 'add' && (
          <div className="addcol">
            <div className="crm-pop-search"><MagnifyingGlass size={12} /><input autoFocus value={addColumnSearch} onChange={e => setAddColumnSearch(e.target.value)} placeholder={`Search ${entity} attributes...`} /></div>
            <div className="crm-pop-list">
              {hiddenColumns.length === 0 ? <div className="ac-empty">All attributes are shown.</div> : searchableHiddenColumns.length === 0 ? <div className="ac-empty">No hidden attributes match.</div> : searchableHiddenColumns.map(c => (
                <button key={c.key} className="ac-row" onClick={() => addColumn(c.key)}>
                  {c.icon}<span>{c.label}</span><Plus size={12} />
                </button>
              ))}
            </div>
            <div className="crm-pop-foot">
              <button
                onClick={() => {
                  setModalColumnKey(searchableHiddenColumns[0]?.key ?? hiddenColumns[0]?.key ?? '')
                  setCreateColumnOpen(true)
                  setPop(null)
                }}
              >
                <Plus size={11} /> Add hidden attribute
              </button>
            </div>
          </div>
        )}
        {pop.type === 'col' && pop.key && (
          <div className="crm-colmenu">
            <button onClick={() => setPop({ type: 'settings', rect: pop.rect })}><Columns size={12} /> Manage columns</button>
            {!pop.locked && <button className="danger" onClick={() => hideColumn(pop.key!)}><EyeSlash size={12} /> Hide column</button>}
          </div>
        )}
      </div>
    </>,
    document.body,
  ) : null

  const viewModal = createViewOpen ? createPortal(
    <>
      <div className="crm-modal-bg" onClick={() => setCreateViewOpen(false)} />
      <div className="crm-modal crm-view-create" role="dialog" aria-label="Create view">
        <div className="crm-modal-hd">
          <span>Create view</span>
          <button onClick={() => setCreateViewOpen(false)} aria-label="Close"><X size={13} /></button>
        </div>
        <div className="crm-modal-body">
          <label className="crm-modal-label">View type</label>
          <div className="crm-view-type-grid">
            <button className={`crm-view-type${newViewType === 'table' ? ' active' : ''}`} onClick={() => setNewViewType('table')}><Rows size={16} /><span><strong>Table</strong><em>Organize your records on a table</em></span></button>
            <button className={`crm-view-type${newViewType === 'kanban' ? ' active' : ''}`} disabled={!kanban} onClick={() => setNewViewType('kanban')}><Kanban size={16} /><span><strong>Kanban</strong><em>Organize your records on a pipeline</em></span></button>
          </div>
          <label className="crm-modal-label">Title</label>
          <input className="crm-modal-input" autoFocus value={newViewName} onChange={e => setNewViewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createView(); if (e.key === 'Escape') setCreateViewOpen(false) }} />
        </div>
        <div className="crm-modal-foot">
          <span className="crm-modal-grow" />
          <button className="crm-modal-secondary" onClick={() => setCreateViewOpen(false)}>Cancel <kbd>esc</kbd></button>
          <button className="crm-modal-primary" disabled={!newViewName.trim()} onClick={createView}>Confirm <kbd>↵</kbd></button>
        </div>
      </div>
    </>,
    document.body,
  ) : null

  const columnModal = createColumnOpen ? createPortal(
    <>
      <div className="crm-modal-bg" onClick={() => setCreateColumnOpen(false)} />
      <div className="crm-modal" role="dialog" aria-label="Add column">
        <div className="crm-modal-hd">
          <span>Add column</span>
          <button onClick={() => setCreateColumnOpen(false)} aria-label="Close"><X size={13} /></button>
        </div>
        <div className="crm-modal-body">
          <label className="crm-modal-label">Attribute <span>Required</span></label>
          <select
            className="crm-modal-select"
            autoFocus
            value={modalColumnKey}
            onChange={e => setModalColumnKey(e.target.value)}
          >
            <option value="" disabled>Select an attribute...</option>
            {hiddenColumns.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          {hiddenColumns.length === 0 && (
            <p className="crm-modal-muted">All existing attributes are already visible.</p>
          )}
        </div>
        <div className="crm-modal-foot">
          <label className="crm-toggle">
            <input type="checkbox" checked={createMoreColumns} onChange={event => setCreateMoreColumns(event.target.checked)} />
            <span />
            Create more
          </label>
          <span className="crm-modal-grow" />
          <button className="crm-modal-secondary" onClick={() => setCreateColumnOpen(false)}>Cancel <kbd>esc</kbd></button>
          <button
            className="crm-modal-primary"
            disabled={!modalColumnKey}
            onClick={() => modalColumnKey && addColumn(modalColumnKey)}
          >
            Add column <kbd>↵</kbd>
          </button>
        </div>
      </div>
    </>,
    document.body,
  ) : null

  return (
    <section className="crm density-comfy grid-hairline">
      {title && (
        <div className="crm-objectbar">
          <span className="crm-object-icon">{entity === 'companies' ? '▦' : entity === 'opportunities' ? '◈' : '●'}</span>
          <span>{title}</span>
          <span className="crm-object-grow" />
          <button className="crm-top-action" onClick={() => { void shareCurrentView() }}>Share</button>
          <button className="crm-top-icon" aria-label="Comments" onClick={() => showNotice('Comments are not connected yet')}>□</button>
          <button className="crm-top-icon" aria-label="Help" onClick={() => showNotice('Use filters, views, columns and row peeks from this table')}>?</button>
          <button className="crm-ask" onClick={() => showNotice('AI table assistant is not connected yet')}>Ask Attio</button>
        </div>
      )}
      <header className="crm-toolbar">
        <div className="crm-tools-l">
          <button
            className={`crm-view-pill${pop?.type === 'views' ? ' active' : ''}`}
            onClick={e => allViews.length ? openPop('views', e) : undefined}
          >
            <span className="vmark">{showKanban ? <Kanban size={11} /> : <SquaresFour size={11} weight="fill" />}</span>
            <span className="truncate">{activeView?.label ?? viewName}</span>
            {allViews.length > 0 && <CaretDown size={9} />}
          </button>
          <button
            className={`crm-tool ghost${pop?.type === 'settings' ? ' active' : ''}`}
            onClick={e => openPop('settings', e)}
          >
            <Columns size={13} />
            <span>View settings</span>
            <CaretDown size={9} />
          </button>
        </div>
        <div className="crm-tools-r">
          <button className={`crm-tool ghost${pop?.type === 'io' ? ' active' : ''}`} onClick={e => openPop('io', e, { align: 'right' })}><Export size={13} /><span>Import / Export</span></button>
          <button className={`crm-tool ghost${pop?.type === 'filter' ? ' active' : ''}${tableState.filterQuery ? ' on' : ''}`} onClick={e => openPop('filter', e, { align: 'right' })}><Funnel size={13} /><span>Filter</span></button>
          {onAdd && (
            <button
              onClick={onAdd}
              className="crm-tool primary"
            >
              <Plus size={12} />
              <span>{addLabel}</span>
            </button>
          )}
        </div>
      </header>

      <div className="crm-subbar">
        <button className="crm-chip-btn">
          {showKanban ? <Columns size={12} /> : <SortAscending size={12} />}
          <span>{showKanban ? 'Group by' : 'Sorted by'}</span>
          <strong>{showKanban ? kanban?.groupLabel : sortColumn?.label ?? sortLabel}</strong>
        </button>
        {!showKanban && (
          <button className="crm-chip-btn icon-only" onClick={e => openPop('sort', e)}>
            <CaretDown size={12} />
          </button>
        )}
        <span className="crm-subbar-sep" />
        <button className={`crm-chip-btn${tableState.filterQuery ? ' on' : ''}`} onClick={e => openPop('filter', e)}><Funnel size={12} /><span>{tableState.filterQuery ? `Filter: ${tableState.filterQuery}` : 'Filter'}</span></button>
        {picked.size > 0 && (
          <div className="crm-selection-bar">
            <span>{picked.size} selected</span>
            <button onClick={() => setPicked(new Set())}>Clear</button>
          </div>
        )}
        <span className="crm-subbar-grow" />
        <span className="crm-subbar-count">{visibleRows.length} {entity}</span>
      </div>

      {showKanban && kanban ? (
        <div className="crm-kanban">
          {kanban.stages.map(stage => {
            const stageRows = visibleRows.filter(r => kanban.groupValue(r) === stage.id)
            return (
              <div
                key={stage.id ?? 'none'}
                onDragOver={e => { if (kanban.onMove) e.preventDefault() }}
                onDrop={() => {
                  if (dragged && kanban.onMove) void kanban.onMove(dragged, stage.id)
                  setDragged(null)
                }}
                className="kb-col"
              >
                <div className="kb-col-hd">
                  <span className="kb-dot" style={{ backgroundColor: stage.color ?? '#536471' }} />
                  <span className="kb-col-name">{stage.label}</span>
                  <span className="kb-col-n">{stageRows.length}</span>
                </div>
                <div className="kb-stack">
                  {stageRows.map(renderCard)}
                  {stageRows.length === 0 && <div className="kb-empty">Drop here</div>}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="crm-table">
            <div className="crm-head" style={{ gridTemplateColumns: template }}>
              <div className="crm-cell head check">
                <button className={`crm-cb head-cb${allVisiblePicked ? ' on' : ''}`} onClick={toggleAllVisible} aria-label={allVisiblePicked ? 'Clear selected records' : 'Select all visible records'}>
                  {allVisiblePicked ? <Check size={9} weight="bold" /> : null}
                </button>
              </div>
              {visibleColumns.map(c => (
                <div key={c.key} className={['crm-cell head', c.align === 'right' ? 'r' : ''].join(' ')}>
                  <button className={`crm-colhd${pop?.type === 'col' && pop.key === c.key ? ' active' : ''}`} onClick={e => openPop('col', e, { key: c.key, locked: c.locked })}>
                    {c.icon}
                    <span className="h-label">{c.label}</span>
                    {!c.locked && <CaretDown size={8} />}
                  </button>
                  {!c.locked && <span className="crm-resize" onMouseDown={event => startResize(c.key, event)} />}
                </div>
              ))}
              <div className="crm-cell head addcol">
                <button className={`crm-addcol-btn${pop?.type === 'add' ? ' active' : ''}`} title="Add column" onClick={e => openPop('add', e, { align: 'right' })}><Plus size={13} /></button>
              </div>
            </div>
            {visibleRows.map(row => (
              <button
                key={row.id}
                onClick={() => onRowClick?.(row)}
                className={`crm-trow${selectedId === row.id ? ' active' : ''}${picked.has(row.id) ? ' picked' : ''}`}
                style={{ gridTemplateColumns: template }}
              >
                <span className="crm-cell check" onClick={e => { e.stopPropagation(); togglePicked(row.id) }}>
                  <span className={`crm-cb${picked.has(row.id) ? ' on' : ''}`}>{picked.has(row.id) && <Check size={9} weight="bold" />}</span>
                </span>
                {visibleColumns.map(c => (
                  <span key={c.key} className={['crm-cell', c.align === 'right' ? 'r' : ''].join(' ')}>
                    {c.render(row)}
                  </span>
                ))}
                <span className="crm-cell addcol-sp" />
              </button>
            ))}
            {visibleRows.length === 0 && (
              <div className="py-14 text-center text-[12px] text-shuttle">No records yet.</div>
            )}
            <div className="crm-foot" style={{ gridTemplateColumns: template }}>
              <div className="crm-cell foot count">{visibleRows.length} count</div>
              {visibleColumns.map(c => <button key={c.key} className="crm-cell foot calc" onClick={() => showNotice(`${c.label} calculations are not connected yet`)}><Plus size={10} /> Add calculation</button>)}
              <div className="crm-cell foot addcol-sp" />
            </div>
        </div>
      )}
      {popover}
      {columnModal}
      {viewModal}
      <div className={`rp-toast${notice ? ' on' : ''}`}>{notice}</div>
    </section>
  )
}
