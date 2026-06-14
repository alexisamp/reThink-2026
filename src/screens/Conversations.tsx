import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowClockwise,
  ArrowDownRight,
  ArrowSquareOut,
  ArrowUpRight,
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  Compass,
  DotsThree,
  EnvelopeSimple,
  GearSix,
  IdentificationBadge,
  LinkedinLogo,
  MagnifyingGlass,
  Plus,
  Sparkle,
  Target,
  X,
  WhatsappLogo,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { openLink } from '@/lib/openLink'
import { useContacts } from '@/hooks/useContacts'
import PeopleFocus from '@/components/PeopleFocus'
import ReviewQueue from '@/screens/ReviewQueue'
import RecordPeek, { type PeekField } from '@/components/crm/RecordPeek'
import type {
  Company,
  Contact,
  ContactChannel,
  ContactFact,
  ContactIntroduction,
  Interaction,
  Opportunity,
  OpportunityContact,
  Todo as AppTodo,
  ValueLog,
} from '@/types'

type AppMode = 'wa' | 'li' | 'review' | 'focus' | 'search'
type ChannelKey = 'whatsapp' | 'linkedin' | 'gmail'
type RecordRef = { kind: 'person'; id: string } | { kind: 'company'; name: string } | { kind: 'opp'; id: string }
type PalResultType = 'person' | 'company' | 'file'

interface ValueItem {
  tag: string
  text: string
  date: string
}

interface KeyDate {
  label: string
  date: string
  soon?: boolean
}

interface PeekTodo {
  id?: string
  text: string
  due?: string
  done?: boolean
}

interface RelationshipPerson {
  id: string
  name: string
  initials: string
  avColor: string
  tier: 1 | 2 | 3
  role: string
  company: string
  channels: ChannelKey[]
  active: boolean
  lastSeen: string
  lists: string[]
  context: string
  facts: Array<{ icon: ReactNode; text: string }>
  ledger: {
    given: number
    received: number
    gaveItems: ValueItem[]
    receivedItems: ValueItem[]
  }
  dates: KeyDate[]
  todos: PeekTodo[]
  intros: Array<{
    pid?: string
    initials: string
    color: string
    name: string
    role: string
    last: string
    note: string
  }>
  opp: {
    title: string
    role: string
    due: string
    progress: { done: number; total: number }
    recordId?: string
  } | null
}

interface PalResult {
  id: string
  type: PalResultType
  name: string
  sub: string
  initials: string
  color: string
  source: 'whatsapp' | 'linkedin' | 'rethink'
  url?: string | null
}

const MODE_TABS: Array<{ mode: AppMode; label: string; icon: ReactNode }> = [
  { mode: 'wa', label: 'WhatsApp', icon: <WhatsappLogo size={17} /> },
  { mode: 'li', label: 'LinkedIn', icon: <LinkedinLogo size={17} /> },
  { mode: 'review', label: 'AI Review', icon: <Sparkle size={17} /> },
  { mode: 'focus', label: 'Focus', icon: <Target size={17} /> },
  { mode: 'search', label: 'Discover', icon: <Compass size={17} /> },
]

const AVATAR_COLORS = ['#8A6F4D', '#4B6B63', '#8D715B', '#526A78', '#7A5E6A', '#6E7A53']

function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const t = new Date(dateStr).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((Date.now() - t) / 86400000)
}

function formatAgo(days: number | null): string {
  if (days === null) return 'no touch'
  if (days <= 0) return 'today'
  if (days === 1) return '1d ago'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || '?'
}

function avatarColor(id: string): string {
  let n = 0
  for (const ch of id) n += ch.charCodeAt(0)
  return AVATAR_COLORS[n % AVATAR_COLORS.length]
}

