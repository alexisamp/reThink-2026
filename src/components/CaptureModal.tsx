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

// ── Markdown renderer (same as journal) ─────────────────────────────
function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/^### (.+)$/gm, '<h3 class="font-semibold text-burnham mt-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-semibold text-burnham mt-3 text-base">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="font-bold text-burnham mt-3 text-lg">$1</h1>')
    .replace(/^- (.+)$/gm, '<li class="ml-3 list-disc list-outside">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-3 list-decimal list-outside">$1</li>')
    .replace(/\n/g, '<br />')
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

// ── Main Modal ───────────────────────────────────────────────────────
interface CaptureModalProps {
  capture: Capture | null          // null = not open
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
  const [bodyEditing, setBodyEditing] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle')
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // AI scorer for title
  const { result: aiResult, loading: aiLoading, scoreText: runScore, clear: clearAi } = useGeminiScorer()

  // Sync state when capture changes
  useEffect(() => {
    if (!capture) return
    setTitle(capture.title)
    setBody(capture.body ?? '')
    setUrl(capture.url ?? '')
    setLinkedGoalId(capture.linked_goal_id ?? '')
    setLinkedMilestoneId(capture.linked_milestone_id ?? '')
    setBodyEditing(false)
    setSaveStatus('idle')
    clearAi()
  }, [capture?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: Esc to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const persist = useCallback(async (patch: Partial<Capture>) => {
    if (!capture) return
    setSaveStatus('saving')
    const { data } = await supabase
      .from('captures')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', capture.id)
      .select()
      .single()
    if (data) { onUpdate(data as Capture); setSaveStatus('saved') }
    setTimeout(() => setSaveStatus('idle'), 1500)
  }, [capture, onUpdate])

  const scheduleSave = useCallback((patch: Partial<Capture>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persist(patch), 600)
  }, [persist])

  // Markdown toolbar actions
  const wrapSelection = (before: string, after = before) => {
    const el = bodyRef.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e, value } = el
    const newVal = value.slice(0, s) + before + value.slice(s, e) + after + value.slice(e)
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
    setBody(newVal)
    scheduleSave({ body: newVal })
  }

  if (!capture) return null
  const cfg = CAPTURE_CONFIG[capture.type]
  const { Icon } = cfg

  const formattedDate = (() => {
    const d = new Date(capture.captured_date + 'T12:00:00')
    const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
  })()

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[200] bg-black/10 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-0 z-[205] flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto w-[560px] max-h-[80vh] bg-white rounded-2xl border border-mercury shadow-2xl flex flex-col overflow-hidden">

