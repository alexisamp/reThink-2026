import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  ArrowBendUpRight, ArrowsIn, ArrowsOut, Broadcast, Briefcase, Check, LinkBreak,
  Minus, Plus, Ranking, UserPlus, WarningCircle,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { Contact, ContactIntroduction, Opportunity, ValueLog } from '@/types'

const VB_W = 1040
const VB_H = 760

type NetworkNode =
  | { id: string; type: 'you'; label: string; parent: null; children: string[]; depth: number; leaves: number; x: number; y: number }
  | { id: string; type: 'person'; pid: string; parent: string | null; children: string[]; depth: number; leaves: number; x: number; y: number; made: number }
  | { id: string; type: 'company'; co: string; parent: string | null; children: string[]; depth: number; leaves: number; x: number; y: number; penetration: number; inside: Contact[]; opp?: Opportunity | null }
  | { id: string; type: 'ghost'; label: string; parent: string | null; children: string[]; depth: number; leaves: number; x: number; y: number; note?: string }

type Edge = { from: string; to: string; weak?: boolean }
type NetworkNodeDraft =
  | Omit<Extract<NetworkNode, { type: 'you' }>, 'children' | 'depth' | 'leaves' | 'x' | 'y'>
  | Omit<Extract<NetworkNode, { type: 'person' }>, 'children' | 'depth' | 'leaves' | 'x' | 'y'>
  | Omit<Extract<NetworkNode, { type: 'company' }>, 'children' | 'depth' | 'leaves' | 'x' | 'y'>
  | Omit<Extract<NetworkNode, { type: 'ghost' }>, 'children' | 'depth' | 'leaves' | 'x' | 'y'>

interface PeopleNetworkProps {
  userId: string | null
  contacts: Contact[]
  introductions?: ContactIntroduction[]
  onOpenPerson?: (contact: Contact) => void
  onOpenOpportunity?: (opportunity: Opportunity) => void
  onContact?: (contact: Contact, context: string) => void
}

