// Today — daily cockpit, rebuilt to the reThink design bundle.
// Planner = time-block calendar + unscheduled todos, wired to live Supabase data.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Archive, ArrowCounterClockwise, ArrowDown, CalendarBlank, CalendarDots, Check, ChartLineUp, MoonStars, Pause, PencilSimple, Play, Plus, Repeat, SidebarSimple, Star, Target, Timer, TrashSimple, X } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { syncJobApplicationsFromGmail } from '@/lib/jobApplications'
import type { Todo, Milestone, Goal, Review, TodoContentSegment, TodoMentionKind, ContactStatus, Habit, HabitLog, WeeklyHabit, WeeklyHabitLog } from '@/types'
import MilestonePanel from '@/components/MilestonePanel'
import DayStartDrawer from '@/components/DayStartDrawer'
import FocusTimer from './today/FocusTimer'
import DayCalendar from './today/DayCalendar'
import TodoScheduleList from './today/TodoScheduleList'
import RightRail, { type RailSectionDef } from './today/RightRail'
import MilestoneRows, { type MilestoneRowData } from './today/MilestoneRows'
import ThisWeek from './today/ThisWeek'
import { useFocusTimer } from './today/useFocusTimer'
import type { Mention, TodoMilestoneOption } from './today/types'
import { companyImage, createCrmObject, firstRelation, mentionFromCompany, mentionFromContact, mentionFromOpportunity, pathForMention } from '@/lib/crmObjects'
import TodayHandoffView, { editorSegmentsToTodo, editorText, type TodayCalendarEvent, type TodayFunnelStage, type TodayGoalStat } from './today/TodayHandoffView'
import type { EditorMeta } from './today/TodayHandoffEditor'
import type { TodayIconName } from './today/TodayIcons'
import { CloseDayFlow, type CloseDayStats } from './today/TodayOverlays'
import { metricForOutreachEvent, type OutreachMetricId } from './today/outreachMetrics'
import { GOOGLE_OAUTH_SCOPES_STRING, markGoogleDriveScopeRequested } from '@/lib/googleDrive'
import {
  RecurringForm,
  RecurringPanel,
  ScopeMenu,
  loadRecurSeries,
  minToHHMM,
  recNid,
  saveRecurSeries,
  seriesAppliesOn,
  type RecurringFormFields,
  type RecurringFormMode,
  type RecurringScope,
  type RecurringScopeAction,
  type RecurringSeries,
} from './today/Recurring'

function fmtClock(seconds: number): string {
  const m = Math.floor(seconds / 60), s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

type GoalLite = Pick<Goal, 'id' | 'text' | 'alias' | 'color' | 'emoji'>
interface MsTodo { id: string; milestone_id: string | null; completed: boolean }
interface TodoLinks {
  contactId?: string | null
  companyId?: string | null
  opportunityId?: string | null
}
interface RelationCompany {
  id: string
  name?: string | null
  logo_url?: string | null
  favicon_url?: string | null
  domain?: string | null
}
interface OpportunityMentionRow {
  id: string
  title: string | null
  stage?: string | null
  type?: string | null
  applied_at?: string | null
  company_id?: string | null
  company?: RelationCompany | RelationCompany[] | null
}
interface ContactMentionRow {
  id: string
  name: string
  profile_photo_url: string | null
  company: string | null
  job_title: string | null
  email: string | null
  status?: ContactStatus | null
}
type TodayReviewRow = Pick<Review, 'notes' | 'one_thing' | 'one_thing_done' | 'energy_level' | 'tomorrow_focus' | 'tomorrow_reviewed' | 'day_locked_at'> & {
  objective_link_kind?: Mention['kind'] | null
  objective_link_id?: string | null
  objective_link_label?: string | null
  objective_link_logo?: string | null
  today_close_summary?: DayCloseSummary | null
}
interface ClosedTodoState {
  id: string
  destination: 'tomorrow' | 'backlog'
  mustDo: boolean
  start: number | null
  duration: number | null
}
interface DayCloseSummary {
  removedTodoIds: string[]
  removedBacklogIds?: string[]
  plannedItems?: Array<{ id: string; text: string; src: 'pending' | 'backlog' | 'new' }>
  carriedCount: number
  clearedCount: number
  completedCount: number
  pendingCount: number
  energyLevel: number | null
  goalDone: boolean | null
  tomorrowGoal?: string
  movedItems?: ClosedTodoState[]
}
interface RecurringFormState {
  mode: RecurringFormMode
  initial?: Partial<RecurringFormFields>
  itemId?: string
  isScheduled?: boolean
  seriesId?: string
}
interface ScopeMenuState {
  item: Todo
  isScheduled: boolean
  seriesId: string
  rect: DOMRect
}
interface ToastState {
  icon: TodayIconName
  text: string
  actionLabel?: string
  onAction?: () => void
}
interface OutreachMetricCounts extends Record<OutreachMetricId, number> {
  reached: number
  accepted: number
  replies: number
  meetings: number
  intros: number
}
interface GoalMetric {
  id: 'apps' | 'gym'
  value: number
  target: number
  source: 'habit' | 'weekly' | 'opportunities' | null
  habitId: string | null
  logId: string | null
  logValue: number
}
interface OutreachEventRow {
  id: string
  event_type: string
  occurred_on: string
  contact_id: string | null
  contact?: { id: string; name: string; profile_photo_url: string | null; job_title: string | null; company: string | null } | Array<{ id: string; name: string; profile_photo_url: string | null; job_title: string | null; company: string | null }> | null
}
type GoogleCalendarAttendee = { displayName?: string; email?: string; self?: boolean; responseStatus?: string }
type GoogleCalendarItem = {
  id?: string
  summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: GoogleCalendarAttendee[]
  hangoutLink?: string
  conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string; label?: string }> }
  location?: string
}
const FUNNEL_PARTNER_EMAILS = new Set(['majose.zuniga@gmail.com'])
const FUNNEL_PARTNER_NAME_TOKEN_SETS = [
  ['maria', 'jose', 'zuniga'],
  ['maria', 'jose'],
]
const CALENDAR_FYI_PREFIX = 'rethink.today.calendarFyi'
interface TodoDayHistoryRow {
  todo_id: string
  snapshot: Todo
}
type FunnelTargets = Record<keyof OutreachMetricCounts, { day: number; week: number }>
interface RecurringSeriesRow {
  id: string
  user_id: string
  name: string
  duration_minutes: number
  time_minutes: number | null
  days: number[]
  start_date: string
  end_type: 'never' | 'date' | 'count'
  end_date: string | null
  end_count: number | null
  active: boolean
}

const FALLBACK_COLORS = ['#3E7A4E', '#536471', '#7A3E68', '#3E5F7A', '#9A6B4F']

function shouldFallbackWithoutContentSegments(error: { message?: string; code?: string } | null) {
  if (!error) return false
  return /content_segments|schema cache|column .*does not exist/i.test(`${error.code ?? ''} ${error.message ?? ''}`)
}

function legacyTextFromContentSegments(segments: TodoContentSegment[], fallback: string) {
  if (!segments.some(segment => segment.type !== 'text')) return fallback
  return segments.map(segment => {
    if (segment.type === 'text') return segment.text
    if (segment.type === 'mention') return `[[mention:${segment.kind}:${segment.id}]]`
    return segment.label
  }).join('').replace(/\s{2,}/g, ' ').trim()
}

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function significantNameTokens(value: string | null | undefined) {
  return normalizeSearchText(value).split(' ').filter(token => token.length >= 3)
}

function attendeeEmail(attendee: GoogleCalendarAttendee) {
  return attendee.email?.trim().toLowerCase() ?? ''
}

function activeCalendarAttendees(event: GoogleCalendarItem) {
  return (event.attendees ?? []).filter(attendee => attendee.responseStatus !== 'declined')
}

function isFunnelPartnerEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase() ?? ''
  if (!normalized) return false
  if (FUNNEL_PARTNER_EMAILS.has(normalized)) return true
  const [local, domain] = normalized.split('@')
  return domain === 'babson.edu' && /zuniga/.test(local)
}

function isFunnelPartnerName(value: string | null | undefined) {
  const tokens = significantNameTokens(value)
  return FUNNEL_PARTNER_NAME_TOKEN_SETS.some(requiredTokens => requiredTokens.every(token => tokens.includes(token)))
}

function isFunnelPartnerAttendee(attendee: GoogleCalendarAttendee) {
  return isFunnelPartnerEmail(attendee.email) || isFunnelPartnerName(attendee.displayName)
}

function isFunnelPartnerContact(contact: ContactMentionRow) {
  return isFunnelPartnerEmail(contact.email) || isFunnelPartnerName(contact.name)
}

function isSelfCalendarAttendee(attendee: GoogleCalendarAttendee, selfEmails: Set<string>) {
  const email = attendeeEmail(attendee)
  return Boolean(attendee.self || (email && selfEmails.has(email)))
}

function hasExternalCalendarAttendee(event: GoogleCalendarItem, selfEmails: Set<string>) {
  return activeCalendarAttendees(event).some(attendee => (
    !isSelfCalendarAttendee(attendee, selfEmails) && !isFunnelPartnerAttendee(attendee)
  ))
}

function isPartnerOnlySharedCalendarEvent(event: GoogleCalendarItem, selfEmails: Set<string>) {
  const attendees = activeCalendarAttendees(event)
  if (!attendees.length) return false
  const hasPartner = attendees.some(isFunnelPartnerAttendee)
  return hasPartner && attendees.every(attendee => (
    isSelfCalendarAttendee(attendee, selfEmails) || isFunnelPartnerAttendee(attendee)
  ))
}

function calendarFyiStorageKey(userId: string) {
  return `${CALENDAR_FYI_PREFIX}:${userId}`
}

