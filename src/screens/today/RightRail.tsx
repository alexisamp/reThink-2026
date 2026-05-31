// RightRail — draggable + collapsible sections (Milestones, This Week, Next Steps,
// Journal). Order + per-section open state persist in localStorage.
// Chrome ported from the reThink design bundle (RailSection.jsx + RightRail.jsx).
import { useEffect, useState, type ReactNode } from 'react'
import { DotsSixVertical, CaretDown, CaretRight } from '@phosphor-icons/react'
import type { RailSectionId } from './types'

const RAIL_LS_KEY = 'rethink.today.rail.v1'

export interface RailSectionDef {
  id: RailSectionId
  title: string
  icon: ReactNode
  count?: number
  tone?: 'lagging'
  body: ReactNode
}

interface RailLayout {
  order: RailSectionId[]
  open: Record<string, boolean>
}

function useRailLayout(defaultOrder: RailSectionId[], defaultOpen: Record<string, boolean>) {
  const [layout, setLayout] = useState<RailLayout>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(RAIL_LS_KEY) || 'null') as RailLayout | null
      if (saved && Array.isArray(saved.order) && saved.open) {
        const order = [
          ...saved.order.filter(id => defaultOrder.includes(id)),
          ...defaultOrder.filter(id => !saved.order.includes(id)),
        ]
        return { order, open: { ...defaultOpen, ...saved.open } }
      }
    } catch { /* ignore */ }
    return { order: defaultOrder, open: defaultOpen }
  })

  useEffect(() => {
    try { localStorage.setItem(RAIL_LS_KEY, JSON.stringify(layout)) } catch { /* ignore */ }
  }, [layout])

  const toggle = (id: RailSectionId) =>
    setLayout(l => ({ ...l, open: { ...l.open, [id]: !l.open[id] } }))

  const move = (fromId: RailSectionId, toId: RailSectionId) =>
    setLayout(l => {
      if (fromId === toId) return l
      const order = [...l.order]
      const from = order.indexOf(fromId)
      const to = order.indexOf(toId)
      if (from < 0 || to < 0) return l
      order.splice(from, 1)
      order.splice(to, 0, fromId)
      return { ...l, order }
    })

  return { layout, toggle, move }
}

interface SectionProps extends RailSectionDef {
  open: boolean
  onToggle: (id: RailSectionId) => void
  dragId: RailSectionId | null
  overId: RailSectionId | null
  onDragStart: (id: RailSectionId) => void
  onDragEnter: (id: RailSectionId) => void
  onDragEnd: () => void
}

function RailSection({
  id, title, icon, open, onToggle, count, tone, body,
  dragId, overId, onDragStart, onDragEnter, onDragEnd,
}: SectionProps) {
  const [grabbable, setGrabbable] = useState(false)
  const dragging = dragId === id
  const isOver = overId === id && dragId !== null && dragId !== id

  return (
    <section
      className={`td-rail-sec${tone ? ' tone-' + tone : ''}${dragging ? ' dragging' : ''}${isOver ? ' drop-target' : ''}`}
      draggable={grabbable}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(id) }}
      onDragEnter={(e) => { e.preventDefault(); onDragEnter(id) }}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={() => { onDragEnd(); setGrabbable(false) }}
    >
      <header className="td-rail-sec-hd">
        <button
          className="grip"
          title="Drag to reorder"
          onMouseDown={() => setGrabbable(true)}
          onMouseUp={() => setGrabbable(false)}
          onMouseLeave={() => setGrabbable(false)}
        >
          <DotsSixVertical size={13} />
        </button>
        <button className="td-rail-sec-toggle" onClick={() => onToggle(id)}>
          {icon}
          <span className="label">{title}</span>
          {!open && count != null && <span className="count">· {count}</span>}
        </button>
        <div className="td-rail-sec-actions">
          <button className="caret" onClick={() => onToggle(id)} title={open ? 'Collapse' : 'Expand'}>
            {open ? <CaretDown size={11} /> : <CaretRight size={11} />}
          </button>
        </div>
      </header>
      {open && <div className="td-rail-sec-body">{body}</div>}
    </section>
  )
}

const DEFAULT_ORDER: RailSectionId[] = ['milestones', 'thisweek', 'nextsteps', 'journal']
const DEFAULT_OPEN: Record<string, boolean> = { milestones: true, thisweek: true, nextsteps: true, journal: false }

export default function RightRail({ sections }: { sections: RailSectionDef[] }) {
  const { layout, toggle, move } = useRailLayout(DEFAULT_ORDER, DEFAULT_OPEN)
  const [dragId, setDragId] = useState<RailSectionId | null>(null)
  const [overId, setOverId] = useState<RailSectionId | null>(null)

  const byId = new Map(sections.map(s => [s.id, s]))

  const dnd = {
    dragId, overId,
    onDragStart: (id: RailSectionId) => setDragId(id),
    onDragEnter: (id: RailSectionId) => setOverId(id),
    onDragEnd: () => { if (dragId && overId) move(dragId, overId); setDragId(null); setOverId(null) },
  }

  return (
    <aside className="td-rail">
      {layout.order.map(id => {
        const sec = byId.get(id)
        if (!sec) return null
        return (
          <RailSection
            key={id}
            {...sec}
            open={!!layout.open[id]}
            onToggle={toggle}
            {...dnd}
          />
        )
      })}
    </aside>
  )
}
