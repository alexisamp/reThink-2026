import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useAttioObjectBundle } from '@/hooks/useAttioObjects'
import { useLists } from '@/hooks/useLists'
import { supabase } from '@/lib/supabase'
import {
  ACCESS_RANK,
  crmUrlPresentation,
  fetchObjectRecords,
  getEffectiveAccess,
  saveRecordAttributeValue,
  type CrmAttribute,
  type CrmObject,
  type UnifiedRecord,
} from '@/lib/attioObjects'
import { companyImage as resolveCompanyImage } from '@/lib/crmObjects'
import { addCrmListEntries } from '@/lib/crmViews'
import { Icon, Logo, type TodayIconName } from '@/screens/today/TodayIcons'
import ListGlyph from '@/components/crm/ListGlyph'

type RecordTab = 'overview' | 'deals' | 'activity' | 'emails' | 'calls' | 'team' | 'notes' | 'tasks' | 'files'
type ActivityRow = {
  id: string
  type: string
  direction: string | null
  notes: string | null
  interaction_date: string
  channel: string | null
}
type TaskRow = { id: string; text: string; completed: boolean; date: string | null }
type NoteRow = { id: string; title: string; body: string | null; created_at: string }
type MemberListRow = { entryId: string; id: string; name: string; icon: string | null; current_stage: string; entered_at: string }
type MembershipNoteRow = { id: string; title: string; body: string; created_at: string }
type DisplayNoteRow = NoteRow | MembershipNoteRow
type DealRow = { id: string; title: string; stage: string | null; estimated_value: number | null; target_date: string | null; imageUrl: string | null }
type TeamMember = { id: string; name: string; imageUrl: string | null; subtitle: string | null; company: string | null }
type ContactTeamRow = {
  id: string
  name: string | null
  profile_photo_url: string | null
  job_title: string | null
  company: string | null
  company_id: string | null
  email: string | null
}

const DETAIL_KEYS: Record<string, string[]> = {
  companies: ['domain', 'name', 'description', 'team', 'sector'],
  people: ['name', 'email', 'phone_numbers', 'company', 'job_title', 'location', 'description'],
  deals: ['title', 'stage', 'owner', 'estimated_value', 'company_id'],
}

const MEDIA_KEYS = new Set(['profile_picture_url', 'profile_photo_url', 'logo', 'logo_url', 'favicon_url', 'image', 'image_url', 'avatar', 'avatar_url'])
const HIDDEN_KEYS = new Set(['list_entries', 'created_by'])

function routeSlug(slug: string | undefined, pathname: string) {
  if (slug) return slug
  const first = pathname.split('/').filter(Boolean)[0]
  return ['companies', 'people', 'deals'].includes(first) ? first : undefined
}

function objectListPath(object: CrmObject) {
  return ['companies', 'people', 'deals'].includes(object.slug) ? `/${object.slug}/view/all` : `/records/${object.slug}`
}

function objectRecordPath(object: CrmObject, recordId: string) {
  return ['companies', 'people', 'deals'].includes(object.slug) ? `/${object.slug}/record/${recordId}` : `/records/${object.slug}/${recordId}`
}

function formatDay(value: unknown) {
  if (!value) return ''
  const raw = String(value)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function humanizeKey(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function sourceLabel(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function markdownValue(value: unknown, key?: string): string {
  if (value === null || value === undefined || value === '') return ''
  if (Array.isArray(value)) return value.map(item => markdownValue(item, key)).filter(Boolean).join('\n')
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([childKey, childValue]) => `**${humanizeKey(childKey)}:** ${markdownValue(childValue, childKey)}`)
      .filter(Boolean)
      .join('\n')
  }
  const text = String(value).trim()
  if (/^https?:\/\//i.test(text)) return `[${sourceLabel(text)}](${text})`
  if (key === 'research_confidence') return text.charAt(0).toUpperCase() + text.slice(1)
  return text
}

function structuredNoteMarkdown(value: Record<string, unknown>) {
  const priority = [
    'why_selected',
    'selection_reason',
    'public_work',
    'career_signals',
    'conversation_anchors',
    'shared_context_candidates',
    'ai_insights',
    'source_urls',
    'research_confidence',
    'linkedin_capture_status',
  ]
  const keys = [...priority.filter(key => key in value), ...Object.keys(value).filter(key => !priority.includes(key))]
  const sections = keys.flatMap(key => {
    const content = value[key]
    if (content === null || content === undefined || content === '') return []
    const label = key === 'source_urls' ? 'Sources' : humanizeKey(key)
    if (Array.isArray(content)) {
      const items = content.map(item => markdownValue(item, key)).filter(Boolean)
      return items.length ? [`## ${label}`, ...items.map(item => `- ${item}`)] : []
    }
    if (typeof content === 'object') {
      const nested = markdownValue(content, key)
      return nested ? [`## ${label}`, nested] : []
    }
    return [`**${label}:** ${markdownValue(content, key)}`]
  })
  return sections.join('\n\n')
}

function formattedJsonNote(value: unknown) {
  if (!value) return null
  if (typeof value === 'object' && !Array.isArray(value)) return structuredNoteMarkdown(value as Record<string, unknown>)
  if (typeof value === 'object') return markdownValue(value)
  const raw = String(value).trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return structuredNoteMarkdown(parsed as Record<string, unknown>)
    return typeof parsed === 'string' ? parsed : markdownValue(parsed)
  } catch {
    return raw
  }
}

function notePreview(body: string | null | undefined) {
  const clean = String(body ?? '').replace(/[#>*_`[\]()-]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!clean) return 'This note has no content'
  return clean.length > 140 ? `${clean.slice(0, 140).trim()}...` : clean
}

function renderInlineMarkdown(text: string) {
  const nodes: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)]+)/g
  let cursor = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index))
    const token = match[0]
    const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) nodes.push(<a key={`${token}-${match.index}`} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>)
    else if (token.startsWith('**')) nodes.push(<strong key={`${token}-${match.index}`}>{token.slice(2, -2)}</strong>)
    else nodes.push(<a key={`${token}-${match.index}`} href={token} target="_blank" rel="noreferrer">{sourceLabel(token)}</a>)
    cursor = match.index + token.length
  }
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