function compactDate(value: string | null | undefined): string {
  if (!value) return 'TBD'
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function tierFor(contact: Contact): 1 | 2 | 3 {
  return contact.tier ?? (contact.relationship_domain === 'personal' ? 2 : 3)
}

function statusList(contact: Contact): string[] {
  const list = [contact.status.toLowerCase().replace('_', ' ')]
  if (contact.relationship_domain) list.push(contact.relationship_domain)
  if (contact.category) list.push(contact.category.replaceAll('_', ' '))
  return list.slice(0, 3)
}

function channelsFor(contact: Contact, rows: ContactChannel[]): ChannelKey[] {
  const set = new Set<ChannelKey>()
  rows.filter(row => row.outreach_log_id === contact.id).forEach(row => {
    if (row.channel === 'whatsapp') set.add('whatsapp')
    if (row.channel === 'linkedin') set.add('linkedin')
  })
  if (contact.phone) set.add('whatsapp')
  if (contact.linkedin_url) set.add('linkedin')
  if (contact.email) set.add('gmail')
  return Array.from(set.size ? set : new Set<ChannelKey>(['gmail']))
}

function digitsOnly(value: string | null | undefined): string {
  return (value ?? '').replace(/[^\d]/g, '')
}

function AppChrome({
  mode,
  onModeChange,
  onOpenSearch,
  reviewCount,
  initialsText,
}: {
  mode: AppMode
  onModeChange: (mode: AppMode) => void
  onOpenSearch: () => void
  reviewCount: number
  initialsText: string
}) {
  return (
    <div className="conv-appbar">
      <div className="conv-brand">
        <span className="conv-logo"><img src="/logo.png" alt="" /></span>
        <span className="conv-app">Conversations</span>
      </div>
      <div className="conv-nav">
        <button title="Back"><CaretLeft size={16} /></button>
        <button title="Forward" className="dim"><CaretRight size={16} /></button>
        <button title="Reload"><ArrowClockwise size={15} /></button>
      </div>
      <div className="conv-tabs">
        {MODE_TABS.map(tab => (
          <button
            key={tab.mode}
            className={`conv-tab ${mode === tab.mode ? 'on' : ''}`}
            onClick={() => onModeChange(tab.mode)}
          >
            {tab.icon}
            {tab.label}
            {tab.mode === 'review' && reviewCount > 0 ? <span className="tb-pip">{reviewCount}</span> : null}
          </button>
        ))}
      </div>
      <div className="conv-appbar-right">
        <button className="conv-search-trigger" onClick={onOpenSearch}>
          <MagnifyingGlass size={15} /><span>Search</span><kbd>cmd K</kbd>
        </button>
        <button className="conv-icon" title="Settings"><GearSix size={18} /></button>
        <div className="conv-me"><span className="av-mono">{initialsText}</span></div>
      </div>
    </div>
  )
}

function Avatar({ contact, size = 49 }: { contact: Contact; size?: number }) {
  return (
    <span className="conv-avatar" style={{ width: size, height: size, background: avatarColor(contact.id) }}>
      {contact.profile_photo_url ? <img src={contact.profile_photo_url} alt="" /> : initials(contact.name)}
    </span>
  )
}

function ConversationList({
  contacts,
  activeId,
  channels,
  mode,
  onSelect,
  onSearch,
}: {
  contacts: Contact[]
  activeId: string | null
  channels: ContactChannel[]
  mode: 'wa' | 'li'
  onSelect: (contact: Contact) => void
  onSearch: () => void
}) {
  const filtered = contacts.filter(contact => {
    const ch = channelsFor(contact, channels)
    return mode === 'wa' ? ch.includes('whatsapp') : ch.includes('linkedin')
  })
  const rows = filtered.length ? filtered : contacts

  return (
    <aside className="conv-mlist">
      <div className="conv-mlist-hd">
        <span className="conv-me-sm">AM</span>
        <button className="conv-mlist-search" onClick={onSearch}>
          <MagnifyingGlass size={16} />
          <span>Search or start a chat</span>
        </button>
        <button className="conv-round" title="New conversation"><DotsThree size={19} /></button>
      </div>
      <div className="conv-filters">
        <span className="mf on">All</span>
        <span className="mf">Unread</span>
        <span className="mf">Favorites</span>
        <span className="mf">Groups</span>
      </div>
      <div className="conv-rows">
        {rows.map(contact => (
          <button
            key={contact.id}
            className={`conv-mrow ${contact.id === activeId ? 'active' : ''}`}
            onClick={() => onSelect(contact)}
          >
            <Avatar contact={contact} />
            <span className="conv-mrowbody">
              <span className="conv-mtop">
                <b>{contact.name}</b>
                <span>{formatAgo(daysSince(contact.last_interaction_at))}</span>
              </span>
              <span className="conv-msub">{contact.notes || contact.looking_for || contact.personal_context || 'Relationship context ready.'}</span>
              <span className="conv-mmeta">
                {channelsFor(contact, channels).map(ch => (
                  <span key={ch} className={`conv-source ${ch}`}>{ch === 'whatsapp' ? <WhatsappLogo size={12} /> : ch === 'linkedin' ? <LinkedinLogo size={12} /> : <EnvelopeSimple size={12} />}</span>
                ))}
                <span className="mtag-crm">CRM</span>
              </span>
            </span>
          </button>
        ))}
      </div>
    </aside>
  )
}

function BrowserStage({
  contact,
  mode,
  draft,
  busy,
  onDraftChange,
  onLog,
}: {
  contact: Contact | null
  mode: 'wa' | 'li'
  draft: string
  busy: boolean
  onDraftChange: (value: string) => void
  onLog: () => void
}) {
  const phone = digitsOnly(contact?.phone)
  const url = mode === 'wa'
    ? phone ? `https://web.whatsapp.com/send?phone=${phone}` : 'https://web.whatsapp.com/'
    : 'https://www.linkedin.com/messaging/'
  const label = mode === 'wa' ? 'web.whatsapp.com' : 'linkedin.com/messaging'
  const title = mode === 'wa' ? 'WhatsApp Web' : 'LinkedIn Messages'

  return (
    <section className="conv-browser" data-channel={mode}>
      <header className="conv-browserbar">
        <div className="conv-browser-title">
          {mode === 'wa' ? <WhatsappLogo size={17} /> : <LinkedinLogo size={17} />}
          <span>{title}</span>
        </div>
        <div className="conv-address">
          <span className="lock-dot" />
          <span>{label}</span>
        </div>
        <button className="conv-open-ext" onClick={() => openLink(url)}>
          <ArrowSquareOut size={14} /> Open
        </button>
      </header>
      <div className="conv-webview-wrap">
        <iframe
          key={url}
          className="conv-webview"
          title={title}
          src={url}
          referrerPolicy="no-referrer-when-downgrade"
          allow="clipboard-read; clipboard-write; fullscreen; autoplay"
        />
        <div className="conv-web-fallback">
          <div>
            <b>{title}</b>
            <span>If the provider blocks embedding in this browser, open the real web app.</span>
          </div>
          <button onClick={() => openLink(url)}><ArrowSquareOut size={14} /> Open {mode === 'wa' ? 'WhatsApp' : 'LinkedIn'}</button>
        </div>
      </div>
      <footer className="conv-capturebar">
        <div className="conv-capture-meta">
          <Sparkle size={13} />
          <span>reThink capture</span>
        </div>
        <textarea
          value={draft}
          onChange={event => onDraftChange(event.target.value)}
          onKeyDown={event => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') onLog()
          }}
          rows={1}
          placeholder={contact ? `Log context from ${contact.name.split(' ')[0]}...` : 'Log context from this conversation...'}
        />
        <button className="conv-send-mini" disabled={busy || !draft.trim()} onClick={onLog}>
          {busy ? 'Saving' : 'Log'}
        </button>
      </footer>
    </section>
  )
}

