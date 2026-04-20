import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  Lightning, Check, Play, Pause, Stop,
  Timer, CalendarBlank, SidebarSimple,
  Flame, TrashSimple, NotePencil, GearSix,
  DotsSixVertical,
  X, Flag, ChartLine, HourglassMedium, MagicWand, Pencil, ArrowsOut, ArrowsIn, Circle,
  ArrowSquareOut, CaretRight, Star, LockSimple, LockSimpleOpen,
} from '@phosphor-icons/react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent, useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '@/lib/supabase'
import type { Todo, Habit, HabitLog, Review, Milestone, Goal, LeadingIndicator, IndicatorDailyLog, Capture, Contact, ContactStatus, ContactMilestone, Company, Opportunity } from '@/types'
import { useContacts, type ContactInput } from '@/hooks/useContacts'
import { useCompanies } from '@/hooks/useCompanies'
import { useOpportunities } from '@/hooks/useOpportunities'
import { createAttioTask, completeAttioTask, hasAttioKey } from '@/lib/attio'
import ContactDetailDrawer from '@/components/ContactDetailDrawer'
import { parseJournalCaptures } from '@/lib/captureParser'
import CaptureModal from '@/components/CaptureModal'
import { JournalEditor } from '@/components/JournalEditor'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useHabitNotifications } from '@/hooks/useHabitNotifications'
import StreakCelebration from '@/components/StreakCelebration'
import EndOfDayDrawer from '@/components/EndOfDayDrawer'
import NewsletterPill from '@/components/NewsletterPill'
import MilestonePanel from '@/components/MilestonePanel'
import MilestoneOverviewPanel from '@/components/MilestoneOverviewPanel'
import HabitEditModal from '@/components/HabitEditModal'
import { openLink } from '@/lib/openLink'
import { WeeklyPulse } from '@/components/WeeklyPulse'
import { MilestoneCapture } from '@/components/MilestoneCapture'
import { WeeklyGoalsModal } from '@/components/WeeklyGoalsModal'
import { SuggestionsPanel } from '@/components/SuggestionsPanel'
import OutreachPanel from '@/components/OutreachPanel'
import { useGeminiScorer, hasGeminiKey } from '@/hooks/useGeminiScorer'
import { getSettings } from '@/lib/userSettings'

const FOCUS_DURATIONS = [
  { label: '25', minutes: 25, desc: 'Pomodoro' },
  { label: '52', minutes: 52, desc: 'Ultradian' },
  { label: '90', minutes: 90, desc: 'Deep Work' },
]


function formatMilestoneDate(date: string): string {
  const parts = date.split('-')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  if (parts.length >= 3) {
    const d = new Date(date + 'T12:00:00')
    if (!isNaN(d.getTime())) return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
  }
  if (parts.length >= 2) {
    const mIdx = parseInt(parts[1]) - 1
    return `${months[mIdx] ?? '?'} ${parts[0]}`
  }
  return date
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function computeContactMilestoneDaysUntil(m: ContactMilestone): number | null {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  if (m.date_mm_dd) {
    const [month, day] = m.date_mm_dd.split('-')
    let next = new Date(today.getFullYear(), parseInt(month) - 1, parseInt(day))
    if (next < today) next.setFullYear(today.getFullYear() + 1)
    return Math.round((next.getTime() - today.getTime()) / 86400000)
  }
  if (m.date_full) {
    const d = new Date(m.date_full); d.setHours(0, 0, 0, 0)
    return Math.round((d.getTime() - today.getTime()) / 86400000)
  }
  return null
}

const CONTACT_MILESTONE_EMOJI: Record<string, string> = {
  birthday_contact: '🎂',
  birthday_child:   '👶',
  birthday_partner: '💑',
  anniversary:      '🎉',
  anniversary_work: '💼',
  custom:           '⭐',
}

/** Simple markdown → HTML renderer (no external lib). XSS-safe: HTML escapes first. */
function renderMarkdown(text: string): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/^# (.+)$/gm, '<div class="font-semibold text-burnham text-sm mt-2 mb-0.5">$1</div>')
    .replace(/^## (.+)$/gm, '<div class="font-medium text-burnham text-xs mt-1.5">$1</div>')
    .replace(/^[-*] (.+)$/gm, '<div class="ml-3 before:content-[\'·\'] before:mr-1.5 before:text-shuttle">$1</div>')
    .replace(/^(\d+)\. (.+)$/gm, '<div class="flex gap-1.5 items-start"><span class="font-mono text-shuttle/40 shrink-0 text-[10px] pt-px">$1.</span><span>$2</span></div>')
    .replace(/\n/g, '<br>')
}

/** Wrap textarea selection in markdown syntax markers. */

/** Local YYYY-MM-DD (avoids UTC offset shifting date at night) */
function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getUrlChip(url: string): { icon: string; label: string; color: string } {
  if (url.includes('docs.google.com/document')) return { icon: '📄', label: 'Doc', color: '#4285F4' }
  if (url.includes('docs.google.com/spreadsheets')) return { icon: '📊', label: 'Sheet', color: '#0F9D58' }
  if (url.includes('docs.google.com/presentation')) return { icon: '📽', label: 'Slides', color: '#F4B400' }
  if (url.includes('drive.google.com')) return { icon: '📁', label: 'Drive', color: '#4285F4' }
  if (url.includes('notion.so')) return { icon: '◼', label: 'Notion', color: '#000000' }
  if (url.includes('linear.app')) return { icon: '◈', label: 'Linear', color: '#5E6AD2' }
  if (url.includes('github.com')) return { icon: '◉', label: 'GitHub', color: '#24292e' }
  if (url.includes('figma.com')) return { icon: '◐', label: 'Figma', color: '#F24E1E' }
  try { return { icon: '🔗', label: new URL(url).hostname.replace('www.', '').split('.')[0], color: '#536471' } }
  catch { return { icon: '🔗', label: 'Link', color: '#536471' } }
}

// Linked entity — a todo can be connected to milestone, goal, person, company, or opportunity
export type LinkedEntityType = 'milestone' | 'goal' | 'person' | 'company' | 'opportunity'
export type LinkedEntity = { id: string; name: string; type: LinkedEntityType; imageUrl?: string }

// ── BacklogDropZone — droppable target that sits below the todo list ──────────
function BacklogDropZone({ children, hasItems }: { children: React.ReactNode; hasItems: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'backlog-zone' })
  return (
    <div ref={setNodeRef}>
      {isOver && !hasItems && (
        <div className="mb-2 rounded-lg border-2 border-dashed border-shuttle/20 bg-mercury/10 py-3 px-4 text-[10px] font-mono text-shuttle/40 text-center transition-colors">
          drop to send to backlog
        </div>
      )}
      {isOver && hasItems && (
        <div className="mb-1 h-0.5 rounded-full bg-shuttle/20 transition-all" />
      )}
      {children}
    </div>
  )
}

interface SortableTodoRowProps {
  index: number
  todo: Todo
  goal: Pick<Goal, 'id' | 'text' | 'alias' | 'color' | 'emoji'> | null | undefined
  milestone: Pick<Milestone, 'id' | 'text'> | null | undefined
  linkedContact?: Pick<Contact, 'id' | 'name' | 'profile_photo_url'> | null
  linkedCompany?: Pick<Company, 'id' | 'name' | 'logo_url'> | null
  linkedOpportunity?: Opportunity | null
  isEditing: boolean
  editingText: string
  onEditStart: () => void
  onEditChange: (text: string) => void
  onEditSave: (textOverride?: string) => void
  onEditCancel: () => void
  onToggle: () => void
  onDelete: () => void
  onMarkWaiting?: () => void
  onMilestoneClick?: (milestone: Pick<Milestone, 'id' | 'text'>) => void
  editRef?: (el: HTMLInputElement | null) => void
  editKeyDownDropdown?: (e: React.KeyboardEvent<HTMLInputElement>) => boolean
  editingLinked?: LinkedEntity[]
  onClearEditingLinked?: (id: string) => void
  onToggleFeatured?: () => void
}

function SortableTodoRow({ index, todo, goal, milestone, linkedContact, linkedCompany, linkedOpportunity, isEditing, editingText, onEditStart, onEditChange, onEditSave, onEditCancel, onToggle, onDelete, onMarkWaiting, onMilestoneClick, editRef, editKeyDownDropdown, editingLinked, onClearEditingLinked, onToggleFeatured }: SortableTodoRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: todo.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  const isTopThree = index < 3

  return (
    <div ref={setNodeRef} style={style} className={`relative group flex items-center gap-2 py-2.5 px-2 -mx-2 rounded-lg transition-colors ${todo.is_featured ? 'bg-gossip/10 hover:bg-gossip/15' : 'hover:bg-gossip/5'}`}>
      {/* Drag handle — always visible at low opacity, brighter on hover */}
      <div
        {...attributes}
        {...listeners}
        className="absolute -left-5 top-1/2 -translate-y-1/2 opacity-[0.18] hover:!opacity-50 cursor-grab active:cursor-grabbing text-shuttle transition-opacity touch-none"
        title="Drag to reorder"
      >
        <DotsSixVertical size={12} weight="bold" />
      </div>
      {/* Priority number — top 3 only */}
      {isTopThree ? (
        <span className="w-3 text-right text-[8px] font-mono text-shuttle/25 shrink-0 leading-none select-none">
          {index + 1}
        </span>
      ) : (
        <span className="w-3 shrink-0" />
      )}
      <input
        type="checkbox"
        className="custom-checkbox shrink-0"
        checked={false}
        onChange={onToggle}
      />
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {isEditing ? (
          /* Edit mode: chips inline BEFORE text input — same flex row so typing appears after chips */
          <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
            {/* Saved milestone chip */}
            {milestone && (
              <span className="inline-flex items-center bg-mercury/40 text-shuttle/50 text-[9px] px-1.5 py-0.5 rounded font-mono leading-none shrink-0">
                {milestone.text}
              </span>
            )}
            {/* Saved person chip */}
            {linkedContact && (
              <span className="inline-flex items-center gap-1 bg-[#1a1a1a]/[0.055] border border-[#1a1a1a]/[0.08] text-[#1a1a1a]/65 text-[9px] px-1 py-px rounded-md leading-none font-medium shrink-0">
                <span className="w-3 h-3 rounded-full overflow-hidden bg-mercury/60 flex items-center justify-center shrink-0 text-[7px] font-bold text-shuttle/60">
                  {linkedContact.profile_photo_url
                    ? <img src={linkedContact.profile_photo_url} className="w-full h-full object-cover" alt="" />
                    : linkedContact.name.charAt(0).toUpperCase()}
                </span>
                {linkedContact.name.split(' ')[0]}
              </span>
            )}
            {/* Saved company chip */}
            {linkedCompany && (
              <span className="inline-flex items-center gap-1 bg-[#1a1a1a]/[0.055] border border-[#1a1a1a]/[0.08] text-[#1a1a1a]/65 text-[9px] px-1 py-px rounded-md leading-none font-medium shrink-0">
                <span className="w-3 h-3 rounded-sm overflow-hidden bg-mercury/60 flex items-center justify-center shrink-0 text-[7px] font-bold text-shuttle/60">
                  {linkedCompany.logo_url
                    ? <img src={linkedCompany.logo_url} className="w-full h-full object-cover" alt="" />
                    : linkedCompany.name.charAt(0).toUpperCase()}
                </span>
                {linkedCompany.name}
              </span>
            )}
            {/* Saved opportunity chip */}
            {linkedOpportunity && (
              <span className="inline-flex items-center gap-1 bg-[#1a1a1a]/[0.055] border border-[#1a1a1a]/[0.08] text-[#1a1a1a]/65 text-[9px] px-1 py-px rounded-md leading-none font-medium shrink-0">
                <span className="w-3 h-3 rounded-sm overflow-hidden bg-mercury/60 flex items-center justify-center shrink-0 text-[7px] font-bold text-shuttle/60">
                  {linkedOpportunity.company?.logo_url
                    ? <img src={linkedOpportunity.company.logo_url} className="w-full h-full object-cover" alt="" />
                    : (linkedOpportunity.company?.name?.charAt(0)?.toUpperCase() ?? '◈')}
                </span>
                {linkedOpportunity.title}
              </span>
            )}
            {/* New @mention chips (removable) */}
            {editingLinked && editingLinked.map(e => (
              <span key={e.id} className="inline-flex items-center gap-1 bg-[#1a1a1a]/[0.06] border border-[#1a1a1a]/[0.09] rounded-md px-1 py-0.5 text-[9px] text-burnham/70 font-medium shrink-0">
                {e.imageUrl && (
                  <span className={`w-3 h-3 rounded-${e.type === 'person' ? 'full' : 'sm'} overflow-hidden bg-mercury/60 flex items-center justify-center shrink-0`}>
                    <img src={e.imageUrl} className="w-full h-full object-cover" alt="" />
                  </span>
                )}
                <span>{e.name.split(' ')[0]}</span>
                <button onMouseDown={ev => { ev.preventDefault(); onClearEditingLinked?.(e.id) }} className="text-shuttle/35 hover:text-burnham ml-0.5">
                  <X size={8} />
                </button>
              </span>
            ))}
            {/* Text input sits AFTER all chips — cursor is naturally "after" them */}
            <input
              ref={editRef}
              autoFocus
              className="flex-1 min-w-[80px] text-[12px] font-normal text-burnham/70 bg-transparent border-b border-burnham/20 focus:border-burnham/40 focus:outline-none transition-colors"
              value={editingText}
              onChange={e => onEditChange(e.target.value)}
              onBlur={_e => {
                const val = (_e.target as HTMLInputElement).value
                setTimeout(() => onEditSave(val), 120)
              }}
              onKeyDown={e => {
                if (editKeyDownDropdown?.(e)) return
                if (e.key === 'Enter') { e.preventDefault(); onEditSave((e.target as HTMLInputElement).value) }
                if (e.key === 'Escape') onEditCancel()
              }}
            />
          </div>
        ) : (
          /* ── Text + inline entity mentions — all flow together ──── */
          <div
            className="flex-1 min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 cursor-text"
            onClick={onEditStart}
          >
            <span className="text-[12px] font-normal text-burnham/70 leading-snug">
              {todo.text}
            </span>
            {/* Milestone — mono chip, full text (no truncation) */}
            {milestone && (
              <button
                onClick={e => { e.stopPropagation(); onMilestoneClick?.(milestone) }}
                className="inline-flex items-center bg-mercury/40 text-shuttle/50 text-[9px] px-1.5 py-0.5 rounded font-mono shrink-0 leading-none hover:bg-burnham/10 hover:text-burnham/60 transition-colors"
              >
                {milestone.text}
                {goal ? ` · ${goal.alias ?? goal.text?.slice(0, 6) ?? ''}` : ''}
              </button>
            )}
            {/* Person chip — avatar + first name */}
            {linkedContact && (() => {
              const photo = linkedContact.profile_photo_url
              return (
                <span className="inline-flex items-center gap-1 bg-[#1a1a1a]/[0.055] border border-[#1a1a1a]/[0.08] text-[#1a1a1a]/65 text-[9px] px-1 py-px rounded-md shrink-0 leading-none font-medium">
                  <span className="w-3.5 h-3.5 rounded-full overflow-hidden bg-mercury/60 flex items-center justify-center shrink-0 text-[7px] font-bold text-shuttle/60">
                    {photo ? <img src={photo} className="w-full h-full object-cover" alt="" /> : linkedContact.name.charAt(0).toUpperCase()}
                  </span>
                  {linkedContact.name.split(' ')[0]}
                </span>
              )
            })()}
            {/* Company chip — logo + full name */}
            {linkedCompany && (() => {
              const logo = linkedCompany.logo_url
              return (
                <span className="inline-flex items-center gap-1 bg-[#1a1a1a]/[0.055] border border-[#1a1a1a]/[0.08] text-[#1a1a1a]/65 text-[9px] px-1 py-px rounded-md shrink-0 leading-none font-medium">
                  <span className="w-3.5 h-3.5 rounded-sm overflow-hidden bg-mercury/60 flex items-center justify-center shrink-0 text-[7px] font-bold text-shuttle/60">
                    {logo ? <img src={logo} className="w-full h-full object-cover" alt="" /> : linkedCompany.name.charAt(0).toUpperCase()}
                  </span>
                  {linkedCompany.name}
                </span>
              )
            })()}
            {/* Opportunity chip — company logo + full title */}
            {linkedOpportunity && (() => {
              const co = linkedOpportunity.company
              const logo = co?.logo_url ?? null
              const coInitial = co?.name?.charAt(0)?.toUpperCase() ?? '◈'
              return (
                <span className="inline-flex items-center gap-1 bg-[#1a1a1a]/[0.055] border border-[#1a1a1a]/[0.08] text-[#1a1a1a]/65 text-[9px] px-1 py-px rounded-md shrink-0 leading-none font-medium">
                  <span className="w-3.5 h-3.5 rounded-sm overflow-hidden bg-mercury/60 flex items-center justify-center shrink-0 text-[7px] font-bold text-shuttle/60">
                    {logo ? <img src={logo} className="w-full h-full object-cover" alt="" /> : coInitial}
                  </span>
                  {linkedOpportunity.title}
                </span>
              )
            })()}
          </div>
        )}
        {todo.url && (() => {
          const chip = getUrlChip(todo.url)
          return (
            <button
              onClick={e => { e.stopPropagation(); openLink(todo.url!) }}
              className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full border shrink-0 hover:opacity-80 transition-opacity leading-none"
              style={{ color: chip.color, borderColor: `${chip.color}40`, backgroundColor: `${chip.color}10` }}
            >
              <span>{chip.icon}</span>
              <span className="font-medium ml-0.5">{chip.label}</span>
            </button>
          )
        })()}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {todo.block && (
          <span className="text-[9px] font-mono text-shuttle/40">{todo.block}</span>
        )}
        {onMarkWaiting && (
          <button
            onClick={onMarkWaiting}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-shuttle/30 hover:text-shuttle p-0.5 rounded"
            title="Mark as waiting"
          >
            <HourglassMedium size={12} />
          </button>
        )}
        {onToggleFeatured && (
          <button
            onClick={onToggleFeatured}
            className={`transition-opacity p-0.5 rounded ${todo.is_featured ? 'opacity-100 text-amber-400' : 'opacity-0 group-hover:opacity-60 text-shuttle/30 hover:text-amber-400'}`}
            title={todo.is_featured ? 'Unstar' : 'Star as priority'}
          >
            <Star size={12} weight={todo.is_featured ? 'fill' : 'regular'} />
          </button>
        )}
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-shuttle hover:text-red-400 p-0.5 rounded"
        >
          <TrashSimple size={12} />
        </button>
      </div>
    </div>
  )
}

// ── Outreach status config ───────────────────────────────────────────────────
const STATUS_CONFIG: Record<ContactStatus, { label: string; classes: string }> = {
  PROSPECT:   { label: 'prospect',   classes: 'bg-mercury/50 text-shuttle/60' },
  INTRO:      { label: 'intro',      classes: 'bg-gossip text-burnham' },
  CONNECTED:  { label: 'connected',  classes: 'bg-pastel/30 text-burnham' },
  RECONNECT:  { label: 'reconnect',  classes: 'bg-pastel/20 text-shuttle' },
  ENGAGED:    { label: 'engaged',    classes: 'bg-pastel/60 text-burnham' },
  NURTURING:  { label: 'nurturing',  classes: 'bg-pastel text-burnham font-semibold' },
  DORMANT:    { label: 'dormant',    classes: 'bg-mercury text-shuttle/50' },
}

function StatusBadge({ status }: { status: ContactStatus }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status.toLowerCase(), classes: 'bg-mercury/50 text-shuttle/60' }
  return (
    <span className={`text-[8px] px-1.5 py-0.5 rounded font-mono shrink-0 ${cfg.classes}`}>
      {cfg.label}
    </span>
  )
}

interface OutreachRowProps {
  log: Contact
  onEdit: () => void
  onDelete: () => void
  onOpenDetail: () => void
}

