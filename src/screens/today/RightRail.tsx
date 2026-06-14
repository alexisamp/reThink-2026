// RightRail — draggable + collapsible sections (Milestones, This Week, Agenda,
// Journal). Order + per-section open state persist in localStorage. Reorder uses
// @dnd-kit/sortable (the native HTML5 version dropped without persisting).
import { useEffect, useState, type ReactNode } from 'react'
import { DotsSixVertical, CaretDown, CaretRight } from '@phosphor-icons/react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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

  const reorder = (fromId: RailSectionId, toId: RailSectionId) =>
    setLayout(l => {
      const from = l.order.indexOf(fromId)
      const to = l.order.indexOf(toId)
      if (from < 0 || to < 0 || from === to) return l
      return { ...l, order: arrayMove(l.order, from, to) }
    })

  return { layout, toggle, reorder }
}

function SortableSection({ sec, open, onToggle }: {
  sec: RailSectionDef
  open: boolean
  onToggle: (id: RailSectionId) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sec.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 20 : undefined,
    position: isDragging ? ('relative' as const) : undefined,
  }
  return (
    <section ref={setNodeRef} style={style} className={`rail-sec${sec.tone ? ' tone-' + sec.tone : ''}${isDragging ? ' dragging' : ''}`}>
      <header className="rail-sec-hd">
        <button className="grip" title="Drag to reorder" {...attributes} {...listeners}>
          <DotsSixVertical size={13} />
        </button>
        <button className="rail-sec-toggle" onClick={() => onToggle(sec.id)}>
          {sec.icon}
          <span className="label">{sec.title}</span>
          {!open && sec.count != null && <span className="count">· {sec.count}</span>}
        </button>
        <div className="rail-sec-actions">
          <button className="caret" onClick={() => onToggle(sec.id)} title={open ? 'Collapse' : 'Expand'}>
            {open ? <CaretDown size={11} /> : <CaretRight size={11} />}
          </button>
        </div>
      </header>
      {open && <div className="rail-sec-body">{sec.body}</div>}
    </section>
  )
}

const DEFAULT_ORDER: RailSectionId[] = ['milestones', 'thisweek', 'agenda', 'journal']
const DEFAULT_OPEN: Record<string, boolean> = { milestones: true, thisweek: true, agenda: true, journal: false }

export default function RightRail({ sections }: { sections: RailSectionDef[] }) {
  const { layout, toggle, reorder } = useRailLayout(DEFAULT_ORDER, DEFAULT_OPEN)
  const byId = new Map(sections.map(s => [s.id, s]))
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    reorder(active.id as RailSectionId, over.id as RailSectionId)
  }

  return (
    <aside className="rail">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={layout.order} strategy={verticalListSortingStrategy}>
          {layout.order.map(id => {
            const sec = byId.get(id)
            if (!sec) return null
            return <SortableSection key={id} sec={sec} open={!!layout.open[id]} onToggle={toggle} />
          })}
        </SortableContext>
      </DndContext>
    </aside>
  )
}
