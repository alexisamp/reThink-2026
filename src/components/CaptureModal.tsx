import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Lightbulb, BookOpen, Eye, Scales, Trophy, Question,
  ArrowSquareOut, X, Link, Target, Trash, MagicWand, Flag
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { Capture, CaptureType } from '@/types'
import { useGeminiScorer, hasGeminiKey } from '@/hooks/useGeminiScorer'

type GoalOption = { id: string; text: string; alias?: string | null }
type MilestoneOption = { id: string; text: string; goal_id?: string | null }

// ── Capture type config ──────────────────────────────────────────────
const CAPTURE_CONFIG: Record<CaptureType, {
  label: string
  Icon: React.ElementType
  chipBg: string
  chipText: string
  badgeBg: string
  badgeText: string
}> = {
  idea:       { label: 'Idea',       Icon: Lightbulb, chipBg: 'bg-gossip',         chipText: 'text-burnham', badgeBg: 'bg-gossip',         badgeText: 'text-burnham' },
  learning:   { label: 'Learning',   Icon: BookOpen,  chipBg: 'bg-pastel/30',      chipText: 'text-burnham', badgeBg: 'bg-pastel/30',      badgeText: 'text-burnham' },
  reflection: { label: 'Reflection', Icon: Eye,       chipBg: 'bg-shuttle/10',     chipText: 'text-shuttle', badgeBg: 'bg-shuttle/10',     badgeText: 'text-shuttle' },
  decision:   { label: 'Decision',   Icon: Scales,    chipBg: 'bg-burnham/15',     chipText: 'text-burnham', badgeBg: 'bg-burnham/15',     badgeText: 'text-burnham' },
  win:        { label: 'Win',        Icon: Trophy,    chipBg: 'bg-pastel',         chipText: 'text-burnham', badgeBg: 'bg-pastel',         badgeText: 'text-burnham' },
  question:   { label: 'Question',   Icon: Question,  chipBg: 'bg-mercury',        chipText: 'text-shuttle', badgeBg: 'bg-mercury',        badgeText: 'text-shuttle' },
}