function ContactAvatar({ name, photoUrl, size = 28 }: { name: string; photoUrl?: string | null; size?: number }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
  const [imgFailed, setImgFailed] = useState(false)
  return (
    <div className="shrink-0 rounded-full overflow-hidden bg-mercury/60 flex items-center justify-center"
      style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {photoUrl && !imgFailed
        ? <img src={photoUrl} className="w-full h-full object-cover" onError={() => setImgFailed(true)} />
        : <span className="font-semibold text-shuttle/60">{initials}</span>
      }
    </div>
  )
}

function OutreachRow({ log, onEdit, onDelete, onOpenDetail }: OutreachRowProps) {
  return (
    <div
      className="group flex items-center gap-2 py-1.5 px-2 -mx-2 rounded hover:bg-gossip/20 transition-colors cursor-pointer"
      onClick={onOpenDetail}
    >
      <ContactAvatar name={log.name} photoUrl={log.profile_photo_url} />
      <div className="flex-1 min-w-0">
        <span className="text-[13px] font-medium text-burnham block truncate">{log.name}</span>
        {(log.company || log.job_title) && (
          <span className="text-[10px] text-shuttle/50 truncate block leading-tight">
            {[log.job_title, log.company].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>
      <StatusBadge status={log.status} />
      {log.linkedin_url && (
        <button
          onClick={e => { e.stopPropagation(); openLink(log.linkedin_url!) }}
          className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity text-shuttle"
          title="Open LinkedIn profile"
        >
          <ArrowSquareOut size={12} />
        </button>
      )}
      {log.attio_record_id && (
        <img src="/attio.png" alt="Attio" className="w-3 h-3 object-contain opacity-0 group-hover:opacity-40 transition-opacity shrink-0" />
      )}
      <button
        onClick={e => { e.stopPropagation(); onEdit() }}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-shuttle hover:text-burnham p-0.5"
      >
        <Pencil size={11} />
      </button>
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-shuttle hover:text-red-400 p-0.5"
      >
        <TrashSimple size={11} />
      </button>
    </div>
  )
}

export default function Today() {
  const today = localDate()
  const tomorrow = localDate(new Date(new Date().getTime() + 86400000))
  const yesterdayDate = new Date()
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterdayStr = localDate(yesterdayDate)

  const startOfWeek = (() => {
    const d = new Date()
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(d)
    monday.setDate(diff)
    return localDate(monday)
  })()

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek + 'T12:00:00')
    d.setDate(d.getDate() + i)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })

  // Data
  const [todos, setTodos] = useState<Todo[]>([])
  const [yesterdayTodos, setYesterdayTodos] = useState<Todo[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [logs, setLogs] = useState<HabitLog[]>([])
  const [recentLogs, setRecentLogs] = useState<HabitLog[]>([])
  const [review, setReview] = useState<Review | null>(null)
  const [tomorrowReview, setTomorrowReview] = useState<Review | null>(null)
  const [goals, setGoals] = useState<Pick<Goal, 'id' | 'text' | 'alias' | 'color' | 'emoji'>[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [dataLoaded, setDataLoaded] = useState(false)

  // Leading Indicators
  const [indicators, setIndicators] = useState<LeadingIndicator[]>([])
  const [indicatorLogs, setIndicatorLogs] = useState<IndicatorDailyLog[]>([])
  const [weekIndicatorLogs, setWeekIndicatorLogs] = useState<IndicatorDailyLog[]>([])
  const [liPanelOpen, setLiPanelOpen] = useState(false)
  const [liDraftValues, setLiDraftValues] = useState<Record<string, string>>({})

  // Add task
  const [newTask, setNewTask] = useState('')
  const [todoBlock, setTodoBlock] = useState<'AM' | 'PM' | null>(null)
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [suggestionIndex, setSuggestionIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  // Inline edit todo
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null)
  const [editingTodoText, setEditingTodoText] = useState('')

  // Autosave refs
  const journalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onethingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Guard: only initialize journalValue from DB once (prevents stale save responses clobbering local state)
  const journalInitialized = useRef(false)

  // Local autosave values
  const [journalValue, setJournalValue] = useState('')
  const [onethingValue, setOnethingValue] = useState('')
  const [journalEditing, setJournalEditing] = useState(false)
  const [journalExpanded, setJournalExpanded] = useState(false)
  const [captures, setCaptures] = useState<Capture[]>([])
  const [activeCapture, setActiveCapture] = useState<Capture | null>(null)

  // Day State Machine
  const [dayStartedLocal, setDayStartedLocal] = useState(() =>
    localStorage.getItem(`day_started_${localDate()}`) === 'true'
  )

  type DayState = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'
  const getDayState = (rev: Review | null): DayState => {
    if (rev?.tomorrow_reviewed) return 'COMPLETED'
    if (dayStartedLocal) return 'IN_PROGRESS'
    return 'NOT_STARTED'
  }
  const dayState: DayState | null = dataLoaded ? getDayState(review) : null

  // Mandatory objective draft
  const [objectiveDraft, setObjectiveDraft] = useState('')

  // Pomodoro settings panel
  const [showPomSettings, setShowPomSettings] = useState(false)

  // End of day
  const [showEndOfDay, setShowEndOfDay] = useState(false)

  // Streak celebration
  const [celebrationStreak, setCelebrationStreak] = useState<{ habit: Habit; streak: number } | null>(null)

  // Calendar dialog
  const [calendarDialogHabitId, setCalendarDialogHabitId] = useState<string | null>(null)
  const [calWhen, setCalWhen] = useState('tomorrow')
  const [calTime, setCalTime] = useState('09:00')
  const [calDuration, setCalDuration] = useState('30')
  const [calSaving, setCalSaving] = useState(false)
  const [calToast, setCalToast] = useState<string | null>(null)
  const calToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Focus timer
  const [timerDuration, setTimerDuration] = useState(() => {
    try {
      const raw = localStorage.getItem('rethink_settings')
      if (raw) {
        const s = JSON.parse(raw) as { focusDefaultMinutes?: number }
        if (s.focusDefaultMinutes) return s.focusDefaultMinutes
      }
    } catch {}
    return 25
  })
  const [timerElapsed, setTimerElapsed] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerGoalId, setTimerGoalId] = useState<string | null>(null)
  const [timerComplete, setTimerComplete] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [habitDrawerOpen, setHabitDrawerOpen] = useState(false)
  const [habitsCollapsed, setHabitsCollapsed] = useState(false)
  const [expandedHabitId, setExpandedHabitId] = useState<string | null>(null)
  const [milestonesOpen, setMilestonesOpen] = useState(false)

  // Milestone inline editing
  const [editingMilestoneDateId, setEditingMilestoneDateId] = useState<string | null>(null)
  const [addingMilestoneForGoalId, setAddingMilestoneForGoalId] = useState<string | null>(null)
  const [newMilestoneDraft, setNewMilestoneDraft] = useState({ text: '', date: '' })

  // Quick-add overlay (⌘N — works from anywhere)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddText, setQuickAddText] = useState('')
  const quickAddRef = useRef<HTMLInputElement>(null)
  // Inline add (click "Add a task" in the list)
  const [inlineAddOpen, setInlineAddOpen] = useState(false)
  const inlineAddRef = useRef<HTMLInputElement>(null)
  // Autocomplete state for @ and / triggers
  const [qaDropdown, setQaDropdown] = useState<{
    type: 'goal' | 'milestone' | 'command' | 'person'
    query: string
    items: Array<{ label: string; insert: string; sub?: string; id?: string; goalId?: string; _isPerson?: boolean; _isMilestone?: boolean; _type?: 'milestone' | 'goal' | 'person' | 'company' | 'opportunity' | 'command' }>
    selectedIdx: number
  } | null>(null)

  // Linked entities for quick-add and edit-mode (@mention selection) — array, multiple types
  const [quickAddLinked, setQuickAddLinked] = useState<LinkedEntity[]>([])
  const [editingLinked, setEditingLinked] = useState<LinkedEntity[]>([])
  // Ref to the currently focused input (inline-add OR edit) — used to position portal dropdown
  const activeEditElRef = useRef<HTMLInputElement | null>(null)

  // Attio task creation in quick-add
  const [linkedContactId, setLinkedContactId] = useState<string | null>(null)
  const [shouldCreateAttioTask, setShouldCreateAttioTask] = useState(false)

  const [milestoneCaptureOpen, setMilestoneCaptureOpen] = useState(false)
  const [weeklyGoalsOpen, setWeeklyGoalsOpen] = useState(false)
  const [doneTodosOpen, setDoneTodosOpen] = useState(false)
  const [backlogExpanded, setBacklogExpanded] = useState(false)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [goalsWidgetOpen, setGoalsWidgetOpen] = useState(true)

  const QA_COMMANDS = [
    { label: '/milestone', insert: '/milestone', sub: 'create a milestone' },
  ]

  const computeQaDropdown = (text: string) => {
    // / command trigger
    const slashMatch = text.match(/(^|\s)(\/\S*)$/)
    if (slashMatch) {
      const q = slashMatch[2].toLowerCase()
      const items = QA_COMMANDS.filter(c => c.label.startsWith(q))
      if (items.length > 0) {
        setQaDropdown({ type: 'command', query: q, items, selectedIdx: 0 })
        return
      }
    }
    // @ — unified search: milestones, goals, people, companies, opportunities
    const atMatch = text.match(/@(\S*)$/)
    if (atMatch) {
      const q = atMatch[1].toLowerCase()
      const msItems = milestones
        .filter(m => m.status !== 'COMPLETE' && (q === '' || m.text.toLowerCase().includes(q)))
        .slice(0, 4)
        .map(m => {
          const g = goals.find(g => g.id === m.goal_id)
          return { label: m.text, insert: '', sub: g?.alias ?? '', id: m.id, goalId: m.goal_id ?? undefined, _isMilestone: true, _type: 'milestone' as const }
        })
      const gItems = goals
        .filter(g => q === '' || g.text.toLowerCase().includes(q) || (g.alias ?? '').toLowerCase().includes(q))
        .slice(0, 3)
        .map(g => ({ label: g.alias ?? g.text.slice(0, 24), insert: '', sub: g.text.slice(0, 32), id: g.id, _type: 'goal' as const }))
      const pItems = allContacts
        .filter(c => q === '' ? true : c.name.toLowerCase().includes(q))
        .slice(0, 5)
        .map(c => ({ label: c.name, insert: c.name, sub: (c as any).company ?? (c as any).role ?? '', id: c.id, _isPerson: true, _type: 'person' as const }))
      const coItems = companies
        .filter(co => q === '' ? true : co.name.toLowerCase().includes(q))
        .slice(0, 4)
        .map(co => ({ label: co.name, insert: co.name, sub: co.sector ?? co.domain ?? '', id: co.id, _type: 'company' as const }))
      const oppItems = opportunities
        .filter(op => op.stage !== 'won' && op.stage !== 'lost' && (q === '' ? true : op.title.toLowerCase().includes(q)))
        .slice(0, 4)
        .map(op => ({ label: op.title, insert: op.title, sub: op.company?.name ?? op.stage, id: op.id, _type: 'opportunity' as const }))
      const combined = [...msItems, ...gItems, ...pItems, ...coItems, ...oppItems]
      if (combined.length > 0) {
        setQaDropdown({ type: 'milestone', query: q, items: combined as any, selectedIdx: 0 })
        return
      }
    }
    setQaDropdown(null)
  }

  const applyQaDropdownItem = (item: { label: string; insert: string; id?: string; goalId?: string; _isMilestone?: boolean; _isPerson?: boolean; _type?: LinkedEntityType | 'command' }) => {
    const isEditMode = !!editingTodoId

    const getText = () => isEditMode ? editingTodoText : quickAddText
    const setText = (t: string) => isEditMode ? setEditingTodoText(t) : setQuickAddText(t)
    // Add (or replace same type) in linked array
    const addLinked = (entity: LinkedEntity) => {
      const updater = (prev: LinkedEntity[]) => {
        // milestone and goal are singular — replace if same type; others accumulate
        if (entity.type === 'milestone' || entity.type === 'goal') {
          return [...prev.filter(e => e.type !== entity.type), entity]
        }
        // dedupe by id
        return prev.some(e => e.id === entity.id) ? prev : [...prev, entity]
      }
      if (isEditMode) setEditingLinked(updater)
      else setQuickAddLinked(updater)
    }
    const refocus = () => activeEditElRef.current?.focus() ?? inlineAddRef.current?.focus() ?? quickAddRef.current?.focus()

    if (qaDropdown?.type === 'command') {
      if (item.label === '/milestone') {
        setQaDropdown(null)
        if (!isEditMode) { setQuickAddOpen(false); setQuickAddText('') }
        setMilestoneCaptureOpen(true)
        return
      }
      setText(getText().replace(/(@m?\S*|\/\S*)$/, item.insert))
    } else if (item.id && item._type) {
      // All typed entities — add as chip and strip @trigger from text
      if (item._type === 'milestone') {
        const ms = milestones.find(m => m.id === item.id)
        addLinked({ id: item.id, name: item.label, type: 'milestone' })
        // auto-link goal too
        const goalId = ms?.goal_id ?? item.goalId
        if (goalId) {
          const g = goals.find(g => g.id === goalId)
          if (g) addLinked({ id: goalId, name: g.alias ?? g.text.slice(0, 24), type: 'goal' })
        }
      } else {
        // Look up image for entity
        let imageUrl: string | undefined
        if (item._type === 'person') {
          const contact = allContacts.find(c => c.id === item.id)
          imageUrl = contact?.profile_photo_url ?? undefined
        } else if (item._type === 'company') {
          const company = companies.find(c => c.id === item.id)
          imageUrl = company?.logo_url ?? undefined
        } else if (item._type === 'opportunity') {
          const opp = opportunities.find(o => o.id === item.id)
          imageUrl = opp?.company?.logo_url ?? undefined
        }
        addLinked({ id: item.id, name: item.label, type: item._type as LinkedEntityType, imageUrl })
      }
      setText(getText().replace(/@\S*$/, '').trimEnd())
    }
    setQaDropdown(null)
    // setTimeout ensures refocus fires after React re-renders the input
    setTimeout(() => refocus(), 0)
  }

  // Friction modal for >5 todos
  const [frictionPendingTodo, setFrictionPendingTodo] = useState<{ text: string; block: 'AM' | 'PM' | null; goalId: string | null; milestoneId: string | null } | null>(null)

  // Pomodoro Enhanced (Sprint 16)
  const [timerIntention, setTimerIntention] = useState('')
  const [showIntentionInput, setShowIntentionInput] = useState(false)
  const [timerHabitId, setTimerHabitId] = useState<string | null>(null)
  const [timerTodoId, setTimerTodoId] = useState<string | null>(null)
  const [ambientSound, setAmbientSound] = useState<'brown' | 'rain' | 'none'>(() => {
    try {
      const raw = localStorage.getItem('rethink_settings')
      if (raw) {
        const s = JSON.parse(raw) as { focusAmbientSound?: string }
        if (s.focusAmbientSound === 'brown' || s.focusAmbientSound === 'rain') return s.focusAmbientSound
      }
    } catch {}
    return 'none'
  })
  const [timerStartedAt, setTimerStartedAt] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Milestone detail modal (Phase 5)
  const [selectedMilestoneDetail, setSelectedMilestoneDetail] = useState<Milestone | null>(null)

  // Habit edit modal (Phase 6)
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null)

  // Outreach panel
  const [outreachPanelOpen, setOutreachPanelOpen] = useState(false)
  const [editingOutreachLog, setEditingOutreachLog] = useState<Contact | null>(null)

  // Contact detail drawer
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)

  // Upcoming contact milestones
  const [upcomingMilestones, setUpcomingMilestones] = useState<Array<ContactMilestone & { contact_name: string; daysUntil: number }>>([])

  // Cold contacts for Relationship Agenda
  const [coldContacts, setColdContacts] = useState<Array<{ id: string; name: string; health_score: number; last_interaction_date?: string | null; days_since: number }>>([])

  // Meetings today (F08)
  const [meetingsToday, setMeetingsToday] = useState<Array<{
    summary: string
    start: string
    contactName?: string
    contactId?: string
    contactScore?: number
  }>>([])

  // AI scorer (Phase 8)
  const gemini = useGeminiScorer()

  useHabitNotifications(habits, logs, today)

  // Outreach habit count helper (uses local logs state from Today's data fetch)
  const upsertHabitCountLocal = useCallback(async (habitId: string, count: number) => {
    const existing = logs.find((l: HabitLog) => l.habit_id === habitId)
    if (existing) {
      await supabase.from('habit_logs').update({ value: count }).eq('id', existing.id)
      setLogs((prev: HabitLog[]) => prev.map(l => l.id === existing.id ? { ...l, value: count } : l))
    } else {
      const { data } = await supabase
        .from('habit_logs')
        .insert({ habit_id: habitId, user_id: userId, log_date: today, value: count })
        .select().single()
      if (data) setLogs((prev: HabitLog[]) => [...prev, data])
    }
  }, [logs, userId, today])

  const {
    todayLogs: todayOutreach,
    contacts: allContacts,
    syncing: outreachSyncing,
    syncError: outreachSyncError,
    addContact,
    updateContact,
    deleteContact,
    syncContactToAttio,
    syncCompany,
    syncAll,
  } = useContacts(userId ?? undefined, habits, upsertHabitCountLocal)

  const { companies } = useCompanies(userId ?? null)
  const { opportunities } = useOpportunities(userId ?? null)

  useKeyboardShortcuts({
    'cmd+b': () => setSidebarOpen(p => !p),
    'cmd+.': () => setSidebarOpen(p => !p),
    'cmd+n': () => setQuickAddOpen(true),
    'cmd+e': () => setShowEndOfDay(true),
    'cmd+h': () => setHabitDrawerOpen(v => !v),
    'cmd+s': () => setSuggestionsOpen(v => !v),
    'cmd+g': () => setGoalsWidgetOpen(v => !v),
    'cmd+o': () => { setEditingOutreachLog(null); setOutreachPanelOpen(p => !p) },
    'cmd+l': () => {
      const drafts: Record<string, string> = {}
      indicators.filter(ind => !ind.habit_id).forEach(ind => {
        const todayLog = indicatorLogs.find(l => l.leading_indicator_id === ind.id)
        drafts[ind.id] = todayLog ? String(todayLog.value) : ''
      })
      setLiDraftValues(drafts)
      setLiPanelOpen(true)
    },
  })

  // Space → play/pause; 1-9 → mark habit in drawer; Escape → close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true'

      if (e.key === 'Escape' && journalExpanded) { setJournalExpanded(false); return }
      if (e.key === 'j' && e.metaKey && e.shiftKey) { e.preventDefault(); setJournalExpanded(v => !v); return }

      if (e.key === 'Escape') {
        if (outreachPanelOpen) { setOutreachPanelOpen(false); return }
        if (liPanelOpen) { setLiPanelOpen(false); return }
        if (milestonesOpen) { setMilestonesOpen(false); return }
        if (habitDrawerOpen) { setHabitDrawerOpen(false); return }
        if (showEndOfDay) { setShowEndOfDay(false); return }
        if (showPomSettings) { setShowPomSettings(false); return }
      }

      if ((e.key === 'm' || e.key === 'M') && !inInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setMilestonesOpen(v => !v)
        return
      }
      if ((e.key === 'm' || e.key === 'M') && e.metaKey && e.shiftKey) {
        e.preventDefault()
        setMilestonesOpen(v => !v)
        return
      }

      if (habitDrawerOpen && !inInput && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const idx = parseInt(e.key) - 1
        const pending = habits.filter(h => !isHabitDone(h))
        if (pending[idx]) {
          toggleHabit(pending[idx].id)
          if (pending.length <= 1) setHabitDrawerOpen(false)
        }
        return
      }

      if (e.key === ' ' && !inInput && !timerComplete) {
        e.preventDefault()
        if (timerRunning) pauseTimer()
        else if (timerElapsed === 0) setShowIntentionInput(true)
        else setTimerRunning(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [timerRunning, timerComplete, timerElapsed, showEndOfDay, habitDrawerOpen, liPanelOpen, habits, logs, journalExpanded, showPomSettings, milestonesOpen])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const thirtyAgoStr = localDate(thirtyDaysAgo)

      const [todosRes, yesterdayTodosRes, habitsRes, logsRes, recentLogsRes, reviewRes, goalsRes, milestonesRes, tomorrowRes, indicatorsRes, indicatorLogsRes, weekLogsRes, capturesRes] = await Promise.all([
        supabase.from('todos').select('*').eq('user_id', user.id)
          .or(`date.eq.${today},and(date.is.null,milestone_id.is.null)`).order('sort_order', { ascending: true }),
        supabase.from('todos').select('*').eq('user_id', user.id)
          .lt('date', today).eq('completed', false).order('date', { ascending: false }),
        supabase.from('habits').select('*').eq('user_id', user.id).eq('is_active', true),
        supabase.from('habit_logs').select('*').eq('user_id', user.id).eq('log_date', today),
        supabase.from('habit_logs').select('*').eq('user_id', user.id)
          .gte('log_date', thirtyAgoStr).order('log_date', { ascending: false }),
        supabase.from('reviews').select('*').eq('user_id', user.id).eq('date', today).maybeSingle(),
        supabase.from('goals').select('id, text, alias, color, emoji').eq('user_id', user.id).eq('goal_type', 'ACTIVE'),
        supabase.from('milestones').select('*').eq('user_id', user.id)
          .or(`target_date.is.null,target_date.gte.${today}`).order('target_date', { nullsFirst: true }),
        supabase.from('reviews').select('*').eq('user_id', user.id).eq('date', tomorrow).maybeSingle(),
        supabase.from('leading_indicators').select('*').eq('user_id', user.id).eq('is_active', true),
        supabase.from('indicator_daily_logs').select('*').eq('user_id', user.id).eq('log_date', today),
        supabase.from('indicator_daily_logs').select('*').eq('user_id', user.id).gte('log_date', startOfWeek).lte('log_date', today),
        supabase.from('captures').select('*').eq('user_id', user.id).gte('captured_date', today),
      ])
      setTodos(todosRes.data ?? [])
      setYesterdayTodos(yesterdayTodosRes.data ?? [])
      setHabits(habitsRes.data ?? [])
      setLogs(logsRes.data ?? [])
      setRecentLogs(recentLogsRes.data ?? [])
      setReview(reviewRes.data)
      setTomorrowReview(tomorrowRes.data ?? null)
      setGoals(goalsRes.data ?? [])
      setMilestones((milestonesRes.data ?? []).slice(0, 10))
      setIndicators(indicatorsRes.data ?? [])
      setIndicatorLogs(indicatorLogsRes.data ?? [])
      setWeekIndicatorLogs(weekLogsRes.data ?? [])
      if (capturesRes.data) setCaptures(capturesRes.data)
      setDataLoaded(true)
    }
    journalInitialized.current = false // reset so today's notes load fresh on day change
    load()
  }, [today])

  // Realtime subscription: re-fetch habit logs when changed externally (e.g. from Chrome extension)
  useEffect(() => {
    if (!userId) return

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const thirtyAgoStr = localDate(thirtyDaysAgo)

    const subscription = supabase
      .channel('habit-logs-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'habit_logs',
        filter: `user_id=eq.${userId}`,
      }, async () => {
        const [logsRes, recentLogsRes] = await Promise.all([
          supabase.from('habit_logs').select('*').eq('user_id', userId).eq('log_date', today),
          supabase.from('habit_logs').select('*').eq('user_id', userId)
            .gte('log_date', thirtyAgoStr).order('log_date', { ascending: false }),
        ])
        if (logsRes.data) setLogs(logsRes.data)
        if (recentLogsRes.data) setRecentLogs(recentLogsRes.data)
      })
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [userId, today])

  // Load upcoming contact milestones (within 30 days)
  useEffect(() => {
    if (!userId) return
    supabase
      .from('contact_milestones')
      .select('*, outreach_logs(name)')
      .eq('user_id', userId)
      .then(({ data }) => {
        if (!data) return
        const withDays = (data as Array<ContactMilestone & { outreach_logs?: { name?: string } }>)
          .map(m => ({
            ...m,
            contact_name: m.outreach_logs?.name ?? 'Unknown',
            daysUntil: computeContactMilestoneDaysUntil(m) ?? 999,
          }))
          .filter(m => m.daysUntil >= 0 && m.daysUntil <= 30)
          .sort((a, b) => a.daysUntil - b.daysUntil)
        setUpcomingMilestones(withDays as Array<ContactMilestone & { contact_name: string; daysUntil: number }>)
      })
  }, [userId])

  // Load cold contacts (health_score ≤ 5, no interaction in 30+ days)
  useEffect(() => {
    if (!userId) return
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    supabase
      .from('outreach_logs')
      .select('id, name, health_score, last_interaction_date')
      .eq('user_id', userId)
      .lte('health_score', 5)
      .or(`last_interaction_date.is.null,last_interaction_date.lte.${thirtyDaysAgo}`)
      .order('health_score', { ascending: true })
      .limit(5)
      .then(({ data }) => {
        if (!data) return
        const now = Date.now()
        setColdContacts(data.map(c => ({
          ...c,
          health_score: c.health_score ?? 0,
          days_since: c.last_interaction_date
            ? Math.floor((now - new Date(c.last_interaction_date).getTime()) / 86400000)
            : 999
        })))
      })
  }, [userId])

  // Load today's meetings with known contacts (F08)
  useEffect(() => {
    if (!userId) return
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const token = session?.provider_token
      if (!token) return
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)
      const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
      url.searchParams.set('timeMin', todayStart.toISOString())
      url.searchParams.set('timeMax', todayEnd.toISOString())
      url.searchParams.set('singleEvents', 'true')
      url.searchParams.set('orderBy', 'startTime')
      url.searchParams.set('maxResults', '10')
      try {
        const res = await fetch(url.toString(), { headers: { 'Authorization': `Bearer ${token}` } })
        if (!res.ok) return
        const data = await res.json()
        const events = (data.items ?? []) as Array<{
          id: string; summary?: string;
          start: { dateTime?: string; date?: string }
          attendees?: Array<{ email: string; displayName?: string }>
        }>
        const { data: contacts } = await supabase
          .from('outreach_logs')
          .select('id, name, health_score, email')
          .eq('user_id', userId)
          .not('email', 'is', null)
        const emailToContact = new Map((contacts ?? []).map(c => [c.email?.toLowerCase(), c]))
        const meetings = events.map(evt => {
          const attendeeEmails = (evt.attendees ?? []).map((a: { email: string }) => a.email.toLowerCase())
          const matchedContact = attendeeEmails.map((e: string) => emailToContact.get(e)).find(Boolean)
          return {
            summary: evt.summary ?? '(Meeting)',
            start: evt.start.dateTime ?? evt.start.date ?? '',
            contactName: matchedContact?.name,
            contactId: matchedContact?.id,
            contactScore: matchedContact?.health_score,
          }
        })
        setMeetingsToday(meetings)
      } catch { /* Calendar not available */ }
    })
  }, [userId])

  // Only initialize from DB once — prevents stale upsertReview responses from clobbering local pill markers
  useEffect(() => {
    if (journalInitialized.current) return
    if (review?.notes !== undefined) {
      setJournalValue(review.notes ?? '')
      journalInitialized.current = true
    }
  }, [review?.notes])
  useEffect(() => {
    const val = review?.one_thing ?? ''
    setOnethingValue(val)
    if (val && !objectiveDraft) setObjectiveDraft(val) // pre-fill drawer if set from yesterday
  }, [review?.one_thing])

  // Focus timer tick
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => {
        setTimerElapsed(e => {
          const next = e + 1
          if (next >= timerDuration * 60) {
            setTimerRunning(false)
            setTimerComplete(true)
            if (timerRef.current) clearInterval(timerRef.current)
          }
          return Math.min(next, timerDuration * 60)
        })
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [timerRunning, timerDuration])

  // Ambient sound
  useEffect(() => {
    if (timerRunning && ambientSound !== 'none') {
      const audio = new Audio(`/sounds/${ambientSound}-noise.mp3`)
      audio.loop = true
      try {
        const raw = localStorage.getItem('rethink_settings')
        audio.volume = raw ? (JSON.parse(raw) as { focusAmbientVolume?: number }).focusAmbientVolume ?? 0.25 : 0.25
      } catch { audio.volume = 0.25 }
      audioRef.current = audio
      audio.play().catch(() => {})
    } else {
      audioRef.current?.pause()
      audioRef.current = null
    }
    return () => { audioRef.current?.pause(); audioRef.current = null }
  }, [timerRunning, ambientSound])

  // Cleanup
  useEffect(() => {
    return () => {
      if (journalTimerRef.current) clearTimeout(journalTimerRef.current)
      if (onethingTimerRef.current) clearTimeout(onethingTimerRef.current)
      if (calToastTimerRef.current) clearTimeout(calToastTimerRef.current)
    }
  }, [])

  // Global shortcut ⌘⇧Space — Rust calls window.rethinkFocusQuickAdd()
  useEffect(() => {
    (window as Window & { rethinkFocusQuickAdd?: () => void }).rethinkFocusQuickAdd = () => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    return () => {
      delete (window as Window & { rethinkFocusQuickAdd?: () => void }).rethinkFocusQuickAdd
    }
  }, [])

  const saveCaptures = useCallback(async (value: string) => {
    if (!userId) return
    const found = parseJournalCaptures(value)
    if (found.length === 0) return
    const today2 = new Date().toISOString().slice(0, 10)
    const rows = found.map(f => ({
      user_id: userId,
      type: f.type,
      title: f.title,
      captured_date: today2,
    }))
    await supabase
      .from('captures')
      .upsert(rows, { onConflict: 'user_id,captured_date,type,title', ignoreDuplicates: true })
    const { data: fresh } = await supabase
      .from('captures')
      .select('*')
      .eq('user_id', userId)
      .eq('captured_date', today2)
    if (fresh) setCaptures(fresh)
  }, [userId])

  const handleJournalChange = (value: string) => {
    setJournalValue(value)
    if (journalTimerRef.current) clearTimeout(journalTimerRef.current)
    journalTimerRef.current = setTimeout(async () => {
      await upsertReview({ notes: value })
      await saveCaptures(value)
    }, 800)
  }


  const openOrCreateCapture = useCallback(async (type: import('@/types').CaptureType, title: string) => {
    let record = captures.find(c => c.type === type && c.title === title)
    if (!record && userId) {
      const today2 = new Date().toISOString().slice(0, 10)
      const { data } = await supabase
        .from('captures')
        .upsert({ user_id: userId, type, title, captured_date: today2 }, { onConflict: 'user_id,captured_date,type,title' })
        .select()
        .single()
      if (data) {
        setCaptures(prev => prev.find(c => c.id === data.id) ? prev.map(c => c.id === data.id ? data : c) : [...prev, data])
        record = data
      }
    }
    if (record) setActiveCapture(record)
  }, [captures, userId])

  /** When modal updates title → also update the inline marker in journalValue */
  const handleCaptureUpdate = useCallback((updated: import('@/types').Capture) => {
    setCaptures(prev => prev.map(c => c.id === updated.id ? updated : c))
    // Find old capture to get its old title
    const old = captures.find(c => c.id === updated.id)
    if (old && old.title !== updated.title) {
      setJournalValue(prev =>
        prev.replace(`[~${old.type}:${old.title}~]`, `[~${updated.type}:${updated.title}~]`)
      )
    }
  }, [captures])

  /** Delete a capture from modal: remove from DB, captures state, and journal text */
  const handleCaptureDelete = useCallback(async (capture: import('@/types').Capture) => {
    await supabase.from('captures').delete().eq('id', capture.id)
    setCaptures(prev => prev.filter(c => c.id !== capture.id))
    setJournalValue(prev =>
      prev.replace(`[~${capture.type}:${capture.title}~]`, '').replace(/\n{3,}/g, '\n\n').trim()
    )
  }, [])

  const handleOnethingChange = (value: string) => {
    setOnethingValue(value)
    if (onethingTimerRef.current) clearTimeout(onethingTimerRef.current)
    onethingTimerRef.current = setTimeout(() => upsertReview({ one_thing: value }), 800)
  }

  // Computed
  const pendingTodos = todos.filter(t => !t.completed && !t.waiting)
  const waitingTodos = todos.filter(t => !t.completed && t.waiting)
  const doneTodos = todos.filter(t => t.completed)
  // Featured / starred todos — for day lock progress tracking
  const featuredTodos = todos.filter(t => t.is_featured && (t.date === today || t.date === null))
  const featuredDone = featuredTodos.filter(t => t.completed)
  const isDayLocked = !!review?.day_locked_at
  const featuredProgress = featuredTodos.length > 0
    ? featuredDone.length / featuredTodos.length
    : doneTodos.length > 0 && todos.filter(t => t.date === today || t.date === null).length > 0
      ? doneTodos.filter(t => t.date === today || t.date === null).length / todos.filter(t => t.date === today || t.date === null).length
      : 0
  const allFeaturedDone = featuredTodos.length > 0 && featuredDone.length === featuredTodos.length
  const pendingMilestones = milestones.filter(m => m.status !== 'COMPLETE')
  const doneMilestones = milestones.filter(m => m.status === 'COMPLETE')

  // Filter habits by scheduled_days (null = every day)
  const todayDayOfWeek = new Date().getDay()
  const scheduledHabits = habits.filter(h =>
    !h.scheduled_days || h.scheduled_days.includes(todayDayOfWeek)
  )

  // Pill visibility logic — only show when actionable
  const urgentMilestone = pendingMilestones
    .filter(m => m.target_date)
    .map(m => {
      const raw = m.target_date!
      // Normalize YYYY-MM to YYYY-MM-01 so Date parsing is unambiguous
      const normalized = raw.length === 7 ? raw + '-01' : raw
      const daysLeft = Math.ceil(
        (new Date(normalized + 'T12:00:00').getTime() - Date.now()) / 86400000
      )
      return { ...m, daysLeft }
    })
    .filter(m => m.daysLeft <= 14)
    .sort((a, b) => a.daysLeft - b.daysLeft)[0] ?? null

  const unloggedIndicatorsCount = indicators.filter(ind =>
    !indicatorLogs.some(l => l.leading_indicator_id === ind.id && l.log_date === today)
  ).length

  // BINARY / QUANTIFIED habit helpers
  const isHabitDone = (habit: Habit): boolean => {
    const log = logs.find(l => l.habit_id === habit.id)
    if (!log) return false
    if (habit.habit_type === 'QUANTIFIED' && habit.daily_target) {
      return log.value >= habit.daily_target
    }
    return log.value === 1
  }

  const doneHabits = scheduledHabits.filter(h => isHabitDone(h))
  const pendingHabits = scheduledHabits.filter(h => !isHabitDone(h))

  const todosProgress = todos.length > 0 ? Math.round((doneTodos.length / todos.length) * 100) : 0
  const habitsProgress = scheduledHabits.length > 0 ? Math.round((doneHabits.length / scheduledHabits.length) * 100) : 0
  const milestonesProgress = milestones.length > 0 ? Math.round((doneMilestones.length / milestones.length) * 100) : 0

  // Streak per habit
  const getStreak = (habitId: string): number => {
    const habitLogs = recentLogs
      .filter(l => l.habit_id === habitId)
      .sort((a, b) => b.log_date.localeCompare(a.log_date))

    let streak = 0
    const checkDate = new Date()
    const todayLogged = habitLogs.some(l => l.log_date === today && l.value === 1)
    if (!todayLogged) checkDate.setDate(checkDate.getDate() - 1)

    for (const log of habitLogs) {
      const logDate = log.log_date
      const expected = localDate(checkDate)
      if (logDate === expected && log.value === 1) {
        streak++
        checkDate.setDate(checkDate.getDate() - 1)
      } else if (logDate < expected) {
        break
      }
    }
    return streak
  }

  // Habit adherence %
  const getAdherence = (habitId: string): number => {
    const daysElapsed = new Date().getDate()
    if (daysElapsed === 0) return 0
    const currentYearMonth = today.slice(0, 7)
    const monthLogs = recentLogs.filter(l =>
      l.habit_id === habitId &&
      l.log_date.startsWith(currentYearMonth) &&
      l.value === 1
    )
    return Math.round((monthLogs.length / daysElapsed) * 100)
  }

  // Relationship Agenda — ranked list of up to 5 items (milestones urgent → cold contacts → milestones upcoming)
  const relationshipAgenda = useMemo(() => {
    const items: Array<{
      key: string
      type: 'milestone' | 'cold'
      contactName: string
      reason: string
      contactId?: string
      score?: number
    }> = []

    // Priority 1: urgent milestones (today or tomorrow)
    upcomingMilestones
      .filter(m => m.daysUntil <= 1)
      .forEach(m => {
        const c = allContacts.find(c => c.name === m.contact_name)
        items.push({
          key: `ms-${m.id}`,
          type: 'milestone',
          contactName: m.contact_name,
          reason: m.daysUntil === 0 ? `${m.label} today` : `${m.label} tomorrow`,
          contactId: c?.id,
        })
      })

    // Priority 2: cold contacts
    coldContacts.forEach(c => {
      if (items.length >= 5) return
      items.push({
        key: `cold-${c.id}`,
        type: 'cold',
        contactName: c.name,
        reason: c.days_since >= 999 ? 'Never contacted' : `Last contact: ${c.days_since}d ago`,
        contactId: c.id,
        score: c.health_score,
      })
    })

    // Priority 3: upcoming milestones (2-30 days)
    upcomingMilestones
      .filter(m => m.daysUntil >= 2)
      .forEach(m => {
        if (items.length >= 5) return
        const c = allContacts.find(c => c.name === m.contact_name)
        items.push({
          key: `ms-${m.id}`,
          type: 'milestone',
          contactName: m.contact_name,
          reason: `${m.label} in ${m.daysUntil}d`,
          contactId: c?.id,
        })
      })

    return items.slice(0, 5)
  }, [upcomingMilestones, coldContacts, allContacts])

  const toggleTodo = async (id: string) => {
    if (!userId) return
    const t = todos.find(t => t.id === id)
    if (!t) return
    const newVal = !t.completed
    const completedAt = newVal ? new Date().toISOString() : null
    await supabase.from('todos').update({ completed: newVal, completed_at: completedAt }).eq('id', id).eq('user_id', userId)
    setTodos(prev => prev.map(t => t.id === id ? { ...t, completed: newVal, completed_at: completedAt } : t))
    // Fire-and-forget Attio task completion
    if (newVal && t.attio_task_id) {
      completeAttioTask(t.attio_task_id)
    }
  }

  const toggleFeatured = async (id: string) => {
    if (!userId) return
    const t = todos.find(t => t.id === id)
    if (!t) return
    const newVal = !t.is_featured
    await supabase.from('todos').update({ is_featured: newVal } as any).eq('id', id).eq('user_id', userId)
    setTodos(prev => prev.map(t => t.id === id ? { ...t, is_featured: newVal } : t))
  }

  const lockDay = async () => {
    if (!userId || !review) return
    const newLockedAt = review.day_locked_at ? null : new Date().toISOString()
    await supabase.from('reviews').update({ day_locked_at: newLockedAt } as any).eq('id', review.id).eq('user_id', userId)
    setReview(prev => prev ? { ...prev, day_locked_at: newLockedAt } : prev)
  }

  const toggleMilestone = async (id: string) => {
    if (!userId) return
    const m = milestones.find(m => m.id === id)
    if (!m) return
    const newStatus = m.status === 'COMPLETE' ? 'PENDING' : 'COMPLETE'
    await supabase.from('milestones').update({ status: newStatus }).eq('id', id).eq('user_id', userId)
    setMilestones(prev => prev.map(m => m.id === id ? { ...m, status: newStatus } : m))
  }

  const updateMilestoneDate = async (id: string, date: string) => {
    const value = date || null
    await supabase.from('milestones').update({ target_date: value }).eq('id', id).eq('user_id', userId)
    setMilestones(prev => prev.map(m => m.id === id ? { ...m, target_date: value } : m))
    setEditingMilestoneDateId(null)
  }

  const createMilestoneFromPanel = async (goalId: string) => {
    if (!newMilestoneDraft.text.trim() || !userId) return
    const { data } = await supabase.from('milestones').insert({
      text: newMilestoneDraft.text.trim(),
      goal_id: goalId === '__none__' ? null : goalId,
      user_id: userId,
      status: 'PENDING',
      target_date: newMilestoneDraft.date || null,
    }).select().single()
    if (data) setMilestones(prev => [...prev, data])
    setAddingMilestoneForGoalId(null)
    setNewMilestoneDraft({ text: '', date: '' })
  }

  const toggleHabit = async (habitId: string) => {
    if (!userId) return
    const existing = logs.find(l => l.habit_id === habitId && l.log_date === today)
    let justCompleted = false
    if (existing) {
      const newVal = existing.value === 1 ? 0 : 1
      const { error } = await supabase.from('habit_logs')
        .update({ value: newVal })
        .eq('id', existing.id)
        .eq('user_id', userId)
      if (error) { console.error('toggleHabit update failed:', error); return }
      setLogs(prev => prev.map(l => l.id === existing.id ? { ...l, value: newVal } : l))
      justCompleted = newVal === 1
    } else {
      const { data, error } = await supabase.from('habit_logs')
        .insert({ habit_id: habitId, user_id: userId, log_date: today, value: 1 })
        .select().single()
      if (error) { console.error('toggleHabit insert failed:', error); return }
      if (data) setLogs(prev => [...prev, data])
      justCompleted = true
    }

    if (justCompleted) {
      const streak = getStreak(habitId) + 1
      const MILESTONE_STREAKS = [7, 30, 100, 365]
      if (MILESTONE_STREAKS.includes(streak)) {
        const habit = habits.find(h => h.id === habitId)
        if (habit) setCelebrationStreak({ habit, streak })
      }
    }
  }

  const logHabitValue = async (habitId: string, value: number) => {
    if (!userId) return
    const habit = habits.find(h => h.id === habitId)
    if (!habit) return
    const existing = logs.find(l => l.habit_id === habitId && l.log_date === today)
    if (existing) {
      const { data, error } = await supabase.from('habit_logs')
        .update({ value })
        .eq('id', existing.id)
        .eq('user_id', userId)
        .select().single()
      if (error || !data) return
      setLogs(prev => prev.map(l => l.id === existing.id ? data : l))
    } else {
      const { data, error } = await supabase.from('habit_logs')
        .insert({ habit_id: habitId, user_id: userId, log_date: today, value })
        .select().single()
      if (error || !data) return
      setLogs(prev => [...prev, data])
    }
  }

  const saveIndicatorLogs = async () => {
    if (!userId) return
    const manualIndicators = indicators.filter(ind => !ind.habit_id)
    await Promise.all(manualIndicators.map(async ind => {
      const val = parseFloat(liDraftValues[ind.id] ?? '')
      if (isNaN(val)) return
      const { data } = await supabase.from('indicator_daily_logs')
        .upsert(
          { user_id: userId, leading_indicator_id: ind.id, log_date: today, value: val },
          { onConflict: 'user_id,leading_indicator_id,log_date' }
        )
        .select().single()
      if (data) {
        setIndicatorLogs(prev => {
          const idx = prev.findIndex(l => l.leading_indicator_id === ind.id)
          return idx >= 0 ? prev.map(l => l.leading_indicator_id === ind.id ? data : l) : [...prev, data]
        })
        setWeekIndicatorLogs(prev => {
          const idx = prev.findIndex(l => l.leading_indicator_id === ind.id && l.log_date === today)
          return idx >= 0 ? prev.map(l => l.leading_indicator_id === ind.id && l.log_date === today ? data : l) : [...prev, data]
        })
      }
    }))
    setLiPanelOpen(false)
  }

  // Core todo submission (used by inline input and quick-add overlay)
  const submitTodo = async (
    rawText: string,
    blockOverride?: 'AM' | 'PM' | null,
    frictionBypass = false,
    forceMilestoneId?: string | null,
    forceGoalId?: string | null,
    forceContactId?: string | null,
    forceCompanyId?: string | null,
    forceOpportunityId?: string | null,
  ) => {
    if (!rawText.trim() || !userId) return
    let text = rawText.trim()
    let goalId: string | null = forceGoalId ?? selectedGoalId
    let block: 'AM' | 'PM' | null = blockOverride !== undefined ? blockOverride : todoBlock

    // Extract URL — supports /url https://... or bare paste
    let extractedUrl: string | null = null
    const urlCmdMatch = text.match(/\/url\s+(https?:\/\/[^\s]+)/i)
    if (urlCmdMatch) {
      extractedUrl = urlCmdMatch[1]
      text = text.replace(urlCmdMatch[0], '').replace(/\s+/g, ' ').trim()
    } else {
      const urlMatch = text.match(/(https?:\/\/[^\s]+)/i)
      if (urlMatch) {
        extractedUrl = urlMatch[0]
        text = text.replace(urlMatch[0], '').replace(/\s+/g, ' ').trim()
      }
    }
    // Remove bare /url command if URL was already extracted above or no URL provided
    text = text.replace(/\/url\b/i, '').replace(/\s+/g, ' ').trim()

    const blockMatch = text.match(/\/\s*(am|pm)\b/i)
    if (blockMatch) {
      block = blockMatch[1].toUpperCase() as 'AM' | 'PM'
      text = text.replace(blockMatch[0], '').trim()
    }

    // Only parse text-based @goal if no forced goalId
    if (!goalId) {
      const goalMatch = text.match(/@(\S+)/)
      if (goalMatch) {
        const match = goals.find(g => g.text.toLowerCase().includes(goalMatch[1].toLowerCase()))
        if (match) goalId = match.id
      }
    }

    // Parse @m<milestone> mention — only if no forced milestone ID
    let milestoneId: string | null = forceMilestoneId ?? null
    if (!milestoneId) {
      const milestoneMatch = text.match(/@m([^\s@/]+)/i)
      if (milestoneMatch) {
        const mMatch = milestones.find(m => m.text.toLowerCase().includes(milestoneMatch[1].toLowerCase()))
        if (mMatch) {
          milestoneId = mMatch.id
          if (!goalId && mMatch.goal_id) goalId = mMatch.goal_id
        }
        text = text.replace(milestoneMatch[0], '').replace(/\s+/g, ' ').trim()
      }
    }

    // Auto-fill goalId from milestone if still missing
    if (!goalId && milestoneId) {
      const ms = milestones.find(m => m.id === milestoneId)
      if (ms?.goal_id) goalId = ms.goal_id
    }

    text = text.replace(/@\S+/g, '').replace(/\s+/g, ' ').trim()
    if (!text) return

    // Friction check: >5 pending todos for today
    const todayPendingCount = pendingTodos.filter(t => t.date === today || t.date === null).length
    if (todayPendingCount >= 5 && !frictionBypass) {
      setFrictionPendingTodo({ text, block, goalId, milestoneId })
      return
    }

    const finalText = text
    const finalBlock = block
    const finalGoalId = goalId
    const finalMilestoneId = milestoneId

    const { data } = await supabase.from('todos')
      .insert({
        text: finalText, user_id: userId, effort: 'NORMAL', date: today, block: finalBlock,
        goal_id: finalGoalId, milestone_id: finalMilestoneId,
        contact_id: forceContactId ?? null,
        company_id: forceCompanyId ?? null,
        opportunity_id: forceOpportunityId ?? null,
        sort_order: pendingTodos.length, url: extractedUrl ?? null,
      })
      .select().single()
    if (data) setTodos(prev => [...prev, data])
  }

  // Parse @goal and /am /pm inline from input, then add todo
  const parseAndAddTodo = async () => {
    await submitTodo(newTask)
    setNewTask('')
    setTodoBlock(null)
    setSelectedGoalId(null)
  }

  // Quick-add from overlay (inline add + ⌘N modal)
  const submitQuickAdd = async () => {
    if (!quickAddText.trim()) return
    // Extract IDs directly from linked entities array
    const forcedMilestoneId   = quickAddLinked.find(e => e.type === 'milestone')?.id ?? null
    const forcedGoalId        = quickAddLinked.find(e => e.type === 'goal')?.id ?? null
    const forcedContactId     = quickAddLinked.find(e => e.type === 'person')?.id ?? null
    const forcedCompanyId     = quickAddLinked.find(e => e.type === 'company')?.id ?? null
    const forcedOpportunityId = quickAddLinked.find(e => e.type === 'opportunity')?.id ?? null
    // Capture state before clearing
    const capturedLinkedContactId = linkedContactId
    const capturedShouldCreate = shouldCreateAttioTask
    const capturedTodoText = quickAddText
    await submitTodo(quickAddText, null, false, forcedMilestoneId, forcedGoalId, forcedContactId, forcedCompanyId, forcedOpportunityId)
    // If Attio task creation was requested, fire it after todo is saved
    if (capturedShouldCreate && capturedLinkedContactId) {
      const contact = allContacts.find(c => c.id === capturedLinkedContactId)
      if (contact?.attio_record_id) {
        const result = await createAttioTask(contact.attio_record_id, capturedTodoText, today)
        if (result?.task_id) {
          // Find the newly added todo (last in list) and save attio_task_id
          setTodos(prev => {
            const last = [...prev].reverse().find(t => t.text === capturedTodoText.trim() && !t.completed)
            if (!last) return prev
            supabase.from('todos').update({ attio_task_id: result.task_id } as any).eq('id', last.id)
            return prev.map(t => t.id === last.id ? { ...t, attio_task_id: result.task_id } : t)
          })
        }
      }
    }
    setQuickAddText('')
    setQuickAddLinked([])
    setLinkedContactId(null)
    setShouldCreateAttioTask(false)
    setQuickAddOpen(false)
    setInlineAddOpen(false)
    setQuickAddText('')
    setQuickAddLinked([])
  }

  const saveTodoText = async (id: string, textOverride?: string) => {
    const text = (textOverride ?? editingTodoText).trim()
    if (!text) { setEditingTodoId(null); setEditingLinked([]); setQaDropdown(null); return }
    const updates: Record<string, unknown> = { text }
    if (editingLinked.length > 0) {
      const ms = editingLinked.find(e => e.type === 'milestone')
      const g  = editingLinked.find(e => e.type === 'goal')
      const p  = editingLinked.find(e => e.type === 'person')
      const co = editingLinked.find(e => e.type === 'company')
      const op = editingLinked.find(e => e.type === 'opportunity')
      if (ms) updates.milestone_id   = ms.id
      if (g)  updates.goal_id        = g.id
      if (p)  updates.contact_id     = p.id
      if (co) updates.company_id     = co.id
      if (op) updates.opportunity_id = op.id
    }
    await supabase.from('todos').update(updates).eq('id', id)
    setTodos(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
    setEditingTodoId(null)
    setEditingLinked([])
    setQaDropdown(null)
  }

  const deleteTodo = async (id: string) => {
    await supabase.from('todos').delete().eq('id', id)
    setTodos(prev => prev.filter(t => t.id !== id))
  }

  // Add a todo directly (used by SuggestionsPanel)
  const addSuggestionTodo = useCallback(async (text: string, milestoneId?: string) => {
    if (!userId || !text.trim()) return
    const { data } = await supabase
      .from('todos')
      .insert({
        user_id: userId,
        text: text.trim(),
        date: today,
        milestone_id: milestoneId ?? null,
        completed: false,
        sort_order: todos.length,
      })
      .select()
      .single()
    if (data) setTodos(prev => [...prev, data as unknown as import('@/types').Todo])
  }, [userId, today, todos.length])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleTodoDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    // Drop on backlog zone — move todo to yesterday
    if (over.id === 'backlog-zone') {
      const todoId = active.id as string
      const todo = todos.find(t => t.id === todoId)
      if (!todo) return
      await supabase.from('todos').update({ date: yesterdayStr }).eq('id', todoId)
      setTodos(prev => prev.filter(t => t.id !== todoId))
      setYesterdayTodos(prev => [{ ...todo, date: yesterdayStr }, ...prev])
      return
    }

    if (active.id === over.id) return
    setTodos(prev => {
      const pending = prev.filter(t => !t.completed)
      const done = prev.filter(t => t.completed)
      const oldIdx = pending.findIndex(t => t.id === active.id)
      const newIdx = pending.findIndex(t => t.id === over.id)
      if (oldIdx === -1 || newIdx === -1) return prev
      const reordered = arrayMove(pending, oldIdx, newIdx).map((t, i) => ({ ...t, sort_order: i }))
      Promise.all(reordered.map(t => supabase.from('todos').update({ sort_order: t.sort_order }).eq('id', t.id)))
      return [...reordered, ...done]
    })
  }

  const upsertReview = async (updates: Partial<Review>) => {
    if (!userId) return
    const payload = { ...review, ...updates, user_id: userId, date: today }
    const { data } = await supabase.from('reviews').upsert(payload, { onConflict: 'user_id,date' }).select().single()
    if (data) setReview(data)
  }

  const logFriction = async (habitId: string, reason: string) => {
    if (!userId) return
    await supabase.from('friction_logs').upsert({
      habit_id: habitId, user_id: userId, log_date: today, reason,
    }, { onConflict: 'habit_id,user_id,log_date' })
  }

  const blockHabitTime = async (habit: Habit) => {
    setCalSaving(true)
    try {
      const base = new Date()
      if (calWhen === 'tomorrow') base.setDate(base.getDate() + 1)
      else if (calWhen === 'next_monday') {
        const daysUntilMon = (8 - base.getDay()) % 7 || 7
        base.setDate(base.getDate() + daysUntilMon)
      }
      const [h, m] = calTime.split(':')
      base.setHours(parseInt(h), parseInt(m), 0, 0)
      const endDate = new Date(base.getTime() + parseInt(calDuration) * 60 * 1000)

      const { data: { session } } = await supabase.auth.getSession()
      const providerToken = session?.provider_token

      if (providerToken) {
        const event = {
          summary: habit.text,
          description: `Habit block — reThink 2026`,
          start: { dateTime: base.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          end: { dateTime: endDate.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        }
        const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${providerToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        })

        if (res.ok) {
          const created = await res.json()
          await supabase.from('habits').update({ calendar_event_id: created.id }).eq('id', habit.id)
          setHabits(prev => prev.map(h => h.id === habit.id ? { ...h, calendar_event_id: created.id } : h))
          setCalendarDialogHabitId(null)
          setCalToast(`Blocked for ${base.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${calTime}`)
        } else {
          setCalToast('Calendar permission needed. Re-sign in with calendar access.')
        }
      } else {
        setCalToast('Calendar access not enabled. Re-sign in with calendar permission.')
      }
    } catch {
      setCalToast('Could not connect to Google Calendar.')
    } finally {
      setCalSaving(false)
      if (calToastTimerRef.current) clearTimeout(calToastTimerRef.current)
      calToastTimerRef.current = setTimeout(() => setCalToast(null), 3500)
    }
  }

  const startTimer = () => { setTimerRunning(true); setTimerComplete(false) }
  const pauseTimer = () => setTimerRunning(false)
  const resetTimer = () => { setTimerRunning(false); setTimerElapsed(0); setTimerComplete(false) }

  const saveSession = async (completionStatus: 'COMPLETE' | 'CARRIED_OVER' | 'INCOMPLETE') => {
    if (userId && timerStartedAt) {
      try {
        const selectedTodo = timerTodoId ? [...todos, ...yesterdayTodos].find(t => t.id === timerTodoId) : null
        const derivedGoalId = selectedTodo?.goal_id
          ?? (selectedTodo?.milestone_id ? milestones.find(m => m.id === selectedTodo.milestone_id)?.goal_id : null)
          ?? timerGoalId
        await supabase.from('focus_sessions').insert({
          user_id: userId,
          goal_id: derivedGoalId,
          habit_id: timerHabitId,
          todo_id: timerTodoId,
          started_at: timerStartedAt,
          ended_at: new Date().toISOString(),
          duration_minutes: timerDuration,
          session_type: timerDuration === 25 ? 'POMODORO' : timerDuration === 52 ? 'ULTRADIAN' : 'DEEP_WORK',
          intention: timerIntention || null,
          completion_status: completionStatus,
        })
      } catch (err) {
        console.error('Failed to save focus session:', err)
      }
    }
    setTimerComplete(false)
    setTimerRunning(false)
    setTimerElapsed(0)
    setTimerIntention('')
    setTimerStartedAt(null)
    setShowIntentionInput(false)
    if (timerRef.current) clearInterval(timerRef.current)
  }

  const monthStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  const timerRemaining = timerDuration * 60 - timerElapsed
  const timerPct = (timerElapsed / (timerDuration * 60)) * 100

  // @ suggestion logic (computed, no extra state)
  const atMatch = newTask.match(/@([^\s]*)$/)
  const atQuery = atMatch ? atMatch[1].toLowerCase() : null
  const showAtSuggestions = atQuery !== null
  const goalSuggestions = atQuery !== null
    ? (atQuery ? goals.filter(g => g.text.toLowerCase().includes(atQuery)) : goals.slice(0, 5))
    : []

  // Reset suggestion index when list changes
  useEffect(() => { setSuggestionIndex(-1) }, [atQuery])

  const selectGoalSuggestion = (goal: Pick<Goal, 'id' | 'text'>) => {
    setNewTask(prev => prev.replace(/@[^\s]*$/, '').trim())
    setSelectedGoalId(goal.id)
    setSuggestionIndex(-1)
    inputRef.current?.focus()
  }

  // Suppress Lightning unused warning
  void Lightning

  return (
    <div className="h-screen bg-white text-burnham font-sans">

      {/* ─── Main content ──────────────────────────────────────────────── */}
      <main
        className="fixed top-0 bottom-0 flex flex-col overflow-hidden transition-all duration-300"
        style={{
          left: 'var(--sidebar-width, 200px)',
          right: sidebarOpen ? 'clamp(280px, 30%, 360px)' : '2.5rem',
        }}
      >

        {/* ── Date + One Thing header ───────────────────────────────── */}
        <div className="shrink-0 bg-white border-b border-mercury/30">
          <div className="px-8 pt-5 pb-3.5 flex items-center gap-3">
            <span className={`text-[10px] font-mono uppercase tracking-[0.15em] whitespace-nowrap shrink-0 transition-colors ${isDayLocked && allFeaturedDone ? 'text-pastel' : 'text-shuttle/30'}`}>
              {isDayLocked && allFeaturedDone ? '★ ' : ''}{monthStr}
            </span>
            {onethingValue && (
              <>
                <span className="text-mercury/60 text-[10px] shrink-0">·</span>
                <span className="text-[13px] font-semibold text-burnham/80 leading-snug truncate flex-1 min-w-0">{onethingValue}</span>
              </>
            )}
            <div className="flex-1" />
            {review && (
              <button
                onClick={lockDay}
                title={isDayLocked ? 'Unlock day' : 'Lock day plan'}
                className={`shrink-0 flex items-center gap-1 text-[9px] font-mono px-2 py-1 rounded transition-all ${isDayLocked ? 'text-pastel bg-gossip/20 hover:bg-gossip/30' : 'text-shuttle/30 hover:text-shuttle/60 hover:bg-mercury/30'}`}
              >
                {isDayLocked
                  ? <LockSimple size={11} weight="fill" />
                  : <LockSimpleOpen size={11} />
                }
                <span className="hidden sm:inline">{isDayLocked ? 'locked' : 'lock'}</span>
              </button>
            )}
          </div>
          {/* Progress bar — only when day is locked */}
          {isDayLocked && (
            <div className="h-0.5 w-full bg-mercury/30">
              <div
                className="h-full bg-pastel transition-all duration-500"
                style={{ width: `${Math.round(featuredProgress * 100)}%` }}
              />
            </div>
          )}
        </div>


        {dayState === 'COMPLETED' ? (
          /* ── Day Complete Summary View ──────────────────────────── */
          <div className="flex-1 flex flex-col items-center justify-center py-16 px-8">
            <div className="w-full max-w-sm">
              <p className="text-[9px] uppercase tracking-[0.2em] text-shuttle/40 mb-2 font-mono">Day complete</p>
              <h1 className="text-xl font-semibold text-burnham mb-1">{onethingValue}</h1>
              <p className="text-xs text-shuttle/50 mb-8">Today's one thing</p>
              <div className="flex items-center gap-3 mb-8 text-xs text-shuttle flex-wrap">
                <span><strong className="text-burnham font-semibold">{todos.filter(t => t.completed).length}</strong> tasks done</span>
                <span className="text-mercury">·</span>
                <span><strong className="text-burnham font-semibold">{doneHabits.length}/{habits.length}</strong> habits</span>
                {review?.energy_level && (
                  <>
                    <span className="text-mercury">·</span>
                    <span>energy <strong className="text-burnham font-semibold">{review.energy_level}/10</strong></span>
                  </>
                )}
              </div>
              {(tomorrowReview?.one_thing || todos.filter(t => t.date === tomorrow).length > 0) && (
                <div className="border-t border-mercury pt-6 mb-8">
                  <p className="text-[9px] uppercase tracking-widest text-shuttle/40 mb-3 font-mono">Tomorrow</p>
                  {tomorrowReview?.one_thing && (
                    <p className="text-sm font-medium text-burnham mb-3">"{tomorrowReview.one_thing}"</p>
                  )}
                  <div className="space-y-1.5">
                    {todos.filter(t => t.date === tomorrow).map(t => (
                      <div key={t.id} className="flex items-center gap-2 text-xs text-shuttle">
                        <span className="w-1 h-1 rounded-full bg-mercury shrink-0 mt-px" />
                        {t.text}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-shuttle/30 italic">See you tomorrow.</p>
            </div>
          </div>
        ) : (
          /* ── Normal Today Content ───────────────────────────────── */
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className={`w-full ${!sidebarOpen ? 'max-w-2xl mx-auto' : ''} px-8 py-6 pb-14`}>

              {/* ── Habits section removed (v0.1.97) ────────────────── */}
              {false && (
              <section className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[11px] font-semibold text-shuttle uppercase tracking-widest flex items-center gap-2">
                    Habits
                    <span className="font-mono font-normal text-shuttle/40 normal-case text-[10px]">{doneHabits.length}/{scheduledHabits.length}</span>
                  </h3>
                  <span className="text-[9px] font-mono text-shuttle/25 border border-mercury/50 rounded px-1">⌘H</span>
                </div>

                {/* Chip strip — all habits always visible */}
                <div className="flex flex-nowrap gap-1.5 overflow-x-auto pb-1 mb-2" style={{ scrollbarWidth: 'none' }}>
                  {[...pendingHabits, ...doneHabits].filter(h => !h.scheduled_days || h.scheduled_days.includes(todayDayOfWeek)).map(habit => {
                    const currentLog = logs.find(l => l.habit_id === habit.id)
                    const currentVal = currentLog?.value ?? 0
                    const isDone = isHabitDone(habit)
                    const pct = habit.habit_type === 'QUANTIFIED' && habit.daily_target
                      ? Math.min(100, (currentVal / habit.daily_target) * 100)
                      : (isDone ? 100 : 0)
                    const streak = getStreak(habit.id)
                    const isExpanded = expandedHabitId === habit.id
                    const label = habit.alias ?? habit.text.split(' ')[0].slice(0, 10)

                    // Chip color based on type and state
                    let chipClass = ''
                    if (habit.habit_type === 'QUANTIFIED') {
                      if (pct >= 100) chipClass = 'bg-gossip/60 border-pastel/50 text-burnham'
                      else if (pct >= 50) chipClass = 'bg-lime-50 border-lime-400 text-lime-800'
                      else if (pct > 0) chipClass = 'bg-amber-50 border-amber-300 text-amber-800'
                      else chipClass = 'bg-white border-mercury text-shuttle'
                    } else {
                      chipClass = isDone
                        ? 'bg-gossip/60 border-pastel/50 text-burnham'
                        : 'bg-white border-mercury text-shuttle hover:border-shuttle/30'
                    }

                    return (
                      <div key={habit.id} className="flex flex-col items-start">
                        {/* The pill itself */}
                        <div className={`flex items-center gap-1.5 h-7 rounded-full border text-[11px] font-medium transition-all duration-200 ${chipClass}`}>
                          {habit.habit_type === 'QUANTIFIED' ? (
                            /* QUANTIFIED chip — vertical +/- to save horizontal space */
                            <div className="flex items-center gap-1 pl-2 pr-1 h-full">
                              {habit.emoji && <span className="leading-none text-[13px]" style={{ filter: 'grayscale(1)' }}>{habit.emoji}</span>}
                              <span className="whitespace-nowrap text-[11px]">{label}</span>
                              <div className="flex flex-col items-center justify-center h-full ml-1" style={{ gap: 0 }}>
                                <button
                                  onClick={e => { e.stopPropagation(); logHabitValue(habit.id, currentVal + 1) }}
                                  className="w-3.5 flex items-center justify-center text-[8px] text-shuttle/50 hover:text-burnham leading-none"
                                >+</button>
                                <span className="text-[10px] font-mono font-semibold w-5 text-center text-burnham leading-none">{currentVal}</span>
                                <button
                                  onClick={e => { e.stopPropagation(); logHabitValue(habit.id, Math.max(0, currentVal - 1)) }}
                                  className="w-3.5 flex items-center justify-center text-[8px] text-shuttle/50 hover:text-burnham leading-none"
                                >−</button>
                              </div>
                              {habit.daily_target && <span className="text-[9px] font-mono opacity-40">/{habit.daily_target}</span>}
                              {isDone && <Check size={10} weight="bold" className="text-pastel shrink-0" />}
                              {streak > 0 && <span className="flex items-center gap-0.5 text-[9px] opacity-60"><Flame size={8} weight="fill" className="text-pastel" />{streak}</span>}
                            </div>
                          ) : (
                            /* BINARY chip */
                            <button
                              onClick={() => toggleHabit(habit.id)}
                              className="flex items-center gap-1.5 pl-2 pr-1 h-full rounded-full"
                              title={habit.text}
                            >
                              {habit.emoji && <span className="leading-none text-[13px]" style={{ filter: 'grayscale(1)' }}>{habit.emoji}</span>}
                              <span className="whitespace-nowrap">{label}</span>
                              {isDone
                                ? <Check size={10} weight="bold" className="text-pastel shrink-0" />
                                : <span className="w-1.5 h-1.5 rounded-full bg-mercury/80 shrink-0" />
                              }
                              {streak > 0 && (
                                <span className="flex items-center gap-0.5 text-[9px] opacity-60">
                                  <Flame size={8} weight="fill" className="text-pastel" />
                                  {streak}
                                </span>
                              )}
                            </button>
                          )}
                          {/* Expand toggle — tiny dot, visible on hover */}
                          <button
                            onClick={() => setExpandedHabitId(isExpanded ? null : habit.id)}
                            className={`pr-1.5 h-full flex items-center transition-colors rounded-r-full ${isExpanded ? 'text-shuttle/50' : 'text-shuttle/15 hover:text-shuttle/40'}`}
                            title="Details"
                          >
                            <span className="text-[8px]">{isExpanded ? '▲' : '▾'}</span>
                          </button>
                        </div>

                        {/* Expanded details — shown below the chip */}
                        {isExpanded && (
                          <div className="mt-1.5 ml-1 flex items-center flex-wrap gap-3 text-[10px] text-shuttle/50">
                            {habit.default_time && <span className="font-mono">{habit.default_time}</span>}
                            {(() => { const adh = getAdherence(habit.id); return adh < getSettings().adherenceTarget ? <span>{adh}% adherence</span> : null })()}
                            {(() => {
                              const days = ['S','M','T','W','T','F','S']
                              const scheduled = habit.scheduled_days
                              return (
                                <div className="flex items-center gap-0.5">
                                  {days.map((d, i) => {
                                    const active = !scheduled || scheduled.includes(i)
                                    return (
                                      <span
                                        key={i}
                                        className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-mono font-semibold ${
                                          active ? 'bg-burnham text-gossip' : 'bg-mercury/40 text-shuttle/30'
                                        }`}
                                      >{d}</span>
                                    )
                                  })}
                                </div>
                              )
                            })()}
                            <button
                              onClick={() => setEditingHabit(habit)}
                              className="flex items-center gap-1 hover:text-burnham transition-colors"
                              title="Edit habit"
                            >
                              <Pencil size={10} /> edit
                            </button>
                            <button
                              onClick={() => setCalendarDialogHabitId(prev => prev === habit.id ? null : habit.id)}
                              className="flex items-center gap-1 hover:text-burnham transition-colors"
                            >
                              <CalendarBlank size={10} /> schedule
                            </button>
                            {!isDone && (
                              <select
                                className="bg-transparent border-0 cursor-pointer hover:text-shuttle transition-colors focus:outline-none text-[10px]"
                                onChange={e => { if (e.target.value) logFriction(habit.id, e.target.value); e.target.value = '' }}
                                defaultValue=""
                              >
                                <option value="" disabled>why not?</option>
                                <option value="Travel">Travel</option>
                                <option value="Forgot">Forgot</option>
                                <option value="Too tired">Too tired</option>
                                <option value="External blocker">External blocker</option>
                                <option value="Other">Other</option>
                              </select>
                            )}

                            {calendarDialogHabitId === habit.id && (
                              <div className="mt-1.5 w-full p-3 bg-[#F8F9F9] border border-mercury rounded-lg space-y-2">
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-shuttle mb-2">Block time in calendar</p>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <select value={calWhen} onChange={e => setCalWhen(e.target.value)}
                                    className="text-xs bg-white border border-mercury rounded px-2 py-1 text-burnham focus:outline-none">
                                    <option value="today">Today</option>
                                    <option value="tomorrow">Tomorrow</option>
                                    <option value="next_monday">Next Monday</option>
                                  </select>
                                  <span className="text-xs text-shuttle">at</span>
                                  <input type="time" value={calTime} onChange={e => setCalTime(e.target.value)}
                                    className="text-xs bg-white border border-mercury rounded px-2 py-1 text-burnham focus:outline-none" />
                                  <select value={calDuration} onChange={e => setCalDuration(e.target.value)}
                                    className="text-xs bg-white border border-mercury rounded px-2 py-1 text-burnham focus:outline-none">
                                    <option value="15">15 min</option>
                                    <option value="30">30 min</option>
                                    <option value="45">45 min</option>
                                    <option value="60">1 hour</option>
                                  </select>
                                </div>
                                <div className="flex items-center gap-2 pt-1">
                                  <button
                                    onClick={() => blockHabitTime(habit)}
                                    disabled={calSaving}
                                    className="text-xs bg-burnham text-[#72eb7e] px-3 py-1.5 rounded hover:bg-burnham/90 disabled:opacity-50 transition-colors"
                                  >
                                    {calSaving ? 'Blocking...' : 'Block time'}
                                  </button>
                                  <button onClick={() => setCalendarDialogHabitId(null)} className="text-xs text-shuttle hover:text-burnham transition-colors">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
              )}

              {/* ── Backlog moved below todos — see below ── */}
              {false && yesterdayTodos.length > 0 && (
                <section className="mb-8">
                  <h3 className="text-[9px] font-semibold text-shuttle/40 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <span className="w-4 h-px bg-shuttle/20" />
                    Backlog · {yesterdayTodos.length} unfinished
                  </h3>
                  <div className="space-y-0.5">
                    {yesterdayTodos.map(todo => {
                      const daysAgo = Math.round((new Date(today).getTime() - new Date(todo.date ?? today).getTime()) / 86400000)
                      const ageLabel = daysAgo === 1 ? 'yesterday' : daysAgo <= 7 ? `${daysAgo}d ago` : `${todo.date}`
                      return (
                        <div key={todo.id} className="group flex items-center gap-3 py-1.5 px-2 -mx-2 rounded hover:bg-amber-50/30 transition-colors">
                          <input
                            type="checkbox"
                            className="custom-checkbox shrink-0 opacity-60"
                            checked={false}
                            onChange={async () => {
                              await supabase.from('todos').update({ completed: true }).eq('id', todo.id)
                              setYesterdayTodos(prev => prev.filter(t => t.id !== todo.id))
                            }}
                          />
                          <span className="flex-1 text-sm text-shuttle/70 min-w-0 truncate">{todo.text}</span>
                          <span className="text-[9px] font-mono text-shuttle/25 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">{ageLabel}</span>
                          <button
                            onClick={async () => {
                              await supabase.from('todos').update({ date: today }).eq('id', todo.id)
                              setTodos(prev => [...prev, { ...todo, date: today }])
                              setYesterdayTodos(prev => prev.filter(t => t.id !== todo.id))
                            }}
                            className="opacity-0 group-hover:opacity-100 text-[10px] text-shuttle/50 hover:text-burnham transition-all px-2 py-0.5 rounded border border-mercury/50 hover:border-burnham/30 shrink-0"
                          >
                            →today
                          </button>
                          <button
                            onClick={async () => {
                              await supabase.from('todos').delete().eq('id', todo.id)
                              setYesterdayTodos(prev => prev.filter(t => t.id !== todo.id))
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-shuttle hover:text-red-400 p-0.5 rounded shrink-0"
                          >
                            <TrashSimple size={12} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                  <div className="h-px bg-mercury/30 mt-5" />
                </section>
              )}

              {/* ── To-Dos ─────────────────────────────────────────────── */}
              <section className="mb-10">
                {/* Hidden input — only used programmatically by ⌘N overlay */}
                <input
                  ref={inputRef}
                  className="sr-only"
                  value={newTask}
                  onChange={e => setNewTask(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'ArrowDown' && showAtSuggestions) {
                      e.preventDefault()
                      setSuggestionIndex(i => Math.min(i + 1, goalSuggestions.length - 1))
                    } else if (e.key === 'ArrowUp' && showAtSuggestions) {
                      e.preventDefault()
                      setSuggestionIndex(i => Math.max(i - 1, -1))
                    } else if (e.key === 'Enter' && showAtSuggestions && suggestionIndex >= 0) {
                      e.preventDefault()
                      selectGoalSuggestion(goalSuggestions[suggestionIndex])
                    } else if (e.key === 'Enter' && !showAtSuggestions) {
                      parseAndAddTodo()
                    } else if (e.key === 'Escape' && showAtSuggestions) {
                      setNewTask(prev => prev.replace(/@[^\s]*$/, '').trim())
                      setSuggestionIndex(-1)
                    }
                  }}
                />
                {/* Placeholder section — not needed but keep structure */}
                <div className="relative">
                  <div className="flex items-center gap-2 group">
                    <span />
                    {/* Tags appear only when typing */}
                  </div>
                </div>

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTodoDragEnd}>
                  {/* ── Group todos: Tasks first, then People ──────────── */}
                  {(() => {
                    const peopleTodos = pendingTodos.filter(t => t.contact_id)
                    const taskTodos = pendingTodos.filter(t => !t.contact_id)
                    const allPendingIds = pendingTodos.map(t => t.id)
                    return (
                  <SortableContext items={allPendingIds} strategy={verticalListSortingStrategy}>
                    <div className="space-y-0.5 mb-6">
                      {taskTodos.map((todo) => {
                        const i = pendingTodos.indexOf(todo)
                        return (
                        <SortableTodoRow
                          key={todo.id}
                          index={i}
                          todo={todo}
                          goal={todo.goal_id ? goals.find(g => g.id === todo.goal_id) : null}
                          milestone={todo.milestone_id ? milestones.find(m => m.id === todo.milestone_id) : null}
                          linkedContact={todo.contact_id ? allContacts.find(c => c.id === todo.contact_id) ?? null : null}
                          linkedCompany={todo.company_id ? companies.find(c => c.id === todo.company_id) ?? null : null}
                          linkedOpportunity={todo.opportunity_id ? opportunities.find(o => o.id === todo.opportunity_id) ?? null : null}
                          isEditing={editingTodoId === todo.id}
                          editingText={editingTodoText}
                          onEditStart={() => { setEditingTodoId(todo.id); setEditingTodoText(todo.text); setEditingLinked([]); setQaDropdown(null) }}
                          onEditChange={text => { setEditingTodoText(text); computeQaDropdown(text) }}
                          onEditSave={(t) => saveTodoText(todo.id, t)}
                          onEditCancel={() => { setEditingTodoId(null); setEditingLinked([]); setQaDropdown(null) }}
                          editRef={el => { activeEditElRef.current = el }}
                          editKeyDownDropdown={e => {
                            if (!qaDropdown || qaDropdown.items.length === 0) return false
                            if (e.key === 'ArrowDown') { e.preventDefault(); setQaDropdown(d => d ? { ...d, selectedIdx: Math.min(d.selectedIdx + 1, d.items.length - 1) } : d); return true }
                            if (e.key === 'ArrowUp') { e.preventDefault(); setQaDropdown(d => d ? { ...d, selectedIdx: Math.max(d.selectedIdx - 1, 0) } : d); return true }
                            if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); applyQaDropdownItem(qaDropdown.items[qaDropdown.selectedIdx]); return true }
                            if (e.key === 'Escape') { setQaDropdown(null); return true }
                            return false
                          }}
                          editingLinked={editingTodoId === todo.id ? editingLinked : []}
                          onClearEditingLinked={(id) => setEditingLinked(prev => prev.filter(e => e.id !== id))}
                          onToggle={() => toggleTodo(todo.id)}
                          onToggleFeatured={() => toggleFeatured(todo.id)}
                          onDelete={() => deleteTodo(todo.id)}
                          onMarkWaiting={async () => {
                            await supabase.from('todos').update({ waiting: true } as any).eq('id', todo.id)
                            setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, waiting: true } : t))
                          }}
                          onMilestoneClick={ms => {
                            const full = milestones.find(m => m.id === ms.id)
                            if (full) setSelectedMilestoneDetail(full)
                          }}
                        />
                        )}
                      )}
                      {/* ── People section — todos linked to a person ── */}
                      {peopleTodos.length > 0 && (
                        <div className="mt-4 mb-2">
                          <div className="text-[9px] font-mono uppercase tracking-widest text-shuttle/30 mb-1.5 flex items-center gap-1.5">
                            <span className="w-2 h-px bg-shuttle/20" />
                            People · {peopleTodos.length}
                          </div>
                          {peopleTodos.map((todo) => {
                            const i = pendingTodos.indexOf(todo)
                            return (
                            <SortableTodoRow
                              key={todo.id}
                              index={i}
                              todo={todo}
                              goal={todo.goal_id ? goals.find(g => g.id === todo.goal_id) : null}
                              milestone={todo.milestone_id ? milestones.find(m => m.id === todo.milestone_id) : null}
                              linkedContact={todo.contact_id ? allContacts.find(c => c.id === todo.contact_id) ?? null : null}
                              linkedCompany={todo.company_id ? companies.find(c => c.id === todo.company_id) ?? null : null}
                              linkedOpportunity={todo.opportunity_id ? opportunities.find(o => o.id === todo.opportunity_id) ?? null : null}
                              isEditing={editingTodoId === todo.id}
                              editingText={editingTodoText}
                              onEditStart={() => { setEditingTodoId(todo.id); setEditingTodoText(todo.text); setEditingLinked([]); setQaDropdown(null) }}
                              onEditChange={text => { setEditingTodoText(text); computeQaDropdown(text) }}
                              onEditSave={(t) => saveTodoText(todo.id, t)}
                              onEditCancel={() => { setEditingTodoId(null); setEditingLinked([]); setQaDropdown(null) }}
                              editRef={el => { activeEditElRef.current = el }}
                              editKeyDownDropdown={e => {
                                if (!qaDropdown || qaDropdown.items.length === 0) return false
                                if (e.key === 'ArrowDown') { e.preventDefault(); setQaDropdown(d => d ? { ...d, selectedIdx: Math.min(d.selectedIdx + 1, d.items.length - 1) } : d); return true }
                                if (e.key === 'ArrowUp') { e.preventDefault(); setQaDropdown(d => d ? { ...d, selectedIdx: Math.max(d.selectedIdx - 1, 0) } : d); return true }
                                if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); applyQaDropdownItem(qaDropdown.items[qaDropdown.selectedIdx]); return true }
                                if (e.key === 'Escape') { setQaDropdown(null); return true }
                                return false
                              }}
                              editingLinked={editingTodoId === todo.id ? editingLinked : []}
                              onClearEditingLinked={(id) => setEditingLinked(prev => prev.filter(e => e.id !== id))}
                              onToggle={() => toggleTodo(todo.id)}
                              onToggleFeatured={() => toggleFeatured(todo.id)}
                              onDelete={() => deleteTodo(todo.id)}
                              onMarkWaiting={async () => {
                                await supabase.from('todos').update({ waiting: true } as any).eq('id', todo.id)
                                setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, waiting: true } : t))
                              }}
                              onMilestoneClick={ms => {
                                const full = milestones.find(m => m.id === ms.id)
                                if (full) setSelectedMilestoneDetail(full)
                              }}
                            />
                          )})}
                        </div>
                      )}
                      {inlineAddOpen ? (
                        /* Chips appear inline BEFORE the text input in the same flex row */
                        <div className="flex items-center gap-1.5 flex-wrap py-2.5 px-2 -mx-2 min-w-0">
                          <span className="w-3 shrink-0" />
                          <div className="w-[18px] h-[18px] border border-dashed border-shuttle/40 rounded-md shrink-0 opacity-40" />
                          {/* Inline chips — appear between checkbox and text input */}
                          {quickAddLinked.map(e => (
                            <span key={e.id} className="inline-flex items-center gap-1 bg-[#1a1a1a]/[0.06] border border-[#1a1a1a]/[0.09] rounded-md px-1 py-0.5 text-[9px] text-burnham/70 font-medium shrink-0">
                              {e.imageUrl && (
                                <span className={`w-3 h-3 rounded-${e.type === 'person' ? 'full' : 'sm'} overflow-hidden bg-mercury/60 flex items-center justify-center shrink-0`}>
                                  <img src={e.imageUrl} className="w-full h-full object-cover" alt="" />
                                </span>
                              )}
                              <span>{e.name.split(' ')[0]}</span>
                              <button onMouseDown={ev => { ev.preventDefault(); setQuickAddLinked(prev => prev.filter(x => x.id !== e.id)) }} className="text-shuttle/35 hover:text-burnham ml-0.5">
                                <X size={8} />
                              </button>
                            </span>
                          ))}
                          <input
                            ref={el => { (inlineAddRef as React.MutableRefObject<HTMLInputElement | null>).current = el; activeEditElRef.current = el }}
                            autoFocus
                            value={quickAddText}
                            onChange={e => { setQuickAddText(e.target.value); computeQaDropdown(e.target.value) }}
                            onKeyDown={e => {
                              if (qaDropdown && qaDropdown.items.length > 0) {
                                if (e.key === 'ArrowDown') { e.preventDefault(); setQaDropdown(d => d ? { ...d, selectedIdx: Math.min(d.selectedIdx + 1, d.items.length - 1) } : d); return }
                                if (e.key === 'ArrowUp') { e.preventDefault(); setQaDropdown(d => d ? { ...d, selectedIdx: Math.max(d.selectedIdx - 1, 0) } : d); return }
                                if (e.key === 'Tab' || (e.key === 'Enter' && qaDropdown)) { e.preventDefault(); applyQaDropdownItem(qaDropdown.items[qaDropdown.selectedIdx]); return }
                                if (e.key === 'Escape') { setQaDropdown(null); return }
                              }
                              if (e.key === 'Enter') submitQuickAdd()
                              if (e.key === 'Escape') { setInlineAddOpen(false); setQuickAddText(''); setQaDropdown(null); setQuickAddLinked([]) }
                            }}
                            placeholder={quickAddLinked.length > 0 ? 'continue typing…' : 'What needs to get done? @ to link...'}
                            className="flex-1 min-w-[120px] text-[12px] font-normal text-burnham/70 placeholder-shuttle/20 border-none outline-none bg-transparent"
                          />
                        </div>
                      ) : (
                        <button
                          className="flex items-center gap-2.5 py-2.5 px-2 -mx-2 opacity-25 hover:opacity-60 transition-opacity group"
                          onClick={() => { setInlineAddOpen(true); setQuickAddText(''); setQaDropdown(null); setQuickAddLinked([]) }}
                        >
                          <span className="w-3 shrink-0" />
                          <div className="w-[18px] h-[18px] border border-dashed border-shuttle/50 rounded-md shrink-0" />
                          <span className="text-[13px] text-shuttle">Add a task</span>
                          <span className="text-[10px] text-shuttle/50 font-mono ml-auto">⌘N</span>
                        </button>
                      )}
                    </div>
                  </SortableContext>
                    ) // end IIFE return
                  })() /* end grouping IIFE */}

                  {waitingTodos.length > 0 && (
                    <div className="pt-4 mb-4">
                      <h4 className="text-[10px] font-semibold text-shuttle/40 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <HourglassMedium size={10} className="text-shuttle/30" /> Waiting · {waitingTodos.length}
                      </h4>
                      <div className="space-y-0.5">
                        {waitingTodos.map(todo => {
                          const goal = todo.goal_id ? goals.find(g => g.id === todo.goal_id) : null
                          return (
                            <div key={todo.id} className="group flex items-center gap-2 py-1.5 px-2 -mx-2 opacity-60 hover:opacity-90 transition-opacity rounded">
                              <HourglassMedium size={13} className="text-shuttle/30 shrink-0" />
                              <span className="text-[13px] text-shuttle flex-1 truncate italic">{todo.text}</span>
                              {goal && (
                                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 leading-none"
                                  style={{ backgroundColor: goal.color ? `${goal.color}20` : '#E5F9BD', color: goal.color ?? '#003720' }}>
                                  {goal.alias ?? goal.text.slice(0, 6)}
                                </span>
                              )}
                              <button
                                onClick={async () => {
                                  await supabase.from('todos').update({ waiting: false }).eq('id', todo.id)
                                  setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, waiting: false } : t))
                                }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] text-shuttle/40 hover:text-burnham font-mono"
                              >unblock</button>
                              <button onClick={async () => {
                                await supabase.from('todos').delete().eq('id', todo.id)
                                setTodos(prev => prev.filter(t => t.id !== todo.id))
                              }} className="opacity-0 group-hover:opacity-100 transition-opacity text-shuttle hover:text-red-400 p-0.5 rounded">
                                <TrashSimple size={12} />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {doneTodos.length > 0 && (
                    <div className="pt-4 border-t border-dashed border-mercury/50">
                      <button
                        onClick={() => setDoneTodosOpen(v => !v)}
                        className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-shuttle/30 hover:text-shuttle/50 transition-colors mb-2 w-full"
                      >
                        <span>{doneTodosOpen ? '▾' : '▸'}</span>
                        <span>Done · {doneTodos.length}</span>
                      </button>
                      {doneTodosOpen && (
                        <div className="space-y-1">
                          {doneTodos.map(todo => {
                            const goal = todo.goal_id ? goals.find(g => g.id === todo.goal_id) : null
                            const doneMilestone = todo.milestone_id ? milestones.find(m => m.id === todo.milestone_id) : null
                            return (
                              <div key={todo.id} className="group flex items-center gap-2 py-1.5 px-2 -mx-2 opacity-50 hover:opacity-70 transition-opacity">
                                <input type="checkbox" className="custom-checkbox shrink-0" checked onChange={() => toggleTodo(todo.id)} />
                                <span className="text-[13px] text-shuttle line-through decoration-pastel flex-1 truncate">{todo.text}</span>
                                {todo.completed_at && (
                                  <span className="text-[9px] font-mono text-pastel/70 shrink-0">
                                    {new Date(todo.completed_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                  </span>
                                )}
                                {doneMilestone && (
                                  <span className="bg-mercury/40 text-shuttle/50 text-[9px] px-1.5 py-0.5 rounded font-mono shrink-0 leading-none opacity-50">
                                    {doneMilestone.text.length > 18 ? doneMilestone.text.slice(0, 18) + '…' : doneMilestone.text}
                                    {goal ? ` · ${goal.alias ?? goal.text?.slice(0, 6) ?? ''}` : ''}
                                  </span>
                                )}
                                {todo.url && (() => {
                                  const chip = getUrlChip(todo.url)
                                  return (
                                    <button
                                      onClick={e => { e.stopPropagation(); openLink(todo.url!) }}
                                      className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full border shrink-0 hover:opacity-80 transition-opacity leading-none"
                                      style={{ color: chip.color, borderColor: `${chip.color}40`, backgroundColor: `${chip.color}10` }}
                                    >
                                      <span>{chip.icon}</span>
                                      <span className="font-medium ml-0.5">{chip.label}</span>
                                    </button>
                                  )
                                })()}
                                <button
                                  onClick={() => deleteTodo(todo.id)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-shuttle hover:text-red-400 p-0.5 rounded shrink-0"
                                >
                                  <TrashSimple size={12} />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Backlog — collapsed by default, drag-to-defer ──── */}
                  <BacklogDropZone hasItems={yesterdayTodos.length > 0}>
                    {yesterdayTodos.length > 0 && (
                      <section className="mt-5 mb-4">
                        <button
                          onClick={() => setBacklogExpanded(v => !v)}
                          className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-widest text-shuttle/25 hover:text-shuttle/45 transition-colors mb-1.5 w-full"
                        >
                          <span className="w-3 h-px bg-shuttle/15" />
                          <span>{backlogExpanded ? '▾' : '▸'}</span>
                          <span>Backlog · {yesterdayTodos.length}</span>
                          <span className="font-normal normal-case text-[8px] text-shuttle/15 ml-1">drag here to defer</span>
                        </button>
                        {backlogExpanded && (
                          <div className="space-y-0.5 opacity-60">
                            {yesterdayTodos.map(todo => {
                              const daysAgo = Math.round((new Date(today).getTime() - new Date(todo.date ?? today).getTime()) / 86400000)
                              const ageLabel = daysAgo === 1 ? 'yesterday' : daysAgo <= 7 ? `${daysAgo}d ago` : `${todo.date}`
                              return (
                                <div key={todo.id} className="group flex items-center gap-3 py-1 px-2 -mx-2 rounded hover:bg-mercury/20 transition-colors">
                                  <input
                                    type="checkbox"
                                    className="custom-checkbox shrink-0 opacity-40"
                                    checked={false}
                                    onChange={async () => {
                                      await supabase.from('todos').update({ completed: true }).eq('id', todo.id)
                                      setYesterdayTodos(prev => prev.filter(t => t.id !== todo.id))
                                    }}
                                  />
                                  <span className="flex-1 text-[11px] text-shuttle/35 min-w-0 truncate">{todo.text}</span>
                                  <span className="text-[8px] font-mono text-shuttle/20 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">{ageLabel}</span>
                                  <button
                                    onClick={async () => {
                                      await supabase.from('todos').update({ date: today }).eq('id', todo.id)
                                      setTodos(prev => [...prev, { ...todo, date: today }])
                                      setYesterdayTodos(prev => prev.filter(t => t.id !== todo.id))
                                    }}
                                    className="opacity-0 group-hover:opacity-100 text-[9px] text-shuttle/35 hover:text-burnham transition-all px-1.5 py-0.5 rounded border border-mercury/40 hover:border-burnham/25 shrink-0"
                                  >
                                    →today
                                  </button>
                                  <button
                                    onClick={async () => {
                                      await supabase.from('todos').delete().eq('id', todo.id)
                                      setYesterdayTodos(prev => prev.filter(t => t.id !== todo.id))
                                    }}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity text-shuttle/25 hover:text-red-400 p-0.5 shrink-0"
                                  >
                                    <TrashSimple size={11} />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </section>
                    )}
                    {yesterdayTodos.length === 0 && (
                      <div className="mt-4 py-2 px-2 -mx-2 min-h-[1.5rem]" />
                    )}
                  </BacklogDropZone>
                </DndContext>
              </section>

              {/* ── Suggestions — flat list, shown when ⌘S toggled ────────── */}
              {userId && suggestionsOpen && (
                <div className="mt-2 mb-4">
                  <SuggestionsPanel
                    userId={userId}
                    today={today}
                    onAddTodo={addSuggestionTodo}
                    onSeeAllMilestones={() => window.location.href = '/milestone-plan'}
                  />
                </div>
              )}

              {/* ── Meetings Today (F08) ──────────────────────────────────── */}
              {meetingsToday.length > 0 && (
                <section className="mb-8">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[10px] font-semibold text-shuttle uppercase tracking-widest flex items-center gap-2">
                      Today's Meetings
                      <span className="font-mono font-normal text-shuttle/40 normal-case bg-mercury/60 px-1.5 py-0.5 rounded text-[9px]">
                        {meetingsToday.length}
                      </span>
                    </h3>
                  </div>
                  <div className="space-y-1">
                    {meetingsToday.map((mtg, i) => (
                      <div key={i} className="flex items-start gap-2 py-2 border-b border-mercury/30">
                        <span className="text-sm">📅</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-burnham truncate">{mtg.summary}</p>
                          {mtg.contactName && (
                            <p className="text-[10px] text-shuttle/60">
                              with {mtg.contactName}
                              {mtg.contactScore !== undefined && ` · score: ${mtg.contactScore}`}
                            </p>
                          )}
                          <p className="text-[10px] text-shuttle/40">
                            {mtg.start ? new Date(mtg.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Relationship Agenda ───────────────────────────────────── */}
              {relationshipAgenda.length > 0 && (
                <section className="mb-8">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[10px] font-semibold text-shuttle uppercase tracking-widest flex items-center gap-2">
                      Relationship Agenda
                      <span className="font-mono font-normal text-shuttle/40 normal-case bg-mercury/60 px-1.5 py-0.5 rounded text-[9px]">
                        {relationshipAgenda.length}
                      </span>
                    </h3>
                  </div>

                  <div className="space-y-1">
                    {relationshipAgenda.map(item => {
                      const contactObj = item.contactId ? allContacts.find(c => c.id === item.contactId) : undefined
                      const scoreColor = item.score !== undefined
                        ? item.score >= 7 ? '#79D65E' : item.score >= 4 ? '#F59E0B' : '#EF4444'
                        : undefined
                      return (
                        <button
                          key={item.key}
                          onClick={() => {
                            if (contactObj) { setSelectedContact(contactObj); setDetailDrawerOpen(true) }
                          }}
                          className="group flex items-center gap-2 w-full py-1.5 px-2 -mx-2 rounded hover:bg-gossip/20 transition-colors text-left"
                        >
                          <span className="text-sm leading-none flex-shrink-0">
                            {item.type === 'cold' ? '🧊' : '⭐'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <span className="text-[13px] font-medium text-burnham">{item.contactName}</span>
                            <span className="text-[11px] text-shuttle/50 ml-1.5">{item.reason}</span>
                          </div>
                          {item.score !== undefined && scoreColor && (
                            <span
                              className="text-[10px] font-semibold flex-shrink-0 px-1.5 py-0.5 rounded"
                              style={{ color: scoreColor, background: scoreColor + '18' }}
                            >
                              {item.score}/10
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* Outreach section removed (v0.1.97) */}

              {pendingTodos.length === 0 && doneHabits.length > 0 && doneHabits.length === habits.length && habits.length > 0 && (
                <div className="mt-10 text-center">
                  <p className="text-[11px] text-shuttle/30">Solid day —{' '}
                    <button onClick={() => setShowEndOfDay(true)} className="underline hover:text-shuttle/60 transition-colors">wrap up?</button>
                  </p>
                </div>
              )}

            </div>
          </div>
        )}
      </main>

      {/* ─── Right Sidebar — journal, pulse, wrap-up ────────────────────── */}
      <aside className={`${sidebarOpen ? 'w-[clamp(280px,30%,360px)]' : 'w-10'} fixed top-0 right-0 h-screen bg-white border-l border-mercury flex flex-col z-20 transition-all duration-300 overflow-visible`}>
        {/* ─── Sidebar header: toggle only (nav is in AppShell) ─── */}
        <div className={`flex ${sidebarOpen ? 'justify-end px-4' : 'justify-center'} pt-4 pb-3 shrink-0`}>
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="p-1.5 rounded hover:bg-mercury/60 text-shuttle/50 hover:text-burnham transition-colors"
            title={sidebarOpen ? 'Collapse ⌘B' : 'Expand ⌘B'}
          >
            <SidebarSimple size={14} weight="regular" />
          </button>
        </div>

        {sidebarOpen && (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col min-h-0">

              {/* JOURNAL */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[10px] font-semibold text-shuttle/70 uppercase tracking-widest flex items-center gap-1.5">
                    <NotePencil size={11} /> Journal
                  </h3>
                  <div className="flex items-center gap-2">
                    {journalEditing && (
                      <span className="text-[9px] font-mono text-shuttle/25">/ para capturar</span>
                    )}
                    <span className="text-[9px] font-mono text-shuttle/30">⌘⇧J</span>
                    <button onClick={() => setJournalExpanded(v => !v)} className="text-shuttle/30 hover:text-shuttle transition-colors" title="Expandir ⌘⇧J">
                      <ArrowsOut size={11} />
                    </button>
                  </div>
                </div>

                <JournalEditor
                  value={journalValue}
                  onChange={handleJournalChange}
                  onPillClick={openOrCreateCapture}
                  onCaptureCreate={openOrCreateCapture}
                  onFocus={() => setJournalEditing(true)}
                  onBlur={() => setJournalEditing(false)}
                  onScoreText={gemini.scoreText}
                  hasAiScorer={hasGeminiKey}
                />
                {/* AI scorer result */}
                {gemini.result && (
                  <div className="mt-2 p-2 bg-gossip/20 border border-pastel/30 rounded-lg relative">
                    <button onClick={gemini.clear} className="absolute top-1.5 right-1.5 text-shuttle/30 hover:text-shuttle transition-colors">
                      <X size={10} />
                    </button>
                    <div className="flex items-center gap-2 mb-1">
                      <MagicWand size={10} className="text-pastel shrink-0" />
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-burnham/60">Score {gemini.result.score}/10</span>
                    </div>
                    {gemini.result.corrected !== gemini.result.explanation && (
                      <p className="text-[10px] text-burnham italic mb-1 leading-relaxed">"{gemini.result.corrected}"</p>
                    )}
                    <p className="text-[10px] text-shuttle/60 leading-relaxed">{gemini.result.explanation}</p>
                  </div>
                )}
                {gemini.loading && (
                  <p className="text-[10px] text-shuttle/30 mt-1 animate-pulse font-mono">scoring…</p>
                )}
              </div>

            </div>

            {/* End of day CTA */}
            <div className="px-6 py-5 border-t border-mercury">
              <button
                onClick={() => setShowEndOfDay(true)}
                className="w-full flex items-center justify-center gap-2 bg-burnham hover:bg-burnham/90 text-[#72eb7e] py-3 rounded-lg text-xs font-medium transition-all"
              >
                <span>Done for today</span>
                <span className="opacity-60">→</span>
              </button>
            </div>
          </>
        )}
      </aside>

      {/* ─── Journal Expand Modal (⌘⇧J) ──────────────────────────────── */}
      {journalExpanded && (
        <>
          <div className="fixed inset-0 z-[180] bg-black/20 backdrop-blur-[2px]" onClick={() => setJournalExpanded(false)} />
          <div className="fixed inset-0 z-[185] flex items-center justify-center pointer-events-none">
            <div className="pointer-events-auto w-full max-w-3xl max-h-[85vh] bg-white rounded-2xl border border-mercury shadow-2xl flex flex-col overflow-hidden mx-6">
              <div className="flex items-center justify-between px-6 py-4 border-b border-mercury/50 shrink-0">
                <h3 className="text-[10px] font-semibold text-shuttle/70 uppercase tracking-widest flex items-center gap-1.5">
                  <NotePencil size={11} /> Journal
                </h3>
                <button onClick={() => setJournalExpanded(false)} className="text-shuttle/40 hover:text-shuttle transition-colors" title="Cerrar ⌘⇧J">
                  <ArrowsIn size={11} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <JournalEditor
                  value={journalValue}
                  onChange={handleJournalChange}
                  onPillClick={openOrCreateCapture}
                  onCaptureCreate={openOrCreateCapture}
                  onFocus={() => setJournalEditing(true)}
                  onBlur={() => setJournalEditing(false)}
                  onScoreText={gemini.scoreText}
                  hasAiScorer={hasGeminiKey}
                />
                {gemini.result && (
                  <div className="mt-2 p-2 bg-gossip/20 border border-pastel/30 rounded-lg relative">
                    <button onClick={gemini.clear} className="absolute top-1.5 right-1.5 text-shuttle/30 hover:text-shuttle transition-colors"><X size={10} /></button>
                    <div className="flex items-center gap-2 mb-1"><MagicWand size={10} className="text-pastel shrink-0" /><span className="text-[9px] font-semibold uppercase tracking-wider text-burnham/60">Score {gemini.result.score}/10</span></div>
                    <p className="text-[10px] text-burnham italic mb-1">"{gemini.result.corrected}"</p>
                    <p className="text-[10px] text-shuttle/60">{gemini.result.explanation}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ─── Floating Pomodoro Widget — REMOVED in v2 ───────────────────── */}
      {false && <div className="fixed top-4 right-14 z-40 flex flex-col items-end gap-1.5">
        {/* Pill: icon + time + controls + gear */}
        <div className={`flex items-center gap-1.5 border rounded-full px-2.5 py-1.5 shadow-md transition-all duration-300 ${timerRunning ? 'bg-gossip/60 border-pastel/50 shadow-pastel/20' : 'bg-white border-mercury'}`}>
          <Timer size={11} className={`shrink-0 transition-colors ${timerRunning ? 'text-burnham' : 'text-shuttle/60'}`} />
          <span className={`text-[11px] font-mono font-bold tabular-nums w-10 text-center transition-colors ${timerRunning ? 'text-burnham' : 'text-shuttle'}`}>
            {formatTime(timerRemaining)}
          </span>
          {timerComplete ? null : !timerRunning ? (
            <button
              onClick={() => { if (timerElapsed === 0) setShowIntentionInput(true); else setTimerRunning(true) }}
              className="w-5 h-5 rounded-full bg-burnham flex items-center justify-center hover:bg-burnham/80 transition-colors"
            >
              <Play size={8} weight="fill" className="text-white" />
            </button>
          ) : (
            <button
              onClick={pauseTimer}
              className="w-5 h-5 rounded-full bg-burnham/10 border border-burnham/20 flex items-center justify-center hover:bg-burnham/20 transition-colors"
            >
              <Pause size={8} weight="fill" className="text-burnham" />
            </button>
          )}
          {timerElapsed > 0 && !timerComplete && (
            <button
              onClick={resetTimer}
              className="w-5 h-5 rounded-full border border-mercury flex items-center justify-center text-shuttle hover:border-shuttle transition-colors"
            >
              <Stop size={8} />
            </button>
          )}
          <button
            onClick={() => setShowPomSettings(v => !v)}
            className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
              showPomSettings ? 'border-burnham text-burnham bg-burnham/5' : 'border-mercury text-shuttle/40 hover:text-shuttle hover:border-shuttle'
            }`}
          >
            <GearSix size={9} />
          </button>
        </div>

        {/* Progress bar when running */}
        {timerRunning && (
          <div className="w-full bg-mercury rounded-full h-0.5">
            <div className="bg-pastel h-0.5 rounded-full transition-all" style={{ width: `${timerPct}%` }} />
          </div>
        )}

        {/* Settings panel */}
        {showPomSettings && (
          <div
            className="bg-white border border-mercury rounded-xl shadow-lg p-3 space-y-2 w-52"
            tabIndex={-1}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setShowPomSettings(false) } }}
          >
            <div className="flex gap-1">
              {FOCUS_DURATIONS.map(d => (
                <button
                  key={d.minutes}
                  onClick={() => { setTimerDuration(d.minutes); resetTimer() }}
                  disabled={timerRunning}
                  className={`flex-1 py-1 rounded text-[10px] font-bold transition-all disabled:opacity-50 ${
                    timerDuration === d.minutes
                      ? 'bg-burnham text-[#72eb7e]'
                      : 'border border-mercury text-shuttle hover:border-shuttle bg-white'
                  }`}
                  title={d.desc}
                >
                  {d.label}m
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {(['none', 'brown', 'rain'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setAmbientSound(s)}
                  className={[
                    'flex-1 text-[10px] py-0.5 rounded border transition-colors',
                    ambientSound === s
                      ? 'border-burnham text-burnham bg-burnham/5'
                      : 'border-mercury text-shuttle hover:border-burnham/30',
                  ].join(' ')}
                >
                  {s === 'none' ? 'Off' : s === 'brown' ? 'Brown' : 'Rain'}
                </button>
              ))}
            </div>
            <div className="space-y-1">
              <span className="text-[9px] uppercase tracking-wide text-shuttle/40">Link to todo</span>
              <select
                value={timerTodoId ?? ''}
                onChange={e => setTimerTodoId(e.target.value || null)}
                disabled={timerRunning}
                className="text-xs text-shuttle border border-mercury rounded-lg px-2 py-1 bg-white w-full focus:outline-none focus:border-burnham/30 cursor-pointer disabled:opacity-50"
              >
                <option value="">No todo linked</option>
                {pendingTodos.map(t => <option key={t.id} value={t.id}>{t.text.slice(0, 40)}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Intention input */}
        {showIntentionInput && (
          <div className="bg-white border border-mercury rounded-xl shadow-lg p-3 space-y-2 w-52">
            <input
              autoFocus
              value={timerIntention}
              onChange={e => setTimerIntention(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  setShowIntentionInput(false)
                  setTimerStartedAt(new Date().toISOString())
                  setTimerRunning(true)
                }
              }}
              placeholder="Session intention…"
              className="w-full text-xs border-b border-mercury outline-none bg-transparent pb-1 text-burnham placeholder-shuttle/40"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowIntentionInput(false); setTimerStartedAt(new Date().toISOString()); startTimer() }}
                className="text-[10px] font-semibold text-[#72eb7e] bg-burnham px-2 py-1 rounded"
              >Begin</button>
              <button
                onClick={() => { setShowIntentionInput(false); setTimerIntention(''); setTimerStartedAt(new Date().toISOString()); startTimer() }}
                className="text-[10px] text-shuttle"
              >Skip</button>
            </div>
          </div>
        )}

        {/* Post-session check */}
        {timerComplete && (
          <div className="bg-white border border-mercury rounded-xl shadow-lg p-3 space-y-2 w-52">
            <p className="text-[10px] uppercase tracking-widest text-shuttle text-center">Did you finish?</p>
            <div className="flex gap-1">
              <button onClick={() => saveSession('COMPLETE')} className="flex-1 text-[10px] font-semibold text-[#72eb7e] bg-burnham py-1 rounded">Yes</button>
              <button onClick={() => saveSession('CARRIED_OVER')} className="flex-1 text-[10px] text-shuttle border border-mercury py-1 rounded">Carry</button>
              <button onClick={() => saveSession('INCOMPLETE')} className="flex-1 text-[10px] text-shuttle border border-mercury py-1 rounded">No</button>
            </div>
          </div>
        )}
      </div>}

      {/* ── Habit Drawer (⌘H) ───────────────────────────────── */}
      {habitDrawerOpen && (
        <>
          <div
            className="fixed inset-0 z-[185] bg-black/10 backdrop-blur-[1px]"
            onClick={() => setHabitDrawerOpen(false)}
          />
          <div className="fixed right-0 top-0 bottom-0 z-[190] w-80 bg-white border-l border-mercury shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-mercury shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-burnham">Habits</h2>
                <span className="text-[10px] font-mono text-shuttle/40">{doneHabits.length}/{scheduledHabits.length}</span>
              </div>
              <button onClick={() => setHabitDrawerOpen(false)} className="text-shuttle hover:text-burnham transition-colors p-1">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              {scheduledHabits.filter(h => h.habit_type !== 'QUANTIFIED').length > 0 && (
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-shuttle/40 mb-3">Yes / No</p>
                  <div className="space-y-1">
                    {scheduledHabits.filter(h => h.habit_type !== 'QUANTIFIED').map((habit, idx) => {
                      const done = isHabitDone(habit)
                      const streak = getStreak(habit.id)
                      return (
                        <div key={habit.id} className="group flex items-center gap-3 py-2 px-2 -mx-2 rounded hover:bg-gray-50/60 transition-colors">
                          <input
                            type="checkbox"
                            className="custom-checkbox shrink-0"
                            checked={done}
                            onChange={() => toggleHabit(habit.id)}
                          />
                          {habit.emoji && <span className="text-base leading-none shrink-0">{habit.emoji}</span>}
                          <span className={`flex-1 text-sm ${done ? 'line-through text-shuttle/40' : 'font-medium text-burnham'}`}>
                            {habit.text}
                          </span>
                          {streak > 0 && (
                            <span className="flex items-center gap-0.5 text-[10px] text-shuttle/40 shrink-0">
                              <Flame size={10} weight="fill" className="text-pastel" />
                              {streak}
                            </span>
                          )}
                          <button onClick={() => setEditingHabit(habit)} className="opacity-0 group-hover:opacity-100 transition-opacity text-shuttle/30 hover:text-shuttle p-0.5" title="Edit">
                            <Pencil size={11} />
                          </button>
                          <span className="text-[9px] font-mono text-shuttle/20 border border-mercury/40 rounded px-1 shrink-0">{idx + 1}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {scheduledHabits.filter(h => h.habit_type === 'QUANTIFIED').length > 0 && (
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-shuttle/40 mb-3">Track Progress</p>
                  <div className="space-y-4">
                    {scheduledHabits.filter(h => h.habit_type === 'QUANTIFIED').map(habit => {
                      const currentLog = logs.find(l => l.habit_id === habit.id)
                      const currentVal = currentLog?.value ?? 0
                      const pct = habit.daily_target ? Math.min(100, (currentVal / habit.daily_target) * 100) : 0
                      const done = isHabitDone(habit)
                      const streak = getStreak(habit.id)
                      return (
                        <div key={habit.id} className="space-y-2">
                          <div className="group flex items-center gap-2">
                            {habit.emoji && <span className="text-base leading-none shrink-0">{habit.emoji}</span>}
                            <span className="flex-1 text-sm font-medium text-burnham">{habit.text}</span>
                            {streak > 0 && (
                              <span className="flex items-center gap-0.5 text-[10px] text-shuttle/40 shrink-0">
                                <Flame size={10} weight="fill" className="text-pastel" />
                                {streak}
                              </span>
                            )}
                            <button onClick={() => setEditingHabit(habit)} className="opacity-0 group-hover:opacity-100 transition-opacity text-shuttle/30 hover:text-shuttle p-0.5" title="Edit">
                              <Pencil size={11} />
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => logHabitValue(habit.id, Math.max(0, currentVal - 1))}
                              className="w-7 h-7 rounded border border-mercury flex items-center justify-center text-shuttle hover:text-burnham hover:border-shuttle transition-colors font-medium"
                            >−</button>
                            <div className="flex-1 text-center">
                              <span className="text-lg font-semibold text-burnham">{currentVal}</span>
                              <span className="text-[10px] text-shuttle/40 ml-1">/ {habit.daily_target}{habit.unit ? ` ${habit.unit}` : ''}</span>
                            </div>
                            <button
                              onClick={() => logHabitValue(habit.id, currentVal + 1)}
                              className="w-7 h-7 rounded border border-mercury flex items-center justify-center text-shuttle hover:text-burnham hover:border-shuttle transition-colors font-medium"
                            >+</button>
                          </div>
                          <div className="h-1 rounded-full bg-mercury/40 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${done ? 'bg-pastel' : pct >= 50 ? 'bg-lime-400' : 'bg-amber-400'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {scheduledHabits.length === 0 && (
                <p className="text-xs text-shuttle/40 italic text-center py-8">
                  {habits.length === 0 ? 'No habits configured yet.' : 'No habits scheduled for today.'}
                </p>
              )}
            </div>
            <div className="px-5 py-3 border-t border-mercury shrink-0">
              <p className="text-[9px] font-mono text-shuttle/25 text-center">⌘H to close</p>
            </div>
          </div>
        </>
      )}

      {/* ─── Milestones — bottom slide-up panel ────────────────────────── */}
      {/* ── Milestone Overview Panel (replaces old slide-up popup) ──── */}
      <MilestoneOverviewPanel
        open={milestonesOpen}
        milestones={milestones}
        goals={goals}
        onClose={() => setMilestonesOpen(false)}
        onSelectMilestone={ms => {
          setSelectedMilestoneDetail(ms)
          setMilestonesOpen(false)
        }}
        onNewMilestone={() => {
          setMilestonesOpen(false)
          setMilestoneCaptureOpen(true)
        }}
        onMilestoneDeleted={id => {
          setMilestones(prev => prev.filter(m => m.id !== id))
          setTodos(prev => prev.filter(t => t.milestone_id !== id))
        }}
        onMilestoneStatusToggle={async ms => {
          const newStatus = ms.status === 'COMPLETE' ? 'PENDING' : 'COMPLETE'
          await supabase.from('milestones').update({ status: newStatus }).eq('id', ms.id)
          setMilestones(prev => prev.map(m => m.id === ms.id ? { ...m, status: newStatus } : m))
        }}
      />

      {/* Bottom-right floating pill removed (v0.1.101) — now in bottom bar */}
      <NewsletterPill />

      {/* ─── @ dropdown portal — works for inline-add AND todo edit ───── */}
      {(inlineAddOpen || !!editingTodoId) && qaDropdown && qaDropdown.items.length > 0 && (inlineAddRef.current || activeEditElRef.current) && createPortal(
        (() => {
          const el = inlineAddOpen ? inlineAddRef.current : activeEditElRef.current
          const rect = el!.getBoundingClientRect()
          const isCommand = qaDropdown.type === 'command'
          // Group items by _type for non-command dropdowns
          const grouped: { type: string; label: string; items: typeof qaDropdown.items }[] = []
          if (isCommand) {
            grouped.push({ type: 'command', label: 'Commands', items: qaDropdown.items })
          } else {
            const msItems = qaDropdown.items.filter(x => x._type === 'milestone')
            const gItems = qaDropdown.items.filter(x => x._type === 'goal')
            const pItems = qaDropdown.items.filter(x => x._type === 'person')
            const coItems = qaDropdown.items.filter(x => x._type === 'company')
            const oppItems = qaDropdown.items.filter(x => x._type === 'opportunity')
            const otherItems = qaDropdown.items.filter(x => !x._type)
            if (msItems.length) grouped.push({ type: 'milestone', label: 'Milestones', items: msItems })
            if (gItems.length) grouped.push({ type: 'goal', label: 'Goals', items: gItems })
            if (pItems.length) grouped.push({ type: 'person', label: 'People', items: pItems })
            if (coItems.length) grouped.push({ type: 'company', label: 'Companies', items: coItems })
            if (oppItems.length) grouped.push({ type: 'opportunity', label: 'Opportunities', items: oppItems })
            if (otherItems.length) grouped.push({ type: 'other', label: 'Link to…', items: otherItems })
          }
          return (
            <div
              style={{ position: 'fixed', top: rect.bottom + 6, left: rect.left, width: Math.max(300, rect.width), zIndex: 9999 }}
              className="bg-white border border-mercury rounded-xl shadow-xl overflow-hidden"
            >
              <div className="max-h-72 overflow-y-auto">
                {grouped.map((group, gi) => {
                  // Track flat index for selectedIdx highlighting
                  const groupStart = grouped.slice(0, gi).reduce((s, g) => s + g.items.length, 0)
                  return (
                    <div key={group.type}>
                      {(grouped.length > 1 || group.type === 'command') && (
                        <div className={`px-3 py-1.5 ${gi > 0 ? 'border-t border-mercury/30' : ''}`}>
                          <span className="text-[9px] uppercase tracking-widest text-shuttle/30 font-mono">{group.label}</span>
                        </div>
                      )}
                      {group.items.map((item, j) => {
                        const flatIdx = groupStart + j
                        return (
                          <button
                            key={j}
                            onMouseDown={e => { e.preventDefault(); applyQaDropdownItem(item) }}
                            className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${flatIdx === qaDropdown.selectedIdx ? 'bg-gossip/40 text-burnham' : 'text-burnham hover:bg-mercury/20'}`}
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-shuttle/30 shrink-0 text-[10px]">
                                {item._type === 'milestone' ? '◎' : item._type === 'goal' ? '★' : item._type === 'person' ? '·' : item._type === 'company' ? '⬡' : item._type === 'opportunity' ? '◈' : '→'}
                              </span>
                              <span className="text-[12px] font-medium truncate">{item.label}</span>
                            </div>
                            {item.sub && <span className="text-[10px] text-shuttle/40 ml-2 shrink-0 truncate max-w-[110px]">{item.sub}</span>}
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
              <div className="px-3 py-1 border-t border-mercury/30">
                <span className="text-[9px] text-shuttle/25 font-mono">↑↓ navegar · Tab seleccionar · Esc cerrar</span>
              </div>
            </div>
          )
        })(),
        document.body
      )}

      {/* ─── Friction modal (>5 todos) ───────────────────────────────── */}
      {frictionPendingTodo && (
        <div className="fixed inset-0 z-[205] flex items-start justify-center pt-40 bg-black/10 backdrop-blur-[2px]" onClick={() => setFrictionPendingTodo(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-mercury p-5 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-burnham mb-1">You already have 5 tasks today</p>
            <p className="text-xs text-shuttle/60 mb-4">"{frictionPendingTodo.text}" — for today or later?</p>
            <div className="flex gap-2">
              <button
                onClick={() => { submitTodo(frictionPendingTodo.text, frictionPendingTodo.block ?? undefined, true); setFrictionPendingTodo(null) }}
                className="flex-1 text-xs bg-burnham text-[#72eb7e] py-2 rounded-lg hover:bg-burnham/90 transition-colors"
              >
                Add today
              </button>
              <button
                onClick={async () => {
                  if (!userId) return
                  await supabase.from('todos').insert({ text: frictionPendingTodo.text, user_id: userId, effort: 'NORMAL', date: null, block: frictionPendingTodo.block, goal_id: frictionPendingTodo.goalId, milestone_id: frictionPendingTodo.milestoneId, url: null })
                  setFrictionPendingTodo(null)
                }}
                className="flex-1 text-xs bg-mercury/30 text-shuttle py-2 rounded-lg hover:bg-mercury/50 transition-colors"
              >
                Save for later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Quick-Add Overlay (⌘N — from anywhere) ──────────────────── */}
      {quickAddOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-start justify-center pt-40 bg-black/10 backdrop-blur-[2px]"
          onClick={e => { if (e.target === e.currentTarget) { setQuickAddOpen(false); setQaDropdown(null); setQuickAddLinked([]); setLinkedContactId(null); setShouldCreateAttioTask(false) } }}
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-mercury p-6 w-full max-w-lg mx-4 relative">
            <p className="text-[9px] uppercase tracking-[0.15em] text-shuttle/30 mb-4 font-mono">Quick Add · ⌘N</p>
            <div className="relative flex items-center">
              <input
                ref={quickAddRef}
                autoFocus
                value={quickAddText}
                onChange={e => {
                  setQuickAddText(e.target.value)
                  computeQaDropdown(e.target.value)
                }}
                onKeyDown={e => {
                  if (qaDropdown && qaDropdown.items.length > 0) {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setQaDropdown(d => d ? { ...d, selectedIdx: Math.min(d.selectedIdx + 1, d.items.length - 1) } : d) }
                    if (e.key === 'ArrowUp') { e.preventDefault(); setQaDropdown(d => d ? { ...d, selectedIdx: Math.max(d.selectedIdx - 1, 0) } : d) }
                    if (e.key === 'Tab' || (e.key === 'Enter' && qaDropdown)) {
                      e.preventDefault()
                      applyQaDropdownItem(qaDropdown.items[qaDropdown.selectedIdx])
                      return
                    }
                    if (e.key === 'Escape') { setQaDropdown(null); return }
                  }
                  if (e.key === 'Enter') { submitQuickAdd() }
                  if (e.key === 'Escape') { setQuickAddOpen(false); setQuickAddText(''); setQaDropdown(null); setQuickAddLinked([]); setLinkedContactId(null); setShouldCreateAttioTask(false) }
                }}
                placeholder="What needs to get done? Type @ for goals, / for commands..."
                className="flex-1 text-base text-burnham placeholder-shuttle/20 border-none outline-none bg-transparent pr-8"
              />
              {hasGeminiKey && (
                <button
                  onClick={() => { if (quickAddText.trim()) gemini.scoreText(quickAddText) }}
                  className="absolute right-0 text-shuttle/30 hover:text-pastel transition-colors"
                  title="AI score"
                  disabled={!quickAddText.trim()}
                >
                  <MagicWand size={14} />
                </button>
              )}
            </div>
            {/* @mention linked chips */}
            {quickAddLinked.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                <span className="text-[10px] text-shuttle/40">linked to</span>
                {quickAddLinked.map(e => (
                  <span key={e.id} className="inline-flex items-center gap-1 bg-burnham/5 border border-burnham/15 rounded px-1.5 py-0.5 text-[10px] text-burnham font-medium">
                    {e.imageUrl && (
                      <span className={`w-3.5 h-3.5 rounded-${e.type === 'person' ? 'full' : 'sm'} overflow-hidden bg-mercury/60 flex items-center justify-center shrink-0`}>
                        <img src={e.imageUrl} className="w-full h-full object-cover" alt="" />
                      </span>
                    )}
                    <span className="truncate max-w-[160px]">{e.name}</span>
                    <button onClick={() => setQuickAddLinked(prev => prev.filter(x => x.id !== e.id))} className="text-shuttle/40 hover:text-burnham ml-0.5 flex-shrink-0">
                      <X size={9} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {gemini.loading && (
              <p className="text-[10px] text-shuttle/30 mt-2 animate-pulse font-mono">scoring…</p>
            )}
            {gemini.result && (
              <div className="mt-2 p-2 bg-gossip/20 border border-pastel/30 rounded-lg relative">
                <button onClick={gemini.clear} className="absolute top-1.5 right-1.5 text-shuttle/30 hover:text-shuttle transition-colors"><X size={10} /></button>
                <div className="flex items-center gap-2 mb-1"><MagicWand size={10} className="text-pastel shrink-0" /><span className="text-[9px] font-semibold uppercase tracking-wider text-burnham/60">Score {gemini.result.score}/10</span></div>
                <p className="text-[10px] text-burnham italic mb-1">"{gemini.result.corrected}"</p>
                <p className="text-[10px] text-shuttle/60">{gemini.result.explanation}</p>
              </div>
            )}

            {/* Autocomplete dropdown — grouped by type */}
            {qaDropdown && qaDropdown.items.length > 0 && (() => {
              const isCmd = qaDropdown.type === 'command'
              const qaGrouped: { type: string; label: string; items: typeof qaDropdown.items }[] = []
              if (isCmd) {
                qaGrouped.push({ type: 'command', label: 'Commands', items: qaDropdown.items })
              } else {
                const ms2 = qaDropdown.items.filter(x => x._type === 'milestone')
                const g2 = qaDropdown.items.filter(x => x._type === 'goal')
                const p2 = qaDropdown.items.filter(x => x._type === 'person')
                const co2 = qaDropdown.items.filter(x => x._type === 'company')
                const opp2 = qaDropdown.items.filter(x => x._type === 'opportunity')
                const other2 = qaDropdown.items.filter(x => !x._type)
                if (ms2.length) qaGrouped.push({ type: 'milestone', label: 'Milestones', items: ms2 })
                if (g2.length) qaGrouped.push({ type: 'goal', label: 'Goals', items: g2 })
                if (p2.length) qaGrouped.push({ type: 'person', label: 'People', items: p2 })
                if (co2.length) qaGrouped.push({ type: 'company', label: 'Companies', items: co2 })
                if (opp2.length) qaGrouped.push({ type: 'opportunity', label: 'Opportunities', items: opp2 })
                if (other2.length) qaGrouped.push({ type: 'other', label: 'Link to…', items: other2 })
              }
              return (
                <div className="absolute left-6 right-6 top-full mt-2 bg-white border border-mercury rounded-xl shadow-lg z-10 overflow-hidden">
                  <div className="max-h-52 overflow-y-auto">
                    {qaGrouped.map((group, gi) => {
                      const groupStart = qaGrouped.slice(0, gi).reduce((s, g) => s + g.items.length, 0)
                      return (
                        <div key={group.type}>
                          {(qaGrouped.length > 1 || group.type === 'command') && (
                            <div className={`px-4 py-1.5 ${gi > 0 ? 'border-t border-mercury/30' : ''}`}>
                              <span className="text-[9px] uppercase tracking-widest text-shuttle/30 font-mono">{group.label}</span>
                            </div>
                          )}
                          {group.items.map((item, j) => {
                            const flatIdx = groupStart + j
                            return (
                              <button
                                key={j}
                                onMouseDown={e => { e.preventDefault(); applyQaDropdownItem(item) }}
                                className={`w-full flex items-center justify-between px-4 py-2 text-left transition-colors ${flatIdx === qaDropdown.selectedIdx ? 'bg-gossip/40 text-burnham' : 'text-burnham hover:bg-mercury/20'}`}
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <span className="text-shuttle/30 shrink-0 text-[10px]">
                                    {item._type === 'milestone' ? '◎' : item._type === 'goal' ? '★' : item._type === 'person' ? '·' : '→'}
                                  </span>
                                  <span className="text-[13px] font-medium truncate">{item.label}</span>
                                </div>
                                {item.sub && <span className="text-[10px] text-shuttle/40 ml-3 shrink-0 truncate max-w-[160px]">{item.sub}</span>}
                              </button>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                  <div className="px-3 py-1 border-t border-mercury/30">
                    <span className="text-[9px] text-shuttle/25 font-mono">↑↓ navegar · Tab seleccionar · Esc cerrar</span>
                  </div>
                </div>
              )
            })()}

            <div className="flex items-center justify-between mt-5 pt-4 border-t border-mercury">
              <span className="text-[9px] text-shuttle/25 font-mono flex items-center gap-3">
                <span>↵ add</span>
                <span>Esc close</span>
              </span>
              <span className="text-[9px] text-shuttle/20 font-mono">@ milestones · @m milestones · @p people · / milestone</span>
            </div>
          </div>
        </div>
      )}

      {/* ─── Leading Indicators Panel (⌘L) — right sidebar ───────────── */}
      {liPanelOpen && (
        <>
          <div className="fixed inset-0 z-[199]" onClick={() => setLiPanelOpen(false)} />
          <div className="fixed right-0 top-0 bottom-0 z-[200] w-80 bg-white border-l border-mercury shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-mercury">
              <span className="text-xs font-semibold text-burnham uppercase tracking-wide">Indicators</span>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-shuttle/30">⌘L</span>
                <button onClick={() => setLiPanelOpen(false)} className="text-shuttle hover:text-burnham p-1">
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {indicators.length === 0 ? (
                <p className="text-xs text-shuttle/40 italic text-center py-8">No leading indicators configured yet.</p>
              ) : (
                <div>
                  {/* Manual indicators grouped by goal */}
                  {(() => {
                    const manual = indicators.filter(ind => !ind.habit_id)
                    const grouped = manual.reduce<Record<string, typeof manual>>((acc, ind) => {
                      const key = ind.goal_id ?? '__none__'
                      ;(acc[key] ??= []).push(ind)
                      return acc
                    }, {})
                    const goalOrder = goals.map(g => g.id)
                    const sortedKeys = Object.keys(grouped).sort((a, b) => {
                      const ai = goalOrder.indexOf(a), bi = goalOrder.indexOf(b)
                      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
                    })
                    return sortedKeys.map(key => {
                      const goal = goals.find(g => g.id === key)
                      return (
                        <div key={key}>
                          {goal && (
                            <div className="text-[9px] uppercase tracking-widest text-shuttle/40 font-mono px-1 mt-3 mb-1">
                              {goal.emoji} {goal.alias ?? goal.text.slice(0, 24)}
                            </div>
                          )}
                          {grouped[key].map(ind => (
                            <div key={ind.id} className="flex items-center gap-2 py-1.5">
                              <span className="text-xs text-burnham flex-1 truncate">{ind.name}</span>
                              <input
                                type="number"
                                min={0}
                                value={liDraftValues[ind.id] ?? ''}
                                onChange={e => setLiDraftValues(prev => ({ ...prev, [ind.id]: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') saveIndicatorLogs() }}
                                className="w-14 text-xs text-right border border-mercury rounded px-1.5 py-0.5 focus:outline-none focus:border-burnham/30"
                              />
                              {ind.unit && <span className="text-[10px] text-shuttle/50 w-8 truncate">{ind.unit}</span>}
                            </div>
                          ))}
                        </div>
                      )
                    })
                  })()}
                  {/* Habit-driven indicators */}
                  {indicators.filter(ind => !!ind.habit_id).map(ind => {
                    const todayLog = indicatorLogs.find(l => l.leading_indicator_id === ind.id)
                    const sourceHabit = habits.find(h => h.id === ind.habit_id)
                    return (
                      <div key={ind.id} className="flex items-center gap-2 py-1.5 opacity-60">
                        <div className="flex-1 min-w-0">
                          <span className="text-xs text-burnham truncate block">{ind.name}</span>
                          <span className="text-[10px] text-shuttle/40">via {sourceHabit?.alias ?? sourceHabit?.text ?? 'habit'}</span>
                        </div>
                        <span className="text-xs text-shuttle font-mono">{todayLog?.value ?? 0}</span>
                        {ind.unit && <span className="text-[10px] text-shuttle/50 w-8 truncate">{ind.unit}</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-mercury flex items-center justify-between">
              <span className="text-[9px] font-mono text-shuttle/30">↵ save · Esc close</span>
              <button onClick={saveIndicatorLogs} className="text-xs font-semibold text-burnham hover:text-burnham/70">Save →</button>
            </div>
          </div>
        </>
      )}

      {/* ─── Day NOT_STARTED overlay ───────────────────────────────── */}
      {dayState === 'NOT_STARTED' && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-burnham">
          <div className="w-full max-w-md px-8">
            <p className="text-[9px] uppercase tracking-[0.2em] text-white/25 mb-10 font-mono">{monthStr}</p>
            {onethingValue ? (
              <h1 className="text-2xl font-semibold text-white mb-8 leading-tight">Good morning. Ready to focus?</h1>
            ) : (
              <>
                <h1 className="text-2xl font-semibold text-white mb-3 leading-tight">What's your one thing today?</h1>
                <p className="text-sm text-white/35 mb-8 leading-relaxed">The single outcome that makes today a win.</p>
              </>
            )}
            {!onethingValue && (
              <input
                autoFocus
                value={objectiveDraft}
                onChange={e => setObjectiveDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && objectiveDraft.trim()) {
                    handleOnethingChange(objectiveDraft)
                    localStorage.setItem(`day_started_${today}`, 'true')
                    setDayStartedLocal(true)
                  }
                }}
                placeholder="e.g. Ship the auth integration"
                className="w-full bg-transparent border-b border-white/20 focus:border-white/50 outline-none text-xl text-white placeholder-white/15 pb-3 transition-colors mb-10"
              />
            )}
            <button
              autoFocus={!!onethingValue}
              onClick={() => {
                if (objectiveDraft.trim()) handleOnethingChange(objectiveDraft)
                localStorage.setItem(`day_started_${today}`, 'true')
                setDayStartedLocal(true)
              }}
              disabled={!onethingValue && !objectiveDraft.trim()}
              className="mt-2 px-8 py-3 bg-white text-burnham font-semibold rounded-xl text-sm disabled:opacity-20 transition-opacity hover:bg-gossip"
            >
              {onethingValue ? 'Begin the day →' : 'Set & Begin →'}
            </button>
          </div>
        </div>
      )}

      {/* ── Outreach Panel ───────────────────────────────────────────── */}
      <OutreachPanel
        open={outreachPanelOpen}
        onClose={() => setOutreachPanelOpen(false)}
        editingLog={editingOutreachLog}
        goals={goals}
        onSave={async (input: ContactInput) => {
          if (editingOutreachLog) {
            await updateContact(editingOutreachLog.id, input)
          } else {
            await addContact(input)
          }
        }}
        syncing={outreachSyncing}
        onSpawnTodo={(text, linkedinUrl, goalId) => {
          submitTodo(text + (linkedinUrl ? ` /url ${linkedinUrl}` : ''), null)
          void goalId
        }}
      />

      {/* ─── Contact Detail Drawer ───────────────────────────────────── */}
      <ContactDetailDrawer
        open={detailDrawerOpen}
        contact={selectedContact}
        userId={userId ?? ''}
        habits={habits}
        upsertHabitCount={upsertHabitCountLocal}
        funnelConfig={null}
        onClose={() => setDetailDrawerOpen(false)}
        onUpdate={async (id, updates) => { await updateContact(id, updates as Parameters<typeof updateContact>[1]) }}
        onDelete={async (id) => { await deleteContact(id); setDetailDrawerOpen(false) }}
        onSyncToAttio={syncContactToAttio}
        onSyncCompany={syncCompany}
        onSyncAll={syncAll}
      />

      {/* ─── End of Day Drawer ───────────────────────────────────────── */}
      {showEndOfDay && userId && (
        <EndOfDayDrawer
          todos={todos}
          today={today}
          userId={userId}
          onClose={() => setShowEndOfDay(false)}
          onComplete={async () => {
            setShowEndOfDay(false)
            if (!userId) return
            const { data } = await supabase.from('reviews').select('*')
              .eq('user_id', userId).eq('date', today).maybeSingle()
            if (data) setReview(data)
          }}
        />
      )}

      {/* ─── Toasts ──────────────────────────────────────────────────── */}
      {calToast && (
        <div className="fixed bottom-24 right-4 bg-burnham text-[#72eb7e] text-xs px-4 py-2.5 rounded-lg shadow-lg z-50 max-w-xs">
          {calToast}
        </div>
      )}

      {/* ─── Streak Celebration ──────────────────────────────────────── */}
      {celebrationStreak && (
        <StreakCelebration
          streak={celebrationStreak.streak}
          habitName={celebrationStreak.habit.text}
          onDismiss={() => setCelebrationStreak(null)}
        />
      )}

      {/* ── Capture Modal ──────────────────────────────────────────────── */}
      <CaptureModal
        capture={activeCapture}
        onClose={() => setActiveCapture(null)}
        goals={goals}
        milestones={milestones}
        onUpdate={handleCaptureUpdate}
        onDelete={handleCaptureDelete}
      />

      {/* ── Milestone Panel (right slide-in detail) ────────────────────── */}
      {selectedMilestoneDetail && userId && (
        <MilestonePanel
          milestone={selectedMilestoneDetail}
          goal={goals.find(g => g.id === selectedMilestoneDetail.goal_id) ?? null}
          userId={userId}
          today={today}
          onClose={() => setSelectedMilestoneDetail(null)}
          onMilestoneUpdate={updated => {
            setMilestones(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m))
          }}
          onMilestoneDelete={id => {
            setMilestones(prev => prev.filter(m => m.id !== id))
            setTodos(prev => prev.filter(t => t.milestone_id !== id))
            setSelectedMilestoneDetail(null)
          }}
          onTodoCreate={todo => setTodos(prev => [...prev, todo])}
          onTodoUpdate={todo => setTodos(prev => prev.map(t => t.id === todo.id ? todo : t))}
          onTodoDelete={todoId => setTodos(prev => prev.filter(t => t.id !== todoId))}
        />
      )}

      {/* ── Habit Edit Modal (Phase 6) ──────────────────────────────────── */}
      {editingHabit && (
        <HabitEditModal
          habit={editingHabit}
          goals={goals}
          onClose={() => setEditingHabit(null)}
          onUpdate={updated => {
            setHabits(prev => prev.map(h => h.id === updated.id ? updated : h))
            setEditingHabit(null)
          }}
        />
      )}

      {/* ── Weekly Goals Modal ──────────────────────────────────────────── */}
      {weeklyGoalsOpen && userId && (
        <WeeklyGoalsModal
          userId={userId}
          onClose={() => setWeeklyGoalsOpen(false)}
        />
      )}

      {/* ── Bottom status bar ──────────────────────────────────────────── */}
      <div
        className="fixed bottom-0 z-30 h-9 border-t border-mercury/40 bg-white/95 backdrop-blur-sm flex items-center px-5 gap-4 transition-all duration-300"
        style={{
          left: 'var(--sidebar-width, 200px)',
          right: sidebarOpen ? 'clamp(280px, 30%, 360px)' : '2.5rem',
        }}
      >
        {/* Milestones button — always says "Milestones" + next target date */}
        {(() => {
          const upcoming = milestones
            .filter(m => m.status !== 'COMPLETE' && m.target_date)
            .sort((a, b) => new Date(a.target_date! + 'T12:00:00').getTime() - new Date(b.target_date! + 'T12:00:00').getTime())[0]
          const daysLeft = upcoming
            ? Math.ceil((new Date(upcoming.target_date! + 'T12:00:00').getTime() - Date.now()) / 86400000)
            : null
          return (
            <button
              onClick={() => setMilestonesOpen(true)}
              className="flex items-center gap-2 text-shuttle/40 hover:text-burnham transition-colors group"
            >
              <span className="text-[10px] font-mono text-shuttle/25 group-hover:text-shuttle/50 transition-colors">◎</span>
              <span className="text-[11px] font-medium">Milestones</span>
              {milestones.filter(m => m.status !== 'COMPLETE').length > 0 && (
                <span className="text-[9px] font-mono text-shuttle/25">
                  {milestones.filter(m => m.status !== 'COMPLETE').length}
                </span>
              )}
              {daysLeft !== null && (
                <span className={`text-[10px] font-mono shrink-0 ${
                  daysLeft < 0 ? 'text-red-400/50' : daysLeft <= 7 ? 'text-amber-500/50' : 'text-shuttle/25'
                }`}>
                  · next {daysLeft < 0 ? 'overdue' : daysLeft === 0 ? 'today' : `${daysLeft}d`}
                </span>
              )}
            </button>
          )
        })()}

        <div className="flex-1" />

        {/* Suggestions toggle */}
        <button
          onClick={() => setSuggestionsOpen(v => !v)}
          className={`flex items-center gap-1.5 text-[11px] transition-colors ${suggestionsOpen ? 'text-burnham/60' : 'text-shuttle/28 hover:text-shuttle/55'}`}
        >
          <span className="text-[8px]">{suggestionsOpen ? '▾' : '▸'}</span>
          <span>Suggestions</span>
          <span className="text-[9px] font-mono text-shuttle/18 ml-0.5">⌘S</span>
        </button>
      </div>

      {/* ── Goals widget — fixed bottom-right ──────────────────────────── */}
      {userId && (
        <div
          className="fixed z-30 bottom-11 transition-all duration-300"
          style={{
            right: sidebarOpen ? 'calc(clamp(280px, 30%, 360px) + 0.75rem)' : '3.5rem',
          }}
        >
          {goalsWidgetOpen ? (
            <div className="bg-white border border-mercury/50 rounded-xl shadow-sm px-3.5 pt-2.5 pb-3 w-[236px]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-mono uppercase tracking-[0.12em] text-shuttle/25">This week</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setGoalsWidgetOpen(false)}
                    className="text-shuttle/18 hover:text-shuttle/45 transition-colors text-[10px] font-mono leading-none"
                    title="Minimize ⌘G"
                  >—</button>
                  <button
                    onClick={() => setWeeklyGoalsOpen(true)}
                    className="text-shuttle/20 hover:text-shuttle/50 transition-colors"
                    title="Manage goals"
                  >
                    <GearSix size={10} />
                  </button>
                </div>
              </div>
              <WeeklyPulse
                userId={userId}
                weekDates={weekDates}
                today={today}
                compact
              />
            </div>
          ) : (
            <button
              onClick={() => setGoalsWidgetOpen(true)}
              className="bg-white border border-mercury/40 rounded-lg px-2.5 py-1.5 shadow-sm text-[9px] font-mono text-shuttle/30 hover:text-shuttle/55 hover:border-mercury/60 transition-all"
              title="Show goals ⌘G"
            >
              goals ⌘G
            </button>
          )}
        </div>
      )}

      {/* ── Milestone Capture Overlay ───────────────────────────────────── */}
      {milestoneCaptureOpen && userId && (
        <MilestoneCapture
          userId={userId}
          today={today}
          goals={goals}
          onClose={() => setMilestoneCaptureOpen(false)}
          onCreated={async (milestoneId, _todayTodoTexts) => {
            setMilestoneCaptureOpen(false)
            // MilestoneCapture already saved all todos to `todos` table — just refresh
            supabase.from('milestones').select('*').eq('user_id', userId).eq('status', 'PENDING')
              .order('created_at', { ascending: false }).limit(10)
              .then(({ data }) => { if (data) setMilestones(data) })
            supabase.from('todos').select('*, milestones(text)').eq('user_id', userId).eq('date', today)
              .order('sort_order', { ascending: true }).order('created_at', { ascending: true })
              .then(({ data }) => { if (data) setTodos(data as typeof todos) })
          }}
        />
      )}
    </div>
  )
}