function ValueColumn({ title, count, items }: { title: string; count: number; items: ValueItem[] }) {
  return (
    <div className="rpv-col">
      <div className="rpv-col-hd">{title}<span>{count}</span></div>
      {items.length === 0 ? <div className="rpv-none">Nothing logged yet.</div> : items.map((item, index) => (
        <div className="rpv-item" key={`${item.text}-${index}`}>
          <span className="rpv-tag">{item.tag}</span>
          <div className="rpv-body">
            <div className="rpv-tx">{item.text}</div>
            <div className="rpv-dt">{item.date}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function AddRow({
  kind,
  onSubmit,
  onCancel,
}: {
  kind: 'date' | 'todo'
  onSubmit: (a: string, b?: string) => void
  onCancel: () => void
}) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const submit = () => {
    if (!a.trim()) {
      onCancel()
      return
    }
    onSubmit(a.trim(), b.trim() || undefined)
  }
  return (
    <div className="rp-add-row">
      <input
        className="rp-add-in"
        autoFocus
        placeholder={kind === 'date' ? 'What is the date?' : 'Add a to-do...'}
        value={a}
        onChange={event => setA(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') submit()
          if (event.key === 'Escape') onCancel()
        }}
      />
      {kind === 'date' && (
        <input
          className="rp-add-in when"
          placeholder="When"
          value={b}
          onChange={event => setB(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') submit()
            if (event.key === 'Escape') onCancel()
          }}
        />
      )}
      <button className="rp-add-ok" title="Save" onClick={submit}><Check size={13} weight="bold" /></button>
    </div>
  )
}

function RelationshipPeek({
  person,
  onOpenRecord,
  onToggleTodo,
  onAddDate,
  onAddTodo,
  onClassify,
  onRecheckContext,
  onToast,
}: {
  person: RelationshipPerson
  onOpenRecord: (ref: RecordRef) => void
  onToggleTodo: (todo: PeekTodo, done: boolean) => void
  onAddDate: (date: KeyDate) => void
  onAddTodo: (todo: PeekTodo) => void
  onClassify: () => void
  onRecheckContext: () => Promise<void>
  onToast: (message: string) => void
}) {
  const [valueOpen, setValueOpen] = useState(false)
  const [adding, setAdding] = useState<null | 'date' | 'todo'>(null)
  const [rechecking, setRechecking] = useState(false)
  const ring = `t${person.tier}`
  const { given, received } = person.ledger
  const net = given - received
  const vk = net < 0 ? 'owe' : net > 0 ? 'credit' : 'even'
  const pending = person.todos.filter(todo => !todo.done).length

  const recheck = async () => {
    setRechecking(true)
    try {
      await onRecheckContext()
      onToast('Context refreshed')
    } finally {
      setRechecking(false)
    }
  }

  return (
    <div className="rp-scope">
      <div className="rp-head">
        <div className={`r-ring ${ring}`}>
          <div className="r-av"><span className="av-mono" style={{ background: person.avColor }}>{person.initials}</span></div>
        </div>
        <div className="rp-id">
          <div className="rp-name-row">
            <span className="rp-name">{person.name}</span>
            <span className={`rp-tier ${ring}`}>T{person.tier}</span>
          </div>
          <div className="rp-role">
            {person.role} ·{' '}
            {person.company
              ? <button className="rp-co" onClick={() => onOpenRecord({ kind: 'company', name: person.company })}>{person.company}<ArrowUpRight size={11} /></button>
              : <span className="rp-co-static">No company</span>}
          </div>
        </div>
      </div>

      <div className="rp-bar">
        <div className="rp-chans">
          {person.channels.map(channel => (
            <span key={channel} className="rp-chan" style={{ '--cc': channel === 'whatsapp' ? '#1FA855' : channel === 'linkedin' ? '#2D6DA3' : '#C5462F' } as CSSProperties} title={channel}>
              {channel === 'whatsapp' ? <WhatsappLogo /> : channel === 'linkedin' ? <LinkedinLogo /> : <EnvelopeSimple />}
            </span>
          ))}
        </div>
        <span className="rp-bar-meta"><span className={`rp-dot ${person.active ? 'on' : ''}`} />{person.active ? 'Active' : 'Dormant'} · {person.lastSeen}</span>
      </div>

      <div className="rp-listrow">
        <div className="rp-lists">
          {person.lists.map(list => <span key={list} className="rp-listchip">{list}</span>)}
          <button className="rp-classify" onClick={onClassify}><Plus size={11} /> classify</button>
        </div>
      </div>

      <div className="rp-ctx">
        <div className="rp-ctx-hd">
          <span className="rp-ai"><Sparkle size={9} />AI</span>Context
          <button className={`rp-recheck ${rechecking ? 'spin' : ''}`} title="Re-check context with AI" onClick={recheck}><ArrowClockwise size={13} /></button>
        </div>
        <p className="rp-ctx-body">{person.context}</p>
        {person.facts.length > 0 && (
          <div className="rp-facts">
            {person.facts.map((fact, index) => <span key={index} className="rp-fact">{fact.icon}{fact.text}</span>)}
          </div>
        )}
      </div>

      <button className={`rp-value ${vk} ${valueOpen ? 'open' : ''}`} aria-expanded={valueOpen} onClick={() => setValueOpen(open => !open)}>
        <span className="rpv-badge">{net < 0 ? <ArrowDownRight size={13} /> : net > 0 ? <ArrowUpRight size={13} /> : <Check size={13} />}</span>
        <span className="rpv-lbl">{net < 0 ? 'You owe value' : net > 0 ? 'You are in credit' : 'Balanced'}</span>
        <span className="rpv-net">{net > 0 ? `+${net}` : net}</span>
        <span className="rpv-chev"><CaretDown size={14} /></span>
      </button>
      {valueOpen && (
        <div className="rp-value-detail" style={{ display: 'grid' }}>
          <ValueColumn title="You gave" count={given} items={person.ledger.gaveItems} />
          <ValueColumn title="You received" count={received} items={person.ledger.receivedItems} />
        </div>
      )}

      <section className="rp-sec">
        <div className="rp-sec-hd">
          <span className="rp-lbl">Key dates</span>
          <button className="rp-add" onClick={() => setAdding('date')}><Plus size={12} /> add</button>
        </div>
        <div className="rp-dates">
          {person.dates.length === 0 ? <span className="rp-empty">No key dates yet.</span> : person.dates.map((date, index) => (
            <div className="rp-date" key={`${date.label}-${index}`}>
              <span className={`rp-date-ic ${date.soon ? 'soon' : ''}`}><span /></span>
              <span className="rp-date-lb">{date.label}</span>
              <span className="rp-date-dt">{date.date}</span>
            </div>
          ))}
          {adding === 'date' && (
            <AddRow
              kind="date"
              onSubmit={(label, when) => {
                onAddDate({ label, date: when ?? 'TBD', soon: true })
                setAdding(null)
              }}
              onCancel={() => setAdding(null)}
            />
          )}
        </div>
      </section>

      <section className="rp-sec">
        <div className="rp-sec-hd">
          <span className="rp-lbl">To-do's</span>
          <span className="rp-ct">{pending}</span>
          <button className="rp-add" onClick={() => setAdding('todo')}><Plus size={12} /> add</button>
        </div>
        <div className="rp-todos">
          {person.todos.length === 0 ? <span className="rp-empty">No open loops.</span> : person.todos.map((todo, index) => (
            <div className={`rp-todo ${todo.done ? 'done' : ''}`} key={todo.id ?? index} onClick={() => onToggleTodo(todo, !todo.done)}>
              <span className="rp-cb"><Check size={11} weight="bold" /></span>
              <span className="rp-todo-tx">{todo.text}{todo.due ? <span className={`rp-due ${/over/i.test(todo.due) ? 'late' : ''}`}>{todo.due}</span> : null}</span>
            </div>
          ))}
          {adding === 'todo' && (
            <AddRow
              kind="todo"
              onSubmit={text => {
                onAddTodo({ text, done: false })
                setAdding(null)
              }}
              onCancel={() => setAdding(null)}
            />
          )}
        </div>
      </section>

      {person.intros.length > 0 && (
        <section className="rp-sec">
          <div className="rp-sec-hd"><span className="rp-lbl">Also at {person.company}</span><span className="rp-sub">in reThink · no touch</span></div>
          <div className="rp-intros">
            {person.intros.map((intro, index) => (
              <button
                className="rp-intro"
                key={`${intro.name}-${index}`}
                title={intro.note}
                onClick={() => {
                  onToast(`Intro draft to ${intro.name} ready`)
                  if (intro.pid) onOpenRecord({ kind: 'person', id: intro.pid })
                }}
              >
                <span className="rp-intro-av"><span className="av-mono" style={{ background: intro.color }}>{intro.initials}</span></span>
                <span className="rp-intro-name">{intro.name}</span>
                <span className="rp-intro-role">{intro.role}</span>
                <span className="rp-intro-last">{intro.last}</span>
                <span className="rp-intro-go"><ArrowUpRight size={13} /></span>
              </button>
            ))}
          </div>
        </section>
      )}

      {person.opp && (
        <section className="rp-sec">
          <div className="rp-sec-hd"><span className="rp-lbl">Linked opportunity</span></div>
          <button className={`rp-opp ${person.opp.recordId ? 'live' : 'flat'}`} onClick={() => person.opp?.recordId && onOpenRecord({ kind: 'opp', id: person.opp.recordId })}>
            <span className="rp-opp-ic"><Target size={12} /></span>
            <span className="rp-opp-name">{person.opp.title}</span>
            <span className="rp-opp-meta">{person.opp.role} · {person.opp.due}</span>
            <span className="rp-opp-go">{person.opp.recordId ? <ArrowUpRight size={13} /> : <Plus size={13} />}</span>
          </button>
        </section>
      )}
    </div>
  )
}

function CommandPalette({
  open,
  onClose,
  search,
  onPick,
}: {
  open: boolean
  onClose: () => void
  search: (query: string) => PalResult[]
  onPick: (result: PalResult) => void
}) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const results = q.trim() ? search(q.trim()) : []

  useEffect(() => {
    if (open) {
      setQ('')
      setSel(0)
    }
  }, [open])

  useEffect(() => {
    if (sel >= results.length) setSel(0)
  }, [results.length, sel])

  if (!open) return null

  const groups: Array<{ key: PalResultType; label: string }> = [
    { key: 'person', label: 'People' },
    { key: 'company', label: 'Companies' },
    { key: 'file', label: 'Files' },
  ]

  return (
    <div className="pal-overlay on" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="pal" role="dialog" aria-label="Search">
        <div className="pal-search">
          <span className="si"><MagnifyingGlass size={18} /></span>
          <input
            autoFocus
            value={q}
            onChange={event => {
              setQ(event.target.value)
              setSel(0)
            }}
            onKeyDown={event => {
              if (event.key === 'Escape') onClose()
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setSel(value => Math.min(value + 1, results.length - 1))
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setSel(value => Math.max(value - 1, 0))
              }
              if (event.key === 'Enter' && results[sel]) {
                event.preventDefault()
                onPick(results[sel])
                onClose()
              }
            }}
            placeholder="Search people, companies and files..."
          />
          <kbd>esc</kbd>
        </div>
        <div className="pal-results">
          {!q.trim() ? (
            <div className="pal-hint">
              <MagnifyingGlass size={26} />
              <span>Start typing to pull a person, company or file into the chat.</span>
            </div>
          ) : results.length === 0 ? (
            <div className="pal-empty">No matches for "{q}".</div>
          ) : groups.map(group => {
            const list = results.filter(result => result.type === group.key)
            if (!list.length) return null
            return (
              <div key={group.key}>
                <div className="pal-group">{group.label}</div>
                {list.map(result => {
                  const index = results.indexOf(result)
                  return (
                    <button
                      key={`${result.type}-${result.id}`}
                      className={`pal-res ${index === sel ? 'sel' : ''}`}
                      onMouseMove={() => setSel(index)}
                      onClick={() => {
                        onPick(result)
                        onClose()
                      }}
                    >
                      <span className={`pr-av ${result.type === 'company' ? 'sq' : ''}`}><span className="av-mono" style={{ background: result.color }}>{result.initials}</span></span>
                      <span className="pr-info"><span className="pr-name">{result.name}</span><span className="pr-sub">{result.sub}</span></span>
                      <span className={`pal-src ${result.source === 'whatsapp' ? 'wa' : result.source === 'linkedin' ? 'li' : 'rt'}`}>
                        {result.source === 'whatsapp' ? <WhatsappLogo size={12} /> : result.source === 'linkedin' ? <LinkedinLogo size={12} /> : <Check size={12} weight="bold" />}
                      </span>
                      <span className="pr-enter"><kbd>enter</kbd></span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
        <div className="pal-foot">
          <span className="fk"><kbd>up</kbd><kbd>down</kbd> navigate</span>
          <span className="fk"><kbd>enter</kbd> bring into chat</span>
          <span className="grow" />
          <span className="fk">WhatsApp · LinkedIn · reThink</span>
        </div>
      </div>
    </div>
  )
}

export default function Conversations() {
  const navigate = useNavigate()
  const [userId, setUserId] = useState<string | null>(null)
  const [mode, setMode] = useState<AppMode>('wa')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [channels, setChannels] = useState<ContactChannel[]>([])
  const [facts, setFacts] = useState<ContactFact[]>([])
  const [values, setValues] = useState<ValueLog[]>([])
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [todos, setTodos] = useState<AppTodo[]>([])
  const [introductions, setIntroductions] = useState<ContactIntroduction[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [opportunityContacts, setOpportunityContacts] = useState<OpportunityContact[]>([])
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [record, setRecord] = useState<RecordRef | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null))
  }, [])

  const { contacts, loading, updateContact } = useContacts(userId ?? undefined, [], async () => {})
  const sortedContacts = useMemo(() => [...contacts].sort((a, b) => (b.last_interaction_at ?? b.created_at).localeCompare(a.last_interaction_at ?? a.created_at)), [contacts])
  const selected = sortedContacts.find(contact => contact.id === selectedId) ?? sortedContacts[0] ?? null
  const selectedInteractions = useMemo(() => interactions.filter(row => row.contact_id === selected?.id), [interactions, selected?.id])
  const selectedFacts = useMemo(() => facts.filter(row => row.contact_id === selected?.id), [facts, selected?.id])
  const selectedValues = useMemo(() => values.filter(row => row.outreach_log_id === selected?.id), [selected?.id, values])
  const selectedTodos = useMemo(() => todos.filter(row => row.contact_id === selected?.id), [selected?.id, todos])

  useEffect(() => {
    if (!selectedId && sortedContacts[0]) setSelectedId(sortedContacts[0].id)
  }, [selectedId, sortedContacts])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    Promise.all([
      supabase.from('contact_channels').select('*'),
      supabase.from('contact_facts').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(500),
      supabase.from('value_logs').select('*').eq('user_id', userId).order('date', { ascending: false }).limit(500),
      supabase.from('interactions').select('*').eq('user_id', userId).order('interaction_date', { ascending: false }).limit(500),
      supabase.from('todos').select('*').eq('user_id', userId).order('date', { ascending: false }).limit(500),
      supabase.from('contact_introductions').select('*').eq('user_id', userId).order('source_interaction_date', { ascending: false }).limit(250),
      supabase.from('companies').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(250),
      supabase.from('opportunities').select('*, company:companies(*)').eq('user_id', userId).order('created_at', { ascending: false }).limit(250),
      supabase.from('opportunity_contacts').select('*'),
    ]).then(([chRes, factsRes, valuesRes, interactionsRes, todosRes, introRes, companiesRes, oppsRes, oppContactsRes]) => {
      if (cancelled) return
      setChannels((chRes.data ?? []) as ContactChannel[])
      setFacts((factsRes.data ?? []) as ContactFact[])
      setValues((valuesRes.data ?? []) as ValueLog[])
      setInteractions((interactionsRes.data ?? []) as Interaction[])
      setTodos((todosRes.data ?? []) as AppTodo[])
      setIntroductions((introRes.data ?? []) as ContactIntroduction[])
      setCompanies((companiesRes.data ?? []) as Company[])
      setOpportunities((oppsRes.data ?? []) as Opportunity[])
      setOpportunityContacts((oppContactsRes.data ?? []) as OpportunityContact[])
    })
    return () => { cancelled = true }
  }, [userId])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(open => !open)
      }
      if (event.key === 'Escape') {
        if (paletteOpen) setPaletteOpen(false)
        else if (record) setRecord(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen, record])

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 1800)
  }, [])

  const person = useMemo<RelationshipPerson | null>(() => {
    if (!selected) return null
    const givenItems = selectedValues.filter(row => row.direction === 'given').map(row => ({
      tag: row.type,
      text: row.description || 'Value logged',
      date: compactDate(row.date),
    }))
    const receivedItems = selectedValues.filter(row => row.direction === 'received').map(row => ({
      tag: row.type,
      text: row.description || 'Value received',
      date: compactDate(row.date),
    }))
    const dateFacts = selectedFacts.filter(fact => fact.expires_at)
    const memoryFacts = selectedFacts.filter(fact => !fact.expires_at).slice(0, 4)
    const sameCompany = selected.company
      ? sortedContacts.filter(contact => contact.id !== selected.id && contact.company && contact.company.toLowerCase() === selected.company?.toLowerCase()).slice(0, 4)
      : []
    const contactOpp = opportunityContacts.find(row => row.outreach_log_id === selected.id)
    const opp = contactOpp ? opportunities.find(item => item.id === contactOpp.opportunity_id) : null

    return {
      id: selected.id,
      name: selected.name,
      initials: initials(selected.name),
      avColor: avatarColor(selected.id),
      tier: tierFor(selected),
      role: selected.job_title || selected.category?.replaceAll('_', ' ') || 'Relationship',
      company: selected.company || 'No company',
      channels: channelsFor(selected, channels),
      active: (daysSince(selected.last_interaction_at) ?? 99) <= 14,
      lastSeen: formatAgo(daysSince(selected.last_interaction_at)),
      lists: statusList(selected),
      context: selected.personal_context || selected.notes || selected.about || selected.looking_for || `${selected.name} is in your relationship layer. Add context from the chat, facts, and value ledger as you go.`,
      facts: memoryFacts.map(fact => ({ icon: <IdentificationBadge size={14} />, text: fact.label ? `${fact.label}: ${fact.value}` : fact.value })),
      ledger: {
        given: givenItems.length,
        received: receivedItems.length,
        gaveItems: givenItems,
        receivedItems,
      },
      dates: [
        ...dateFacts.map(fact => ({ label: fact.label || fact.value, date: compactDate(fact.expires_at), soon: (daysSince(fact.expires_at) ?? -99) > -14 })),
        ...(selected.birthday ? [{ label: 'Birthday', date: compactDate(selected.birthday), soon: false }] : []),
      ],
      todos: selectedTodos.slice(0, 8).map(todo => ({ id: todo.id, text: todo.text, due: todo.date ? compactDate(todo.date) : undefined, done: todo.completed })),
      intros: sameCompany.map(contact => ({
        pid: contact.id,
        initials: initials(contact.name),
        color: avatarColor(contact.id),
        name: contact.name,
        role: contact.job_title || contact.status,
        last: formatAgo(daysSince(contact.last_interaction_at)),
        note: `Same company context with ${selected.name}`,
      })),
      opp: opp ? {
        title: opp.title,
        role: contactOpp?.role || 'contact',
        due: opp.target_date ? compactDate(opp.target_date) : opp.stage,
        progress: { done: opp.stage === 'won' ? 4 : opp.stage === 'negotiating' ? 3 : opp.stage === 'active' ? 2 : 1, total: 4 },
        recordId: opp.id,
      } : null,
    }
  }, [channels, opportunities, opportunityContacts, selected, selectedFacts, selectedTodos, selectedValues, sortedContacts])

  const addInteraction = useCallback(async () => {
    if (!userId || !selected || !draft.trim()) return
    setSending(true)
    const payload = {
      user_id: userId,
      contact_id: selected.id,
      type: mode === 'li' ? 'linkedin_msg' : 'whatsapp',
      direction: 'outbound',
      notes: draft.trim(),
      interaction_date: localDate(),
      channel: mode === 'li' ? 'linkedin' : 'whatsapp',
    }
    const { data } = await supabase.from('interactions').insert(payload).select('*').single()
    if (data) {
      setInteractions(prev => [data as Interaction, ...prev])
      setDraft('')
      showToast('Conversation logged')
    }
    setSending(false)
  }, [draft, mode, selected, showToast, userId])

  const addTodo = useCallback(async (todo: PeekTodo) => {
    if (!userId || !selected) return
    const { data } = await supabase.from('todos').insert({
      user_id: userId,
      contact_id: selected.id,
      text: todo.text,
      date: localDate(),
      completed: false,
    }).select('*').single()
    if (data) setTodos(prev => [data as AppTodo, ...prev])
  }, [selected, userId])

  const toggleTodo = useCallback(async (todo: PeekTodo, done: boolean) => {
    if (!todo.id) return
    const completed_at = done ? new Date().toISOString() : null
    await supabase.from('todos').update({ completed: done, completed_at }).eq('id', todo.id)
    setTodos(prev => prev.map(row => row.id === todo.id ? { ...row, completed: done, completed_at } : row))
  }, [])

  const addDate = useCallback(async (date: KeyDate) => {
    if (!userId || !selected) return
    const { data } = await supabase.from('contact_facts').insert({
      user_id: userId,
      contact_id: selected.id,
      category: 'other',
      label: date.label,
      value: date.label,
      importance: 2,
      expires_at: /^\d{4}-\d{2}-\d{2}$/.test(date.date) ? date.date : null,
      source: 'manual',
    }).select('*').single()
    if (data) setFacts(prev => [data as ContactFact, ...prev])
  }, [selected, userId])

  const recheckContext = useCallback(async () => {
    if (!selected) return
    const recent = selectedInteractions[0]?.notes
    const nextContext = [
      selected.personal_context,
      recent ? `Latest conversation: ${recent}` : null,
      selectedTodos[0]?.text ? `Open loop: ${selectedTodos[0].text}` : null,
    ].filter(Boolean).join(' ')
    if (nextContext && nextContext !== selected.personal_context) {
      await updateContact(selected.id, { personal_context: nextContext })
    }
  }, [selected, selectedInteractions, selectedTodos, updateContact])

  const search = useCallback((query: string): PalResult[] => {
    const q = query.toLowerCase()
    const people = sortedContacts
      .filter(contact => [contact.name, contact.company, contact.job_title, contact.email].some(value => value?.toLowerCase().includes(q)))
      .slice(0, 8)
      .map(contact => ({
        id: contact.id,
        type: 'person' as const,
        name: contact.name,
        sub: [contact.job_title, contact.company].filter(Boolean).join(' · ') || contact.status,
        initials: initials(contact.name),
        color: avatarColor(contact.id),
        source: channelsFor(contact, channels).includes('whatsapp') ? 'whatsapp' as const : channelsFor(contact, channels).includes('linkedin') ? 'linkedin' as const : 'rethink' as const,
      }))
    const companyNames = Array.from(new Set(sortedContacts.map(contact => contact.company).filter(Boolean) as string[]))
    const companyHits = companyNames
      .filter(name => name.toLowerCase().includes(q))
      .slice(0, 6)
      .map(name => ({
        id: name,
        type: 'company' as const,
        name,
        sub: `${sortedContacts.filter(contact => contact.company === name).length} people in reThink`,
        initials: name[0]?.toUpperCase() ?? 'C',
        color: '#003720',
        source: 'rethink' as const,
      }))
    const files = todos.flatMap(todo => (todo.content_segments ?? []).flatMap(segment => {
      if (segment.type !== 'file' || !segment.label.toLowerCase().includes(q)) return []
      return [{
        id: segment.id,
        type: 'file' as const,
        name: segment.label,
        sub: segment.source,
        initials: 'F',
        color: '#3E7A4E',
        source: 'rethink' as const,
        url: segment.url,
      }]
    })).slice(0, 6)
    return [...people, ...companyHits, ...files]
  }, [channels, sortedContacts, todos])

  const pickResult = useCallback((result: PalResult) => {
    if (result.type === 'person') {
      setSelectedId(result.id)
      setMode(result.source === 'linkedin' ? 'li' : 'wa')
      return
    }
    if (result.type === 'company') {
      setRecord({ kind: 'company', name: result.name })
      return
    }
    if (result.url) window.open(result.url, '_blank', 'noopener,noreferrer')
  }, [])

  const reviewCount = 0
  const isChat = mode === 'wa' || mode === 'li'
  const overlayContact = record?.kind === 'person' ? sortedContacts.find(contact => contact.id === record.id) ?? null : null
  const overlayCompany = record?.kind === 'company'
    ? companies.find(company => company.name.toLowerCase() === record.name.toLowerCase()) ?? null
    : null
  const overlayOpp = record?.kind === 'opp' ? opportunities.find(opp => opp.id === record.id) ?? null : null
  const companyName = record?.kind === 'company' ? record.name : overlayCompany?.name
  const companyPeople = companyName ? sortedContacts.filter(contact => contact.company?.toLowerCase() === companyName.toLowerCase()) : []

  const recordTitle = overlayContact?.name ?? overlayCompany?.name ?? companyName ?? overlayOpp?.title ?? ''
  const recordSubtitle = overlayContact
    ? [overlayContact.job_title, overlayContact.company].filter(Boolean).join(' · ')
    : overlayCompany
      ? [overlayCompany.sector, overlayCompany.size].filter(Boolean).join(' · ')
      : overlayOpp
        ? [overlayOpp.stage, overlayOpp.company?.name].filter(Boolean).join(' · ')
        : `${companyPeople.length} people in reThink`
  const recordFields: PeekField[] = overlayContact ? [
    { label: 'Email', value: overlayContact.email || '--' },
    { label: 'Company', value: overlayContact.company || '--' },
    { label: 'Role', value: overlayContact.job_title || '--' },
    { label: 'Last touch', value: formatAgo(daysSince(overlayContact.last_interaction_at)) },
  ] : overlayCompany ? [
    { label: 'Domain', value: overlayCompany.domain || '--' },
    { label: 'Sector', value: overlayCompany.sector || '--' },
    { label: 'Stage', value: overlayCompany.account_stage || '--' },
    { label: 'Next step', value: overlayCompany.next_step || '--', wide: true },
  ] : overlayOpp ? [
    { label: 'Stage', value: overlayOpp.stage },
    { label: 'Type', value: overlayOpp.type },
    { label: 'Target date', value: overlayOpp.target_date || '--' },
    { label: 'Value', value: overlayOpp.estimated_value ? `$${overlayOpp.estimated_value.toLocaleString()}` : '--' },
  ] : [
    { label: 'People', value: companyPeople.length },
    { label: 'Known contacts', value: companyPeople.map(contact => contact.name).join(', ') || '--', wide: true },
  ]

  return (
    <div className="conv-os" data-mode={mode}>
      <AppChrome
        mode={mode}
        onModeChange={setMode}
        onOpenSearch={() => setPaletteOpen(true)}
        reviewCount={reviewCount}
        initialsText="AM"
      />
      <div className="conv-shell">
        <main className="conv-center">
          {isChat ? (
            <div className="conv-messenger">
              <ConversationList
                contacts={sortedContacts}
                activeId={selected?.id ?? null}
                channels={channels}
                mode={mode}
                onSelect={contact => setSelectedId(contact.id)}
                onSearch={() => setPaletteOpen(true)}
              />
              <BrowserStage
                contact={selected}
                mode={mode}
                draft={draft}
                busy={sending}
                onDraftChange={setDraft}
                onLog={() => { void addInteraction() }}
              />
            </div>
          ) : mode === 'review' ? (
            <div className="conv-embedded"><ReviewQueue /></div>
          ) : mode === 'focus' ? (
            <div className="conv-embedded">
              <PeopleFocus
                userId={userId}
                contacts={contacts}
                channels={channels}
                onOpenPerson={contact => {
                  setSelectedId(contact.id)
                  setRecord({ kind: 'person', id: contact.id })
                }}
                onOpenOpportunity={opp => setRecord({ kind: 'opp', id: opp.id })}
                onContact={(contact, context) => {
                  setSelectedId(contact.id)
                  setMode('wa')
                  setDraft(context)
                }}
              />
            </div>
          ) : (
            <div className="conv-discover">
              <div className="webtag"><LinkedinLogo size={12} /> Discover</div>
              <div className="li-cover" />
              <div className="li-head">
                <div className="li-logo">{selected?.company?.[0] ?? 'R'}</div>
                <h2 className="li-co-name">{selected?.company || 'Relationship search'}</h2>
                <p className="li-co-tag">Search and pull people, companies, and files into the active conversation.</p>
              </div>
              <div className="li-section">
                <h3 className="li-h">People nearby</h3>
                <div className="li-people">
                  {sortedContacts.slice(0, 8).map(contact => (
                    <button key={contact.id} className="li-person" onClick={() => { setSelectedId(contact.id); setMode('wa') }}>
                      <span className="pa" style={{ background: avatarColor(contact.id) }}>{initials(contact.name)}</span>
                      <span><span className="pn">{contact.name}</span><span className="pr">{contact.job_title || contact.company || contact.status}</span></span>
                      <span className="pin"><ArrowUpRight size={12} /> pull</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>

        {isChat && person && (
          <aside className="peekcol conv-peekcol">
            <div className="pk-acct">
              <div className="pk-acct-id"><IdentificationBadge size={15} /> Relationship context</div>
              <div className="pk-acct-r"><button title="Open in People" onClick={() => navigate('/people')}><ArrowSquareOut size={16} /></button></div>
            </div>
            <div className="pk-scroll conv-pk-scroll">
              <RelationshipPeek
                person={person}
                onOpenRecord={setRecord}
                onToggleTodo={(todo, done) => { void toggleTodo(todo, done) }}
                onAddDate={date => { void addDate(date) }}
                onAddTodo={todo => { void addTodo(todo) }}
                onClassify={() => { if (selected) setRecord({ kind: 'person', id: selected.id }) }}
                onRecheckContext={recheckContext}
                onToast={showToast}
              />
            </div>
          </aside>
        )}
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} search={search} onPick={pickResult} />

      <RecordPeek
        open={Boolean(record)}
        title={recordTitle}
        subtitle={recordSubtitle}
        eyebrow={record?.kind === 'opp' ? 'Opportunity' : record?.kind === 'company' ? 'Company' : 'Person'}
        avatar={<span className="peek-avatar-fallback">{initials(recordTitle)}</span>}
        fields={recordFields}
        highlights={record?.kind === 'company' ? [
          { label: 'People', value: companyPeople.length },
          { label: 'Open opps', value: opportunities.filter(opp => opp.company?.name?.toLowerCase() === companyName?.toLowerCase()).length },
        ] : []}
        listItems={record?.kind === 'company' ? companyPeople.slice(0, 5).map(contact => contact.name) : undefined}
        activity={record?.kind === 'person' && overlayContact ? interactions.filter(row => row.contact_id === overlayContact.id).slice(0, 8).map(row => ({
          text: row.notes || row.type,
          when: row.interaction_date,
          source: row.channel || row.type,
        })) : []}
        onClose={() => setRecord(null)}
        onOpenFull={() => {
          if (record?.kind === 'person') navigate(`/people/${record.id}`)
          if (record?.kind === 'company' && overlayCompany) navigate(`/people/companies/${overlayCompany.id}`)
          if (record?.kind === 'opp') navigate(`/people/opportunities/${record.id}`)
        }}
      />

      <div className={`rp-toast ${toast ? 'on' : ''}`}>{toast}</div>
      {loading && <div className="conv-loading"><span /></div>}
    </div>
  )
}