// ── Chip (rendered in journal non-edit view) ─────────────────────────
export function CaptureChip({ type, title, onClick }: {
  type: CaptureType
  title: string
  onClick: (e: React.MouseEvent) => void
}) {
  const cfg = CAPTURE_CONFIG[type]
  const { Icon } = cfg
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${cfg.chipBg} ${cfg.chipText} hover:opacity-80 transition-opacity my-0.5`}
    >
      <Icon size={11} weight="bold" />
      <span>{title}</span>
    </button>
  )
}

// ── Toolbar button ───────────────────────────────────────────────────
function ToolbarBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      className="text-[10px] font-mono text-shuttle/50 hover:text-shuttle px-1.5 py-0.5 rounded hover:bg-mercury/40 transition-colors leading-none"
    >
      {label}
    </button>
  )
}

// ── Main Modal ───────────────────────────────────────────────────────
interface CaptureModalProps {
  capture: Capture | null
  onClose: () => void
  goals: GoalOption[]
  milestones: MilestoneOption[]
  onUpdate: (updated: Capture) => void
  onDelete?: (capture: Capture) => void
}

export default function CaptureModal({ capture, onClose, goals, milestones, onUpdate, onDelete }: CaptureModalProps) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')
  const [linkedGoalId, setLinkedGoalId] = useState<string>('')
  const [linkedMilestoneId, setLinkedMilestoneId] = useState('')
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle')
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Refs always hold the latest values (bypass stale-closure issues) ──
  // IMPORTANT: also write-through immediately in every onChange handler below
  // so flushAndClose always reads current values even before the next render.
  const captureRef = useRef<Capture | null>(capture)
  const titleRef = useRef(title)
  const bodyValRef = useRef(body)
  const urlRef = useRef(url)
  const linkedGoalIdRef = useRef(linkedGoalId)
  const linkedMilestoneIdRef = useRef(linkedMilestoneId)

  // Fallback: keep refs in sync with state every render (handles any missed write-throughs)
  captureRef.current = capture
  titleRef.current = title
  bodyValRef.current = body
  urlRef.current = url
  linkedGoalIdRef.current = linkedGoalId
  linkedMilestoneIdRef.current = linkedMilestoneId

  // AI scorer for title
  const { result: aiResult, loading: aiLoading, scoreText: runScore, clear: clearAi } = useGeminiScorer()

  // Sync state AND refs when a different capture opens
  useEffect(() => {
    if (!capture) return
    // Write-through refs first so flushAndClose has correct values even on rapid close
    titleRef.current = capture.title
    bodyValRef.current = capture.body ?? ''
    urlRef.current = capture.url ?? ''
    linkedGoalIdRef.current = capture.linked_goal_id ?? ''
    linkedMilestoneIdRef.current = capture.linked_milestone_id ?? ''
    // Then update state for rendering
    setTitle(capture.title)
    setBody(capture.body ?? '')
    setUrl(capture.url ?? '')
    setLinkedGoalId(capture.linked_goal_id ?? '')
    setLinkedMilestoneId(capture.linked_milestone_id ?? '')
    setSaveStatus('idle')
    clearAi()
    // Focus body after a tick so title doesn't steal focus on reopen
    setTimeout(() => bodyRef.current?.focus(), 80)
  }, [capture?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── persist: saves a patch immediately, shows status indicator ──
  const persist = useCallback(async (patch: Partial<Capture>) => {
    const cap = captureRef.current
    if (!cap) return
    setSaveStatus('saving')
    const { data } = await supabase
      .from('captures')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', cap.id)
      .select()
      .single()
    if (data) { onUpdate(data as Capture); setSaveStatus('saved') }
    setTimeout(() => setSaveStatus('idle'), 1500)
  }, [onUpdate])

  // ── scheduleSave: debounced persist ──
  const scheduleSave = useCallback((patch: Partial<Capture>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persist(patch), 600)
  }, [persist])

  // ── flushAndClose: reads from refs → always has latest values ──
  const flushAndClose = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const cap = captureRef.current
    if (cap) {
      // Fire-and-forget with CURRENT values from refs (not stale closures)
      supabase
        .from('captures')
        .update({
          title: titleRef.current,
          body: bodyValRef.current,
          url: urlRef.current || null,
          linked_goal_id: linkedGoalIdRef.current || null,
          linked_milestone_id: linkedMilestoneIdRef.current || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cap.id)
        .select()
        .single()
        .then(({ data }) => { if (data) onUpdate(data as Capture) })
    }
    onClose()
  }, [onClose, onUpdate]) // stable deps — reads live values from refs

  // ESC to close with flush
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && captureRef.current) {
        e.stopPropagation()
        flushAndClose()
      }
    }
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [flushAndClose])

  // Markdown toolbar helpers
  const wrapSelection = (before: string, after = before) => {
    const el = bodyRef.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e, value } = el
    const newVal = value.slice(0, s) + before + value.slice(s, e) + after + value.slice(e)
    bodyValRef.current = newVal  // write-through immediately
    setBody(newVal)
    scheduleSave({ body: newVal })
    setTimeout(() => { el.selectionStart = s + before.length; el.selectionEnd = e + before.length; el.focus() }, 0)
  }
  const prependLine = (prefix: string) => {
    const el = bodyRef.current
    if (!el) return
    const { selectionStart: s, value } = el
    const lineStart = value.lastIndexOf('\n', s - 1) + 1
    const newVal = value.slice(0, lineStart) + prefix + value.slice(lineStart)
    bodyValRef.current = newVal  // write-through immediately
    setBody(newVal)
    scheduleSave({ body: newVal })
  }

  if (!capture) return null
  const cfg = CAPTURE_CONFIG[capture.type]
  const { Icon } = cfg

  const formattedDate = (() => {
    const d = new Date(capture.captured_date + 'T12:00:00')
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
  })()

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[200] bg-black/10 backdrop-blur-[2px]"
        onClick={flushAndClose}
      />

      {/* Panel */}
      <div className="fixed inset-0 z-[205] flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto w-[560px] max-h-[80vh] bg-white rounded-2xl border border-mercury shadow-2xl flex flex-col overflow-hidden">

          {/* ── Header ── */}
          <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-mercury/50 shrink-0">
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${cfg.badgeBg} ${cfg.badgeText}`}>
              <Icon size={12} weight="bold" />
              <span>{cfg.label}</span>
            </div>
            <button onClick={flushAndClose} className="text-shuttle/30 hover:text-shuttle transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* ── Title ── */}
          <div className="px-6 pt-4 pb-2 shrink-0">
            <div className="relative">
              <input
                type="text"
                value={title}
                onChange={e => {
                  const v = e.target.value
                  titleRef.current = v  // write-through immediately
                  setTitle(v)
                  scheduleSave({ title: v })
                }}
                onBlur={e => {
                  if (e.target.value.trim()) persist({ title: e.target.value })
                }}
                className="w-full text-xl font-semibold text-burnham bg-transparent border-none outline-none placeholder-shuttle/20 pr-8"
                placeholder="Title…"
              />
              {title.trim() && hasGeminiKey && (
                <button
                  type="button"
                  onClick={() => runScore(title)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-shuttle/20 hover:text-shuttle/60 transition-colors"
                  title="Score with AI"
                >
                  <MagicWand size={13} />
                </button>
              )}
              {aiLoading && <p className="text-[10px] text-shuttle/50 mt-1 animate-pulse">Scoring…</p>}
              {aiResult && (
                <div className="mt-2 p-2 bg-gossip/20 rounded-lg border border-gossip/40 text-[11px]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-burnham">Score: {aiResult.score}/10</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setTitle(aiResult.corrected); scheduleSave({ title: aiResult.corrected }); clearAi() }}
                        className="text-[10px] text-burnham underline"
                      >
                        Apply
                      </button>
                      <button onClick={clearAi} className="text-shuttle/40 hover:text-shuttle transition-colors">
                        <X size={10} />
                      </button>
                    </div>
                  </div>
                  <p className="text-shuttle/60">{aiResult.corrected}</p>
                  <p className="text-shuttle/40 mt-0.5">{aiResult.explanation}</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Body — always editable textarea, no toggle ── */}
          <div className="flex-1 overflow-y-auto px-6 pb-4 min-h-0">
            <div className="flex items-center gap-0.5 mb-2 -ml-1">
              <ToolbarBtn label="B"  onClick={() => wrapSelection('**')} />
              <ToolbarBtn label="I"  onClick={() => wrapSelection('*')} />
              <ToolbarBtn label="~~" onClick={() => wrapSelection('~~')} />
              <span className="w-px h-3 bg-mercury mx-1" />
              <ToolbarBtn label="•"  onClick={() => prependLine('- ')} />
              <ToolbarBtn label="1." onClick={() => prependLine('1. ')} />
            </div>
            <textarea
              ref={bodyRef}
              value={body}
              onChange={e => {
                const v = e.target.value
                bodyValRef.current = v  // write-through immediately
                setBody(v)
                scheduleSave({ body: v })
              }}
              onBlur={e => {
                // onBlur fires when user clicks something else (selects, backdrop, etc.)
                // Read all current refs so we save everything, not just body
                persist({
                  title: titleRef.current,
                  body: e.target.value,
                  url: urlRef.current || null,
                  linked_goal_id: linkedGoalIdRef.current || null,
                  linked_milestone_id: linkedMilestoneIdRef.current || null,
                })
              }}
              className="w-full min-h-[140px] bg-transparent border-none outline-none text-sm text-burnham resize-none leading-relaxed placeholder-shuttle/20 focus:ring-0"
              placeholder="Add context, notes, reflections…"
            />
          </div>

          {/* ── Meta fields ── */}
          <div className="px-6 py-3 border-t border-mercury/50 space-y-2 shrink-0">
            {/* URL */}
            <div className="flex items-center gap-2">
              <Link size={12} className="text-shuttle/30 shrink-0" />
              <input
                type="url"
                value={url}
                onChange={e => {
                  const v = e.target.value
                  urlRef.current = v  // write-through immediately
                  setUrl(v)
                  scheduleSave({ url: v || null })
                }}
                onBlur={e => persist({ url: e.target.value || null })}
                placeholder="https://…"
                className="flex-1 text-[12px] text-burnham bg-transparent border-none outline-none placeholder-shuttle/20"
              />
              {url && (
                <a href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                  <ArrowSquareOut size={12} className="text-shuttle/30 hover:text-shuttle transition-colors" />
                </a>
              )}
            </div>

            {/* Milestone — first */}
            <div className="flex items-center gap-2">
              <Flag size={12} className="text-shuttle/30 shrink-0" />
              <select
                value={linkedMilestoneId}
                onChange={e => {
                  const mid = e.target.value || ''
                  // Write-through refs IMMEDIATELY before setState (so flushAndClose
                  // reads the new values even if called before the next render)
                  linkedMilestoneIdRef.current = mid
                  setLinkedMilestoneId(mid)
                  // Auto-populate goal from milestone
                  let newGoalId = linkedGoalIdRef.current
                  if (mid) {
                    const ms = milestones.find(m => m.id === mid)
                    if (ms?.goal_id) {
                      newGoalId = ms.goal_id
                      linkedGoalIdRef.current = newGoalId  // write-through immediately
                      setLinkedGoalId(newGoalId)
                    }
                  }
                  // Persist BOTH milestone and goal together so neither is lost
                  persist({ linked_milestone_id: mid || null, linked_goal_id: newGoalId || null })
                }}
                className="flex-1 text-[12px] text-burnham bg-transparent border-none outline-none cursor-pointer"
              >
                <option value="">No milestone linked</option>
                {milestones.map(m => (
                  <option key={m.id} value={m.id}>{m.text}</option>
                ))}
              </select>
            </div>

            {/* Goal — second */}
            <div className="flex items-center gap-2">
              <Target size={12} className="text-shuttle/30 shrink-0" />
              <select
                value={linkedGoalId}
                onChange={e => {
                  const gid = e.target.value
                  linkedGoalIdRef.current = gid  // write-through immediately
                  setLinkedGoalId(gid)
                  persist({ linked_goal_id: gid || null })
                }}
                className="flex-1 text-[12px] text-burnham bg-transparent border-none outline-none cursor-pointer"
              >
                <option value="">No goal linked</option>
                {goals.map(g => (
                  <option key={g.id} value={g.id}>{g.alias ?? g.text}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="px-6 py-3 border-t border-mercury/50 flex items-center justify-between shrink-0">
            <span className="text-[9px] font-mono text-shuttle/25">
              {formattedDate} · {cfg.label.toLowerCase()}
            </span>
            <div className="flex items-center gap-3">
              {onDelete && (
                <button
                  onClick={() => { onDelete(capture); onClose() }}
                  className="flex items-center gap-1 text-[11px] text-shuttle/40 hover:text-red-400 transition-colors"
                >
                  <Trash size={12} />
                  <span>delete</span>
                </button>
              )}
              <span className="text-[9px] font-mono text-shuttle/25">
                {saveStatus === 'saving' ? 'saving…' : saveStatus === 'saved' ? 'saved ✓' : 'Esc to close'}
              </span>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