function todayLocal(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function first(name: string) {
  return name.trim().split(/\s+/)[0] || name
}

function Avatar({ name, src, size = 30 }: { name: string; src?: string | null; size?: number }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
  return (
    <span className="crm-av" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {src ? <img src={src} alt="" /> : initials || '?'}
    </span>
  )
}

function normalize(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function idForGhost(prefix: string, value: string, seed: string) {
  return `${prefix}-${normalize(value).replace(/[^a-z0-9]+/g, '-') || seed}`
}

function findContact(
  contactsById: Map<string, Contact>,
  contactsByName: Map<string, Contact>,
  id: string | null | undefined,
  name: string | null | undefined,
) {
  if (id && contactsById.has(id)) return contactsById.get(id)
  const key = normalize(name)
  if (key && contactsByName.has(key)) return contactsByName.get(key)
  if (key.length >= 4) {
    for (const [contactName, contact] of contactsByName.entries()) {
      if (contactName.includes(key) || key.includes(contactName)) return contact
    }
  }
  return undefined
}

function buildGraph(contacts: Contact[], opportunities: Opportunity[], introductions: ContactIntroduction[]) {
  const byId = new Map(contacts.map(contact => [contact.id, contact]))
  const contactsByName = new Map(contacts.map(contact => [normalize(contact.name), contact]))
  const oppByCompany = new Map<string, Opportunity>()
  opportunities.forEach(opp => {
    const company = normalize(opp.company?.name)
    if (company && !oppByCompany.has(company)) oppByCompany.set(company, opp)
  })

  const nodes: Record<string, NetworkNode> = {}
  const make = (node: NetworkNodeDraft) => {
    nodes[node.id] = { ...node, children: [], depth: 0, leaves: 1, x: 0, y: 0 } as unknown as NetworkNode
    return nodes[node.id]
  }

  make({ id: 'you', type: 'you', label: 'You', parent: null })

  const visibleIntros = introductions.filter(intro => intro.status !== 'requested')

  const graphContactIds = new Set<string>()
  visibleIntros.forEach(intro => {
    ;[intro.source_contact_id, intro.connector_contact_id, intro.introduced_contact_id, intro.introduced_to_contact_id]
      .filter(Boolean)
      .forEach(id => graphContactIds.add(id as string))
    const connector = findContact(byId, contactsByName, intro.connector_contact_id, intro.connector_name)
    const introduced = findContact(byId, contactsByName, intro.introduced_contact_id, intro.introduced_person_name)
    const introducedTo = findContact(byId, contactsByName, intro.introduced_to_contact_id, intro.introduced_to_name)
    if (connector) graphContactIds.add(connector.id)
    if (introduced) graphContactIds.add(introduced.id)
    if (introducedTo) graphContactIds.add(introducedTo.id)
  })

  contacts.forEach(contact => {
    if (!graphContactIds.has(contact.id)) return
    make({ id: contact.id, type: 'person', pid: contact.id, parent: 'you', made: 0 })
  })

  const ensureGhost = (prefix: string, name: string, note: string | null | undefined) => {
    const id = idForGhost(prefix, name, `${prefix}-${Object.keys(nodes).length}`)
    if (!nodes[id]) make({ id, type: 'ghost', label: name, parent: 'you', note: note ?? undefined })
    return id
  }

  const nodeIdForContactOrName = (
    prefix: string,
    contact: Contact | undefined,
    name: string | null | undefined,
    note: string | null | undefined,
  ) => {
    if (contact && nodes[contact.id]) return contact.id
    if (name?.trim()) return ensureGhost(prefix, name.trim(), note)
    return null
  }

  const setParent = (childId: string, parentId: string) => {
    if (!nodes[childId] || !nodes[parentId] || childId === parentId) return
    const current = nodes[childId].parent
    if (current && nodes[current]) nodes[current].children = nodes[current].children.filter(id => id !== childId)
    nodes[childId].parent = parentId
    if (!nodes[parentId].children.includes(childId)) nodes[parentId].children.push(childId)
  }

  visibleIntros.forEach(intro => {
    const connector = findContact(byId, contactsByName, intro.connector_contact_id, intro.connector_name)
    const introduced = findContact(byId, contactsByName, intro.introduced_contact_id, intro.introduced_person_name)
    const introducedTo = findContact(byId, contactsByName, intro.introduced_to_contact_id, intro.introduced_to_name)
    const source = byId.get(intro.source_contact_id)

    const connectorId = nodeIdForContactOrName(
      'g-connector',
      connector ?? (!intro.connector_name && intro.direction === 'received' ? source : undefined),
      intro.connector_name,
      intro.relationship_context ?? 'Connector captured from Conversations.',
    )
    const introducedId = nodeIdForContactOrName(
      'g-intro',
      introduced,
      intro.introduced_person_name,
      intro.relationship_context ?? 'Introduction captured from Conversations.',
    )
    const introducedToId = nodeIdForContactOrName(
      'g-to',
      introducedTo ?? (!intro.introduced_to_name && intro.direction === 'given' ? source : undefined),
      intro.introduced_to_name,
      intro.relationship_context ?? 'Recipient captured from Conversations.',
    )

    if (intro.direction === 'received' && connectorId) {
      setParent(connectorId, 'you')
      if (introducedId) setParent(introducedId, connectorId)
    }

    if (intro.direction === 'given' && introducedToId) {
      setParent(introducedToId, 'you')
      if (introducedId) setParent(introducedId, introducedToId)
    }
  })

  Object.values(nodes).forEach(node => {
    if (node.type !== 'person') return
    if (node.parent !== 'you' || nodes.you.children.includes(node.id)) return
    nodes.you.children.push(node.id)
  })

  const graphPersonIds = new Set(
    Object.values(nodes)
      .filter((node): node is Extract<NetworkNode, { type: 'person' }> => node.type === 'person')
      .map(node => node.pid),
  )
  const companyNames = [...new Set(
    contacts
      .filter(contact => graphPersonIds.has(contact.id) && contact.company)
      .map(contact => contact.company as string),
  )]
    .filter(name => oppByCompany.has(normalize(name)))
    .slice(0, 4)
  companyNames.forEach(name => {
    const inside = contacts.filter(contact => graphPersonIds.has(contact.id) && normalize(contact.company) === normalize(name))
    const parent = inside.find(contact => nodes[contact.id])?.id ?? 'you'
    const id = `co-${normalize(name).replace(/[^a-z0-9]+/g, '-')}`
    const opp = oppByCompany.get(normalize(name))
    make({ id, type: 'company', co: name, parent, penetration: inside.length, inside, opp })
    if (nodes[parent] && !nodes[parent].children.includes(id)) nodes[parent].children.push(id)
  })

  Object.values(nodes).filter(node => node.type === 'person').forEach(node => {
    const contact = byId.get(node.pid)
    if (!contact) return
    const isConnector = (intro: ContactIntroduction) => (
      intro.connector_contact_id === contact.id ||
      normalize(intro.connector_name) === normalize(contact.name) ||
      (!intro.connector_contact_id && !intro.connector_name && intro.direction === 'received' && intro.source_contact_id === contact.id)
    )
    const isRecipient = (intro: ContactIntroduction) => (
      intro.introduced_to_contact_id === contact.id ||
      normalize(intro.introduced_to_name) === normalize(contact.name) ||
      (!intro.introduced_to_contact_id && !intro.introduced_to_name && intro.direction === 'given' && intro.source_contact_id === contact.id)
    )
    const openedFromRows = visibleIntros.filter(intro =>
      intro.direction === 'received' && isConnector(intro),
    ).length
    const givenToRows = visibleIntros.filter(intro =>
      intro.direction === 'given' && isRecipient(intro),
    ).length
    node.made = openedFromRows + givenToRows
  })

  const setDepth = (id: string, depth: number) => {
    const node = nodes[id]
    if (!node) return
    node.depth = depth
    node.children.forEach(child => setDepth(child, depth + 1))
  }
  setDepth('you', 0)

  const leaves = (id: string): number => {
    const node = nodes[id]
    if (!node.children.length) {
      node.leaves = 1
      return 1
    }
    node.leaves = node.children.reduce((sum, child) => sum + leaves(child), 0)
    return node.leaves
  }
  leaves('you')

  const cx = VB_W / 2
  const cy = VB_H / 2 - 6
  const ring = [0, 146, 272, 372]
  const place = (id: string, a0: number, a1: number) => {
    const node = nodes[id]
    const mid = (a0 + a1) / 2
    if (node.depth === 0) {
      node.x = cx
      node.y = cy
    } else {
      const r = ring[Math.min(node.depth, ring.length - 1)]
      node.x = cx + r * Math.cos(mid)
      node.y = cy + r * Math.sin(mid)
    }
    let a = a0
    node.children.forEach(child => {
      const span = (a1 - a0) * (nodes[child].leaves / Math.max(node.leaves, 1))
      place(child, a, a + span)
      a += span
    })
  }
  const deg = Math.PI / 180
  place('you', -230 * deg, 70 * deg)

  const edges: Edge[] = []
  const edgeKeys = new Set<string>()
  Object.values(nodes).forEach(node => node.children.forEach(child => {
    const key = `${node.id}->${child}`
    if (edgeKeys.has(key)) return
    edgeKeys.add(key)
    edges.push({ from: node.id, to: child })
  }))

  return { nodes, edges, byId }
}

function nodeRadius(node: NetworkNode) {
  if (node.type === 'you') return 19
  if (node.type === 'person') return Math.min(28, 16 + (node.made || 0) * 2.8)
  if (node.type === 'company') return Math.min(26, 15 + (node.penetration || 1) * 3.1)
  return 12
}

function lineage(nodes: Record<string, NetworkNode>, id: string) {
  const set = new Set<string>([id])
  let cur = nodes[id]
  while (cur?.parent) {
    set.add(cur.parent)
    cur = nodes[cur.parent]
  }
  const down = (nid: string) => {
    nodes[nid]?.children.forEach(child => {
      set.add(child)
      down(child)
    })
  }
  down(id)
  const node = nodes[id]
  if (node?.type === 'company') node.inside.forEach(contact => { if (nodes[contact.id]) set.add(contact.id) })
  return set
}

function reciprocity(contact: Contact | undefined, logs: ValueLog[]) {
  if (!contact) return { key: 'even' as const, color: 'color-mix(in oklab, var(--shuttle) 30%, transparent)', label: 'balanced', net: 0 }
  const contactLogs = logs.filter(log => log.outreach_log_id === contact.id)
  const given = contactLogs.filter(log => log.direction === 'given').length
  const received = contactLogs.filter(log => log.direction === 'received').length
  const net = given - received
  if (net >= 1) return { key: 'gave' as const, color: 'var(--moss)', label: `you gave more (+${net})`, net }
  if (net <= -1) return { key: 'owe' as const, color: 'var(--acc-plum)', label: `you owe value (${net})`, net }
  return { key: 'even' as const, color: 'color-mix(in oklab, var(--shuttle) 35%, transparent)', label: 'balanced', net }
}

export default function PeopleNetwork({
  userId,
  contacts,
  introductions = [],
  onOpenPerson,
  onOpenOpportunity,
  onContact,
}: PeopleNetworkProps) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [valueLogs, setValueLogs] = useState<ValueLog[]>([])
  const [added, setAdded] = useState<Set<string>>(() => new Set())
  const [hover, setHover] = useState<string | null>(null)
  const [full, setFull] = useState(false)
  const [scope, setScope] = useState<'focus' | 'recent'>('focus')
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null)
  const leaveTimer = useRef<number | null>(null)
  const [size, setSize] = useState({ w: 1040, h: 800 })
  const [view, setView] = useState({ x: 0, y: 0, z: 1 })

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    Promise.all([
      supabase.from('opportunities').select('*, company:companies(*)').eq('user_id', userId),
      supabase.from('value_logs').select('*').eq('user_id', userId),
      supabase.from('todos').select('url').eq('user_id', userId).like('url', 'rethink://people-network/%').eq('completed', false),
    ]).then(([oppRes, valueRes, todoRes]) => {
      if (cancelled) return
      setOpportunities((oppRes.data ?? []) as Opportunity[])
      setValueLogs((valueRes.data ?? []) as ValueLog[])
      setAdded(new Set((todoRes.data ?? []).map(row => String(row.url ?? '').replace('rethink://people-network/', '')).filter(Boolean)))
    })
    return () => { cancelled = true }
  }, [userId])

  useEffect(() => {
    const el = wrapRef.current
    if (!el || !window.ResizeObserver) return
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect()
      setSize({ w: rect.width, h: rect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [full])

  useEffect(() => { setView({ x: 0, y: 0, z: 1 }) }, [full])

  const eligibleIntroductions = useMemo(() => {
    const seen = new Set<string>()
    return [...introductions]
      .filter(intro => intro.status !== 'requested')
      .sort((a, b) => b.source_interaction_date.localeCompare(a.source_interaction_date))
      .filter(intro => {
        const key = [
          intro.direction,
          normalize(intro.connector_contact_id ?? intro.connector_name ?? ''),
          normalize(intro.introduced_contact_id ?? intro.introduced_person_name ?? ''),
          normalize(intro.introduced_to_contact_id ?? intro.introduced_to_name ?? ''),
          intro.source_interaction_date,
        ].join('|')
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  }, [introductions])
  const graphIntroductions = useMemo(
    () => eligibleIntroductions.slice(0, scope === 'focus' ? 5 : 9),
    [eligibleIntroductions, scope],
  )
  const visibleIntroductions = useMemo(
    () => eligibleIntroductions.slice(0, scope === 'focus' ? 8 : 16),
    [eligibleIntroductions, scope],
  )

  const graph = useMemo(() => buildGraph(contacts, opportunities, graphIntroductions), [contacts, opportunities, graphIntroductions])
  const { nodes, edges, byId } = graph
  const nodeList = Object.values(nodes)
  const highlighted = hover ? lineage(nodes, hover) : null
  const hoverNode = hover ? nodes[hover] : null
  const hoverPerson = hoverNode?.type === 'person' ? byId.get(hoverNode.pid) : undefined
  const hoverRec = reciprocity(hoverPerson, valueLogs)

  const connectorIds = nodeList
    .filter((node): node is Extract<NetworkNode, { type: 'person' }> => node.type === 'person')
    .map(node => ({ id: node.pid, n: node.made }))
    .filter(row => row.n > 0)
    .sort((a, b) => b.n - a.n)
  const firstDeg = nodes.you.children.filter(id => nodes[id]?.type === 'person').length
  const reachable = nodeList.filter(node => node.type === 'ghost').length
  const oweConnectors = connectorIds.filter(row => reciprocity(byId.get(row.id), valueLogs).key === 'owe')
  const hasIntroGraph = graphIntroductions.length > 0 && nodeList.length > 1
  const contactsById = useMemo(() => new Map(contacts.map(contact => [contact.id, contact])), [contacts])
  const contactsByName = useMemo(() => new Map(contacts.map(contact => [normalize(contact.name), contact])), [contacts])

  const resolveIntroPerson = (
    id: string | null | undefined,
    name: string | null | undefined,
    company: string | null | undefined,
  ) => {
    const contact = findContact(contactsById, contactsByName, id, name)
    return {
      id: contact?.id ?? id ?? null,
      name: contact?.name ?? name ?? 'Unknown',
      company: contact?.company ?? company ?? 'Network',
      photoUrl: contact?.profile_photo_url ?? null,
      linked: Boolean(contact),
    }
  }

  const introLedgerRows = visibleIntroductions.map(intro => {
    const connector = intro.direction === 'given'
      ? { id: null, name: 'You', company: 'reThink', photoUrl: null, linked: false }
      : resolveIntroPerson(intro.connector_contact_id ?? (!intro.connector_name ? intro.source_contact_id : null), intro.connector_name, null)
    const introduced = resolveIntroPerson(intro.introduced_contact_id, intro.introduced_person_name, intro.introduced_person_company)
    const recipient = intro.direction === 'received'
      ? { id: null, name: 'You', company: 'reThink', photoUrl: null, linked: false }
      : resolveIntroPerson(intro.introduced_to_contact_id ?? (!intro.introduced_to_name ? intro.source_contact_id : null), intro.introduced_to_name, intro.introduced_to_company)
    return { intro, connector, introduced, recipient }
  })

  const ZMIN = 0.55
  const ZMAX = 2.6
  const clampZ = (z: number) => Math.min(ZMAX, Math.max(ZMIN, z))
  const zoomAt = (nz: number, px: number, py: number) => setView(prev => {
    const z = clampZ(nz)
    const k = z / prev.z
    return { z, x: px - (px - prev.x) * k, y: py - (py - prev.y) * k }
  })
  const zoomBy = (factor: number) => zoomAt(view.z * factor, size.w / 2, size.h / 2)
  const dragging = () => Boolean(drag.current?.moved)
  const enter = (id: string) => {
    if (dragging()) return
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current)
    setHover(id)
  }
  const leave = () => {
    leaveTimer.current = window.setTimeout(() => setHover(null), 160)
  }
  const pct = (value: number, axis: 'x' | 'y') => `${axis === 'x' ? (value / VB_W) * 100 : (value / VB_H) * 100}%`
  const dim = (id: string) => highlighted && !highlighted.has(id)

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey && Math.abs(event.deltaY) < 1) return
    event.preventDefault()
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    zoomAt(view.z * (event.deltaY < 0 ? 1.12 : 1 / 1.12), event.clientX - rect.left, event.clientY - rect.top)
  }
  const onPointerDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    drag.current = { sx: event.clientX, sy: event.clientY, ox: view.x, oy: view.y, moved: false }
    setHover(null)
  }
  const onPointerMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const dx = event.clientX - d.sx
    const dy = event.clientY - d.sy
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
    if (d.moved) setView(prev => ({ ...prev, x: d.ox + dx, y: d.oy + dy }))
  }
  const endDrag = () => { drag.current = null }

  const valueTodoId = (contact: Contact) => contact.id
  const addValue = async (contact: Contact | undefined) => {
    if (!userId || !contact) return
    const id = valueTodoId(contact)
    const already = added.has(id)
    setAdded(prev => {
      const next = new Set(prev)
      if (already) next.delete(id)
      else next.add(id)
      return next
    })
    if (already) {
      await supabase.from('todos').delete().eq('user_id', userId).eq('url', `rethink://people-network/${id}`)
      return
    }
    await supabase.from('todos').insert({
      user_id: userId,
      contact_id: contact.id,
      text: `Give value to ${first(contact.name)} before your next ask`,
      date: todayLocal(),
      url: `rethink://people-network/${id}`,
    })
  }

  const parentLabel = hoverNode?.parent && hoverNode.parent !== 'you'
    ? nodes[hoverNode.parent]?.type === 'person'
      ? first(byId.get((nodes[hoverNode.parent] as Extract<NetworkNode, { type: 'person' }>).pid)?.name ?? 'Someone')
      : nodes[hoverNode.parent]?.type === 'company'
        ? (nodes[hoverNode.parent] as Extract<NetworkNode, { type: 'company' }>).co
        : 'You'
    : hoverNode?.parent === 'you' ? 'You (direct)' : null

  return (
    <div className={`network${full ? ' full' : ''}`}>
      <div className="net-graph-wrap">
        <div className="net-graph-bar">
          <span className="net-graph-tag"><Briefcase size={13} />Your relationship web</span>
          <span className="net-graph-hint">{graphIntroductions.length} key chains · {eligibleIntroductions.length} intros captured · size = intros made · ring = value balance</span>
          <div className="net-scope" onClick={event => event.stopPropagation()}>
            <button className={scope === 'focus' ? 'on' : ''} onClick={() => setScope('focus')}>Focus</button>
            <button className={scope === 'recent' ? 'on' : ''} onClick={() => setScope('recent')}>Recent</button>
          </div>
          <div className="net-zoom" onClick={event => event.stopPropagation()}>
            <button onClick={() => zoomBy(1 / 1.2)} title="Zoom out" disabled={view.z <= ZMIN + 0.001}><Minus size={13} /></button>
            <button className="net-zoom-lvl" onClick={() => setView({ x: 0, y: 0, z: 1 })} title="Reset view">{Math.round(view.z * 100)}%</button>
            <button onClick={() => zoomBy(1.2)} title="Zoom in" disabled={view.z >= ZMAX - 0.001}><Plus size={13} /></button>
          </div>
          <button className="net-full-btn" onClick={() => setFull(value => !value)} title={full ? 'Exit fullscreen' : 'Expand'}>
            {full ? <ArrowsIn size={14} /> : <ArrowsOut size={14} />}
            <span>{full ? 'Close' : 'Expand'}</span>
          </button>
        </div>

        <div
          className="net-graph"
          ref={wrapRef}
          onWheel={onWheel}
          onMouseDown={onPointerDown}
          onMouseMove={onPointerMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
        >
          <div className="net-stage" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
            {!hasIntroGraph && (
              <div className="net-empty">
                <UserPlus size={18} />
                <span>No introduction edges captured yet.</span>
              </div>
            )}
            <svg className="net-links" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid meet">
              {edges.map((edge, index) => {
                const a = nodes[edge.from]
                const b = nodes[edge.to]
                const active = highlighted && highlighted.has(edge.from) && highlighted.has(edge.to)
                const mx = (a.x + b.x) / 2
                const my = (a.y + b.y) / 2
                const cx = mx + (a.y - b.y) * 0.08
                const cy = my + (b.x - a.x) * 0.08
                return (
                  <path
                    key={index}
                    d={`M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`}
                    className={`net-link${edge.weak ? ' weak' : ''}${active ? ' on' : ''}${highlighted && !active ? ' off' : ''}`}
                  />
                )
              })}
            </svg>

            {nodeList.map(node => {
              const r = nodeRadius(node)
              const sizePx = r * 2
              const style: CSSProperties = { left: pct(node.x, 'x'), top: pct(node.y, 'y'), width: sizePx, height: sizePx }
              if (node.type === 'you') return <div key={node.id} className={`gnode you${dim(node.id) ? ' dim' : ''}`} style={style}><span>You</span></div>
              if (node.type === 'ghost') {
                return (
                  <div key={node.id} className={`gnode ghost${dim(node.id) ? ' dim' : ''}${hover === node.id ? ' hot' : ''}`} style={style} onMouseEnter={() => enter(node.id)} onMouseLeave={leave}>
                    <UserPlus size={Math.round(r * 0.7)} />
                    <span className="gnode-cap ghost-cap">{node.label}</span>
                  </div>
                )
              }
              if (node.type === 'company') {
                return (
                  <div
                    key={node.id}
                    className={`gnode company${dim(node.id) ? ' dim' : ''}${hover === node.id ? ' hot' : ''}`}
                    style={style}
                    onMouseEnter={() => enter(node.id)}
                    onMouseLeave={leave}
                    onClick={event => { event.stopPropagation(); if (!dragging() && node.opp) onOpenOpportunity?.(node.opp) }}
                  >
                    <span className="co-mark">{node.co[0]}</span>
                    <span className="gnode-cap">{node.co}</span>
                    {node.penetration > 1 && <span className="co-pen" title={`${node.penetration} inside`}>{node.penetration}</span>}
                  </div>
                )
              }
              const contact = byId.get(node.pid)
              if (!contact) return null
              const rec = reciprocity(contact, valueLogs)
              const danger = node.made >= 2 && rec.key === 'owe'
              return (
                <div
                  key={node.id}
                  className={`gnode person${dim(node.id) ? ' dim' : ''}${hover === node.id ? ' hot' : ''}${danger ? ' danger' : ''}`}
                  style={{ ...style, '--rec': rec.color } as CSSProperties}
                  onMouseEnter={() => enter(node.id)}
                  onMouseLeave={leave}
                  onClick={event => { event.stopPropagation(); if (!dragging()) onOpenPerson?.(contact) }}
                >
                  <span className="gnode-av"><Avatar src={contact.profile_photo_url} name={contact.name} size={sizePx - 7} /></span>
                  {danger && <span className="gnode-warn" title="Your door-opener - you owe value"><WarningCircle size={10} /></span>}
                  <span className="gnode-cap">{first(contact.name)}</span>
                </div>
              )
            })}

            {hoverNode && hoverNode.type !== 'you' && (() => {
              const sx = (view.x + view.z * (hoverNode.x / VB_W * size.w)) / (size.w || 1)
              const leftSide = sx > 0.6
              const gapX = leftSide ? -(236 + 24) : 24
              const gapY = -36
              return (
                <div
                  className="net-card"
                  style={{
                    left: pct(hoverNode.x, 'x'),
                    top: pct(hoverNode.y, 'y'),
                    transform: `translate(${gapX / view.z}px, ${gapY / view.z}px) scale(${1 / view.z})`,
                  }}
                  onMouseEnter={() => hover && enter(hover)}
                  onMouseLeave={leave}
                  onMouseDown={event => event.stopPropagation()}
                  onClick={event => event.stopPropagation()}
                >
                  {hoverPerson && (
                    <>
                      <div className="net-card-hd">
                        <Avatar src={hoverPerson.profile_photo_url} name={hoverPerson.name} size={30} />
                        <div>
                          <span className="net-card-name">{hoverPerson.name}</span>
                          <span className="net-card-role">{hoverPerson.job_title}{hoverPerson.company ? ` · ${hoverPerson.company}` : ''}</span>
                        </div>
                      </div>
                      <div className="net-card-rows">
                        {parentLabel && <div className="net-card-row"><span className="k">via</span><span className="v">{parentLabel}</span></div>}
                        <div className="net-card-row"><span className="k">opened</span><span className="v">{hoverNode.type === 'person' ? hoverNode.made : 0} {hoverNode.type === 'person' && hoverNode.made === 1 ? 'door' : 'doors'}</span></div>
                        <div className="net-card-row"><span className="k">balance</span><span className="v" style={{ color: hoverRec.color }}>● {hoverRec.label}</span></div>
                      </div>
                      {hoverRec.key === 'owe' && (
                        <button className={`net-card-give${added.has(valueTodoId(hoverPerson)) ? ' done' : ''}`} onClick={() => void addValue(hoverPerson)}>
                          {added.has(valueTodoId(hoverPerson)) ? <Check size={12} /> : <Plus size={12} />}
                          {added.has(valueTodoId(hoverPerson)) ? 'Give-value todo added' : `Add give-value todo${hoverNode.type === 'person' && hoverNode.made >= 2 ? ' - owe a big connector' : ''}`}
                        </button>
                      )}
                    </>
                  )}
                  {hoverNode.type === 'company' && (
                    <>
                      <div className="net-card-hd">
                        <span className="co-mark sm">{hoverNode.co[0]}</span>
                        <div><span className="net-card-name">{hoverNode.co}</span>{hoverNode.opp && <span className="net-card-role">{hoverNode.opp.title}</span>}</div>
                      </div>
                      <div className="net-card-rows">
                        {hoverNode.opp && <div className="net-card-row"><span className="k">stage</span><span className="v">{hoverNode.opp.stage}</span></div>}
                        <div className="net-card-row"><span className="k">penetration</span><span className="v">{hoverNode.penetration} inside</span></div>
                        <div className="net-card-row"><span className="k">via</span><span className="v">{hoverNode.inside.slice(0, 4).map(contact => first(contact.name)).join(', ')}</span></div>
                      </div>
                      {hoverNode.penetration < 2 && <div className="net-card-flag soft"><LinkBreak size={11} />Hanging on one thread - get a second contact inside.</div>}
                    </>
                  )}
                  {hoverNode.type === 'ghost' && (
                    <>
                      <div className="net-card-hd">
                        <span className="net-ghost-mark"><UserPlus size={14} /></span>
                        <div><span className="net-card-name">{hoverNode.label}</span><span className="net-card-role">forward intro · not added</span></div>
                      </div>
                      <div className="net-card-flag soft"><ArrowBendUpRight size={11} />{hoverNode.note ?? 'A door you can still open.'}</div>
                    </>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      </div>

      <section className="net-intros">
        <div className="na-hd"><UserPlus size={13} />Introduction edges in this view</div>
        {introLedgerRows.length === 0 ? (
          <p className="na-note">No introduction rows are available for this scope.</p>
        ) : (
          <div className="net-intro-list">
            {introLedgerRows.map(({ intro, connector, introduced, recipient }) => (
              <div className="net-intro-row" key={intro.id}>
                <button
                  className={`net-intro-person${connector.linked ? ' linked' : ''}`}
                  onClick={() => { if (connector.id && contactsById.has(connector.id)) onOpenPerson?.(contactsById.get(connector.id)!) }}
                >
                  <Avatar src={connector.photoUrl} name={connector.name} size={22} />
                  <span><b>{connector.name}</b><em>{connector.company}</em></span>
                </button>
                <span className="net-intro-arrow">-&gt;</span>
                <button
                  className={`net-intro-person main${introduced.linked ? ' linked' : ''}`}
                  onClick={() => { if (introduced.id && contactsById.has(introduced.id)) onOpenPerson?.(contactsById.get(introduced.id)!) }}
                >
                  <Avatar src={introduced.photoUrl} name={introduced.name} size={24} />
                  <span><b>{introduced.name}</b><em>{introduced.company}</em></span>
                </button>
                <span className="net-intro-arrow">-&gt;</span>
                <button
                  className={`net-intro-person${recipient.linked ? ' linked' : ''}`}
                  onClick={() => { if (recipient.id && contactsById.has(recipient.id)) onOpenPerson?.(contactsById.get(recipient.id)!) }}
                >
                  <Avatar src={recipient.photoUrl} name={recipient.name} size={22} />
                  <span><b>{recipient.name}</b><em>{recipient.company}</em></span>
                </button>
                <span className={`net-intro-status ${intro.direction}`}>{intro.direction}</span>
                <span className="net-intro-date">{intro.source_interaction_date}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="net-analytics">
        <div className="na-card">
          <div className="na-hd"><Ranking size={13} />Top connectors</div>
          <div className="na-list">
            {connectorIds.slice(0, 4).map(row => {
              const contact = byId.get(row.id)
              if (!contact) return null
              const rec = reciprocity(contact, valueLogs)
              const max = connectorIds[0]?.n || 1
              return (
                <button className="na-row" key={row.id} onClick={() => onOpenPerson?.(contact)}>
                  <Avatar src={contact.profile_photo_url} name={contact.name} size={22} />
                  <span className="na-name">{first(contact.name)}</span>
                  <span className="na-bar"><span style={{ width: `${(row.n / max) * 100}%` }} /></span>
                  <span className="na-n">{row.n}</span>
                  <span className="na-rec" style={{ background: rec.color }} title={rec.label} />
                </button>
              )
            })}
          </div>
        </div>

        <div className="na-card">
          <div className="na-hd"><Broadcast size={13} />Reach</div>
          <div className="na-reach">
            <div className="na-stat"><b>{firstDeg}</b><span>direct ties</span></div>
            <div className="na-stat"><b>{connectorIds.reduce((sum, row) => sum + row.n, 0)}</b><span>via intros</span></div>
            <div className="na-stat"><b>{reachable}</b><span>one intro away</span></div>
          </div>
          <p className="na-note">Introductions compound. Each warm node is a door you’ve already half-opened.</p>
        </div>

        <div className="na-card accent">
          <div className="na-hd"><WarningCircle size={13} />Connectors you owe</div>
          {oweConnectors.length ? (
            <div className="na-list">
              {oweConnectors.map(row => {
                const contact = byId.get(row.id)
                if (!contact) return null
                return (
                  <div className="na-row owe" key={row.id}>
                    <button className="na-owe-main" onClick={() => onContact?.(contact, 'Give value before asking again')}>
                      <Avatar src={contact.profile_photo_url} name={contact.name} size={22} />
                      <span className="na-name">{first(contact.name)}</span>
                      <span className="na-owe-meta">{row.n} {row.n === 1 ? 'door' : 'doors'} · you owe</span>
                    </button>
                    <button className={`na-add${added.has(valueTodoId(contact)) ? ' done' : ''}`} onClick={() => void addValue(contact)} title={added.has(valueTodoId(contact)) ? 'Give-value todo added' : 'Add give-value todo'}>
                      {added.has(valueTodoId(contact)) ? <Check size={13} /> : <Plus size={13} />}
                    </button>
                  </div>
                )
              })}
            </div>
          ) : <p className="na-note">You’re square with your door-openers. Keep it that way.</p>}
          <p className="na-note dim">Pay value forward here before your next ask - these are your most valuable relationships.</p>
        </div>
      </section>
    </div>
  )
}