function loadCalendarFyiIds(userId: string | null | undefined) {
  if (!userId) return new Set<string>()
  try {
    const parsed = JSON.parse(localStorage.getItem(calendarFyiStorageKey(userId)) || '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set<string>()
  }
}

function saveCalendarFyiIds(userId: string, ids: Set<string>) {
  localStorage.setItem(calendarFyiStorageKey(userId), JSON.stringify([...ids]))
}

function googleEventIdFromCalendarBlockId(id: string) {
  return id.startsWith('gcal-') ? id.slice(5) : id
}

function contactMatchesCalendarEvent(contact: ContactMentionRow, event: GoogleCalendarItem): 'email' | 'attendee_name' | 'title_name' | 'title_company' | null {
  const attendees = event.attendees ?? []
  const email = contact.email?.toLowerCase()
  if (email && attendees.some(attendee => !attendee.self && attendee.email?.toLowerCase() === email)) return 'email'

  const contactTokens = significantNameTokens(contact.name)
  if (contactTokens.length >= 2) {
    const attendeeNames = attendees
      .filter(attendee => !attendee.self)
      .map(attendee => normalizeSearchText(attendee.displayName || attendee.email))
    if (attendeeNames.some(name => contactTokens.every(token => name.includes(token)))) return 'attendee_name'
  }

  const title = normalizeSearchText(event.summary)
  if (title && contactTokens.length >= 2 && contactTokens.every(token => title.includes(token))) return 'title_name'
  const companyTokens = significantNameTokens(contact.company)
  if (title && companyTokens.length && companyTokens.every(token => title.includes(token))) return 'title_company'
  return null
}

function clampMinutes(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function hasTodoDragPayload(types: DOMStringList | readonly string[]) {
  return Array.from(types).includes('text/todo-id') || Array.from(types).includes('text/plain')
}

function todoIdFromDrag(dataTransfer: DataTransfer) {
  return dataTransfer.getData('text/todo-id') || dataTransfer.getData('text/plain')
}

function hasSchedule(todo: Todo) {
  return todo.scheduled_start_minutes != null && todo.scheduled_duration_minutes != null
}

const DAY_START_MINUTES = 7 * 60
const DAY_END_MINUTES = 23 * 60
const DEFAULT_MUST_DO_DURATION = 30
const OUTREACH_FUNNEL_TARGETS = {
  reached: { day: 12, week: 60 },
  accepted: { day: 8, week: 40 },
  replies: { day: 10, week: 50 },
  meetings: { day: 4, week: 20 },
  intros: { day: 3, week: 15 },
}
const EMPTY_OUTREACH_COUNTS: OutreachMetricCounts = { reached: 0, accepted: 0, replies: 0, meetings: 0, intros: 0 }

function weekStart(date: string) {
  const d = new Date(date + 'T12:00:00')
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  return localDate(d)
}

function weekEnd(date: string) {
  const d = new Date(weekStart(date) + 'T12:00:00')
  d.setDate(d.getDate() + 6)
  return localDate(d)
}

function countOutreachEvents(events: OutreachEventRow[]): OutreachMetricCounts {
  const identities = new Map<keyof OutreachMetricCounts, Set<string>>()
  ;(Object.keys(EMPTY_OUTREACH_COUNTS) as Array<keyof OutreachMetricCounts>).forEach(metric => identities.set(metric, new Set()))
  events.forEach(event => {
    const metric = metricForOutreachEvent(event.event_type)
    if (metric) identities.get(metric)?.add(event.contact_id ?? event.id)
  })
  return (Object.keys(EMPTY_OUTREACH_COUNTS) as Array<keyof OutreachMetricCounts>).reduce<OutreachMetricCounts>((counts, metric) => {
    counts[metric] = identities.get(metric)?.size ?? 0
    return counts
  }, { ...EMPTY_OUTREACH_COUNTS })
}

function countApplicationsInWeek(opportunities: OpportunityMentionRow[], date: string) {
  const start = weekStart(date)
  const end = weekEnd(date)
  return opportunities.filter(opportunity => {
    if (opportunity.type !== 'job' || !opportunity.applied_at) return false
    const appliedOn = localDate(new Date(opportunity.applied_at))
    return appliedOn >= start && appliedOn <= end
  }).length
}

function isNamedMetric(text: string | null | undefined, kind: 'apps' | 'gym') {
  const value = (text ?? '').toLowerCase()
  if (kind === 'apps') return /\b(applications?|apply|applied|job apps?)\b/.test(value)
  return /\b(gym|workout|training|exercise|f45)\b/.test(value)
}

function weeklyTargetFromLegacyHabit(habit: Habit, kind: 'apps' | 'gym') {
  const explicit = habit.daily_target || habit.target_value
  if (explicit) return kind === 'apps' ? Math.max(explicit * 5, explicit, 5) : explicit
  const text = `${habit.alias ?? ''} ${habit.text ?? ''}`.toLowerCase()
  const perWeek = text.match(/\b(\d+)\s*(?:x|times?|classes?|sessions?)?\s*(?:\/|per\s+)?week\b/)
    ?? text.match(/\b(\d+)\s*(?:x|times?|classes?|sessions?)\s*(?:a|per)\s*week\b/)
  const parsed = perWeek ? Number(perWeek[1]) : 0
  if (parsed > 0) return parsed
  return kind === 'apps' ? 5 : 1
}

function contactDisplayName(value: string) {
  return value.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '').trim() || value
}

function isVirtualRecurringTodo(todo: Pick<Todo, 'id' | 'recurring_id'>) {
  return Boolean(todo.recurring_id && todo.id.startsWith('rec-'))
}

function textFromTodo(todo: Todo) {
  return todo.content_segments?.map(segment => {
    if (segment.type === 'text') return segment.text
    if (segment.type === 'mention') return segment.label
    return segment.label
  }).join('').trim() || todo.text
}

function materializeRecurringSeries(series: RecurringSeries, userId: string, today: string): Todo {
  const content: TodoContentSegment[] = [{ type: 'text', text: series.name }]
  return {
    id: crypto.randomUUID(),
    text: series.name,
    user_id: userId,
    date: today,
    content_segments: content,
    milestone_id: null,
    goal_id: null,
    contact_id: null,
    company_id: null,
    opportunity_id: null,
    effort: null,
    block: null,
    completed: false,
    waiting: false,
    completed_at: null,
    scheduled_start_minutes: series.time,
    scheduled_duration_minutes: series.time != null ? series.dur : null,
    must_do: false,
    recurring_id: series.id,
    sort_order: 1_000_000,
    url: null,
    outreach_log_id: null,
    attio_task_id: null,
    is_featured: false,
    created_at: `${today}T00:00:00.000Z`,
  }
}

function recurringOccurrencesForToday(series: RecurringSeries[], userId: string, today: string) {
  const date = new Date(today + 'T12:00:00')
  return series
    .filter(s => seriesAppliesOn(s, date))
    .map(s => materializeRecurringSeries(s, userId, today))
}

function recurringSeriesFromRow(row: RecurringSeriesRow): RecurringSeries {
  return {
    id: row.id,
    active: row.active,
    name: row.name,
    dur: row.duration_minutes,
    time: row.time_minutes,
    days: row.days,
    startDate: row.start_date,
    endType: row.end_type,
    endDate: row.end_date,
    endCount: row.end_count,
  }
}

function recurringSeriesToRow(series: RecurringSeries, userId: string): RecurringSeriesRow {
  return {
    id: series.id,
    user_id: userId,
    name: series.name,
    duration_minutes: series.dur,
    time_minutes: series.time,
    days: series.days,
    start_date: series.startDate,
    end_type: series.endType,
    end_date: series.endDate,
    end_count: series.endCount,
    active: series.active,
  }
}

function formatDue(target: string | null, today: string): { label: string | null; urgent: boolean } {
  if (!target) return { label: null, urgent: false }
  const t = new Date(today + 'T12:00:00')
  const d = new Date(target + 'T12:00:00')
  const days = Math.round((d.getTime() - t.getTime()) / 86400000)
  if (days < 0) return { label: `${-days}d ago`, urgent: true }
  if (days === 0) return { label: 'today', urgent: true }
  return { label: `${days}d`, urgent: days <= 7 }
}

function addDays(base: string, n: number) {
  const d = new Date(base + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return localDate(d)
}

function relLabel(dateKey: string | null | undefined, todayK: string) {
  if (!dateKey) return null
  const diff = Math.round((new Date(dateKey).getTime() - new Date(todayK).getTime()) / 86400000)
  if (diff <= 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff < 7) return `in ${diff}d`
  if (diff < 14) return 'next week'
  return new Date(dateKey + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
}

function ObjectiveBar({
  objective,
  onChange,
}: {
  objective: string
  onChange: (value: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(objective || '')
  useEffect(() => setText(objective || ''), [objective])
  const commit = () => {
    onChange(text.trim())
    setEditing(false)
  }
  return (
    <div className="objective-bar" onClick={() => !editing && setEditing(true)}>
      <span className="obj-icon"><Target size={13} weight="bold" /></span>
      <span className="obj-label">Day objective</span>
      {editing ? (
        <input
          autoFocus
          className="obj-input"
          value={text}
          placeholder="What's the one big thing today?"
          onChange={e => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setText(objective || '')
              setEditing(false)
            }
          }}
        />
      ) : (
        <span className={`obj-text${objective ? '' : ' empty'}`}>{objective || "Set today's objective..."}</span>
      )}
      <span className="obj-edit"><PencilSimple size={12} /></span>
    </div>
  )
}

function BacklogBin({
  count,
  armed,
  activeCount = 0,
  onOpen,
  onDropTodo,
  onParkAll,
}: {
  count: number
  armed?: boolean
  activeCount?: number
  onOpen: () => void
  onDropTodo?: (id: string) => void
  onParkAll?: () => void
}) {
  const [over, setOver] = useState(false)
  return (
    <>
      <button
        className={`backlog-bin${armed ? ' armed' : ''}${over ? ' over' : ''}`}
        onClick={onOpen}
        title="Backlog — drag a todo here to park it"
        onDragOver={e => {
          if (hasTodoDragPayload(e.dataTransfer.types)) {
            e.preventDefault()
            setOver(true)
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={e => {
          e.preventDefault()
          const id = todoIdFromDrag(e.dataTransfer)
          setOver(false)
          if (id) onDropTodo?.(id)
        }}
      >
        <Archive size={14} />
        <span className="bl-word">Backlog</span>
        {count > 0 && <span className="bl-count">{count}</span>}
      </button>
      {activeCount > 0 && onParkAll && (
        <button className="backlog-bin backlog-all" onClick={onParkAll} title="Move all active todos to Backlog">
          <Archive size={13} />
          <span className="bl-word">All</span>
        </button>
      )}
    </>
  )
}

function ReturnDatePicker({
  value,
  todayK,
  onPick,
}: {
  value: string | null | undefined
  todayK: string
  onPick: (value: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLSpanElement | null>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const label = relLabel(value, todayK)
  return (
    <span ref={wrap} style={{ position: 'relative' }}>
      <button className={`bl-date${value ? '' : ' empty'}`} onClick={() => setOpen(o => !o)}>
        <CalendarBlank size={10} />
        {label || 'no date'}
      </button>
      {open && (
        <div className="date-popover" style={{ top: '100%', right: 0, marginTop: 6, minWidth: 200 }}>
          <button onClick={() => { onPick(addDays(todayK, 1)); setOpen(false) }}>Tomorrow<span className="meta">auto</span></button>
          <button onClick={() => { onPick(addDays(todayK, 3)); setOpen(false) }}>In 3 days<span className="meta">auto</span></button>
          <button onClick={() => { onPick(addDays(todayK, 7)); setOpen(false) }}>Next week<span className="meta">auto</span></button>
          <div className="sep" />
          <input type="date" value={value || ''} min={todayK} onChange={e => onPick(e.target.value || null)} />
          <div className="sep" />
          <button onClick={() => { onPick(null); setOpen(false) }} className="bl-clear">No date · manual only</button>
        </div>
      )}
    </span>
  )
}

function BacklogPanel({
  items,
  todayK,
  activeCount = 0,
  onClose,
  onDropTodo,
  onParkAll,
  onRestore,
  onSetDate,
  onRemove,
}: {
  items: Todo[]
  todayK: string
  activeCount?: number
  onClose: () => void
  onDropTodo?: (id: string) => void
  onParkAll?: () => void
  onRestore: (id: string) => void
  onSetDate: (id: string, value: string | null) => void
  onRemove: (id: string) => void
}) {
  const [dropOver, setDropOver] = useState(false)
  return (
    <>
      <div className="bl-scrim" onClick={onClose} />
      <aside className="bl-panel" role="dialog" aria-label="Backlog">
        <header className="bl-hd">
          <div className="bl-hd-title">
            <Archive size={15} />
            <h3>Backlog</h3>
            <span className="bl-hd-count">{items.length}</span>
          </div>
          <div className="bl-hd-actions">
            {activeCount > 0 && onParkAll && (
              <button className="bl-move-all" onClick={onParkAll} title="Move all active todos to Backlog">
                <Archive size={12} />
                All active
              </button>
            )}
            <button className="bl-close" onClick={onClose} title="Close"><X size={13} /></button>
          </div>
        </header>
        <p className="bl-sub">Tasks on hold — not deleted. Pull one back with <b>+</b>, or give it a tentative date so it returns on its own.</p>
        <div
          className={`bl-list${dropOver ? ' drop' : ''}`}
          onDragOver={(e) => {
            if (!onDropTodo) return
            if (hasTodoDragPayload(e.dataTransfer.types)) {
              e.preventDefault()
              setDropOver(true)
            }
          }}
          onDragLeave={() => setDropOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDropOver(false)
            const id = todoIdFromDrag(e.dataTransfer)
            if (id && onDropTodo) onDropTodo(id)
          }}
        >
          {items.length === 0 && (
            <div className="bl-empty">
              <Archive size={22} />
              <span>Nothing on hold.</span>
              <small>Park a todo from Today to clear it without deleting it.</small>
            </div>
          )}
          {items.map(it => (
            <div className="bl-item" key={it.id}>
              <button className="bl-restore" onClick={() => onRestore(it.id)} title="Bring back to Today"><Plus size={12} /></button>
              <span className="bl-text">{it.text}</span>
              <ReturnDatePicker value={it.return_date} todayK={todayK} onPick={d => onSetDate(it.id, d)} />
              <button className="bl-trash" onClick={() => onRemove(it.id)} title="Delete for good"><TrashSimple size={12} /></button>
            </div>
          ))}
        </div>
        {items.some(i => i.return_date) && (
          <div className="bl-foot"><CalendarBlank size={11} /> Dated items flow back into Today when that day starts.</div>
        )}
      </aside>
    </>
  )
}

function AgendaRows({ items = [] }: { items?: Array<never> }) {
  if (!items.length) {
    return <div className="ns-empty">No meetings booked. A quiet week — or time to reach out.</div>
  }
  return (
    <div className="agenda">
      <div className="ag-feeds"><ArrowDown size={10} />{items.length} this week feed <b>Scheduled</b></div>
    </div>
  )
}

function ContextDrawer({
  open,
  sections,
  journal,
  onJournalChange,
  onClose,
}: {
  open: boolean
  sections: RailSectionDef[]
  journal: string
  onJournalChange: (value: string) => void
  onClose: () => void
}) {
  if (!open) return null
  return (
    <>
      <div className="ctx-scrim" onClick={onClose} />
      <aside className="ctx-drawer" aria-label="Today context">
        <header className="ctx-hd">
          <div>
            <h3>Context</h3>
            <span>Milestones, week, agenda, journal</span>
          </div>
          <button onClick={onClose} title="Close context"><X size={13} /></button>
        </header>
        <RightRail sections={sections.map(section => section.id === 'journal'
          ? {
              ...section,
              body: (
                <textarea
                  className="journal-area"
                  placeholder="What's on your mind?"
                  value={journal}
                  onChange={event => onJournalChange(event.target.value)}
                />
              ),
            }
          : section)}
        />
      </aside>
    </>
  )
}

export default function Today() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [actualToday, setActualToday] = useState(() => localDate())
  const [metricsRevision, setMetricsRevision] = useState(0)
  useEffect(() => {
    const refreshDate = () => {
      const next = localDate()
      setActualToday(previous => previous === next ? previous : next)
    }
    const interval = window.setInterval(refreshDate, 60_000)
    window.addEventListener('focus', refreshDate)
    document.addEventListener('visibilitychange', refreshDate)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshDate)
      document.removeEventListener('visibilitychange', refreshDate)
    }
  }, [])
  const requestedDate = searchParams.get('date')
  const today = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && requestedDate <= actualToday ? requestedDate : actualToday
  const isHistorical = today !== actualToday
  const todayLabel = new Date(today + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const weekDates = useMemo(() => {
    const d = new Date(today + 'T12:00:00')
    const day = d.getDay()
    const monday = new Date(d)
    monday.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(monday); x.setDate(monday.getDate() + i)
      return localDate(x)
    })
  }, [today])

  const navigateDay = useCallback((offset: number) => {
    const next = addDays(today, offset)
    if (next > actualToday) return
    const params = new URLSearchParams(searchParams)
    if (next === actualToday) params.delete('date')
    else params.set('date', next)
    setSearchParams(params)
  }, [actualToday, searchParams, setSearchParams, today])

  const [userId, setUserId] = useState<string | null>(null)
  const [todos, setTodos] = useState<Todo[]>([])
  const [backlog, setBacklog] = useState<Todo[]>([])
  const [backlogOpen, setBacklogOpen] = useState(false)
  const [recurSeries, setRecurSeries] = useState<RecurringSeries[]>(() => loadRecurSeries())
  const [recurPanelOpen, setRecurPanelOpen] = useState(false)
  const [recurRect, setRecurRect] = useState<DOMRect | null>(null)
  const [recurForm, setRecurForm] = useState<RecurringFormState | null>(null)
  const [scopeMenu, setScopeMenu] = useState<ScopeMenuState | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [dragArmed, setDragArmed] = useState(false)
  const [msTodos, setMsTodos] = useState<MsTodo[]>([])      // all milestone-linked todos (for progress)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [goalsMap, setGoalsMap] = useState<Map<string, GoalLite>>(new Map())
  const [goals, setGoals] = useState<GoalLite[]>([])
  const [outreachDayCounts, setOutreachDayCounts] = useState<OutreachMetricCounts>(EMPTY_OUTREACH_COUNTS)
  const [outreachWeekCounts, setOutreachWeekCounts] = useState<OutreachMetricCounts>(EMPTY_OUTREACH_COUNTS)
  const [outreachPrevCounts, setOutreachPrevCounts] = useState<OutreachMetricCounts>(EMPTY_OUTREACH_COUNTS)
  const [outreachEvents, setOutreachEvents] = useState<OutreachEventRow[]>([])
  const [funnelTargets, setFunnelTargets] = useState<FunnelTargets>(OUTREACH_FUNNEL_TARGETS)
  const [goalMetrics, setGoalMetrics] = useState<Record<'apps' | 'gym', GoalMetric>>({
    apps: { id: 'apps', value: 0, target: 5, source: null, habitId: null, logId: null, logValue: 0 },
    gym: { id: 'gym', value: 0, target: 1, source: null, habitId: null, logId: null, logValue: 0 },
  })
  const [calendarEvents, setCalendarEvents] = useState<TodayCalendarEvent[]>([])
  const [calendarError, setCalendarError] = useState<string | null>(null)
  const [mentions, setMentions] = useState<Map<string, Mention>>(new Map())  // key: `${kind}:${id}`
  const [mentionOptions, setMentionOptions] = useState<Mention[]>([])
  const [expandedMs, setExpandedMs] = useState<string | null>(null)
  const [journal, setJournal] = useState('')
  const [dailyGoal, setDailyGoal] = useState('')
  const [objectiveLink, setObjectiveLink] = useState<Mention | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const [startOpen, setStartOpen] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  const [closeDaySnapshot, setCloseDaySnapshot] = useState<{ stats: CloseDayStats; unfinished: Todo[] } | null>(null)
  const [closingDay, setClosingDay] = useState(false)
  const [focusOpen, setFocusOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [dayClosed, setDayClosed] = useState(false)
  const [closedSummary, setClosedSummary] = useState<DayCloseSummary | null>(null)
  const focus = useFocusTimer(userId)
  const journalTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const journalInit = useRef(false)
  const recurBtn = useRef<HTMLButtonElement | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── load mentions for a set of todos ───────────────────────────
  const loadMentions = useCallback(async (uid: string, list: Todo[]) => {
    const contactIds = [...new Set(list.map(t => t.contact_id).filter(Boolean))] as string[]
    const companyIds = [...new Set(list.map(t => t.company_id).filter(Boolean))] as string[]
    const oppIds = [...new Set(list.map(t => t.opportunity_id).filter(Boolean))] as string[]
    const map = new Map<string, Mention>()
    await Promise.all([
      contactIds.length
        ? supabase.from('outreach_logs').select('id, name, profile_photo_url').in('id', contactIds).eq('user_id', uid)
            .then(({ data }) => (data ?? []).forEach(c => map.set(`person:${c.id}`, { id: c.id, name: c.name, kind: 'person', imageUrl: c.profile_photo_url })))
        : null,
      companyIds.length
        ? supabase.from('companies').select('id, name, logo_url, favicon_url, domain').in('id', companyIds).eq('user_id', uid)
            .then(({ data }) => (data ?? []).forEach(c => map.set(`company:${c.id}`, { id: c.id, name: c.name, kind: 'company', imageUrl: companyImage(c.logo_url, c.domain, c.favicon_url) })))
        : null,
      oppIds.length
        ? supabase.from('opportunities').select('id, title, company_id, company:companies(id, name, logo_url, favicon_url, domain)').in('id', oppIds).eq('user_id', uid)
            .then(({ data }) => ((data ?? []) as OpportunityMentionRow[]).forEach(o => {
              const company = firstRelation(o.company)
              map.set(`opportunity:${o.id}`, {
                id: o.id,
                name: o.title ?? 'Opportunity',
                kind: 'opportunity',
                sub: company?.name ?? null,
                imageUrl: companyImage(company?.logo_url, company?.domain, company?.favicon_url),
                companyId: o.company_id ?? company?.id ?? null,
              })
            }))
        : null,
    ])
    setMentions(map)
  }, [])

  const loadGoogleCalendarEvents = useCallback(async (date: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.provider_token ?? (session?.user?.user_metadata?.google_access_token as string | undefined) ?? null
    if (!token) {
      setCalendarEvents([])
      setCalendarError('Google Calendar is not connected')
      return []
    }
    const start = new Date(date + 'T00:00:00')
    const end = new Date(date + 'T00:00:00')
    end.setDate(end.getDate() + 1)
    try {
      const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
      url.searchParams.set('timeMin', start.toISOString())
      url.searchParams.set('timeMax', end.toISOString())
      url.searchParams.set('singleEvents', 'true')
      url.searchParams.set('orderBy', 'startTime')
      url.searchParams.set('maxResults', '40')
      url.searchParams.set('conferenceDataVersion', '1')
      let res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 401 || res.status === 403) {
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        const { data: refreshData, error: refreshError } = await supabase.functions.invoke('google-refresh-token', {
          headers: currentSession?.access_token ? { Authorization: `Bearer ${currentSession.access_token}` } : undefined,
        })
        const freshToken = (refreshData as { access_token?: string } | null)?.access_token ?? null
        if (!refreshError && freshToken) {
          await supabase.auth.updateUser({ data: { google_access_token: freshToken } })
          res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${freshToken}` } })
        }
      }
      if (!res.ok) {
        setCalendarEvents([])
        setCalendarError(res.status === 401 || res.status === 403 ? 'Google Calendar needs to be reconnected' : `Google Calendar unavailable (${res.status})`)
        return []
      }
      const data = await res.json() as { items?: GoogleCalendarItem[] }
      const calendarItems = data.items ?? []
      const sessionUserId = session?.user?.id ?? null
      const fyiIds = loadCalendarFyiIds(sessionUserId)
      const blocks = calendarItems.flatMap((event): TodayCalendarEvent[] => {
        const startRaw = event.start?.dateTime
        const endRaw = event.end?.dateTime
        if (!startRaw || !endRaw) return []
        const s = new Date(startRaw)
        const e = new Date(endRaw)
        const startMin = clampMinutes(s.getHours() * 60 + s.getMinutes(), DAY_START_MINUTES, DAY_END_MINUTES)
        const endMin = clampMinutes(e.getHours() * 60 + e.getMinutes(), DAY_START_MINUTES, DAY_END_MINUTES)
        if (localDate(s) !== date || endMin <= DAY_START_MINUTES || startMin >= DAY_END_MINUTES) return []
        const hasPeople = Boolean(event.attendees?.length || event.hangoutLink)
        const conference = event.hangoutLink || event.conferenceData?.entryPoints?.find(point => point.entryPointType === 'video')?.uri || null
        const blockId = `gcal-${event.id ?? `${startRaw}-${event.summary ?? ''}`}`
        const fyi = fyiIds.has(blockId)
        return [{
          id: blockId,
          title: event.summary?.trim() || 'Busy',
          start: startMin,
          dur: Math.max(15, endMin - startMin),
          type: hasPeople ? 'meeting' : 'internal',
          sub: fyi ? 'FYI only' : event.location || (hasPeople ? 'Google Calendar' : null),
          fyi,
          attendees: (event.attendees ?? []).map(attendee => ({ name: attendee.displayName || attendee.email || 'Guest', email: attendee.email, you: attendee.self })),
          conferenceUrl: conference,
          platform: conference?.includes('zoom') ? 'Zoom' : conference ? 'Meet' : null,
        }]
      })

      const candidateEvents = calendarItems.filter(event => event.start?.dateTime && event.id && (event.attendees?.some(attendee => !attendee.self && attendee.responseStatus !== 'declined') || event.summary))
      if (session?.user?.id && candidateEvents.length > 0) {
        const selfEmails = new Set([session.user.email?.toLowerCase(), (session.user.user_metadata?.email as string | undefined)?.toLowerCase()].filter((email): email is string => Boolean(email)))
        const { data: contacts } = await supabase
          .from('outreach_logs')
          .select('id, name, email, company, job_title, profile_photo_url')
          .eq('user_id', session.user.id)
        const contactRows = (contacts ?? []) as ContactMentionRow[]
        const observedAt = new Date().toISOString()
        const meetingRows = candidateEvents.flatMap(event => {
          const startRaw = event.start?.dateTime
          if (!startRaw || !event.id) return []
          const blockId = `gcal-${event.id}`
          const markedFyi = fyiIds.has(blockId)
          const excludedFromFunnel = markedFyi || isPartnerOnlySharedCalendarEvent(event, selfEmails)
          const hasExternalAttendee = hasExternalCalendarAttendee(event, selfEmails)
          const matchedContacts = contactRows.flatMap(contact => {
            const matchedBy = contactMatchesCalendarEvent(contact, event)
            if (matchedBy && isFunnelPartnerContact(contact) && (excludedFromFunnel || hasExternalAttendee)) return []
            return matchedBy ? [{ contact, matchedBy }] : []
          })
          return matchedContacts.map(({ contact, matchedBy }) => ({
            user_id: session.user.id,
            contact_id: contact.id,
            event_type: 'meeting_scheduled',
            occurred_at: startRaw,
            occurred_on: localDate(new Date(startRaw)),
            observed_at: observedAt,
            evidence_confidence: matchedBy === 'email' ? 100 : matchedBy === 'attendee_name' ? 92 : 84,
            source: 'google_calendar',
            source_external_id: `gcal-event:${event.id}:${contact.id}`,
            payload: {
              google_event_id: event.id,
              title: event.summary?.trim() || 'Meeting',
              conference_url: event.hangoutLink || event.conferenceData?.entryPoints?.find(point => point.entryPointType === 'video')?.uri || null,
              attendees: (event.attendees ?? []).map(attendee => ({ name: attendee.displayName || attendee.email || null, email: attendee.email || null, self: Boolean(attendee.self), response_status: attendee.responseStatus || null })),
              matched_by: matchedBy,
              calendar_excluded_from_funnel: excludedFromFunnel,
              calendar_exclusion_reason: markedFyi ? 'user_marked_fyi_not_mine' : excludedFromFunnel ? 'partner_only_shared_calendar' : null,
            },
          }))
        })
        if (meetingRows.length > 0) {
          const sourceIds = meetingRows.map(row => row.source_external_id)
          const { data: existingRows } = await supabase
            .from('outreach_events')
            .select('id, source_external_id')
            .eq('user_id', session.user.id)
            .eq('source', 'google_calendar')
            .in('source_external_id', sourceIds)
          const existingBySource = new Map((existingRows ?? []).map(row => [row.source_external_id, row.id]))
          const inserts = meetingRows.filter(row => !existingBySource.has(row.source_external_id))
          const updates = meetingRows.filter(row => existingBySource.has(row.source_external_id))
          await Promise.all([
            inserts.length ? supabase.from('outreach_events').insert(inserts) : Promise.resolve(),
            ...updates.map(row => supabase.from('outreach_events').update({
              occurred_at: row.occurred_at,
              occurred_on: row.occurred_on,
              observed_at: row.observed_at,
              evidence_confidence: row.evidence_confidence,
              payload: row.payload,
            }).eq('id', existingBySource.get(row.source_external_id)).eq('user_id', session.user.id)),
          ])
        }
      }
      setCalendarEvents(blocks)
      setCalendarError(null)
      return blocks
    } catch (error) {
      console.warn('Google Calendar events unavailable:', error)
      setCalendarEvents([])
      setCalendarError('Google Calendar could not be loaded')
      return []
    }
  }, [])

  const refreshOutreachMetrics = useCallback(async () => {
    if (!userId) return
    const start = weekStart(today)
    const end = weekEnd(today)
    const previous = addDays(today, -1)
    const [dayResult, weekResult, previousResult] = await Promise.all([
      supabase.from('outreach_daily_metric_contacts').select('id, event_type, occurred_on, contact_id').eq('user_id', userId).eq('occurred_on', today),
      supabase.from('outreach_daily_metric_contacts').select('id, event_type, occurred_on, contact_id').eq('user_id', userId).gte('occurred_on', start).lte('occurred_on', end),
      supabase.from('outreach_daily_metric_contacts').select('id, event_type, occurred_on, contact_id').eq('user_id', userId).eq('occurred_on', previous),
    ])
    if (dayResult.error || weekResult.error || previousResult.error) return
    const weekEvents = (weekResult.data ?? []) as OutreachEventRow[]
    const contactIds = [...new Set(weekEvents.map(event => event.contact_id).filter(Boolean))] as string[]
    const contactsResult = contactIds.length
      ? await supabase.from('outreach_logs').select('id, name, profile_photo_url, job_title, company').eq('user_id', userId).in('id', contactIds)
      : { data: [], error: null }
    const contactById = new Map(((contactsResult.data ?? []) as ContactMentionRow[]).map(contact => [contact.id, contact]))
    setOutreachEvents(weekEvents.map(event => ({ ...event, contact: event.contact_id ? contactById.get(event.contact_id) ?? null : null })))
    setOutreachDayCounts(countOutreachEvents((dayResult.data ?? []) as OutreachEventRow[]))
    setOutreachWeekCounts(countOutreachEvents(weekEvents))
    setOutreachPrevCounts(countOutreachEvents((previousResult.data ?? []) as OutreachEventRow[]))
  }, [today, userId])

  useEffect(() => {
    if (!userId) return
    const refresh = () => { void refreshOutreachMetrics() }
    const channel = supabase.channel(`today-outreach-${userId}`).on('postgres_changes', {
      event: '*', schema: 'public', table: 'outreach_events', filter: `user_id=eq.${userId}`,
    }, refresh).subscribe()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      void supabase.removeChannel(channel)
    }
  }, [refreshOutreachMetrics, userId])

  const refreshApplicationMetric = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase
      .from('opportunities')
      .select('id, type, applied_at')
      .eq('user_id', userId)
      .eq('type', 'job')
      .not('applied_at', 'is', null)
    if (error) return
    const value = countApplicationsInWeek((data ?? []) as OpportunityMentionRow[], today)
    setGoalMetrics(previous => ({
      ...previous,
      apps: { ...previous.apps, value, source: 'opportunities', habitId: null, logId: null, logValue: 0 },
    }))
  }, [today, userId])

  useEffect(() => {
    if (!userId) return
    const refresh = () => { void refreshApplicationMetric() }
    const channel = supabase.channel(`today-applications-${userId}`).on('postgres_changes', {
      event: '*', schema: 'public', table: 'opportunities', filter: `user_id=eq.${userId}`,
    }, refresh).subscribe()
    void refreshApplicationMetric()
    return () => { void supabase.removeChannel(channel) }
  }, [refreshApplicationMetric, userId])

  useEffect(() => {
    if (!userId) return
    const refresh = () => setMetricsRevision(revision => revision + 1)
    const channels = [
      supabase.channel(`today-weekly-habits-${userId}`).on('postgres_changes', {
        event: '*', schema: 'public', table: 'weekly_habits', filter: `user_id=eq.${userId}`,
      }, refresh).subscribe(),
      supabase.channel(`today-weekly-habit-logs-${userId}`).on('postgres_changes', {
        event: '*', schema: 'public', table: 'weekly_habit_logs', filter: `user_id=eq.${userId}`,
      }, refresh).subscribe(),
      supabase.channel(`today-legacy-habit-logs-${userId}`).on('postgres_changes', {
        event: '*', schema: 'public', table: 'habit_logs', filter: `user_id=eq.${userId}`,
      }, refresh).subscribe(),
    ]
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      channels.forEach(channel => { void supabase.removeChannel(channel) })
    }
  }, [userId])

  useEffect(() => {
    if (!userId || isHistorical) return
    const reconcile = () => {
      void syncJobApplicationsFromGmail(userId).then(result => {
        if (result.changed) void refreshApplicationMetric()
      })
    }
    reconcile()
    window.addEventListener('focus', reconcile)
    return () => window.removeEventListener('focus', reconcile)
  }, [isHistorical, refreshApplicationMetric, userId])

  // ── initial load ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return
      setUserId(user.id)
      const rawName = typeof user.user_metadata?.full_name === 'string'
        ? user.user_metadata.full_name
        : typeof user.user_metadata?.name === 'string'
          ? user.user_metadata.name
          : user.email?.split('@')[0]
      setUserName(rawName ? rawName.split(/\s+/)[0] : null)

      const todayWeekStart = weekStart(today)
      const todayWeekEnd = weekEnd(today)
      const yesterday = addDays(today, -1)
      const [todosRes, overdueTodosRes, dueBacklogRes, backlogRes, msTodosRes, msRes, goalsRes, reviewRes, contactsRes, companiesRes, oppsRes, outreachDayRes, outreachWeekRes, outreachPrevRes, metricSettingsRes, habitsRes, habitLogsTodayRes, habitLogsWeekRes, weeklyHabitsRes, weeklyLogsWeekRes] = await Promise.all([
        isHistorical
          ? supabase.from('todo_day_history').select('todo_id, snapshot').eq('user_id', user.id).eq('plan_date', today).order('captured_at')
          : supabase.from('todos').select('*').eq('user_id', user.id).eq('date', today).is('backlog_at', null).order('sort_order').order('created_at'),
        isHistorical ? Promise.resolve({ data: [], error: null }) : supabase.from('todos').select('*').eq('user_id', user.id).lt('date', today).eq('completed', false).is('backlog_at', null).order('date').order('sort_order').order('created_at'),
        isHistorical ? Promise.resolve({ data: [], error: null }) : supabase.from('todos').select('*').eq('user_id', user.id).eq('completed', false).not('backlog_at', 'is', null).not('return_date', 'is', null).lte('return_date', today).order('return_date').order('created_at'),
        supabase.from('todos').select('*').eq('user_id', user.id).eq('completed', false).not('backlog_at', 'is', null).order('backlog_at', { ascending: false }),
        supabase.from('todos').select('id, milestone_id, completed').eq('user_id', user.id).not('milestone_id', 'is', null),
        supabase.from('milestones').select('*').eq('user_id', user.id).neq('status', 'COMPLETE').order('target_date', { nullsFirst: false }),
        supabase.from('goals').select('id, text, alias, color, emoji').eq('user_id', user.id).eq('goal_type', 'ACTIVE').order('position'),
        supabase.from('reviews').select('notes, one_thing, one_thing_done, energy_level, tomorrow_focus, tomorrow_reviewed, day_locked_at, objective_link_kind, objective_link_id, objective_link_label, objective_link_logo, today_close_summary').eq('user_id', user.id).eq('date', today).maybeSingle(),
        supabase.from('outreach_logs').select('id, name, profile_photo_url, company, job_title, email, status').eq('user_id', user.id).order('name'),
        supabase.from('companies').select('id, name, logo_url, favicon_url, domain, sector, headline').eq('user_id', user.id).order('name'),
        supabase.from('opportunities').select('id, title, stage, type, applied_at, company_id, company:companies(id, name, logo_url, favicon_url, domain)').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('outreach_daily_metric_contacts').select('id, event_type, occurred_on, contact_id').eq('user_id', user.id).eq('occurred_on', today),
        supabase.from('outreach_daily_metric_contacts').select('id, event_type, occurred_on, contact_id').eq('user_id', user.id).gte('occurred_on', todayWeekStart).lte('occurred_on', todayWeekEnd),
        supabase.from('outreach_daily_metric_contacts').select('id, event_type, occurred_on, contact_id').eq('user_id', user.id).eq('occurred_on', yesterday),
        supabase.from('today_metric_settings').select('funnel_targets').eq('user_id', user.id).maybeSingle(),
        supabase.from('habits').select('*').eq('user_id', user.id).eq('is_active', true),
        supabase.from('habit_logs').select('*').eq('user_id', user.id).eq('log_date', today),
        supabase.from('habit_logs').select('*').eq('user_id', user.id).gte('log_date', todayWeekStart).lte('log_date', todayWeekEnd),
        supabase.from('weekly_habits').select('*').eq('user_id', user.id).eq('is_active', true),
        supabase.from('weekly_habit_logs').select('*').eq('user_id', user.id).gte('log_date', todayWeekStart).lte('log_date', todayWeekEnd),
      ])
      if (cancelled) return
      void loadGoogleCalendarEvents(today)

      const overdueTodos = ((overdueTodosRes.data ?? []) as Todo[]).map(t => ({ ...t, date: today }))
      const dueBacklogTodos = ((dueBacklogRes.data ?? []) as Todo[]).map(t => ({
        ...t,
        date: today,
        backlog_at: null,
        return_date: null,
        scheduled_start_minutes: null,
        scheduled_duration_minutes: null,
      }))
      if (overdueTodos.length > 0) {
        supabase.from('todos').update({ date: today }).in('id', overdueTodos.map(t => t.id)).then(() => {})
      }
      if (dueBacklogTodos.length > 0) {
        supabase.from('todos').update({
          date: today,
          backlog_at: null,
          return_date: null,
          scheduled_start_minutes: null,
          scheduled_duration_minutes: null,
        }).in('id', dueBacklogTodos.map(t => t.id)).then(() => {})
      }
      const localSeries = loadRecurSeries()
      let todaySeries = localSeries
      const recurringRes = await supabase
        .from('recurring_task_series')
        .select('id, user_id, name, duration_minutes, time_minutes, days, start_date, end_type, end_date, end_count, active')
        .eq('user_id', user.id)
        .order('created_at')
      if (!recurringRes.error) {
        const remoteSeries = ((recurringRes.data ?? []) as RecurringSeriesRow[]).map(recurringSeriesFromRow)
        if (remoteSeries.length > 0) {
          todaySeries = remoteSeries
          saveRecurSeries(remoteSeries)
        } else if (localSeries.length > 0) {
          await supabase.from('recurring_task_series').upsert(localSeries.map((series: RecurringSeries) => recurringSeriesToRow(series, user.id)))
        }
      } else {
        console.warn('Recurring series fell back to localStorage:', recurringRes.error.message)
      }
      setRecurSeries(todaySeries)
      const byTodo = new Map<string, Todo>()
      const selectedTodos = isHistorical
        ? ((todosRes.data ?? []) as unknown as TodoDayHistoryRow[]).map(row => ({ ...row.snapshot, id: row.todo_id, date: today }))
        : (todosRes.data ?? []) as Todo[]
      ;[...dueBacklogTodos, ...overdueTodos, ...selectedTodos].forEach(t => byTodo.set(t.id, t))
      const { data: exceptionRows } = await supabase.from('recurring_task_exceptions').select('series_id, action').eq('user_id', user.id).eq('occurrence_date', today)
      const skippedSeries = new Set((exceptionRows ?? []).filter(row => row.action === 'skip').map(row => row.series_id))
      const newOccurrences = isHistorical ? [] : recurringOccurrencesForToday(todaySeries, user.id, today).filter(occurrence => !skippedSeries.has(occurrence.recurring_id as string) && ![...byTodo.values()].some(existing => existing.recurring_id === occurrence.recurring_id))
      if (newOccurrences.length) {
        const { data: inserted } = await supabase.from('todos').insert(newOccurrences.map(occurrence => ({ id: occurrence.id, user_id: user.id, text: occurrence.text, content_segments: occurrence.content_segments, date: today, completed: false, waiting: false, sort_order: occurrence.sort_order, is_featured: false, scheduled_start_minutes: occurrence.scheduled_start_minutes, scheduled_duration_minutes: occurrence.scheduled_duration_minutes, must_do: false, recurring_id: occurrence.recurring_id }))).select('*')
        ;((inserted ?? newOccurrences) as Todo[]).forEach(todo => byTodo.set(todo.id, todo))
      }
      const todoList = [...byTodo.values()]
      const restoredIds = new Set(dueBacklogTodos.map(t => t.id))
      const backlogList = ((backlogRes.data ?? []) as Todo[]).filter(t => !restoredIds.has(t.id))
      const contactRows = (contactsRes.data ?? []) as ContactMentionRow[]
      const peopleOptions: Mention[] = contactRows.map(c => mentionFromContact({ ...c, name: contactDisplayName(c.name) }))
      const companyOptions: Mention[] = (companiesRes.data ?? []).map(c => mentionFromCompany(c))
      const opportunityRows = (oppsRes.data ?? []) as OpportunityMentionRow[]
      const oppOptions: Mention[] = opportunityRows
        .filter(o => o.stage !== 'won' && o.stage !== 'lost')
        .map(o => mentionFromOpportunity(o))
      const review = reviewRes.data as TodayReviewRow | null
      setTodos(todoList)
      setBacklog(backlogList)
      setMsTodos((msTodosRes.data ?? []) as MsTodo[])
      setMilestones((msRes.data ?? []) as Milestone[])
      setMentionOptions([...peopleOptions, ...companyOptions, ...oppOptions])
      const contactById = new Map(contactRows.map(contact => [contact.id, contact]))
      const attachOutreachContact = (event: OutreachEventRow): OutreachEventRow => ({ ...event, contact: event.contact_id ? contactById.get(event.contact_id) ?? null : null })
      const dayEvents = ((outreachDayRes.data ?? []) as OutreachEventRow[]).map(attachOutreachContact)
      const weekEvents = ((outreachWeekRes.data ?? []) as OutreachEventRow[]).map(attachOutreachContact)
      if (outreachDayRes.error || outreachWeekRes.error || outreachPrevRes.error) {
        console.error('Could not load outreach funnel:', outreachDayRes.error || outreachWeekRes.error || outreachPrevRes.error)
      }
      setOutreachEvents(weekEvents)
      setOutreachDayCounts(countOutreachEvents(dayEvents))
      setOutreachWeekCounts(countOutreachEvents(weekEvents))
      setOutreachPrevCounts(countOutreachEvents((outreachPrevRes.data ?? []) as OutreachEventRow[]))
      const remoteTargets = metricSettingsRes.data?.funnel_targets as FunnelTargets | undefined
      if (remoteTargets) setFunnelTargets({ ...OUTREACH_FUNNEL_TARGETS, ...remoteTargets })
      else await supabase.from('today_metric_settings').upsert({ user_id: user.id, funnel_targets: OUTREACH_FUNNEL_TARGETS })
      const habits = (habitsRes.data ?? []) as Habit[]
      const todayHabitLogs = (habitLogsTodayRes.data ?? []) as HabitLog[]
      const weekHabitLogs = (habitLogsWeekRes.data ?? []) as HabitLog[]
      const weeklyHabits = (weeklyHabitsRes.data ?? []) as WeeklyHabit[]
      const weeklyLogs = (weeklyLogsWeekRes.data ?? []) as WeeklyHabitLog[]
      const buildGoalMetric = (kind: 'apps' | 'gym'): GoalMetric => {
        const weekly = weeklyHabits.find(h => isNamedMetric(h.name, kind))
        if (weekly) {
          const quantity = weeklyLogs.filter(log => log.habit_id === weekly.id).reduce((sum, log) => sum + Number(log.quantity || 0), 0)
          const todayLog = weeklyLogs.find(log => log.habit_id === weekly.id && log.log_date === today)
          return { id: kind, value: quantity, target: weekly.weekly_target || (kind === 'apps' ? 5 : 1), source: 'weekly', habitId: weekly.id, logId: todayLog?.id ?? null, logValue: Number(todayLog?.quantity || 0) }
        }
        const habit = habits.find(h => isNamedMetric(h.alias || h.text, kind))
        if (habit) {
          const logs = weekHabitLogs.filter(log => log.habit_id === habit.id)
          const value = logs.reduce((sum, log) => sum + Number(log.value || 0), 0)
          const todayLog = todayHabitLogs.find(log => log.habit_id === habit.id)
          const target = weeklyTargetFromLegacyHabit(habit, kind)
          return { id: kind, value, target, source: 'habit', habitId: habit.id, logId: todayLog?.id ?? null, logValue: Number(todayLog?.value || 0) }
        }
        return { id: kind, value: 0, target: kind === 'apps' ? 5 : 1, source: null, habitId: null, logId: null, logValue: 0 }
      }
      const applicationTarget = buildGoalMetric('apps')
      setGoalMetrics({
        apps: {
          ...applicationTarget,
          value: countApplicationsInWeek(opportunityRows, today),
          source: 'opportunities',
          habitId: null,
          logId: null,
          logValue: 0,
        },
        gym: buildGoalMetric('gym'),
      })
      const gl = (goalsRes.data ?? []) as GoalLite[]
      setGoals(gl)
      setGoalsMap(new Map(gl.map(g => [g.id, g])))
      setJournal(review?.notes ?? '')
      journalInit.current = true
      const savedObjective = review?.one_thing?.trim() ?? ''
      setDailyGoal(savedObjective)
      setObjectiveLink(review?.objective_link_kind && review.objective_link_id && review.objective_link_label ? { id: review.objective_link_id, name: review.objective_link_label, kind: review.objective_link_kind, imageUrl: review.objective_link_logo } : null)
      setDayClosed(Boolean(review?.tomorrow_reviewed || review?.day_locked_at))
      setClosedSummary(review?.tomorrow_reviewed || review?.day_locked_at ? review.today_close_summary ?? {
        removedTodoIds: [],
        carriedCount: 0,
        clearedCount: 0,
        completedCount: todoList.filter(t => t.completed).length,
        pendingCount: todoList.filter(t => !t.completed).length,
        energyLevel: review?.energy_level ?? null,
        goalDone: review?.one_thing_done ?? null,
        tomorrowGoal: review?.tomorrow_focus ?? undefined,
      } : null)
      const dayStartKey = `rethink.today.started:${today}`
      if (!isHistorical && savedObjective) {
        localStorage.setItem(dayStartKey, '1')
        setStartOpen(false)
      } else if (!isHistorical && !localStorage.getItem(dayStartKey)) {
        localStorage.setItem(dayStartKey, '1')
        setStartOpen(true)
      } else if (isHistorical) setStartOpen(false)
      loadMentions(user.id, todoList)
    })()
    return () => { cancelled = true }
  }, [today, isHistorical, loadMentions, loadGoogleCalendarEvents, metricsRevision])

  // ── milestone progress (done/total) from milestone-linked todos ──
  const msProgress = useMemo(() => {
    const m = new Map<string, { done: number; total: number }>()
    for (const t of msTodos) {
      if (!t.milestone_id) continue
      const cur = m.get(t.milestone_id) ?? { done: 0, total: 0 }
      cur.total++; if (t.completed) cur.done++
      m.set(t.milestone_id, cur)
    }
    return m
  }, [msTodos])

  const colorForGoal = useCallback((goalId: string | null) => {
    const g = goalId ? goalsMap.get(goalId) : null
    if (g?.color) return g.color
    // stable fallback by goal id hash
    const idx = goalId ? [...goalId].reduce((s, c) => s + c.charCodeAt(0), 0) % FALLBACK_COLORS.length : 0
    return FALLBACK_COLORS[idx]
  }, [goalsMap])

  const milestoneRows: MilestoneRowData[] = useMemo(() => {
    return [...milestones]
      .filter(m => m.focused)
      .sort((a, b) =>
        ((a.position ?? 999) - (b.position ?? 999)) ||
        (a.target_date ?? '9999-12-31').localeCompare(b.target_date ?? '9999-12-31'))
      .slice(0, 6)
      .map(m => {
        const g = goalsMap.get(m.goal_id)
        const prog = msProgress.get(m.id) ?? { done: 0, total: 0 }
        const due = formatDue(m.target_date, today)
        return {
          id: m.id,
          name: m.text,
          emoji: m.emoji ?? g?.emoji ?? null,
          color: m.color ?? colorForGoal(m.goal_id),
          due: due.label,
          urgent: due.urgent,
          done: prog.done,
          total: prog.total,
        }
      })
  }, [milestones, goalsMap, msProgress, today, colorForGoal])

  const milestoneOptions: TodoMilestoneOption[] = useMemo(() => {
    return [...milestones]
      .filter(m => m.focused)
      .sort((a, b) =>
        ((a.position ?? 999) - (b.position ?? 999)) ||
        (a.target_date ?? '9999-12-31').localeCompare(b.target_date ?? '9999-12-31') ||
        a.text.localeCompare(b.text))
      .slice(0, 6)
      .map(m => {
        const g = goalsMap.get(m.goal_id)
        const prog = msProgress.get(m.id) ?? { done: 0, total: 0 }
        const due = formatDue(m.target_date, today)
        return {
          id: m.id,
          name: m.text,
          goalId: m.goal_id,
          goalLabel: g?.alias || g?.text || null,
          color: m.color ?? colorForGoal(m.goal_id),
          due: due.label,
          urgent: due.urgent,
          done: prog.done,
          total: prog.total,
        }
      })
  }, [milestones, goalsMap, msProgress, today, colorForGoal])

  const resolveMentions = useCallback((t: Todo): Mention[] => {
    const out: Mention[] = []
    if (t.contact_id) { const m = mentions.get(`person:${t.contact_id}`); if (m) out.push(m) }
    if (t.company_id) { const m = mentions.get(`company:${t.company_id}`); if (m) out.push(m) }
    if (t.opportunity_id) { const m = mentions.get(`opportunity:${t.opportunity_id}`); if (m) out.push(m) }
    return out
  }, [mentions])

  // ── todo handlers ──────────────────────────────────────────────
  const syncMsTodo = (id: string, patch: Partial<MsTodo>) =>
    setMsTodos(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))

  const reportSaveError = (action: string, error: { message?: string; code?: string } | null) => {
    console.error(`Failed to ${action}`, error)
    const missingColumn = error?.message?.includes('scheduled_') || error?.code === 'PGRST204'
    setSaveError(missingColumn
      ? 'Could not save the day plan because the database schema was missing. Reload and try again.'
      : 'Could not save that change. Reload and try again.')
    window.setTimeout(() => setSaveError(null), 7000)
  }
  const showToast = useCallback((icon: ToastState['icon'], text: string, actionLabel?: string, onAction?: () => void) => {
    setToast({ icon, text, actionLabel, onAction })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }, [])
  const bumpGoalMetric = useCallback(async (id: 'apps' | 'gym') => {
    if (!userId) return
    const metric = goalMetrics[id]
    if (!metric.habitId || !metric.source) return
    setGoalMetrics(prev => ({ ...prev, [id]: { ...prev[id], value: prev[id].value + 1, logValue: prev[id].logValue + 1 } }))
    if (metric.source === 'weekly') {
      if (metric.logId) {
        await supabase.from('weekly_habit_logs').update({ quantity: metric.logValue + 1 }).eq('id', metric.logId)
      } else {
        const { data } = await supabase.from('weekly_habit_logs').insert({
          habit_id: metric.habitId,
          user_id: userId,
          log_date: today,
          quantity: 1,
        }).select('id').single()
        if (data?.id) setGoalMetrics(prev => ({ ...prev, [id]: { ...prev[id], logId: data.id } }))
      }
    } else if (metric.logId) {
      await supabase.from('habit_logs').update({ value: metric.logValue + 1 }).eq('id', metric.logId)
    } else {
      const { data } = await supabase.from('habit_logs').insert({
        habit_id: metric.habitId,
        user_id: userId,
        log_date: today,
        value: 1,
      }).select('id').single()
      if (data?.id) setGoalMetrics(prev => ({ ...prev, [id]: { ...prev[id], logId: data.id } }))
    }
  }, [goalMetrics, today, userId])

  const toggleCalendarFyi = useCallback(async (id: string) => {
    if (!userId) return
    const nextFyi = !calendarEvents.find(event => event.id === id)?.fyi
    const fyiIds = loadCalendarFyiIds(userId)
    if (nextFyi) fyiIds.add(id)
    else fyiIds.delete(id)
    saveCalendarFyiIds(userId, fyiIds)
    setCalendarEvents(previous => previous.map(event => event.id === id
      ? { ...event, fyi: nextFyi, sub: nextFyi ? 'FYI only' : event.sub === 'FYI only' ? 'Google Calendar' : event.sub }
      : event))

    const googleEventId = googleEventIdFromCalendarBlockId(id)
    const { data: rows } = await supabase
      .from('outreach_events')
      .select('id, payload')
      .eq('user_id', userId)
      .eq('source', 'google_calendar')
      .in('event_type', ['meeting_scheduled', 'meetings'])
      .ilike('source_external_id', `gcal-event:${googleEventId}:%`)
    await Promise.all(((rows ?? []) as Array<{ id: string; payload: Record<string, unknown> | null }>).map(row =>
      supabase.from('outreach_events').update({
        payload: {
          ...(row.payload ?? {}),
          calendar_excluded_from_funnel: nextFyi,
          calendar_exclusion_reason: nextFyi ? 'user_marked_fyi_not_mine' : null,
        },
      }).eq('id', row.id).eq('user_id', userId)
    ))
    void refreshOutreachMetrics()
  }, [calendarEvents, refreshOutreachMetrics, userId])

  const openSlot = useCallback(() => {
    const now = new Date()
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    const startAt = today === localDate(now) ? nowMinutes : DAY_START_MINUTES
    const scheduled = todos
      .filter(t => hasSchedule(t))
      .map(t => ({
        start: t.scheduled_start_minutes as number,
        end: (t.scheduled_start_minutes as number) + (t.scheduled_duration_minutes as number),
      }))
      .sort((a, b) => a.start - b.start)
    for (let slot = Math.min(DAY_END_MINUTES - DEFAULT_MUST_DO_DURATION, Math.max(DAY_START_MINUTES, Math.ceil(startAt / 5) * 5)); slot <= DAY_END_MINUTES - DEFAULT_MUST_DO_DURATION; slot += 5) {
      const end = slot + DEFAULT_MUST_DO_DURATION
      if (scheduled.every(block => end <= block.start || slot >= block.end)) return slot
    }
    return Math.max(DAY_START_MINUTES, DAY_END_MINUTES - DEFAULT_MUST_DO_DURATION)
  }, [today, todos])

  const toggleTodo = async (id: string) => {
    const t = todos.find(x => x.id === id); if (!t) return
    const next = !t.completed
    const completedAt = next ? new Date().toISOString() : null
    setTodos(prev => prev.map(x => x.id === id ? { ...x, completed: next, completed_at: completedAt } : x))
    syncMsTodo(id, { completed: next })
    if (isVirtualRecurringTodo(t)) return
    const { error } = await supabase
      .from('todos')
      .update({ completed: next, completed_at: completedAt })
      .eq('id', id)
      .select('id, completed, completed_at')
      .single()
    if (error) {
      setTodos(prev => prev.map(x => x.id === id ? t : x))
      syncMsTodo(id, { completed: t.completed })
      reportSaveError('toggle todo', error)
    }
  }
  const persistTodoPatch = async (todo: Todo, patch: Record<string, unknown>, action: string) => {
    if (isVirtualRecurringTodo(todo)) return null
    const { error } = await supabase.from('todos').update(patch).eq('id', todo.id)
    if (error) reportSaveError(action, error)
    return error
  }
  const mustDoCount = todos.filter(t => t.must_do).length
  const toggleMustDoTodo = async (id: string) => {
    const x = todos.find(t2 => t2.id === id); if (!x) return
    if (!x.must_do) {
      if (mustDoCount >= 2) { showToast('star', '2 max — unmark one first'); return }
      const s = openSlot()
      const patch = { must_do: true, scheduled_start_minutes: s, scheduled_duration_minutes: x.scheduled_duration_minutes || DEFAULT_MUST_DO_DURATION }
      setTodos(p => p.map(t2 => t2.id === id ? { ...t2, ...patch } : t2))
      showToast('star', `Must-do · scheduled ${minToHHMM(s)}`)
      await persistTodoPatch(x, patch, 'mark must-do')
    } else {
      const patch = { must_do: false }
      setTodos(p => p.map(t2 => t2.id === id ? { ...t2, ...patch } : t2))
      await persistTodoPatch(x, patch, 'unmark must-do')
    }
  }
  const toggleMustDoSched = async (id: string) => {
    const x = todos.find(s2 => s2.id === id); if (!x) return
    if (!x.must_do && mustDoCount >= 2) { showToast('star', '2 max — unmark one first'); return }
    const patch = { must_do: !x.must_do }
    setTodos(p => p.map(s2 => s2.id === id ? { ...s2, ...patch } : s2))
    await persistTodoPatch(x, patch, 'toggle scheduled must-do')
  }
  const parkTodo = async (id: string) => {
    const t = todos.find(x => x.id === id)
    if (!t) return
    const patch = { backlog_at: new Date().toISOString(), return_date: null, date: null, scheduled_start_minutes: null, scheduled_duration_minutes: null }
    setTodos(prev => prev.filter(x => x.id !== id))
    setBacklog(prev => [{ ...t, ...patch }, ...prev])
    setBacklogOpen(true)
    if (isVirtualRecurringTodo(t)) return
    await supabase.from('todos').update(patch).eq('id', id)
  }
  const parkAllTodos = async () => {
    const activeTodos = todos.filter(t => !t.completed)
    if (activeTodos.length === 0) return
    const ids = activeTodos.map(t => t.id)
    const idSet = new Set(ids)
    const patch = { backlog_at: new Date().toISOString(), return_date: null, date: null, scheduled_start_minutes: null, scheduled_duration_minutes: null }
    setTodos(prev => prev.filter(t => !idSet.has(t.id)))
    setBacklog(prev => {
      const existing = new Set(prev.map(t => t.id))
      const parked = activeTodos.filter(t => !existing.has(t.id)).map(t => ({ ...t, ...patch }))
      return [...parked, ...prev]
    })
    setBacklogOpen(true)
    const persistedIds = activeTodos.filter(t => !isVirtualRecurringTodo(t)).map(t => t.id)
    if (persistedIds.length > 0) await supabase.from('todos').update(patch).in('id', persistedIds)
  }
  const scheduleTodo = async (id: string, startMinutes: number, durationMinutes: number) => {
    const previous = todos.find(t => t.id === id)
    if (!previous) return
    const patch = {
      scheduled_start_minutes: startMinutes,
      scheduled_duration_minutes: durationMinutes,
    }
    setTodos(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
    if (isVirtualRecurringTodo(previous)) return
    const { error } = await supabase
      .from('todos')
      .update(patch)
      .eq('id', id)
      .select('id, scheduled_start_minutes, scheduled_duration_minutes')
      .single()
    if (error) {
      setTodos(prev => prev.map(t => t.id === id ? previous : t))
      reportSaveError('schedule todo', error)
    }
  }
  const unscheduleTodo = async (id: string) => {
    const previous = todos.find(t => t.id === id)
    if (!previous) return
    const patch = {
      scheduled_start_minutes: null,
      scheduled_duration_minutes: null,
    }
    setTodos(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
    if (isVirtualRecurringTodo(previous)) return
    const { error } = await supabase
      .from('todos')
      .update(patch)
      .eq('id', id)
      .select('id, scheduled_start_minutes, scheduled_duration_minutes')
      .single()
    if (error) {
      setTodos(prev => prev.map(t => t.id === id ? previous : t))
      reportSaveError('unschedule todo', error)
    } else {
      showToast('enter', 'Task unscheduled', 'Undo', () => {
        void scheduleTodo(id, previous.scheduled_start_minutes ?? DAY_START_MINUTES, previous.scheduled_duration_minutes ?? DEFAULT_MUST_DO_DURATION)
      })
    }
  }
  const restoreBacklogTodo = async (id: string) => {
    const t = backlog.find(x => x.id === id)
    if (!t) return
    const restored: Todo = { ...t, date: today, backlog_at: null, return_date: null, scheduled_start_minutes: null, scheduled_duration_minutes: null }
    setBacklog(prev => prev.filter(x => x.id !== id))
    setTodos(prev => [...prev, restored])
    if (isVirtualRecurringTodo(t)) return
    await supabase.from('todos').update({ date: today, backlog_at: null, return_date: null, scheduled_start_minutes: null, scheduled_duration_minutes: null }).eq('id', id)
    if (userId) loadMentions(userId, [...todos, restored])
  }
  const setBacklogReturnDate = async (id: string, returnDate: string | null) => {
    const t = backlog.find(x => x.id === id)
    setBacklog(prev => prev.map(x => x.id === id ? { ...x, return_date: returnDate } : x))
    if (t && isVirtualRecurringTodo(t)) return
    await supabase.from('todos').update({ return_date: returnDate }).eq('id', id)
  }
  const deleteBacklogTodo = async (id: string) => {
    const t = backlog.find(x => x.id === id)
    setBacklog(prev => prev.filter(x => x.id !== id))
    if (t && isVirtualRecurringTodo(t)) return
    await supabase.from('todos').delete().eq('id', id)
  }
  const deleteTodo = async (id: string, rect?: DOMRect, isScheduled = false) => {
    const t = todos.find(x => x.id === id) ?? backlog.find(x => x.id === id)
    if (!t) return
    if (t.recurring_id && !t.backlog_at) {
      setScopeMenu({ item: t, isScheduled, seriesId: t.recurring_id, rect: rect ?? new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 0, 0) })
      return
    }
    setTodos(prev => prev.filter(x => x.id !== id))
    setBacklog(prev => prev.filter(x => x.id !== id))
    if (t.milestone_id) setMsTodos(prev => prev.filter(x => x.id !== id))
    if (!isVirtualRecurringTodo(t)) await supabase.from('todos').delete().eq('id', id)
    showToast('trash', 'Todo deleted')
  }
  const createMention = useCallback(async (kind: TodoMentionKind, name: string, companyId?: string | null) => {
    if (!userId) return null
    const created = await createCrmObject(supabase, userId, kind, name, { today, companyId })
    if (!created) return null
    setMentionOptions(prev => {
      const exists = prev.some(m => m.kind === created.mention.kind && m.id === created.mention.id)
      return exists ? prev : [...prev, created.mention].sort((a, b) => a.name.localeCompare(b.name))
    })
    setMentions(prev => {
      const next = new Map(prev)
      if (created.mention.id) next.set(`${created.mention.kind}:${created.mention.id}`, created.mention)
      return next
    })
    return created.mention
  }, [today, userId])

  const editTodoText = async (id: string, text: string, contentSegments: TodoContentSegment[], links?: TodoLinks) => {
    const currentTodo = todos.find(x => x.id === id)
    const patch: Partial<Todo> = { text, content_segments: contentSegments }
    if (links?.contactId !== undefined) patch.contact_id = links.contactId
    if (links?.companyId !== undefined) patch.company_id = links.companyId
    if (links?.opportunityId !== undefined) patch.opportunity_id = links.opportunityId
    setTodos(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x))
    if (currentTodo && isVirtualRecurringTodo(currentTodo)) return
    const updatePayload = {
      text,
      content_segments: contentSegments,
      ...(links?.contactId !== undefined ? { contact_id: links.contactId } : {}),
      ...(links?.companyId !== undefined ? { company_id: links.companyId } : {}),
      ...(links?.opportunityId !== undefined ? { opportunity_id: links.opportunityId } : {}),
    }
    const { error } = await supabase.from('todos').update(updatePayload).eq('id', id)
    if (shouldFallbackWithoutContentSegments(error)) {
      const { error: fallbackError } = await supabase
        .from('todos')
        .update({
          text: legacyTextFromContentSegments(contentSegments, text),
          ...(links?.contactId !== undefined ? { contact_id: links.contactId } : {}),
          ...(links?.companyId !== undefined ? { company_id: links.companyId } : {}),
          ...(links?.opportunityId !== undefined ? { opportunity_id: links.opportunityId } : {}),
        })
        .eq('id', id)
      if (fallbackError) console.error('editTodoText fallback failed:', fallbackError)
    } else if (error) {
      console.error('editTodoText failed:', error)
    }
    if (userId && links) loadMentions(userId, todos.map(x => x.id === id ? { ...x, ...patch } as Todo : x))
  }
  const addTodo = async (
    text: string,
    milestoneId: string | null,
    contentSegments: TodoContentSegment[],
    links: TodoLinks = {},
    schedule?: { start: number; duration: number },
    featured = false,
  ) => {
    if (!userId) return
    const milestone = milestoneId ? milestones.find(m => m.id === milestoneId) : null
    const selectedOpp = links.opportunityId ? mentionOptions.find(m => m.kind === 'opportunity' && m.id === links.opportunityId) : null
    const companyId = links.companyId ?? selectedOpp?.companyId ?? null
    const todoId = crypto.randomUUID()
    const optimisticTodo: Todo = {
      id: todoId,
      text,
      user_id: userId,
      date: today,
      content_segments: contentSegments,
      milestone_id: milestoneId,
      goal_id: milestone?.goal_id ?? null,
      contact_id: links.contactId ?? null,
      company_id: companyId,
      opportunity_id: links.opportunityId ?? null,
      effort: null,
      block: null,
      completed: false,
      waiting: false,
      completed_at: null,
      scheduled_start_minutes: schedule?.start ?? null,
      scheduled_duration_minutes: schedule?.duration ?? null,
      must_do: false,
      recurring_id: null,
      sort_order: todos.length,
      url: null,
      outreach_log_id: null,
      attio_task_id: null,
      is_featured: featured,
      created_at: new Date().toISOString(),
    }
    setTodos(prev => [...prev, optimisticTodo])
    if (milestoneId) setMsTodos(prev => [...prev, { id: todoId, milestone_id: milestoneId, completed: false }])

    const insertPayload = {
      id: todoId, text, user_id: userId, date: today,
      content_segments: contentSegments,
      milestone_id: milestoneId, goal_id: milestone?.goal_id ?? null,
      contact_id: links.contactId ?? null,
      company_id: companyId,
      opportunity_id: links.opportunityId ?? null,
      scheduled_start_minutes: schedule?.start ?? null,
      scheduled_duration_minutes: schedule?.duration ?? null,
      is_featured: featured,
    }
    const { error } = await supabase.from('todos').insert(insertPayload)
    if (shouldFallbackWithoutContentSegments(error)) {
      const { error: fallbackError } = await supabase
        .from('todos')
        .insert({
          id: todoId,
          text: legacyTextFromContentSegments(contentSegments, text),
          user_id: userId,
          date: today,
          milestone_id: milestoneId,
          goal_id: milestone?.goal_id ?? null,
          contact_id: links.contactId ?? null,
          company_id: companyId,
          opportunity_id: links.opportunityId ?? null,
          scheduled_start_minutes: schedule?.start ?? null,
          scheduled_duration_minutes: schedule?.duration ?? null,
          is_featured: featured,
        })
      if (fallbackError) {
        console.error('addTodo fallback failed:', fallbackError)
        return
      }
    } else if (error) {
      console.error('addTodo failed:', error)
      return
    }
    loadMentions(userId, [...todos, optimisticTodo])
  }

  const linksFromSegments = (contentSegments: TodoContentSegment[]): TodoLinks => {
    const links: TodoLinks = {}
    for (const segment of contentSegments) {
      if (segment.type !== 'mention') continue
      if (segment.kind === 'person' && links.contactId === undefined) links.contactId = segment.id
      if (segment.kind === 'company' && links.companyId === undefined) links.companyId = segment.id
      if (segment.kind === 'opportunity' && links.opportunityId === undefined) {
        links.opportunityId = segment.id
        if (links.companyId === undefined) links.companyId = segment.companyId ?? null
      }
    }
    return links
  }

  const milestoneIdFromEditor = (meta: EditorMeta) =>
    meta.ms ? milestoneOptions.find(option => option.name === meta.ms)?.id ?? null : null

  const addTodoFromHandoff = async (meta: EditorMeta) => {
    const contentSegments = editorSegmentsToTodo(meta.segments)
    const text = editorText(meta.segments)
    const schedule = meta.schedule ? { start: openSlot(), duration: DEFAULT_MUST_DO_DURATION } : undefined
    await addTodo(text, milestoneIdFromEditor(meta), contentSegments, linksFromSegments(contentSegments), schedule, meta.priority)
  }

  const updateTodoFromHandoff = async (todo: Todo, meta: EditorMeta) => {
    const contentSegments = editorSegmentsToTodo(meta.segments)
    const text = editorText(meta.segments)
    const links = linksFromSegments(contentSegments)
    await editTodoText(todo.id, text, contentSegments, links)
    await changeTodoMilestone(todo.id, milestoneIdFromEditor(meta))
    if (todo.is_featured !== meta.priority) {
      setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, is_featured: meta.priority } : t))
      if (!isVirtualRecurringTodo(todo)) await supabase.from('todos').update({ is_featured: meta.priority }).eq('id', todo.id)
    }
    if (meta.schedule && !hasSchedule(todo)) await scheduleTodo(todo.id, openSlot(), DEFAULT_MUST_DO_DURATION)
  }

  const changeTodoMilestone = async (id: string, milestoneId: string | null) => {
    const todo = todos.find(x => x.id === id)
    if (!todo) return
    const milestone = milestoneId ? milestones.find(m => m.id === milestoneId) : null
    const patch: Partial<Todo> = {
      milestone_id: milestoneId,
      goal_id: milestone?.goal_id ?? null,
    }
    setTodos(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x))
    setMsTodos(prev => {
      const without = prev.filter(x => x.id !== id)
      if (!milestoneId) return without
      return [...without, { id, milestone_id: milestoneId, completed: todo.completed }]
    })
    if (isVirtualRecurringTodo(todo)) return
    await supabase.from('todos').update({
      milestone_id: milestoneId,
      goal_id: milestone?.goal_id ?? null,
    }).eq('id', id)
  }

  const saveSeriesState = (next: RecurringSeries[]) => {
    setRecurSeries(next)
    saveRecurSeries(next)
    if (!userId) return
    ;(async () => {
      const { error: deleteError } = await supabase
        .from('recurring_task_series')
        .delete()
        .eq('user_id', userId)
      if (deleteError) {
        console.warn('Failed to sync recurring series delete:', deleteError.message)
        return
      }
      if (next.length === 0) return
      const { error: insertError } = await supabase
        .from('recurring_task_series')
        .insert(next.map(series => recurringSeriesToRow(series, userId)))
      if (insertError) console.warn('Failed to sync recurring series insert:', insertError.message)
    })()
  }
  const occurrenceForSeries = (series: RecurringSeries) => userId ? materializeRecurringSeries(series, userId, today) : null
  const applyRecurItemPatch = (seriesId: string, fields: RecurringFormFields) => {
    setTodos(prev => prev.map(item => {
      if (item.recurring_id !== seriesId) return item
      return {
        ...item,
        text: fields.name,
        content_segments: [{ type: 'text', text: fields.name }],
        scheduled_start_minutes: fields.time,
        scheduled_duration_minutes: fields.time != null ? fields.dur : null,
      }
    }))
  }
  const upsertTodayOccurrence = async (series: RecurringSeries) => {
    const occurrence = occurrenceForSeries(series)
    if (!occurrence || !seriesAppliesOn(series, new Date(today + 'T12:00:00'))) return
    const { data } = await supabase.from('todos').insert({ id: occurrence.id, user_id: occurrence.user_id, text: occurrence.text, content_segments: occurrence.content_segments, date: today, completed: false, waiting: false, sort_order: occurrence.sort_order, is_featured: false, scheduled_start_minutes: occurrence.scheduled_start_minutes, scheduled_duration_minutes: occurrence.scheduled_duration_minutes, must_do: false, recurring_id: series.id }).select('*').single()
    setTodos(prev => [...prev.filter(item => item.recurring_id !== series.id), (data as Todo | null) ?? occurrence])
  }
  const openRecurNew = () => {
    setRecurPanelOpen(false)
    setRecurForm({ mode: 'create' })
  }
  const openRecurEditSeriesById = (seriesId: string) => {
    const s = recurSeries.find(x => x.id === seriesId); if (!s) return
    setRecurPanelOpen(false); setScopeMenu(null)
    setRecurForm({ mode: 'series', initial: s, seriesId })
  }
  const openRecurEditOccurrence = (item: Todo, isScheduled: boolean) => {
    setScopeMenu(null)
    setRecurForm({
      mode: 'occurrence',
      initial: {
        name: textFromTodo(item),
        dur: item.scheduled_duration_minutes || DEFAULT_MUST_DO_DURATION,
        time: isScheduled ? item.scheduled_start_minutes ?? null : null,
      },
      itemId: item.id,
      isScheduled,
      seriesId: item.recurring_id ?? undefined,
    })
  }
  const openConvertToRecurring = (item: Todo, isScheduled: boolean) => {
    setScopeMenu(null)
    setRecurForm({
      mode: 'convert',
      initial: {
        name: textFromTodo(item),
        dur: item.scheduled_duration_minutes || DEFAULT_MUST_DO_DURATION,
        time: isScheduled ? item.scheduled_start_minutes ?? null : null,
      },
      itemId: item.id,
      isScheduled,
    })
  }
  const onRecurIconClick = (item: Todo, isScheduled: boolean, rect: DOMRect) => {
    if (item.recurring_id) setScopeMenu({ item, isScheduled, seriesId: item.recurring_id, rect })
    else openConvertToRecurring(item, isScheduled)
  }
  const saveRecurForm = async (fields: RecurringFormFields) => {
    if (recurForm?.mode === 'create' || recurForm?.mode === 'convert') {
      const s: RecurringSeries = { id: recNid(), active: true, ...fields }
      const next = [...recurSeries, s]
      saveSeriesState(next)
      if (recurForm.mode === 'convert' && recurForm.itemId) {
        const converted = todos.find(t => t.id === recurForm.itemId)
        setTodos(prev => prev.filter(t => t.id !== recurForm.itemId))
        if (converted && !isVirtualRecurringTodo(converted)) await supabase.from('todos').delete().eq('id', converted.id)
      }
      await upsertTodayOccurrence(s)
      showToast('repeat', `"${s.name}" set to recur`)
    } else if (recurForm?.mode === 'series' && recurForm.seriesId) {
      const seriesId = recurForm.seriesId
      const next = recurSeries.map(s => s.id === seriesId ? { ...s, ...fields } : s)
      saveSeriesState(next)
      const s = next.find(x => x.id === seriesId)
      if (s && seriesAppliesOn(s, new Date(today + 'T12:00:00'))) {
        applyRecurItemPatch(seriesId, fields)
        await supabase.from('todos').update({ text: fields.name, content_segments: [{ type: 'text', text: fields.name }], scheduled_start_minutes: fields.time, scheduled_duration_minutes: fields.time != null ? fields.dur : null }).eq('user_id', userId).eq('recurring_id', seriesId).gte('date', today)
      }
      else setTodos(prev => prev.filter(x => x.recurring_id !== seriesId))
      showToast('repeat', 'Recurring task updated')
    } else if (recurForm?.mode === 'occurrence' && recurForm.itemId) {
      const itemId = recurForm.itemId
      const occurrencePatch = {
        text: fields.name,
        content_segments: [{ type: 'text' as const, text: fields.name }],
        scheduled_start_minutes: fields.time,
        scheduled_duration_minutes: fields.time != null ? fields.dur : null,
      }
      setTodos(prev => prev.map(item => item.id === itemId ? {
        ...item,
        ...occurrencePatch,
      } : item))
      await supabase.from('todos').update(occurrencePatch).eq('id', itemId)
      if (userId && recurForm.seriesId) await supabase.from('recurring_task_exceptions').upsert({ user_id: userId, series_id: recurForm.seriesId, occurrence_date: today, action: 'modify', todo_id: itemId }, { onConflict: 'user_id,series_id,occurrence_date' })
      showToast('repeat', 'Occurrence updated')
    }
    setRecurForm(null)
  }
  const deleteSeries = (seriesId: string) => {
    const s = recurSeries.find(x => x.id === seriesId)
    const next = recurSeries.filter(x => x.id !== seriesId)
    saveSeriesState(next)
    setTodos(prev => prev.filter(x => x.recurring_id !== seriesId))
    if (userId) void supabase.from('todos').delete().eq('user_id', userId).eq('recurring_id', seriesId).gte('date', today)
    setRecurForm(null); setRecurPanelOpen(false); setScopeMenu(null)
    showToast('trash', `"${s ? s.name : 'Recurring task'}" removed`)
  }
  const deleteOccurrence = async (item: Todo) => {
    setTodos(prev => prev.filter(t => t.id !== item.id))
    setScopeMenu(null)
    if (userId && item.recurring_id) {
      await supabase.from('recurring_task_exceptions').upsert({ user_id: userId, series_id: item.recurring_id, occurrence_date: today, action: 'skip', todo_id: null }, { onConflict: 'user_id,series_id,occurrence_date' })
      await supabase.from('todos').delete().eq('id', item.id)
    }
    showToast('trash', 'Removed for today')
  }
  const handleScopePick = (action: RecurringScopeAction, scope: RecurringScope) => {
    if (!scopeMenu) return
    const { item, isScheduled, seriesId } = scopeMenu
    if (action === 'edit') {
      if (scope === 'occurrence') openRecurEditOccurrence(item, isScheduled)
      else openRecurEditSeriesById(seriesId)
    } else {
      if (scope === 'occurrence') void deleteOccurrence(item)
      else deleteSeries(seriesId)
    }
  }

  // ── milestone panel todo sync ──────────────────────────────────
  const onPanelTodoCreate = (t: Todo) => {
    if (t.milestone_id) setMsTodos(prev => prev.some(x => x.id === t.id) ? prev : [...prev, { id: t.id, milestone_id: t.milestone_id, completed: t.completed }])
    if (t.date === today) setTodos(prev => prev.some(x => x.id === t.id) ? prev : [...prev, t])
  }
  const onPanelTodoUpdate = (t: Todo) => {
    if (t.milestone_id) syncMsTodo(t.id, { completed: t.completed, milestone_id: t.milestone_id })
    setTodos(prev => {
      const inToday = t.date === today
      const exists = prev.some(x => x.id === t.id)
      if (inToday) return exists ? prev.map(x => x.id === t.id ? t : x) : [...prev, t]
      return prev.filter(x => x.id !== t.id)
    })
  }
  const onPanelTodoDelete = (id: string) => {
    setTodos(prev => prev.filter(x => x.id !== id))
    setMsTodos(prev => prev.filter(x => x.id !== id))
  }

  const expandedMilestone = milestones.find(m => m.id === expandedMs) ?? null
  const expandedGoal = expandedMilestone ? goalsMap.get(expandedMilestone.goal_id) ?? null : null

  const activeTodoCount = todos.filter(t => !t.completed).length
  const scheduledTodos = todos.filter(hasSchedule)
  const unscheduledTodos = todos
    .filter(t => !hasSchedule(t))
    .sort((a, b) => Number(a.completed) - Number(b.completed) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const funnelStages: TodayFunnelStage[] = useMemo(() => {
    const labels: Record<keyof OutreachMetricCounts, string> = { reached: 'Reached', accepted: 'Accepted', replies: 'Replies', meetings: 'Meetings', intros: 'Intros' }
    return (Object.keys(labels) as Array<keyof OutreachMetricCounts>).map(id => {
      const people = new Map<string, TodayFunnelStage['people'][number]>()
      const weeklyPeople = new Map<string, TodayFunnelStage['people'][number]>()
      outreachEvents.filter(event => metricForOutreachEvent(event.event_type) === id).forEach(event => {
        const contact = firstRelation(event.contact)
        if (contact) {
          const person = { id: contact.id, name: contactDisplayName(contact.name), sub: [contact.job_title, contact.company].filter(Boolean).join(' · ') || null, imageUrl: contact.profile_photo_url }
          weeklyPeople.set(contact.id, person)
          if (event.occurred_on === today) people.set(contact.id, person)
        }
      })
      return { id, label: labels[id], value: outreachDayCounts[id], target: funnelTargets[id].day, weeklyValue: outreachWeekCounts[id], weeklyTarget: funnelTargets[id].week, prevValue: outreachPrevCounts[id], people: [...people.values()], weeklyPeople: [...weeklyPeople.values()] }
    })
  }, [funnelTargets, outreachDayCounts, outreachEvents, outreachPrevCounts, outreachWeekCounts, today])
  const goalStats: TodayGoalStat[] = useMemo(() => {
    const stateFor = (metric: GoalMetric): TodayGoalStat['state'] => {
      if (metric.value >= metric.target) return 'hit'
      if (metric.value > 0) return metric.value >= metric.target * 0.5 ? 'ok' : 'warn'
      return 'neutral'
    }
    return [
      {
        id: 'apps',
        icon: 'mailPlus',
        label: 'Applications',
        value: goalMetrics.apps.value,
        target: goalMetrics.apps.target,
        period: 'weekly',
        state: stateFor(goalMetrics.apps),
        onBump: undefined,
      },
      {
        id: 'gym',
        icon: 'dumbbell',
        label: 'Gym',
        value: goalMetrics.gym.value,
        target: goalMetrics.gym.target,
        period: 'weekly',
        state: stateFor(goalMetrics.gym),
        onBump: goalMetrics.gym.habitId ? () => { void bumpGoalMetric('gym') } : undefined,
      },
    ]
  }, [bumpGoalMetric, goalMetrics])

  const closeDayStats: CloseDayStats = useMemo(() => {
    const now = new Date()
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    const meetings = calendarEvents.filter(event => event.type === 'meeting' && !event.fyi)
    return {
      tasksDone: todos.filter(todo => todo.completed).length,
      tasksTotal: todos.length,
      mustDoDone: todos.filter(todo => todo.must_do && todo.completed).length,
      mustDoTotal: todos.filter(todo => todo.must_do).length,
      meetingsAttended: meetings.filter(meeting => meeting.start + meeting.dur <= nowMinutes).length,
      meetingsTotal: meetings.length,
      objective: dailyGoal,
      objectiveLink,
      funnel: funnelStages.map(stage => ({ id: stage.id, label: stage.label, value: stage.value, target: stage.target })),
    }
  }, [calendarEvents, dailyGoal, funnelStages, objectiveLink, todos])

  const openCloseDay = async () => {
    if (!userId) return
    const [todosResult, eventsResult, refreshedCalendar] = await Promise.all([
      supabase.from('todos').select('*').eq('user_id', userId).eq('date', today).is('backlog_at', null).order('sort_order').order('created_at'),
      supabase.from('outreach_daily_metric_contacts').select('id, event_type, occurred_on, contact_id').eq('user_id', userId).eq('occurred_on', today),
      loadGoogleCalendarEvents(today),
    ])
    const freshTodos = todosResult.error ? todos : (todosResult.data ?? []) as Todo[]
    const freshCounts = eventsResult.error ? outreachDayCounts : countOutreachEvents((eventsResult.data ?? []) as OutreachEventRow[])
    const now = new Date()
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    const meetings = refreshedCalendar.filter(event => event.type === 'meeting' && !event.fyi)
    setCloseDaySnapshot({
      unfinished: freshTodos.filter(todo => !todo.completed),
      stats: {
        tasksDone: freshTodos.filter(todo => todo.completed).length,
        tasksTotal: freshTodos.length,
        mustDoDone: freshTodos.filter(todo => todo.must_do && todo.completed).length,
        mustDoTotal: freshTodos.filter(todo => todo.must_do).length,
        meetingsAttended: meetings.filter(meeting => meeting.start + meeting.dur <= nowMinutes).length,
        meetingsTotal: meetings.length,
        objective: dailyGoal,
        objectiveLink,
        funnel: funnelStages.map(stage => ({ id: stage.id, label: stage.label, value: freshCounts[stage.id as keyof OutreachMetricCounts], target: stage.target })),
      },
    })
    setEndOpen(true)
  }

  const commitCloseDay = async ({ carryIds, objective }: { carryIds: string[]; objective: string }) => {
    if (!userId || closingDay) return
    setClosingDay(true)
    const tomorrow = addDays(today, 1)
    const unfinished = (closeDaySnapshot?.unfinished ?? todos.filter(todo => !todo.completed)).filter(todo => !isVirtualRecurringTodo(todo))
    const carrySet = new Set(carryIds)
    const carried = unfinished.filter(todo => carrySet.has(todo.id))
    const parked = unfinished.filter(todo => !carrySet.has(todo.id))
    const closedAt = new Date().toISOString()
    const summary: DayCloseSummary = {
      removedTodoIds: carried.map(todo => todo.id),
      removedBacklogIds: parked.map(todo => todo.id),
      carriedCount: carried.length,
      clearedCount: parked.length,
      completedCount: todos.filter(todo => todo.completed).length,
      pendingCount: unfinished.length,
      energyLevel: null,
      goalDone: null,
      tomorrowGoal: objective.trim() || undefined,
      movedItems: unfinished.map(todo => ({
        id: todo.id,
        destination: carrySet.has(todo.id) ? 'tomorrow' : 'backlog',
        mustDo: Boolean(todo.must_do),
        start: todo.scheduled_start_minutes ?? null,
        duration: todo.scheduled_duration_minutes ?? null,
      })),
    }
    try {
      if (carried.length) {
        const { error } = await supabase.from('todos').update({ date: tomorrow, scheduled_start_minutes: null, scheduled_duration_minutes: null }).eq('user_id', userId).eq('date', today).in('id', carried.map(todo => todo.id))
        if (error) throw error
      }
      if (parked.length) {
        const { error } = await supabase.from('todos').update({ date: null, backlog_at: closedAt, return_date: null, scheduled_start_minutes: null, scheduled_duration_minutes: null, must_do: false }).eq('user_id', userId).eq('date', today).in('id', parked.map(todo => todo.id))
        if (error) throw error
      }
      if (objective.trim()) {
        const { error } = await supabase.from('reviews').upsert({ user_id: userId, date: tomorrow, one_thing: objective.trim() }, { onConflict: 'user_id,date' })
        if (error) throw error
      }
      const { error: reviewError } = await supabase.from('reviews').upsert({ user_id: userId, date: today, tomorrow_reviewed: true, day_locked_at: closedAt, tomorrow_focus: objective.trim() || null, today_close_summary: summary }, { onConflict: 'user_id,date' })
      if (reviewError) throw reviewError
      setTodos(current => current.filter(todo => todo.completed || isVirtualRecurringTodo(todo)))
      setBacklog(current => [...parked.map(todo => ({ ...todo, date: null, backlog_at: closedAt, must_do: false })), ...current])
      setClosedSummary(summary)
      setDayClosed(true)
      setEndOpen(false)
      setCloseDaySnapshot(null)
      showToast('checkcircle', `${carried.length} task${carried.length === 1 ? '' : 's'} carried to tomorrow`)
    } catch (error) {
      console.error('Could not close the day:', error)
      showToast('x', 'Could not close day — try again')
    } finally {
      setClosingDay(false)
    }
  }

  const onJournalChange = (value: string) => {
    setJournal(value)
    if (!userId) return
    if (journalTimer.current) clearTimeout(journalTimer.current)
    journalTimer.current = setTimeout(() => {
      supabase.from('reviews').upsert({ user_id: userId, date: today, notes: value }, { onConflict: 'user_id,date' }).then(() => {})
    }, 700)
  }

  const contextSections: RailSectionDef[] = userId ? [
    {
      id: 'milestones', title: 'Milestones', icon: <Target size={13} />, count: milestoneRows.length,
      body: <MilestoneRows rows={milestoneRows} activeId={expandedMs} onExpand={setExpandedMs} onManage={() => navigate('/milestones')} />,
    },
    {
      id: 'thisweek', title: 'This week', icon: <ChartLineUp size={13} />, tone: 'lagging',
      body: <ThisWeek userId={userId} weekDates={weekDates} today={today} onManage={() => navigate('/milestones')} />,
    },
    {
      id: 'agenda', title: 'Agenda', icon: <CalendarDots size={13} />, count: 0,
      body: <AgendaRows />,
    },
    {
      id: 'journal', title: 'Journal', icon: <PencilSimple size={13} />,
      body: null,
    },
  ] : []

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const editing = target?.closest('input, textarea, [contenteditable="true"]')
      if (editing) return
      if (event.key.toLowerCase() === 'j') {
        event.preventDefault()
        setContextOpen(open => !open)
      }
      if (event.key === 'Escape') setContextOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const reopenDay = async () => {
    if (!userId) return
    const movedItems = closedSummary?.movedItems ?? (closedSummary?.removedTodoIds ?? []).map(id => ({ id, destination: 'tomorrow' as const, mustDo: false, start: null, duration: null }))
    const ids = movedItems.map(item => item.id)
    try {
      if (movedItems.length > 0) {
        const results = await Promise.all(movedItems.map(item => supabase.from('todos').update({
          date: today,
          backlog_at: null,
          return_date: null,
          must_do: item.mustDo,
          scheduled_start_minutes: item.start,
          scheduled_duration_minutes: item.duration,
        }).eq('user_id', userId).eq('id', item.id)))
        const restoreError = results.find(result => result.error)?.error
        if (restoreError) throw restoreError
      }
      const { error: reviewError } = await supabase.from('reviews').upsert({ user_id: userId, date: today, tomorrow_reviewed: false, day_locked_at: null, today_close_summary: null }, { onConflict: 'user_id,date' })
      if (reviewError) throw reviewError
      if (ids.length > 0) {
        const { data, error } = await supabase.from('todos').select('*').in('id', ids)
        if (error) throw error
        if (data) {
          setBacklog(prev => prev.filter(todo => !ids.includes(todo.id)))
          setTodos(prev => {
            const byId = new Map(prev.map(t => [t.id, t]))
            ;(data as Todo[]).forEach(t => byId.set(t.id, t))
            return [...byId.values()]
          })
          setMsTodos(prev => {
            const byId = new Map(prev.map(t => [t.id, t]))
            ;(data as Todo[]).forEach(t => {
              if (t.milestone_id) byId.set(t.id, { id: t.id, milestone_id: t.milestone_id, completed: t.completed })
            })
            return [...byId.values()]
          })
        }
      }
      setClosedSummary(null)
      setDayClosed(false)
    } catch (error) {
      console.error('Could not reopen the day:', error)
      showToast('x', 'Could not reopen day — try again')
    }
  }

  return (
    <>
      <TodayHandoffView
        today={today}
        todayLabel={todayLabel}
        isHistorical={isHistorical}
        dailyGoal={dailyGoal}
        objectiveLink={objectiveLink}
        dayClosed={dayClosed}
        saveError={saveError}
        todos={todos}
        backlog={backlog}
        calendarEvents={calendarEvents}
        calendarError={calendarError}
        funnelStages={funnelStages}
        goalStats={goalStats}
        milestoneOptions={milestoneOptions}
        mentionOptions={mentionOptions}
        recurSeries={recurSeries}
        recurPanelOpen={recurPanelOpen}
        recurRect={recurRect}
        recurForm={recurForm}
        scopeMenu={scopeMenu}
        focus={focus}
        toast={toast}
        onDailyGoalChange={async value => {
          setDailyGoal(value)
          if (userId) await supabase.from('reviews').upsert({ user_id: userId, date: today, one_thing: value }, { onConflict: 'user_id,date' })
        }}
        onPreviousDay={() => navigateDay(-1)}
        onNextDay={() => navigateDay(1)}
        onObjectiveLinkChange={async value => {
          setObjectiveLink(value)
          if (!userId) return
          await supabase.from('reviews').upsert({ user_id: userId, date: today, objective_link_kind: value?.kind ?? null, objective_link_id: value?.id ?? null, objective_link_label: value?.name ?? null, objective_link_logo: value?.imageUrl ?? null }, { onConflict: 'user_id,date' })
        }}
        onOpenRecord={mention => navigate(pathForMention(mention))}
        onOpenFunnel={stageId => navigate(`/people?todayStage=${stageId}&date=${today}`)}
        onReconnectGoogle={() => {
          markGoogleDriveScopeRequested()
          void supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/today`, scopes: GOOGLE_OAUTH_SCOPES_STRING, queryParams: { access_type: 'offline', prompt: 'consent' } } })
        }}
        onToggleCalendarFyi={toggleCalendarFyi}
        onDismissSaveError={() => setSaveError(null)}
        onToggleTodo={toggleTodo}
        onToggleMustDoTodo={toggleMustDoTodo}
        onToggleMustDoSched={toggleMustDoSched}
        onScheduleTodo={scheduleTodo}
        onUnscheduleTodo={unscheduleTodo}
        onBacklogTodo={parkTodo}
        onRestoreBacklogTodo={restoreBacklogTodo}
        onDeleteTodo={deleteTodo}
        onAddEditor={addTodoFromHandoff}
        onUpdateEditor={updateTodoFromHandoff}
        onOpenFocus={() => setFocusOpen(true)}
        onOpenEndDay={() => { void openCloseDay() }}
        onReopenDay={reopenDay}
        onManageMilestones={() => navigate('/milestones')}
        onRecurringPanelToggle={rect => {
          setRecurRect(rect)
          setRecurPanelOpen(v => !v)
        }}
        onRecurringPanelClose={() => setRecurPanelOpen(false)}
        onRecurringNew={openRecurNew}
        onRecurringEditSeries={openRecurEditSeriesById}
        onRecurringDeleteSeries={deleteSeries}
        onRecurringFormClose={() => setRecurForm(null)}
        onRecurringFormSave={saveRecurForm}
        onRecurringFormDelete={recurForm?.mode === 'series' && recurForm.seriesId ? () => deleteSeries(recurForm.seriesId as string) : undefined}
        onScopeClose={() => setScopeMenu(null)}
        onScopePick={handleScopePick}
        onRecurringIconClick={onRecurIconClick}
      />

      {userId && !isHistorical && expandedMilestone && (
        <MilestonePanel
          milestone={expandedMilestone}
          goal={expandedGoal}
          userId={userId}
          today={today}
          onClose={() => setExpandedMs(null)}
          onMilestoneUpdate={(m) => {
            if (m.status === 'COMPLETE') {
              setMilestones(prev => prev.filter(x => x.id !== m.id))
              setExpandedMs(null)
            } else {
              setMilestones(prev => prev.map(x => x.id === m.id ? { ...x, ...m } : x))
            }
          }}
          onMilestoneDelete={(id) => { setMilestones(prev => prev.filter(x => x.id !== id)); setExpandedMs(null) }}
          onTodoCreate={onPanelTodoCreate}
          onTodoUpdate={onPanelTodoUpdate}
          onTodoDelete={onPanelTodoDelete}
        />
      )}

      {userId && !isHistorical && (
        <FocusTimer
          open={focusOpen}
          onClose={() => setFocusOpen(false)}
          onStart={focus.start}
          goals={goals.map(g => ({ id: g.id, text: g.text, emoji: g.emoji }))}
        />
      )}

      {userId && !isHistorical && startOpen && (
        <DayStartDrawer
          today={today}
          userId={userId}
          initialGoal={dailyGoal}
          todos={todos}
          userName={userName}
          onClose={() => { localStorage.setItem(`rethink.today.started:${today}`, '1'); setStartOpen(false) }}
          onSave={async (goal) => {
            if (userId) {
              const { error } = await supabase.from('reviews').upsert({ user_id: userId, date: today, one_thing: goal }, { onConflict: 'user_id,date' })
              if (error) throw error
            }
            localStorage.setItem(`rethink.today.started:${today}`, '1')
            setDailyGoal(goal)
            setStartOpen(false)
          }}
        />
      )}

      {userId && !isHistorical && endOpen && <CloseDayFlow stats={closeDaySnapshot?.stats ?? closeDayStats} unfinished={closeDaySnapshot?.unfinished ?? todos.filter(todo => !todo.completed)} saving={closingDay} onClose={() => { setEndOpen(false); setCloseDaySnapshot(null) }} onCommit={commitCloseDay} />}
    </>
  )
}