          {/* ── Header: type badge + close ── */}
          <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-mercury/50 shrink-0">
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${cfg.badgeBg} ${cfg.badgeText}`}>
              <Icon size={12} weight="bold" />
              <span>{cfg.label}</span>
            </div>
            <button onClick={onClose} className="text-shuttle/30 hover:text-shuttle transition-colors">
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
                  setTitle(e.target.value)
                  scheduleSave({ title: e.target.value })
                }}
                className="w-full text-xl font-semibold text-burnham bg-transparent border-none outline-none placeholder-shuttle/20 pr-8"
                placeholder="Título…"
              />
              {title.trim() && hasGeminiKey && (
                <button
                  type="button"
                  onClick={() => runScore(title)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-shuttle/30 hover:text-shuttle transition-colors"
                  title="Evaluar escritura con AI"
                >
                  <MagicWand size={14} />
                </button>
              )}
              {aiLoading && <p className="text-[10px] text-shuttle/50 mt-1 animate-pulse">Evaluando…</p>}
              {aiResult && (
                <div className="mt-2 p-2 bg-gossip/20 rounded-lg border border-gossip/40 text-[11px]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-burnham">Nota: {aiResult.score}/10</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setTitle(aiResult.corrected); scheduleSave({ title: aiResult.corrected }); clearAi() }}
                        className="text-[10px] text-burnham underline"
                      >
                        Aplicar
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

          {/* ── Body (rich text) ── */}
          <div className="flex-1 overflow-y-auto px-6 pb-4 min-h-0">
            {/* Toolbar */}
            <div className="flex items-center gap-0.5 mb-2 -ml-1">
              <ToolbarBtn label="B"  onClick={() => wrapSelection('**')} />
              <ToolbarBtn label="I"  onClick={() => wrapSelection('*')} />
              <ToolbarBtn label="~~" onClick={() => wrapSelection('~~')} />
              <span className="w-px h-3 bg-mercury mx-1" />
              <ToolbarBtn label="•"  onClick={() => prependLine('- ')} />
              <ToolbarBtn label="1." onClick={() => prependLine('1. ')} />
            </div>

            {/* Edit / View toggle */}
            {bodyEditing ? (
              <textarea
                ref={bodyRef}
                autoFocus
                value={body}
                onChange={e => { setBody(e.target.value); scheduleSave({ body: e.target.value }) }}
                onBlur={() => { setBodyEditing(false); persist({ title, body, url: url || null, linked_goal_id: linkedGoalId || null, linked_milestone_id: linkedMilestoneId || null }) }}
                className="w-full min-h-[140px] bg-transparent border-none outline-none text-sm text-burnham resize-none leading-relaxed placeholder-shuttle/20 focus:ring-0"
                placeholder="Agrega contexto, notas, reflexiones…"
              />
            ) : (
              <div
                onClick={() => setBodyEditing(true)}
                className="min-h-[140px] cursor-text text-sm text-burnham leading-relaxed"
              >
                {body ? (
                  <div dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} />
                ) : (
                  <span className="text-shuttle/25 italic">Agrega contexto, notas, reflexiones…</span>
                )}
              </div>
            )}
          </div>

          {/* ── Meta fields ── */}
          <div className="px-6 py-3 border-t border-mercury/50 space-y-2 shrink-0">
            {/* URL */}
            <div className="flex items-center gap-2">
              <Link size={12} className="text-shuttle/30 shrink-0" />
              <input
                type="url"
                value={url}
                onChange={e => { setUrl(e.target.value); scheduleSave({ url: e.target.value || null }) }}
                placeholder="https://…"
                className="flex-1 text-[12px] text-burnham bg-transparent border-none outline-none placeholder-shuttle/20"
              />
              {url && (
                <a href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                  <ArrowSquareOut size={12} className="text-shuttle/30 hover:text-shuttle transition-colors" />
                </a>
              )}
            </div>

            {/* Milestone link — first */}
            <div className="flex items-center gap-2">
              <Flag size={12} className="text-shuttle/30 shrink-0" />
              <select
                value={linkedMilestoneId}
                onChange={e => {
                  const mid = e.target.value || null
                  setLinkedMilestoneId(mid ?? '')
                  if (mid) {
                    const ms = milestones.find(m => m.id === mid)
                    if (ms?.goal_id) setLinkedGoalId(ms.goal_id)
                  }
                  scheduleSave({ linked_milestone_id: mid })
                }}
                className="flex-1 text-[12px] text-burnham bg-transparent border-none outline-none cursor-pointer"
              >
                <option value="">Sin milestone vinculado</option>
                {milestones.map(m => (
                  <option key={m.id} value={m.id}>{m.text}</option>
                ))}
              </select>
            </div>

            {/* Goal link — second */}
            <div className="flex items-center gap-2">
              <Target size={12} className="text-shuttle/30 shrink-0" />
              <select
                value={linkedGoalId}
                onChange={e => { setLinkedGoalId(e.target.value); scheduleSave({ linked_goal_id: e.target.value || null }) }}
                className="flex-1 text-[12px] text-burnham bg-transparent border-none outline-none cursor-pointer"
              >
                <option value="">Sin objetivo vinculado</option>
                {goals.map(g => (
                  <option key={g.id} value={g.id}>{g.alias ?? g.text}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="px-6 py-3 border-t border-mercury/50 flex items-center justify-between shrink-0">
            <span className="text-[9px] font-mono text-shuttle/25">
              {formattedDate} · {cfg.label.toLowerCase()} · editado {new Date(capture.updated_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
            </span>
            <div className="flex items-center gap-3">
              {onDelete && (
                <button
                  onClick={() => { onDelete(capture); onClose() }}
                  className="flex items-center gap-1 text-[11px] text-shuttle/40 hover:text-red-400 transition-colors"
                  title="Eliminar captura"
                >
                  <Trash size={12} />
                  <span>eliminar</span>
                </button>
              )}
              <span className="text-[9px] font-mono text-shuttle/25">
                {saveStatus === 'saving' ? 'guardando…' : saveStatus === 'saved' ? 'guardado ✓' : 'Esc para cerrar'}
              </span>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
