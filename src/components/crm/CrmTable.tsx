import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  CaretDown, Check, Columns, DotsSixVertical, Export, Eye, EyeSlash, Funnel,
  Kanban, LockSimple, MagnifyingGlass, Plus, Rows, SortAscending, SquaresFour,
  Stack,
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
  views?: Array<{ id: string; label: string; type: 'table' | 'kanban' }>
  view?: string
  onViewChange?: (view: string) => void
  kanban?: CrmKanbanConfig<T>
  storageKey?: string
}

function configKey(entity: string, storageKey?: string) {
  return `rethink.crm.columns.${storageKey ?? entity}`
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
  })
  const [config, setConfig] = useState<{ order: string[]; hidden: string[] }>(() => {
    try {
      const raw = localStorage.getItem(configKey(entity, storageKey))
      if (!raw) return defaultConfig()
      const parsed = JSON.parse(raw) as { order?: string[]; hidden?: string[] }
      const known = new Set(allKeys)
      const order = (parsed.order ?? []).filter(k => known.has(k))
      allKeys.forEach(k => { if (!order.includes(k)) order.push(k) })
      return {
        order,
        hidden: (parsed.hidden ?? columns.filter(c => c.defaultOff).map(c => c.key)).filter(k => known.has(k)),
      }
    } catch {
      return defaultConfig()
    }
  })
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [dragged, setDragged] = useState<T | null>(null)
  const [pop, setPop] = useState<
    | { type: 'settings' | 'views' | 'add' | 'col'; rect: DOMRect; key?: string; locked?: boolean; align?: 'left' | 'right' }
    | null
  >(null)
  const colDrag = useRef<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(configKey(entity, storageKey), JSON.stringify(config))
    } catch {
      // ignore storage failures
    }
  }, [config, entity, storageKey])

  const byKey = useMemo(() => new Map(columns.map(c => [c.key, c])), [columns])
  const hidden = new Set(config.hidden)
  const visibleKeys = [lockedKey, ...config.order.filter(k => k !== lockedKey && byKey.has(k) && !hidden.has(k))]
  const visibleColumns = visibleKeys.map(k => byKey.get(k)).filter(Boolean) as CrmColumn<T>[]
  const hiddenColumns = config.order.map(k => byKey.get(k)).filter((c): c is CrmColumn<T> => Boolean(c && c.key !== lockedKey && hidden.has(c.key)))
  const activeView = views?.find(v => v.id === view)
  const showKanban = Boolean(activeView?.type === 'kanban' && kanban)
  const hasFlex = visibleColumns.some(c => (c.width ?? '').includes('1fr'))
  const template = `32px ${visibleColumns.map(c => c.width ?? 'minmax(120px, 1fr)').join(' ')} ${hasFlex ? '46px' : 'minmax(46px, 1fr)'}`

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
    setPop(null)
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

  const togglePicked = (id: string) => {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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
            <div className="crm-pop-search"><MagnifyingGlass size={12} /><input autoFocus placeholder="Find an attribute..." /></div>
            <div className="crm-pop-list">
              {config.order.map(key => {
                const c = byKey.get(key)
                if (!c) return null
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
        {pop.type === 'views' && views && (
          <div className="crm-viewmenu">
            <div className="crm-pop-hd"><Stack size={12} /><span>Views</span></div>
            {views.map(v => (
              <button
                key={v.id}
                className={`vm-row${v.id === (activeView?.id ?? view) ? ' on' : ''}`}
                onClick={() => { onViewChange?.(v.id); setPop(null) }}
              >
                {v.type === 'kanban' ? <Kanban size={13} /> : <Rows size={13} />}
                <span className="vm-label">{v.label}</span>
                {v.id === (activeView?.id ?? view) && <Check size={12} />}
              </button>
            ))}
            <div className="crm-pop-foot"><button><Plus size={11} /> Create new view</button></div>
          </div>
        )}
        {pop.type === 'add' && (
          <div className="addcol">
            <div className="crm-pop-search"><MagnifyingGlass size={12} /><input autoFocus placeholder="Add a column..." /></div>
            <div className="crm-pop-list">
              {hiddenColumns.length === 0 ? <div className="ac-empty">All attributes are shown.</div> : hiddenColumns.map(c => (
                <button key={c.key} className="ac-row" onClick={() => addColumn(c.key)}>
                  {c.icon}<span>{c.label}</span><Plus size={12} />
                </button>
              ))}
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

  return (
    <section className="crm density-comfy grid-hairline">
      <header className="crm-toolbar">
        <div className="crm-tools-l">
          <button
            className={`crm-view-pill${pop?.type === 'views' ? ' active' : ''}`}
            onClick={e => views ? openPop('views', e) : undefined}
          >
            <span className="vmark">{showKanban ? <Kanban size={11} /> : <SquaresFour size={11} weight="fill" />}</span>
            <span className="truncate">{activeView?.label ?? viewName}</span>
            {views && <CaretDown size={9} />}
          </button>
          {title && <span className="truncate text-[12px] text-shuttle">{title}</span>}
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
          <button className="crm-tool ghost"><Export size={13} /><span>Import / Export</span></button>
          <button className="crm-tool ghost"><Funnel size={13} /><span>Filter</span></button>
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
          <strong>{showKanban ? kanban?.groupLabel : sortLabel}</strong>
        </button>
        <span className="crm-subbar-sep" />
        <button className="crm-chip-btn"><Funnel size={12} /><span>Filter</span></button>
        <span className="crm-subbar-grow" />
        <span className="crm-subbar-count">{rows.length} {entity}</span>
      </div>

      {showKanban && kanban ? (
        <div className="crm-kanban">
          {kanban.stages.map(stage => {
            const stageRows = rows.filter(r => kanban.groupValue(r) === stage.id)
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
                  <span className="kb-dot" style={{ backgroundColor: stage.color ?? '#6F7988' }} />
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
              <div className="crm-cell head check"><span className="crm-cb head-cb" /></div>
              {visibleColumns.map(c => (
                <div key={c.key} className={['crm-cell head', c.align === 'right' ? 'r' : ''].join(' ')}>
                  <button className={`crm-colhd${pop?.type === 'col' && pop.key === c.key ? ' active' : ''}`} onClick={e => openPop('col', e, { key: c.key, locked: c.locked })}>
                    {c.icon}
                    <span className="h-label">{c.label}</span>
                    {!c.locked && <CaretDown size={8} />}
                  </button>
                </div>
              ))}
              <div className="crm-cell head addcol">
                <button className={`crm-addcol-btn${pop?.type === 'add' ? ' active' : ''}`} title="Add column" onClick={e => openPop('add', e, { align: 'right' })}><Plus size={13} /></button>
              </div>
            </div>
            {rows.map(row => (
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
            {rows.length === 0 && (
              <div className="py-14 text-center text-[12px] text-shuttle">No records yet.</div>
            )}
            <div className="crm-foot" style={{ gridTemplateColumns: template }}>
              <div className="crm-cell foot count">{rows.length} count</div>
              {visibleColumns.map(c => <div key={c.key} className="crm-cell foot calc"><Plus size={10} /> Add calculation</div>)}
              <div className="crm-cell foot addcol-sp" />
            </div>
        </div>
      )}
      {popover}
    </section>
  )
}