function renderMarkdownNote(body: string | null | undefined) {
  let raw = String(body ?? '').trim()
  if (!raw) return <p className="rm-note-empty">This note has no content.</p>
  raw = raw.replace(/\\([[\]()])/g, '$1')
  if (/^\s*\{/.test(raw) || /^\s*\[\s*[{"]/.test(raw)) {
    try {
      const parsed = JSON.parse(raw)
      raw = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? structuredNoteMarkdown(parsed as Record<string, unknown>) : markdownValue(parsed)
    } catch {
      return <pre>{raw}</pre>
    }
  }

  const nodes: ReactNode[] = []
  let bullets: string[] = []
  const flushBullets = () => {
    if (!bullets.length) return
    const items = bullets
    bullets = []
    nodes.push(<ul key={`ul-${nodes.length}`}>{items.map((item, index) => <li key={`${item}-${index}`}>{renderInlineMarkdown(item)}</li>)}</ul>)
  }

  raw.split(/\r?\n/).forEach((line, index) => {
    const text = line.trim()
    if (!text) {
      flushBullets()
      return
    }
    const bullet = text.match(/^[-*]\s+(.+)$/)
    if (bullet) {
      bullets.push(bullet[1])
      return
    }
    flushBullets()
    const bracketHeading = text.match(/^\[([^\]]+)\]$/)
    const labelValue = text.match(/^([A-Z][A-Za-z0-9 /&-]{1,48}):\s+(.+)$/)
    if (bracketHeading) nodes.push(<h3 className="note-bracket-heading" key={index}>{renderInlineMarkdown(bracketHeading[1])}</h3>)
    else if (text.startsWith('### ')) nodes.push(<h3 key={index}>{renderInlineMarkdown(text.slice(4))}</h3>)
    else if (text.startsWith('## ')) nodes.push(<h2 key={index}>{renderInlineMarkdown(text.slice(3))}</h2>)
    else if (text.startsWith('# ')) nodes.push(<h1 key={index}>{renderInlineMarkdown(text.slice(2))}</h1>)
    else if (labelValue) nodes.push(<p className="note-kv" key={index}><strong>{labelValue[1]}:</strong> {renderInlineMarkdown(labelValue[2])}</p>)
    else nodes.push(<p key={index}>{renderInlineMarkdown(text)}</p>)
  })
  flushBullets()
  return nodes
}

function attributeIcon(attribute: CrmAttribute): TodayIconName {
  const type = attribute.attribute_type.toLowerCase()
  if (attribute.is_relationship || /user|relationship/.test(type)) return 'users'
  if (/domain|email|url/.test(type)) return 'globe'
  if (/currency/.test(type)) return 'dollar'
  if (/number|percent/.test(type)) return 'hash'
  if (/multi|tag/.test(type)) return 'tag'
  if (/location/.test(type)) return 'pin'
  if (/status|select/.test(type)) return 'status'
  if (/date|time/.test(type)) return 'calendar'
  return 'text'
}

function valueFor(object: CrmObject, record: UnifiedRecord, attribute: CrmAttribute) {
  if (object.slug === 'deals' && attribute.key === 'company_id') return record.values.company ?? record.values.company_id
  if (object.slug === 'people' && attribute.key === 'description') return record.values.description ?? record.values.about ?? record.values.personal_context ?? record.values.notes
  if (object.slug === 'people' && attribute.key === 'phone_numbers') return record.values.phone_numbers ?? record.values.phone
  return record.values[attribute.key]
}

function currencyText(value: unknown) {
  const amount = typeof value === 'object' && value && 'amount' in value ? Number((value as { amount: unknown }).amount) : Number(value)
  if (!Number.isFinite(amount)) return String(value)
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function displayValue(value: unknown, attribute?: CrmAttribute) {
  if (value === null || value === undefined || value === '') return <span className="rp-empty-val">Set a value...</span>
  if (Array.isArray(value)) return <span className="chipset">{value.slice(0, 3).map(item => <span className="cat-tag" key={String(item)}>{String(item)}</span>)}</span>
  if (typeof value === 'boolean') return value ? <Icon name="check" size={12} /> : <span className="c-muted">No</span>
  if (/date|timestamp/i.test(attribute?.attribute_type ?? '')) return <span>{formatDay(value)}</span>
  if (attribute?.attribute_type === 'Currency') return <span>{currencyText(value)}</span>
  if (/select|status/i.test(attribute?.attribute_type ?? '')) return <span className="chip"><span className="dot" />{String(value)}</span>
  if (attribute?.is_relationship) return <span className="rec-chip"><span className="rec-chip-ico"><Icon name="contact" size={9} /></span>{String(value)}</span>
  if (/url|domain|email/i.test(attribute?.attribute_type ?? '')) {
    const presentation = crmUrlPresentation(value, attribute?.attribute_type)
    return <a className="c-domain" href={presentation.href} title={String(value)} target={attribute?.attribute_type === 'Email' ? undefined : '_blank'} rel="noreferrer" onClick={event => event.stopPropagation()}>{presentation.label}</a>
  }
  return <span>{String(value)}</span>
}

function activitySource(activity: ActivityRow): { icon: TodayIconName; title: string } {
  const source = `${activity.channel ?? ''} ${activity.type}`.toLowerCase()
  if (source.includes('linkedin')) return { icon: 'linkedin', title: 'LinkedIn' }
  if (source.includes('email') || source.includes('gmail')) return { icon: 'gmail', title: 'Gmail' }
  if (source.includes('call') || source.includes('video') || source.includes('coffee') || source.includes('meeting')) return { icon: 'clock', title: 'Meeting' }
  return { icon: 'chat', title: source.includes('whatsapp') ? 'WhatsApp' : 'Message' }
}

function activityLabel(activity: ActivityRow) {
  const source = activitySource(activity).title
  const direction = activity.direction === 'inbound' ? 'received' : activity.direction === 'outbound' ? 'sent' : 'logged'
  return `${source} ${direction}`
}

function connectionLabel(value: unknown) {
  const score = Number(value)
  if (!Number.isFinite(score) || score <= 0) return 'No communication'
  const normalized = score <= 5 ? score * 20 : score
  if (normalized < 25) return 'Very weak'
  if (normalized < 45) return 'Weak'
  if (normalized < 65) return 'Medium'
  if (normalized < 85) return 'Strong'
  return 'Very strong'
}

function asPeople(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value === 'string' && value.trim()) return value.split(',').map(item => item.trim()).filter(Boolean)
  return []
}

function normalizeCompanyName(value: unknown) {
  return String(value ?? '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '').trim()
}

function ilikeNeedle(value: unknown) {
  return String(value ?? '').replace(/[%_]/g, '').trim()
}

function toTeamMember(row: ContactTeamRow): TeamMember {
  return {
    id: row.id,
    name: row.name || row.email || 'Unknown person',
    imageUrl: row.profile_photo_url,
    subtitle: row.job_title || row.company,
    company: row.company,
  }
}

async function fetchCompanyTeam(userId: string, companyId: string) {
  const { data: company } = await supabase
    .from('companies')
    .select('id,name,domain')
    .eq('user_id', userId)
    .eq('id', companyId)
    .maybeSingle()
  const companyName = company?.name ?? ''
  const normalizedCompany = normalizeCompanyName(companyName)
  const { data: fkRows } = await supabase
    .from('outreach_logs')
    .select('id,name,profile_photo_url,job_title,company,company_id,email')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .order('name')
  let textRows: ContactTeamRow[] = []
  const needle = ilikeNeedle(companyName)
  if (needle && normalizedCompany) {
    const { data } = await supabase
      .from('outreach_logs')
      .select('id,name,profile_photo_url,job_title,company,company_id,email')
      .eq('user_id', userId)
      .ilike('company', `%${needle}%`)
      .order('name')
    textRows = ((data ?? []) as ContactTeamRow[]).filter(row => {
      const normalized = normalizeCompanyName(row.company)
      return normalized && (normalized === normalizedCompany || normalized.includes(normalizedCompany) || normalizedCompany.includes(normalized))
    })
  }
  const byId = new Map<string, ContactTeamRow>()
  ;([...(fkRows ?? []) as ContactTeamRow[], ...textRows]).forEach(row => byId.set(row.id, row))
  const exactUnlinkedIds = textRows
    .filter(row => !row.company_id && normalizeCompanyName(row.company) === normalizedCompany)
    .map(row => row.id)
  if (exactUnlinkedIds.length) {
    void supabase
      .from('outreach_logs')
      .update({ company_id: companyId })
      .eq('user_id', userId)
      .in('id', exactUnlinkedIds)
  }
  return [...byId.values()].map(toTeamMember)
}

function companyImage(logo?: unknown, domain?: unknown, favicon?: unknown) {
  return resolveCompanyImage(
    typeof logo === 'string' ? logo : null,
    typeof domain === 'string' ? domain : null,
    typeof favicon === 'string' ? favicon : null,
  )
}

function RecordAttributeRow({ object, record, attribute, canWrite, forceEdit = false, onSave }: {
  object: CrmObject
  record: UnifiedRecord
  attribute: CrmAttribute
  canWrite: boolean
  forceEdit?: boolean
  onSave: (attribute: CrmAttribute, value: unknown) => Promise<void>
}) {
  const value = valueFor(object, record, attribute)
  const initial = value === null || value === undefined ? '' : /date|timestamp/i.test(attribute.attribute_type) ? String(value).slice(0, 10) : Array.isArray(value) ? value.join(',') : String(value)
  const [editing, setEditing] = useState(forceEdit)
  const [draft, setDraft] = useState(initial)
  useEffect(() => { setDraft(initial); setEditing(forceEdit) }, [forceEdit, initial])
  const editable = canWrite && attribute.is_editable && !attribute.is_relationship
  const commit = async (next = draft) => {
    const parsed = attribute.attribute_type === 'Multi-select' ? next.split(',').map(item => item.trim()).filter(Boolean) : next.trim() || null
    await onSave(attribute, parsed)
    if (!forceEdit) setEditing(false)
  }
  return <div className="rp-attr-row">
    <span className="rp-attr-lbl"><Icon name={attributeIcon(attribute)} size={13} />{attribute.name}</span>
    <span className="rp-attr-val">
      {editing && editable ? (
        <input
          className="rp-inline-input"
          autoFocus={!forceEdit}
          type={/date|timestamp/i.test(attribute.attribute_type) ? 'date' : /number|currency/i.test(attribute.attribute_type) ? 'number' : 'text'}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={event => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') { setDraft(initial); setEditing(false) }
          }}
        />
      ) : (
        <button className={`rp-value-button${value === null || value === undefined || value === '' ? ' empty' : ''}`} type="button" disabled={!editable} onClick={() => editable && setEditing(true)}>
          {displayValue(value, attribute)}
        </button>
      )}
    </span>
  </div>
}

function EmptyState({ icon, title, sub, cta, onCta }: { icon: TodayIconName; title: string; sub: string; cta?: string; onCta?: () => void }) {
  return <div className="rp-empty"><div className="rp-empty-ill"><Icon name={icon} size={30} /></div><h3>{title}</h3><p>{sub}</p>{cta && onCta && <button className="btn btn-primary" onClick={onCta}><Icon name="plus" size={13} />{cta}</button>}</div>
}

function TeamInlineValue({ people, onOpenTeam, onOpenPerson }: { people: TeamMember[]; onOpenTeam: () => void; onOpenPerson: (id: string) => void }) {
  if (!people.length) return <button type="button" className="rp-value-button empty" onClick={onOpenTeam}>Set Team...</button>
  const first = people[0]
  return <span className="rp-teaminline">
    <button type="button" className="rp-person-chip rp-person-chip-btn" onClick={() => onOpenPerson(first.id)}>
      <Logo id={first.imageUrl || first.name} size={18} sq={false} /><span className="pn">{first.name}</span>
    </button>
    {people.length > 1 && <button type="button" className="rp-teamplus" onClick={onOpenTeam}>+{people.length - 1}</button>}
  </span>
}

export default function CrmRecordDetail() {
  const { slug, recordId } = useParams<{ slug: string; recordId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const activeSlug = routeSlug(slug, location.pathname)
  const { object, attributes, permissions, loading } = useAttioObjectBundle(user?.id, activeSlug)
  const { lists } = useLists(user?.id)
  const [record, setRecord] = useState<UnifiedRecord | null>(null)
  const [recordOrder, setRecordOrder] = useState<string[]>([])
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [membershipNotes, setMembershipNotes] = useState<MembershipNoteRow[]>([])
  const [activities, setActivities] = useState<ActivityRow[]>([])
  const [memberLists, setMemberLists] = useState<MemberListRow[]>([])
  const [relatedDeals, setRelatedDeals] = useState<DealRow[]>([])
  const [companyTeam, setCompanyTeam] = useState<TeamMember[]>([])
  const [tab, setTab] = useState<RecordTab>('overview')
  const [leftMode, setLeftMode] = useState<'details' | 'search'>('details')
  const [query, setQuery] = useState('')
  const [detailsCollapsed, setDetailsCollapsed] = useState(false)
  const [listsCollapsed, setListsCollapsed] = useState(false)
  const [leftWidth, setLeftWidth] = useState(438)
  const [tabsWidth, setTabsWidth] = useState(9999)
  const [moreTabsOpen, setMoreTabsOpen] = useState(false)
  const [listMenuId, setListMenuId] = useState<string | null>(null)
  const [modal, setModal] = useState<'task' | 'note' | 'compose' | 'meeting' | 'edit' | 'add-list' | null>(null)
  const [openNote, setOpenNote] = useState<DisplayNoteRow | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [meetingStart, setMeetingStart] = useState('09:00')
  const [meetingEnd, setMeetingEnd] = useState('09:30')
  const [meetingParticipant, setMeetingParticipant] = useState('')
  const [toast, setToast] = useState<{ icon: TodayIconName; text: string } | null>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  const relatedReloadTimer = useRef<number | null>(null)
  const canWrite = ACCESS_RANK[getEffectiveAccess(permissions)] >= ACCESS_RANK.read_write

  const visibleAttributes = useMemo(() => attributes.filter(attribute => !attribute.is_archived && !MEDIA_KEYS.has(attribute.key) && !HIDDEN_KEYS.has(attribute.key)), [attributes])
  const detailAttributes = useMemo(() => {
    const keys = DETAIL_KEYS[object?.slug ?? '']
    if (!keys) return visibleAttributes.filter(attribute => !attribute.is_relationship).slice(0, 5)
    return keys.map(key => visibleAttributes.find(attribute => attribute.key === key)).filter((attribute): attribute is CrmAttribute => Boolean(attribute))
  }, [object?.slug, visibleAttributes])
  const searchAttributes = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle ? visibleAttributes.filter(attribute => attribute.name.toLowerCase().includes(needle) || attribute.key.toLowerCase().includes(needle)) : visibleAttributes
  }, [query, visibleAttributes])

  const notify = useCallback((icon: TodayIconName, text: string) => {
    setToast({ icon, text })
    window.setTimeout(() => setToast(null), 2200)
  }, [])

  const loadRecord = useCallback(async () => {
    if (!user || !object || !recordId) return
    const rows = await fetchObjectRecords(user.id, object)
    setRecordOrder(rows.map(row => row.id))
    setRecord(rows.find(row => row.id === recordId) ?? null)
  }, [object, recordId, user])

  const loadRelated = useCallback(async () => {
    if (!user || !object || !recordId) return
    const relationKey = object.backing_source === 'people' ? 'contact_id' : object.backing_source === 'companies' ? 'company_id' : object.backing_source === 'deals' ? 'opportunity_id' : null
    const taskPromise = relationKey
      ? supabase.from('todos').select('id,text,completed,date').eq('user_id', user.id).eq(relationKey, recordId).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as TaskRow[] })
    const notePromise = supabase.from('captures').select('id,title,body,created_at').eq('user_id', user.id).eq('linked_record_slug', object.slug).eq('linked_record_id', recordId).order('created_at', { ascending: false })
    const membershipPromise = supabase.from('crm_list_entries').select('id,current_stage,entered_at,notes,attributes,list:lists(id,name,icon)').eq('user_id', user.id).eq('object_slug', object.slug).eq('record_id', recordId)
    const [taskResult, noteResult, membershipResult] = await Promise.all([taskPromise, notePromise, membershipPromise])
    setTasks((taskResult.data ?? []) as TaskRow[])
    setNotes((noteResult.data ?? []) as NoteRow[])
    setMemberLists((membershipResult.data ?? []).flatMap(row => {
      const linked = Array.isArray(row.list) ? row.list[0] : row.list
      return linked ? [{ entryId: row.id, id: linked.id, name: linked.name, icon: linked.icon, current_stage: row.current_stage || 'No stage', entered_at: row.entered_at }] : []
    }))
    setMembershipNotes((membershipResult.data ?? []).flatMap(row => {
      const linked = Array.isArray(row.list) ? row.list[0] : row.list
      const attrs = row.attributes && typeof row.attributes === 'object' && !Array.isArray(row.attributes) ? row.attributes as Record<string, unknown> : {}
      const result: MembershipNoteRow[] = []
      const dossier = formattedJsonNote(attrs.external_research_dossier)
      if (dossier) {
        result.push({
          id: `${row.id}:dossier`,
          title: `${linked?.name ?? 'List'} research dossier`,
          body: dossier,
          created_at: row.entered_at,
        })
      }
      const entryNote = typeof row.notes === 'string' ? row.notes.trim() : ''
      if (entryNote && !/^Planned for .* Priority \d+ of \d+\.$/i.test(entryNote)) {
        result.push({
          id: `${row.id}:note`,
          title: `${linked?.name ?? 'List'} note`,
          body: entryNote,
          created_at: row.entered_at,
        })
      }
      return result
    }))

    let interactionQuery = supabase.from('interactions').select('id,type,direction,notes,interaction_date,channel').eq('user_id', user.id).order('interaction_date', { ascending: false }).limit(100)
    let resolvedCompanyTeam: TeamMember[] = []
    if (object.backing_source === 'people') interactionQuery = interactionQuery.eq('contact_id', recordId)
    else if (object.backing_source === 'deals') interactionQuery = interactionQuery.eq('opportunity_id', recordId)
    else if (object.backing_source === 'companies') {
      resolvedCompanyTeam = await fetchCompanyTeam(user.id, recordId)
      const ids = resolvedCompanyTeam.map(contact => contact.id)
      if (ids.length) interactionQuery = interactionQuery.in('contact_id', ids)
      else { setActivities([]); interactionQuery = interactionQuery.eq('contact_id', '00000000-0000-0000-0000-000000000000') }
    } else interactionQuery = interactionQuery.eq('id', '00000000-0000-0000-0000-000000000000')
    setCompanyTeam(object.backing_source === 'companies' ? resolvedCompanyTeam : [])
    const { data: interactionRows } = await interactionQuery
    setActivities((interactionRows ?? []) as ActivityRow[])

    if (object.backing_source === 'companies') {
      const { data: dealRows } = await supabase.from('opportunities').select('id,title,stage,estimated_value,target_date,company:companies(logo_url,domain,favicon_url)').eq('user_id', user.id).eq('company_id', recordId).order('created_at', { ascending: false })
      setRelatedDeals((dealRows ?? []).map(row => {
        const linked = Array.isArray(row.company) ? row.company[0] : row.company
        return { id: row.id, title: row.title, stage: row.stage, estimated_value: row.estimated_value, target_date: row.target_date, imageUrl: companyImage(linked?.logo_url, linked?.domain, linked?.favicon_url) }
      }))
    } else setRelatedDeals([])
  }, [object, recordId, user])

  useEffect(() => { void loadRecord(); void loadRelated() }, [loadRecord, loadRelated])
  useEffect(() => {
    if (!user || !object || !recordId) return
    const schedule = () => {
      if (relatedReloadTimer.current) window.clearTimeout(relatedReloadTimer.current)
      relatedReloadTimer.current = window.setTimeout(() => {
        relatedReloadTimer.current = null
        void loadRelated()
      }, 140)
    }
    const onFocus = () => schedule()
    const onVisibility = () => { if (document.visibilityState === 'visible') schedule() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    const channel = supabase.channel(`record-membership-sync-${user.id}-${object.slug}-${recordId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_list_entries', filter: `user_id=eq.${user.id}` }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_memberships', filter: `user_id=eq.${user.id}` }, schedule)
      .subscribe()
    return () => {
      if (relatedReloadTimer.current) window.clearTimeout(relatedReloadTimer.current)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      void supabase.removeChannel(channel)
    }
  }, [loadRelated, object, recordId, user])
  useEffect(() => {
    const element = tabsRef.current
    if (!element) return
    const update = () => setTabsWidth(element.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const saveAttribute = async (attribute: CrmAttribute, value: unknown) => {
    if (!user || !object || !record || !canWrite || !attribute.is_editable) return
    const { error } = await saveRecordAttributeValue(user.id, object, record, attribute, value)
    if (error) notify('x', error.message)
    await loadRecord()
  }

  const createTask = async () => {
    if (!user || !object || !recordId || !draftTitle.trim()) return
    const relationKey = object.backing_source === 'people' ? 'contact_id' : object.backing_source === 'companies' ? 'company_id' : object.backing_source === 'deals' ? 'opportunity_id' : null
    if (!relationKey) { notify('checkcircle', 'Tasks for custom objects need backend design'); return }
    const { error } = await supabase.from('todos').insert({ user_id: user.id, text: draftTitle.trim(), date: new Date().toISOString().slice(0, 10), [relationKey]: recordId })
    if (error) notify('x', error.message)
    else { setDraftTitle(''); setModal(null); await loadRelated(); notify('checkcircle', 'Task created') }
  }

  const createNote = async () => {
    if (!user || !object || !recordId) return
    const title = draftTitle.trim() || 'Untitled note'
    const { error } = await supabase.from('captures').insert({ user_id: user.id, type: 'idea', title, body: draftBody.trim() || null, captured_date: new Date().toISOString().slice(0, 10), linked_record_slug: object.slug, linked_record_id: recordId })
    if (error) notify('x', error.message)
    else { setDraftTitle(''); setDraftBody(''); setModal(null); await loadRelated(); notify('article', 'Note created') }
  }

  const createMeeting = async () => {
    if (!user || !object || !recordId || !draftTitle.trim()) return
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.provider_token || (session?.user.user_metadata?.google_access_token as string | undefined)
    if (!token) { notify('calendar', 'Reconnect Google Calendar to create this meeting'); return }
    const date = new Date().toISOString().slice(0, 10)
    const attendees = meetingParticipant.trim() ? [{ email: meetingParticipant.trim() }] : []
    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: draftTitle.trim(), start: { dateTime: `${date}T${meetingStart}:00`, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }, end: { dateTime: `${date}T${meetingEnd}:00`, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }, attendees, conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } } }),
    })
    if (!response.ok) { notify('x', `Google Calendar could not create the meeting (${response.status})`); return }
    if (object.backing_source === 'people') await supabase.from('interactions').insert({ user_id: user.id, contact_id: recordId, type: 'meeting', channel: 'video', direction: 'outbound', notes: draftTitle.trim(), interaction_date: date })
    setDraftTitle(''); setModal(null); await loadRelated(); notify('calendar', 'Meeting created in Google Calendar')
  }

  if (loading) return <div className="attio-record-detail"><div className="attio-empty">Loading...</div></div>
  if (!object || !record) return <div className="attio-record-detail"><div className="attio-empty">Record not found.</div></div>

  const team = object.slug === 'companies'
    ? companyTeam
    : asPeople(record.values.team ?? record.values.owner).map(person => ({ id: person, name: person, imageUrl: null, subtitle: null, company: null }))
  const nextTask = tasks.filter(task => !task.completed && task.date).sort((a, b) => String(a.date).localeCompare(String(b.date)))[0]
  const nextInteraction = activities.filter(activity => activity.interaction_date > new Date().toISOString().slice(0, 10)).sort((a, b) => a.interaction_date.localeCompare(b.interaction_date))[0]
  const profileNoteBody = typeof record.values.notes === 'string' ? record.values.notes.trim() : ''
  const profileNotes: MembershipNoteRow[] = profileNoteBody ? [{
    id: `${record.id}:profile-notes`,
    title: 'Profile notes',
    body: profileNoteBody,
    created_at: String(record.createdAt ?? new Date().toISOString()),
  }] : []
  const displayNotes: DisplayNoteRow[] = [...profileNotes, ...membershipNotes, ...notes]
  const highlights: Array<{ label: string; icon: TodayIconName; value: unknown; muted?: boolean; people?: TeamMember[]; color?: string; currency?: boolean }> = object.slug === 'companies' ? [
    { label: 'Connection strength', icon: 'heart' as TodayIconName, value: connectionLabel(record.values.connection_strength), color: '#c5ccd1' },
    { label: 'Next calendar interaction', icon: 'calendar', value: record.values.next_calendar_interaction ? formatDay(record.values.next_calendar_interaction) : 'No upcoming interaction', muted: !record.values.next_calendar_interaction },
    { label: 'Team', icon: 'users', value: team.length ? null : 'No Team', people: team, muted: !team.length },
    { label: 'Estimated ARR', icon: 'dollar', value: record.values.estimated_arr ?? 'No Estimated ARR', muted: record.values.estimated_arr == null, currency: record.values.estimated_arr != null },
    { label: 'Funding raised', icon: 'dollar', value: record.values.funding_raised ?? 'No Funding raised', muted: record.values.funding_raised == null, currency: typeof record.values.funding_raised === 'number' },
    { label: 'Employee range', icon: 'users', value: record.values.size ?? record.values.employees_count ?? 'No Employee range', muted: record.values.size == null && record.values.employees_count == null },
  ] : object.slug === 'people' ? [
    { label: 'Connection strength', icon: 'heart' as TodayIconName, value: connectionLabel(record.values.connection_strength), color: 'var(--danger, #C23A3A)' },
    { label: 'Next calendar interaction', icon: 'calendar', value: nextInteraction ? formatDay(nextInteraction.interaction_date) : 'No upcoming interaction', muted: !nextInteraction },
    { label: 'Email addresses', icon: 'globe', value: record.values.email ?? 'No email addresses', muted: !record.values.email },
    { label: 'Phone numbers', icon: 'hash', value: record.values.phone_numbers ?? record.values.phone ?? 'No phone numbers', muted: !record.values.phone_numbers && !record.values.phone },
    { label: 'Primary location', icon: 'pin', value: record.values.location ?? 'No location', muted: !record.values.location },
    { label: 'Company', icon: 'contact', value: record.values.company ?? 'No Company', muted: !record.values.company },
  ] : object.slug === 'deals' ? [
    { label: 'Deal stage', icon: 'status', value: record.values.stage ?? 'No stage', muted: !record.values.stage },
    { label: 'Deal value', icon: 'dollar', value: record.values.estimated_value ?? 'No Deal value', muted: record.values.estimated_value == null, currency: record.values.estimated_value != null },
    { label: 'Deal owner', icon: 'users', value: team.length ? null : 'No Deal owner', people: team, muted: !team.length },
    { label: 'Next due task', icon: 'checkcircle', value: nextTask ? formatDay(nextTask.date) : 'No Next due task', muted: !nextTask },
    { label: 'Next interaction', icon: 'clock', value: nextInteraction ? formatDay(nextInteraction.interaction_date) : 'No upcoming interaction', muted: !nextInteraction },
    { label: 'Close date', icon: 'clock', value: record.values.target_date ? formatDay(record.values.target_date) : 'No Close date', muted: !record.values.target_date },
  ] : visibleAttributes.filter(attribute => valueFor(object, record, attribute) != null).slice(0, 6).map(attribute => ({ label: attribute.name, icon: attributeIcon(attribute), value: /date|timestamp/i.test(attribute.attribute_type) ? formatDay(valueFor(object, record, attribute)) : valueFor(object, record, attribute) }))

  const allTabs: Array<{ key: RecordTab; label: string; icon: TodayIconName; count?: number }> = [
    { key: 'overview', label: 'Overview', icon: 'grid' },
    { key: 'deals', label: 'Deals', icon: 'dollar', count: relatedDeals.length },
    { key: 'activity', label: 'Activity', icon: 'activity' },
    { key: 'emails', label: 'Emails', icon: 'chat', count: activities.filter(activity => activitySource(activity).title === 'Gmail').length },
    { key: 'calls', label: 'Calls', icon: 'clock', count: activities.filter(activity => activitySource(activity).title === 'Meeting').length },
    { key: 'team', label: 'Team', icon: 'users', count: team.length },
    { key: 'notes', label: 'Notes', icon: 'article', count: displayNotes.length },
    { key: 'tasks', label: 'Tasks', icon: 'checkcircle', count: tasks.length },
    { key: 'files', label: 'Files', icon: 'folder' },
  ]
  const estimateTab = (item: typeof allTabs[number]) => 50 + item.label.length * 7 + (item.count === undefined ? 0 : 24)
  let shownTabs = allTabs
  let hiddenTabs: typeof allTabs = []
  if (allTabs.reduce((sum, item) => sum + estimateTab(item), 0) > tabsWidth) {
    let used = 0
    let count = 0
    for (const item of allTabs) {
      if (used + estimateTab(item) + 96 > tabsWidth) break
      used += estimateTab(item)
      count += 1
    }
    count = Math.max(3, count)
    shownTabs = allTabs.slice(0, count)
    hiddenTabs = allTabs.slice(count)
    if (hiddenTabs.some(item => item.key === tab)) {
      const active = allTabs.find(item => item.key === tab)!
      hiddenTabs = [shownTabs[shownTabs.length - 1], ...hiddenTabs.filter(item => item.key !== tab)]
      shownTabs = [...shownTabs.slice(0, -1), active]
    }
  }

  const currentIndex = recordOrder.indexOf(record.id)
  const goToRecord = (offset: number) => {
    const next = recordOrder[currentIndex + offset]
    if (next) navigate(objectRecordPath(object, next))
  }
  const openPersonRecord = (personId: string) => navigate(`/people/record/${personId}`)
  const openMeeting = () => {
    setMeetingParticipant(typeof record.values.email === 'string' ? record.values.email : '')
    setDraftTitle('')
    setModal('meeting')
  }
  const activityRow = (activity: ActivityRow) => {
    const source = activitySource(activity)
    return <div key={activity.id} className="rp-act-row">
      <span className="rp-source-icon" title={source.title}><Icon name={source.icon} size={13} /></span>
      <span className="rp-act-txt"><b>{activityLabel(activity)}</b>{activity.notes ? ` · ${activity.notes}` : ''}</span>
      <span className="rp-act-when">{formatDay(activity.interaction_date)}</span>
    </div>
    /*
    {modal === 'compose' && <div className="scrim" onClick={() => setModal(null)}><div className="rm rm-email" onClick={event => event.stopPropagation()}><div className="rm-hd"><button className="rm-ico" onClick={() => setModal(null)}><Icon name="caretLeft" size={15} /></button><span className="rm-title"><Icon name="mailPlus" size={15} />Compose email</span><span className="rm-hd-r"><button className="rm-ico" onClick={() => { setModal(null); notify('minus', 'Minimized') }}><Icon name="minus" size={15} /></button><button className="rm-ico" onClick={() => setModal(null)} aria-label="Close dialog"><Icon name="x" size={15} /></button></span></div><div className="rm-email-body"><div className="rm-email-main"><div className="rm-email-row"><span className="lbl">From</span><span className="val"><Logo id={user?.user_metadata?.avatar_url || user?.email || 'A'} size={20} sq={false} />{user?.user_metadata?.full_name || user?.email || 'You'}</span></div><div className="rm-email-row"><span className="lbl">To</span><span className="val"><span className="rm-topill"><Icon name="chat" size={12} />Sending an individual email to 1 recipient</span></span><span className="rm-ccbcc">Cc / Bcc</span></div><div className="rm-email-row"><span className="lbl">Subject</span><input className="rm-subject" placeholder="Enter subject..." /></div><div className="rm-email-editor">Start typing your email, or create a template</div></div><div className="rm-email-side"><button className="rm-addrec" onClick={() => notify('users', 'Add recipients is a product stub')}><Icon name="plus" size={13} />Add recipients</button><div className="rm-rec"><Logo id={record.imageUrl || record.title} size={26} sq={false} /><div className="rm-rec-txt"><b>{record.title}</b><span>{String(record.values.email ?? '')}</span></div></div></div></div><div className="rm-email-info"><span><Icon name="status" size={13} />Delivery time will depend on items in your outbox. <a>Learn more</a></span><a className="rm-outbox">View outbox <Icon name="caretRight" size={11} /></a></div><div className="rm-email-toolbar"><span className="rm-tb-icons"><button className="rm-ico" onClick={() => notify('link', 'Attachment is a product stub')}><Icon name="link" size={15} /></button><button className="rm-ico" onClick={() => notify('image', 'Image is a product stub')}><Icon name="image" size={15} /></button><button className="rm-ico" onClick={() => notify('brackets', 'Variables are a product stub')}><Icon name="brackets" size={15} /></button><button className="rm-ico" onClick={() => notify('pencil', 'Templates are a product stub')}><Icon name="pencil" size={15} /></button></span><span className="rm-tb-r"><span className="rm-mass"><span className="tg on"><span className="knob" /></span>Mass sending <Icon name="status" size={12} /></span><button className="rm-ico" onClick={() => setModal(null)}><Icon name="trash" size={15} /></button><button className="btn btn-primary" onClick={() => notify('gmail', 'Send email needs Gmail send scope')}><Icon name="arrowRight" size={13} />Send emails (1)</button></span></div><div className="rm-email-quota"><b>200</b> Emails left this month on free plan. <a>Upgrade</a> for unlimited email sending.</div></div></div>}

    {modal === 'task' && <div className="scrim top" onClick={() => setModal(null)}><div className="rm rm-task" onClick={event => event.stopPropagation()}><div className="rm-hd sm"><span className="rm-title"><Icon name="checkcircle" size={15} />Create task</span><button className="rm-ico" onClick={() => setModal(null)} aria-label="Close dialog"><Icon name="x" size={15} /></button></div><div className="rm-task-body"><span className="rm-atchip">@{record.title}</span><input autoFocus className="rm-task-input" value={draftTitle} onChange={event => setDraftTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void createTask() }} /></div><div className="rm-task-foot"><button className="rm-chip"><Icon name="calendar" size={13} />Today</button><button className="rm-chip"><Icon name="users" size={13} />Assigned to You</button><button className="rm-chip"><Icon name="arrowUpRight" size={13} />1 linked record</button><span className="rm-spacer" /><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel <span className="kbd">ESC</span></button><button className="btn btn-primary" disabled={!draftTitle.trim()} onClick={() => void createTask()}>Save <span className="kbd">Cmd+Enter</span></button></div></div></div>}

    {modal === 'note' && <div className="scrim" onClick={() => setModal(null)}><div className="rm rm-note" onClick={event => event.stopPropagation()}><div className="rm-note-hd"><span className="rm-crumb"><Logo id={record.imageUrl || record.title} size={16} /><span>{record.title}</span></span><span className="rm-hd-r"><button className="rm-ico" onClick={() => { setModal(null); notify('minus', 'Minimized') }}><Icon name="minus" size={15} /></button><button className="rm-ico" onClick={() => setModal(null)} aria-label="Close dialog"><Icon name="x" size={15} /></button></span></div><div className="rm-note-toolbar"><Logo id={user?.user_metadata?.avatar_url || user?.email || 'A'} size={22} sq={false} /><button className="rm-note-link" onClick={() => notify('link', 'Note link copied')}><Icon name="link" size={13} />Copy link</button><button className="rm-ico"><Icon name="grip" size={15} /></button></div><div className="rm-note-body"><input autoFocus className="rm-note-title" placeholder="Untitled note" value={draftTitle} onChange={event => setDraftTitle(event.target.value)} /><div className="rm-note-chips"><span className="rm-chip static"><Logo id={record.imageUrl || record.title} size={13} />{record.title}</span><span className="rm-chip static"><Icon name="calendar" size={12} />Link a meeting</span></div><textarea className="rm-note-editor" placeholder="Start typing your note" value={draftBody} onChange={event => setDraftBody(event.target.value)} /><div className="rm-note-sec">FAVORITE TEMPLATES</div><div className="rm-note-muted">Templates that you favorite will appear here</div><div className="rm-note-sec">ACTIONS</div><button className="rm-note-act" onClick={() => notify('article', 'Templates are a product stub')}><Icon name="article" size={14} />View all templates</button></div><div className="rm-foot right"><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={() => void createNote()}>Save note</button></div></div></div>}

    {modal === 'meeting' && <div className="scrim" onClick={() => setModal(null)}><div className="rm rm-meeting" onClick={event => event.stopPropagation()}><div className="rm-hd"><span className="rm-title"><Icon name="calendar" size={15} />New meeting</span><button className="rm-ico" onClick={() => setModal(null)} aria-label="Close dialog"><Icon name="x" size={15} /></button></div><div className="rm-meeting-body"><input autoFocus className="rm-meeting-title" placeholder="Meeting title" value={draftTitle} onChange={event => setDraftTitle(event.target.value)} /><div className="rm-meeting-desc">Add a description</div><div className="rm-sec">Date and time</div><div className="rm-meeting-dt"><b>Today</b><input className="pill" type="time" value={meetingStart} onChange={event => setMeetingStart(event.target.value)} /><Icon name="arrowRight" size={13} /><input className="pill" type="time" value={meetingEnd} onChange={event => setMeetingEnd(event.target.value)} /></div><div className="rm-sec spread">Participants</div>{!meetingParticipant.trim() && <div className="rm-warn">At least two participants are required</div>}<div className="rm-part"><Logo id={user?.user_metadata?.avatar_url || user?.email || 'A'} size={26} sq={false} /><b>{user?.user_metadata?.full_name || user?.email || 'You'}</b><span className="rm-hostbadge">Host</span></div><div className="rm-part"><Logo id={record.imageUrl || record.title} size={26} sq={false} /><b>{record.title}</b><input className="rm-participant-input" type="email" value={meetingParticipant} onChange={event => setMeetingParticipant(event.target.value)} placeholder="Email address" /></div><div className="rm-sec spread">Linked records</div><div className="rm-part"><Logo id={record.imageUrl || record.title} size={22} /><b>{record.title}</b></div></div><div className="rm-foot"><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel <span className="kbd">ESC</span></button><button className="btn btn-primary" disabled={!draftTitle.trim() || !meetingParticipant.trim() || meetingEnd <= meetingStart} onClick={() => void createMeeting()}>Create meeting <span className="kbd">Cmd+Enter</span></button></div></div></div>}

    {modal === 'edit' && <div className="scrim" onClick={() => setModal(null)}><div className="rm rm-edit" onClick={event => event.stopPropagation()}><div className="rm-hd"><span className="rm-title"><Icon name="pencil" size={15} />Edit {object.singular_name}</span><button className="rm-ico" onClick={() => setModal(null)} aria-label="Close dialog"><Icon name="x" size={15} /></button></div><div className="rm-edit-body"><div className="rm-edit-head"><Logo id={record.imageUrl || record.title} size={30} sq={object.slug !== 'people'} /><h2>{record.title}</h2></div><p className="rm-edit-sub">Viewing all of the record details for <b>{record.title}</b></p><div className="rm-edit-fields">{detailAttributes.map(attribute => <RecordAttributeRow key={attribute.id} object={object} record={record} attribute={attribute} canWrite={canWrite} forceEdit onSave={saveAttribute} />)}</div></div><div className="rm-foot right"><button className="btn btn-primary" onClick={() => setModal(null)}>Finished editing <span className="kbd">Cmd+Enter</span></button></div></div></div>}

    {modal === 'add-list' && <div className="scrim" onClick={() => setModal(null)}><div className="modal sm" onClick={event => event.stopPropagation()}><div className="modal-hd"><Icon name="list" size={15} />Add to list<button className="x" onClick={() => setModal(null)} aria-label="Close dialog"><Icon name="x" size={15} /></button></div><div className="modal-bd">{lists.filter(list => (list.object_slug || 'people') === object.slug && !memberLists.some(member => member.id === list.id)).map(list => <button className="rec-item list-destination" key={list.id} onClick={async () => { if (!user || !recordId) return; await addCrmListEntries(user.id, list.id, object.slug, [recordId], list.stages[0]?.key ?? null); await loadRelated(); setModal(null); notify('list', `Added to ${list.name}`) }}><ListGlyph value={list.icon} /><span className="rname">{list.name}</span></button>)}{lists.filter(list => (list.object_slug || 'people') === object.slug && !memberLists.some(member => member.id === list.id)).length === 0 && <div className="pop-empty">No available lists for this record.</div>}</div><div className="modal-ft"><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={() => navigate(`/lists?new=1&object=${object.slug}`)}><Icon name="plus" size={12} />New list</button></div></div></div>}
    {toast && <div className="toast"><span className="em"><Icon name={toast.icon} size={13} /></span>{toast.text}</div>}
  </div>
}
    */
  }

  return <div className="rp handoff-record-detail">
    <div className="rp-cols">
      <div className="rp-left" style={{ width: leftWidth }}>
        <div className="rp-left-top">
          <button className="rp-x" onClick={() => navigate(objectListPath(object))} aria-label={`Close ${object.singular_name} record`}><Icon name="x" size={15} /></button>
          <span className="rp-nav">
            <button disabled={currentIndex <= 0} onClick={() => goToRecord(-1)} aria-label="Previous record"><Icon name="caretUp" size={11} /></button>
            <button disabled={currentIndex < 0 || currentIndex >= recordOrder.length - 1} onClick={() => goToRecord(1)} aria-label="Next record"><Icon name="caretDown" size={11} /></button>
          </span>
        </div>
        <div className="rp-header"><Logo id={record.imageUrl || record.title} size={24} sq={object.slug !== 'people'} /><h1>{record.title}</h1><button className="rp-hicon" title="Edit record" onClick={() => setModal('edit')}><Icon name="pencil" size={13} /></button><button className="rp-hicon" title="Favorite" onClick={() => notify('star', 'Added to favorites')}><Icon name="star" size={15} /></button></div>
        <div className="rp-actions"><button className="rp-act-btn" onClick={() => setModal('compose')}><Icon name="chat" size={13} />Compose email</button><button className="rp-act-btn" onClick={() => setModal('add-list')}><Icon name="list" size={13} />Add to list</button><button className="rp-ico-btn sm" title="New note" onClick={() => setModal('note')}><Icon name="article" size={13} /></button><button className="rp-ico-btn sm" title="Run workflow" onClick={() => notify('relation', 'Run workflow is a product stub')}><Icon name="relation" size={13} /></button><button className="rp-ico-btn sm" title="New task" onClick={() => setModal('task')}><Icon name="checkcircle" size={13} /></button></div>
        <div className="rp-left-scroll">
          {leftMode === 'search' ? <>
            <div className="rp-panel-hd"><button className="rp-collapse" onClick={() => { setLeftMode('details'); setQuery('') }} aria-label="Back to record details"><Icon name="caretLeft" size={13} /></button><div className="pop-search" style={{ flex: 1, border: '1px solid var(--border-1)', borderRadius: 'var(--rc)' }}><span className="ico"><Icon name="search" size={13} /></span><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search attributes..." /></div></div>
            <div className="rp-attrlist">{searchAttributes.length ? searchAttributes.map(attribute => <RecordAttributeRow key={attribute.id} object={object} record={record} attribute={attribute} canWrite={canWrite} onSave={saveAttribute} />) : <div className="pop-empty">No matching attributes.</div>}</div>
          </> : <>
            <div className="rp-sec-hd" onClick={() => setDetailsCollapsed(value => !value)}><span>Record Details</span><Icon name="caretDown" size={11} style={{ transform: detailsCollapsed ? 'rotate(-90deg)' : undefined }} /></div>
            {!detailsCollapsed && <><div className="rp-attrlist">{detailAttributes.map(attribute => object.slug === 'companies' && attribute.key === 'team' ? <div key={attribute.id} className="rp-attr-row"><span className="rp-attr-lbl"><Icon name="users" size={13} />{attribute.name}</span><span className="rp-attr-val"><TeamInlineValue people={team} onOpenTeam={() => setTab('team')} onOpenPerson={openPersonRecord} /></span></div> : <RecordAttributeRow key={attribute.id} object={object} record={record} attribute={attribute} canWrite={canWrite} onSave={saveAttribute} />)}</div><button className="rp-viewall" onClick={() => setLeftMode('search')}>View all values</button></>}
            <div className="rp-sec-hd border" onClick={() => setListsCollapsed(value => !value)}><span>Lists <b className="n">{memberLists.length}</b></span><span className="rp-sec-acts" onClick={event => event.stopPropagation()}><button title="View settings" onClick={() => notify('gear', 'List view settings')}><Icon name="gear" size={13} /></button><button title="Add to list" onClick={() => setModal('add-list')}><Icon name="plus" size={13} /></button><Icon name="caretDown" size={11} style={{ transform: listsCollapsed ? 'rotate(-90deg)' : undefined }} /></span></div>
            {!listsCollapsed && (memberLists.length === 0 ? <div className="rp-none">This record has not been added to any lists</div> : memberLists.map(list => <div key={list.entryId} className="rp-list-card"><div className="rp-list-hd"><ListGlyph value={list.icon} /><span className="rp-list-name" onClick={() => navigate(`/lists/${list.id}`)}>{list.name}</span><span className="rp-list-when">{formatDay(list.entered_at)}</span><span className="rp-list-icons"><button className="rp-lc-ico" title="Relationship"><Icon name="relation" size={13} /></button><button className="rp-lc-ico" title="Options" onClick={() => setListMenuId(value => value === list.entryId ? null : list.entryId)}><Icon name="dots" size={14} /></button></span></div><div className="rp-attr-row"><span className="rp-attr-lbl"><Icon name="status" size={13} />Stage</span><span className="rp-attr-val"><span className="rp-stage-plain"><span className="dot" />{list.current_stage}</span></span></div>{listMenuId === list.entryId && <div className="rp-inline-menu"><button onClick={() => { setListMenuId(null); notify('grid', 'Manage attributes is a product stub') }}><Icon name="grid" size={13} />Manage attributes</button><button className="danger" onClick={async () => { await supabase.from('crm_list_entries').delete().eq('id', list.entryId); setListMenuId(null); await loadRelated() }}><Icon name="trash" size={13} />Remove from list</button></div>}</div>))}
            {object.slug === 'companies' && <><div className="rp-sec-hd border"><span>Contract</span><Icon name="caretDown" size={11} /></div><div className="rp-attr-row"><span className="rp-attr-lbl"><Icon name="dollar" size={13} />Associated deals</span><span className="rp-attr-val">{relatedDeals[0] ? <button className="rec-chip" onClick={() => navigate(`/deals/record/${relatedDeals[0].id}`)}><span className="rec-chip-ico"><Icon name="dollar" size={9} /></span>{relatedDeals[0].title}</button> : <span className="rp-empty-val">Set a value...</span>}</span></div></>}
          </>}
        </div>
      </div>
      <div className="rp-divider" onMouseDown={event => { const startX = event.clientX; const start = leftWidth; const move = (next: MouseEvent) => setLeftWidth(Math.max(320, Math.min(640, start + next.clientX - startX))); const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up) }; document.addEventListener('mousemove', move); document.addEventListener('mouseup', up) }}><span className="rp-divider-line" /></div>
      <div className="rp-right">
        <div className="rp-tabs" ref={tabsRef}>{shownTabs.map(item => <button key={item.key} className={`rp-tab${tab === item.key ? ' on' : ''}`} onClick={() => { setTab(item.key); setMoreTabsOpen(false) }}><Icon name={item.icon} size={13} />{item.label}{item.count !== undefined && <span className="rp-tab-n">{item.count}</span>}</button>)}{hiddenTabs.length > 0 && <button className={`rp-tab rp-tab-more${moreTabsOpen ? ' on' : ''}`} onClick={() => setMoreTabsOpen(value => !value)}>+{hiddenTabs.length} more<Icon name="caretDown" size={11} /></button>}</div>
        {moreTabsOpen && <div className="pop rp-tabs-pop">{hiddenTabs.map(item => <button key={item.key} className="pop-item" onClick={() => { setTab(item.key); setMoreTabsOpen(false) }}><span className="ico"><Icon name={item.icon} size={13} /></span><span className="lbl">{item.label}</span>{item.count !== undefined && <span className="rp-tab-n">{item.count}</span>}</button>)}</div>}
        <div className="rp-main">
          {tab === 'overview' && <><div className="rp-h-row"><h2>Highlights</h2></div><div className="rp-highlights-grid">{highlights.map(item => <div className="rp-hi-card" key={item.label}><div className="rp-hi-top"><span>{item.label}</span><Icon name={item.icon} size={14} /></div>{item.people?.length ? <div className="rp-hi-people">{item.people.map(person => <button type="button" className="rp-person-chip rp-person-chip-btn" key={person.id} onClick={() => openPersonRecord(person.id)}><Logo id={person.imageUrl || person.name} size={18} sq={false} /><span className="pn">{person.name}</span></button>)}</div> : <div className={`rp-hi-val${item.muted ? ' muted' : ''}`}>{item.color && <span className="sq" style={{ background: item.color }} />}{item.currency && typeof item.value === 'number' ? currencyText(item.value) : String(item.value ?? '—')}</div>}</div>)}</div><div className="rp-h-row"><h2>Activity</h2><button className="rp-viewall-r" onClick={() => setTab('activity')}>View all</button></div><div className="rp-activity-feed">{activities.length ? activities.slice(0, 3).map(activityRow) : <div className="rp-none">No activity captured yet.</div>}</div>{displayNotes.length > 0 && <><div className="rp-h-row"><h2>Notes<span className="rp-h-n">{displayNotes.length}</span></h2></div><div className="rp-line-list">{displayNotes.slice(0, 3).map(note => <button type="button" className="rp-line-row note" key={note.id} onClick={() => setOpenNote(note)}><Icon name="article" size={14} /><span className="rp-line-title">{note.title}</span><span className="rp-line-sub">{notePreview(note.body)}</span><span className="rp-line-when">{formatDay(note.created_at)}</span></button>)}</div></>}{tasks.length > 0 && <><div className="rp-h-row"><h2>Tasks<span className="rp-h-n">{tasks.length}</span></h2></div><div className="rp-line-list">{tasks.slice(0, 4).map(task => <div className="rp-line-row" key={task.id}><span className={`cb cbr${task.completed ? ' on' : ''}`}>{task.completed && <Icon name="check" size={10} />}</span><span className="rp-line-title task">{task.text}</span><span className="rp-line-today"><Icon name="calendar" size={11} />{task.date ? formatDay(task.date) : 'Backlog'}</span></div>)}</div></>}</>}
          {tab === 'deals' && <>{relatedDeals.length ? <><div className="rp-tabhd"><h2>Deals</h2><button className="rp-tab-btn ghost" onClick={() => notify('gear', 'Related view settings')}><Icon name="gear" size={13} /></button></div><div className="rp-rel-list">{relatedDeals.map(deal => <div className="rp-rel-row" key={deal.id} onClick={() => navigate(`/deals/record/${deal.id}`)}><Logo id={deal.imageUrl || deal.title} size={20} /><span className="rp-rel-name">{deal.title}</span><span className="rp-rel-tag"><Icon name="tag" size={10} />{deal.stage || 'No stage'}</span><span className="rp-rel-amt">{deal.estimated_value == null ? '—' : currencyText(deal.estimated_value)}</span><span className="rp-rel-date"><Icon name="clock" size={11} />{deal.target_date ? formatDay(deal.target_date) : 'No date'}</span></div>)}</div></> : <><div className="rp-tabhd"><h2>Deals</h2></div><EmptyState icon="link" title="No Deals found" sub="There are no related records for this relationship." cta="Add Deal" onCta={() => navigate('/deals/view/all')} /></>}</>}
          {tab === 'activity' && <><div className="rp-tabhd"><h2>Activity</h2><span className="rp-tabhd-r"><button className="rp-tab-btn ghost" onClick={() => notify('grid', 'Activity view settings')}><Icon name="grid" size={13} />View settings</button><button className="rp-tab-btn" onClick={openMeeting}><Icon name="plus" size={13} />Add meeting</button></span></div>{activities.length ? <div className="rp-act-group"><div className="rp-act-glabel">This week</div>{activities.map(activityRow)}</div> : <EmptyState icon="activity" title="No activity yet" sub="Interactions and record updates will show up here." />}</>}
          {tab === 'emails' && <><div className="rp-tabhd"><h2>Emails</h2><button className="rp-tab-btn ghost" onClick={() => notify('lock', 'Manage access is a product stub')}><Icon name="lock" size={12} />Manage access <span className="pro">Pro</span></button></div><EmptyState icon="chat" title="No emails" sub="This record doesn't have any emails, or they may be hidden due to permissions." cta="Compose email" onCta={() => setModal('compose')} /></>}
          {tab === 'calls' && <><div className="rp-tabhd"><h2>Calls</h2></div><EmptyState icon="clock" title="No calls yet" sub="Call recordings and transcripts for this record will show up here." /></>}
          {tab === 'team' && <>{team.length ? <><div className="rp-tabhd"><h2>Team</h2><button className="rp-tab-btn ghost" onClick={() => notify('gear', 'Related view settings')}><Icon name="gear" size={13} /></button></div><div className="rp-rel-list">{team.map(person => <button type="button" className="rp-team-row" key={person.id} onClick={() => openPersonRecord(person.id)}><Logo id={person.imageUrl || person.name} size={22} sq={false} /><span className="rp-rel-name">{person.name}</span>{person.company && <span className="rp-team-email">{person.company}</span>}{person.subtitle && <span className="rp-rel-tag">{person.subtitle}</span>}</button>)}</div></> : <><div className="rp-tabhd"><h2>Team</h2></div><EmptyState icon="users" title="No Team found" sub="There are no related records for this relationship." /></>}</>}
          {tab === 'notes' && <>{displayNotes.length ? <><div className="rp-tabhd"><h2>Notes</h2><button className="rp-tab-btn" onClick={() => setModal('note')}><Icon name="plus" size={13} />Create note</button></div><div className="rp-line-list">{displayNotes.map(note => <button type="button" className="rp-line-row note" key={note.id} onClick={() => setOpenNote(note)}><Icon name="article" size={14} /><span className="rp-line-title">{note.title}</span><span className="rp-line-sub">{notePreview(note.body)}</span><span className="rp-line-when">{formatDay(note.created_at)}</span></button>)}</div></> : <EmptyState icon="article" title="No notes" sub="Add a note to keep track of important details." cta="New note" onCta={() => setModal('note')} />}</>}
          {tab === 'tasks' && <>{tasks.length ? <><div className="rp-tabhd"><h2>Tasks</h2><button className="rp-tab-btn" onClick={() => setModal('task')}><Icon name="plus" size={13} />Add task</button></div><div className="rp-line-list">{tasks.map(task => <div className="rp-line-row" key={task.id}><button className={`cb cbr${task.completed ? ' on' : ''}`} onClick={async () => { await supabase.from('todos').update({ completed: !task.completed }).eq('id', task.id); await loadRelated() }} aria-label={`${task.completed ? 'Mark incomplete' : 'Mark complete'}: ${task.text}`}>{task.completed && <Icon name="check" size={10} />}</button><span className="rp-line-title task">{task.text}</span><span className="rp-line-today"><Icon name="calendar" size={11} />{task.date ? formatDay(task.date) : 'Backlog'}</span></div>)}</div></> : <EmptyState icon="checkcircle" title="No tasks" sub="Create a task to track follow-ups on this record." cta="Add task" onCta={() => setModal('task')} />}</>}
          {tab === 'files' && <><div className="rp-tabhd"><h2>Files</h2><span className="rp-tabhd-r"><button className="rp-tab-btn" onClick={() => notify('folder', 'New folder is a product stub')}><Icon name="plus" size={13} />New folder</button><button className="rp-tab-btn" onClick={() => notify('file', 'File upload is a product stub')}><Icon name="plus" size={13} />Upload file</button></span></div><EmptyState icon="folder" title="No files" sub="Drag a file here or choose one from your computer." /></>}
        </div>
      </div>
    </div>
    {modal === 'compose' && <div className="scrim" onClick={() => setModal(null)}>
      <div className="rm rm-email" onClick={event => event.stopPropagation()}>
        <div className="rm-hd"><button className="rm-ico" onClick={() => setModal(null)} aria-label="Back from compose"><Icon name="caretLeft" size={15} /></button><span className="rm-title"><Icon name="mailPlus" size={15} />Compose email</span><span className="rm-hd-r"><button className="rm-ico" aria-label="Minimize composer"><Icon name="minus" size={15} /></button><button className="rm-ico" onClick={() => setModal(null)} aria-label="Close dialog"><Icon name="x" size={15} /></button></span></div>
        <div className="rm-email-body"><div className="rm-email-main"><div className="rm-email-row"><span className="lbl">From</span><span className="val"><Logo id={user?.user_metadata?.avatar_url || user?.email || 'A'} size={20} sq={false} />{user?.user_metadata?.full_name || user?.email || 'You'}</span></div><div className="rm-email-row"><span className="lbl">To</span><span className="val"><span className="rm-topill"><Icon name="chat" size={12} />Sending an individual email to 1 recipient</span></span><span className="rm-ccbcc">Cc / Bcc</span></div><div className="rm-email-row"><span className="lbl">Subject</span><input className="rm-subject" placeholder="Enter subject..." /></div><div className="rm-email-editor">Start typing your email, or create a template</div></div><div className="rm-email-side"><button className="rm-addrec" onClick={() => notify('users', 'Add recipients is a product stub')}><Icon name="plus" size={13} />Add recipients</button><div className="rm-rec"><Logo id={record.imageUrl || record.title} size={26} sq={false} /><div className="rm-rec-txt"><b>{record.title}</b><span>{String(record.values.email ?? '')}</span></div></div></div></div>
        <div className="rm-email-info"><span><Icon name="status" size={13} />Delivery time will depend on items in your outbox. <a>Learn more</a></span><a className="rm-outbox">View outbox <Icon name="caretRight" size={11} /></a></div>
        <div className="rm-email-toolbar"><span className="rm-tb-icons"><button className="rm-ico" aria-label="Attach link"><Icon name="link" size={15} /></button><button className="rm-ico" aria-label="Attach image"><Icon name="image" size={15} /></button><button className="rm-ico" aria-label="Insert variable"><Icon name="brackets" size={15} /></button><button className="rm-ico" aria-label="Open templates"><Icon name="pencil" size={15} /></button></span><span className="rm-tb-r"><span className="rm-mass"><span className="tg on"><span className="knob" /></span>Mass sending <Icon name="status" size={12} /></span><button className="rm-ico" onClick={() => setModal(null)} aria-label="Discard draft"><Icon name="trash" size={15} /></button><button className="btn btn-primary" onClick={() => notify('gmail', 'Send email needs Gmail send scope')}><Icon name="arrowRight" size={13} />Send emails (1)</button></span></div>
        <div className="rm-email-quota"><b>200</b> Emails left this month on free plan. <a>Upgrade</a> for unlimited email sending.</div>
      </div>
    </div>}
    {modal === 'task' && <div className="scrim top" onClick={() => setModal(null)}><div className="rm rm-task" onClick={event => event.stopPropagation()}><div className="rm-hd sm"><span className="rm-title"><Icon name="checkcircle" size={15} />Create task</span><button className="rm-ico" onClick={() => setModal(null)} aria-label="Close dialog"><Icon name="x" size={15} /></button></div><div className="rm-task-body"><span className="rm-atchip">@{record.title}</span><input autoFocus className="rm-task-input" value={draftTitle} onChange={event => setDraftTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void createTask() }} /></div><div className="rm-task-foot"><button className="rm-chip"><Icon name="calendar" size={13} />Today</button><button className="rm-chip"><Icon name="users" size={13} />Assigned to You</button><button className="rm-chip"><Icon name="arrowUpRight" size={13} />1 linked record</button><span className="rm-spacer" /><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel <span className="kbd">ESC</span></button><button className="btn btn-primary" disabled={!draftTitle.trim()} onClick={() => void createTask()}>Save <span className="kbd">Cmd+Enter</span></button></div></div></div>}
    {modal === 'note' && <div className="scrim" onClick={() => setModal(null)}><div className="rm rm-note" onClick={event => event.stopPropagation()}><div className="rm-note-hd"><span className="rm-crumb"><Logo id={record.imageUrl || record.title} size={16} /><span>{record.title}</span></span><span className="rm-hd-r"><button className="rm-ico" aria-label="Minimize note"><Icon name="minus" size={15} /></button><button className="rm-ico" onClick={() => setModal(null)} aria-label="Close dialog"><Icon name="x" size={15} /></button></span></div><div className="rm-note-toolbar"><Logo id={user?.email || 'A'} size={22} sq={false} /><button className="rm-note-link"><Icon name="link" size={13} />Copy link</button><button className="rm-ico" aria-label="Move note"><Icon name="grip" size={15} /></button></div><div className="rm-note-body"><input autoFocus className="rm-note-title" placeholder="Untitled note" value={draftTitle} onChange={event => setDraftTitle(event.target.value)} /><div className="rm-note-chips"><span className="rm-chip static"><Logo id={record.imageUrl || record.title} size={13} />{record.title}</span><span className="rm-chip static"><Icon name="calendar" size={12} />Link a meeting</span></div><textarea className="rm-note-editor" placeholder="Start typing your note" value={draftBody} onChange={event => setDraftBody(event.target.value)} /><div className="rm-note-sec">FAVORITE TEMPLATES</div><div className="rm-note-muted">Templates that you favorite will appear here</div></div><div className="rm-foot right"><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={() => void createNote()}>Save note</button></div></div></div>}
    {openNote && <div className="scrim" onClick={() => setOpenNote(null)}><div className="rm rm-note rm-note-view" onClick={event => event.stopPropagation()}><div className="rm-note-hd"><span className="rm-crumb"><Logo id={record.imageUrl || record.title} size={16} /><span>{record.title}</span></span><span className="rm-hd-r"><button className="rm-ico" onClick={() => notify('link', 'Note link copied')}><Icon name="link" size={15} /></button><button className="rm-ico" onClick={() => setOpenNote(null)} aria-label="Close note"><Icon name="x" size={15} /></button></span></div><div className="rm-note-toolbar"><Logo id={user?.email || 'A'} size={22} sq={false} /><span className="rm-note-date"><Icon name="calendar" size={12} />{formatDay(openNote.created_at)}</span></div><div className="rm-note-body"><h1 className="rm-note-title view">{openNote.title}</h1><div className="rm-note-chips"><span className="rm-chip static"><Logo id={record.imageUrl || record.title} size={13} />{record.title}</span></div><div className="rm-note-md">{renderMarkdownNote(openNote.body)}</div></div></div></div>}
    {modal === 'meeting' && <div className="scrim" onClick={() => setModal(null)}><div className="rm rm-meeting" onClick={event => event.stopPropagation()}><div className="rm-hd"><span className="rm-title"><Icon name="calendar" size={15} />New meeting</span><button className="rm-ico" onClick={() => setModal(null)} aria-label="Close dialog"><Icon name="x" size={15} /></button></div><div className="rm-meeting-body"><input autoFocus className="rm-meeting-title" placeholder="Meeting title" value={draftTitle} onChange={event => setDraftTitle(event.target.value)} /><div className="rm-meeting-desc">Add a description</div><div className="rm-sec">Date and time</div><div className="rm-meeting-dt"><b>Today</b><input className="pill" type="time" value={meetingStart} onChange={event => setMeetingStart(event.target.value)} /><Icon name="arrowRight" size={13} /><input className="pill" type="time" value={meetingEnd} onChange={event => setMeetingEnd(event.target.value)} /></div><div className="rm-sec spread">Participants</div>{!meetingParticipant.trim() && <div className="rm-warn">At least two participants are required</div>}<div className="rm-part"><Logo id={user?.email || 'A'} size={26} sq={false} /><b>{user?.user_metadata?.full_name || user?.email || 'You'}</b><span className="rm-hostbadge">Host</span></div><div className="rm-part"><Logo id={record.imageUrl || record.title} size={26} sq={false} /><b>{record.title}</b><input className="rm-participant-input" type="email" value={meetingParticipant} onChange={event => setMeetingParticipant(event.target.value)} placeholder="Email address" /></div><div className="rm-sec spread">Linked records</div><div className="rm-part"><Logo id={record.imageUrl || record.title} size={22} /><b>{record.title}</b></div></div><div className="rm-foot"><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel <span className="kbd">ESC</span></button><button className="btn btn-primary" disabled={!draftTitle.trim() || !meetingParticipant.trim() || meetingEnd <= meetingStart} onClick={() => void createMeeting()}>Create meeting <span className="kbd">Cmd+Enter</span></button></div></div></div>}
    {modal === 'edit' && <div className="scrim" onClick={() => setModal(null)}><div className="rm rm-edit" onClick={event => event.stopPropagation()}><div className="rm-hd"><span className="rm-title"><Icon name="pencil" size={15} />Edit {object.singular_name}</span><button className="rm-ico" onClick={() => setModal(null)} aria-label="Close dialog"><Icon name="x" size={15} /></button></div><div className="rm-edit-body"><div className="rm-edit-head"><Logo id={record.imageUrl || record.title} size={30} sq={object.slug !== 'people'} /><h2>{record.title}</h2></div><p className="rm-edit-sub">Viewing all of the record details for <b>{record.title}</b></p><div className="rm-edit-fields">{detailAttributes.map(attribute => <RecordAttributeRow key={attribute.id} object={object} record={record} attribute={attribute} canWrite={canWrite} forceEdit onSave={saveAttribute} />)}</div></div><div className="rm-foot right"><button className="btn btn-primary" onClick={() => setModal(null)}>Finished editing <span className="kbd">Cmd+Enter</span></button></div></div></div>}
    {modal === 'add-list' && <div className="scrim" onClick={() => setModal(null)}><div className="modal sm" onClick={event => event.stopPropagation()}><div className="modal-hd"><Icon name="list" size={15} />Add to list<button className="x" onClick={() => setModal(null)} aria-label="Close dialog"><Icon name="x" size={15} /></button></div><div className="modal-bd">{lists.filter(list => (list.object_slug || 'people') === object.slug && !memberLists.some(member => member.id === list.id)).map(list => <button className="rec-item list-destination" key={list.id} onClick={async () => { if (!user || !recordId) return; await addCrmListEntries(user.id, list.id, object.slug, [recordId], list.stages[0]?.key ?? null); await loadRelated(); setModal(null); notify('list', `Added to ${list.name}`) }}><ListGlyph value={list.icon} /><span className="rname">{list.name}</span></button>)}{lists.filter(list => (list.object_slug || 'people') === object.slug && !memberLists.some(member => member.id === list.id)).length === 0 && <div className="pop-empty">No available lists for this record.</div>}</div><div className="modal-ft"><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={() => navigate(`/lists?new=1&object=${object.slug}`)}><Icon name="plus" size={12} />New list</button></div></div></div>}
    {toast && <div className="toast"><span className="em"><Icon name={toast.icon} size={13} /></span>{toast.text}</div>}
  </div>
}
