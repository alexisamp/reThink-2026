import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  House, CalendarBlank, Strategy, ChartPie, Repeat, BookOpen, Timer, Check,
  Target, Flag, CheckSquare, Lightbulb, Eye, Scales, Trophy, Question as PhQuestion,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { Goal, Milestone, Todo, Capture, CaptureType } from '@/types'

interface Command {
  id: string
  label: string
  Icon: React.ElementType
  shortcut?: string
  action: () => void
  group?: string
}

interface MilestoneItem {
  id: string
  text: string
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onStartTimer?: () => void
  onOpenCapture?: (capture: Capture) => void
}

const CAPTURE_ICONS: Record<CaptureType, React.ElementType> = {
  idea: Lightbulb,
  learning: BookOpen,
  reflection: Eye,
  decision: Scales,
  win: Trophy,
  question: PhQuestion,
}

interface SearchResult {
  id: string
  label: string
  sub?: string
  group: 'goal' | 'milestone' | 'todo' | 'capture'
  Icon: React.ElementType
  action: () => void
}

export default function CommandPalette({ open, onClose, onStartTimer, onOpenCapture }: CommandPaletteProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [pendingMilestones, setPendingMilestones] = useState<MilestoneItem[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [recentTodos, setRecentTodos] = useState<Todo[]>([])
  const [captures, setCaptures] = useState<Capture[]>([])
  const [userId, setUserId] = useState<string | null>(null)

  // Resolve userId once
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })
  }, [])

  // Load data when palette opens
  useEffect(() => {
    if (!open || !userId) return

    // Pending milestones for quick-complete (nav mode)
    supabase.from('milestones')
      .select('id, text')
      .eq('user_id', userId)
      .eq('status', 'PENDING')
      .limit(10)
      .then(({ data }) => setPendingMilestones(data ?? []))

    // All milestones for search
    supabase.from('milestones')
      .select('*')
      .eq('user_id', userId)
      .then(({ data }) => setMilestones((data as Milestone[]) ?? []))

    // Goals for search
    supabase.from('goals')
      .select('*')
      .eq('user_id', userId)
      .then(({ data }) => setGoals((data as Goal[]) ?? []))

    // Recent todos (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
    supabase.from('todos')
      .select('*')
      .eq('user_id', userId)
      .gte('date', weekAgo)
      .then(({ data }) => setRecentTodos((data as Todo[]) ?? []))

    // Recent captures (last 30 days) — table may not exist yet, silently ignore
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    supabase.from('captures')
      .select('*')
      .eq('user_id', userId)
      .gte('captured_date', monthAgo)
      .then(({ data }) => setCaptures((data as Capture[]) ?? []))
  }, [open, userId])

  const markMilestoneComplete = async (id: string) => {
    if (!userId) return
    await supabase.from('milestones').update({ status: 'COMPLETE' }).eq('id', id).eq('user_id', userId)
    setPendingMilestones(prev => prev.filter(m => m.id !== id))
    onClose()
  }

  const navCommands: Command[] = [
    { id: 'today',    label: 'Go to Today',         Icon: House,         shortcut: '⌘1', group: 'nav', action: () => { navigate('/today');        onClose() } },
    { id: 'monthly',  label: 'Go to Monthly',        Icon: CalendarBlank, shortcut: '⌘2', group: 'nav', action: () => { navigate('/monthly');      onClose() } },
    { id: 'dashboard',label: 'Go to Dashboard',      Icon: ChartPie,      shortcut: '⌘3', group: 'nav', action: () => { navigate('/dashboard');    onClose() } },
    { id: 'strategy', label: 'Go to Strategy',       Icon: Strategy,                      group: 'nav', action: () => { navigate('/strategy');     onClose() } },
    { id: 'review',   label: 'Go to Weekly Review',  Icon: Repeat,                        group: 'nav', action: () => { navigate('/weekly-review'); onClose() } },
    { id: 'library',  label: 'Go to Library',        Icon: BookOpen,                      group: 'nav', action: () => { navigate('/library');       onClose() } },
    { id: 'timer',    label: 'Start Focus Timer',    Icon: Timer,                         group: 'nav', action: () => { navigate('/today'); onStartTimer?.(); onClose() } },
  ]

  const milestoneCommands: Command[] = pendingMilestones.map(m => ({
    id: `ms-${m.id}`,
    label: `Mark complete: ${m.text}`,
    Icon: Check,
    group: 'milestone',
    action: () => markMilestoneComplete(m.id),
  }))

  const allCommands = [...navCommands, ...milestoneCommands]

  const filtered = query.trim()
    ? allCommands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))
    : allCommands

  // Search results (when query >= 2 chars)
  const searchResults: SearchResult[] = useMemo(() => {
    if (query.trim().length < 2) return []
    const q = query.toLowerCase()
    const results: SearchResult[] = []

    goals
      .filter(g => `${g.text} ${g.alias ?? ''}`.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach(g => results.push({
        id: g.id,
        label: g.alias ?? g.text,
        sub: g.text !== (g.alias ?? g.text) ? g.text : undefined,
        group: 'goal',
        Icon: Target,
        action: () => { navigate('/strategy'); onClose() },
      }))

    milestones
      .filter(m => m.text.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach(m => results.push({
        id: m.id,
        label: m.text,
        sub: m.target_date ?? undefined,
        group: 'milestone',
        Icon: Flag,
        action: () => { onClose() },
      }))

    recentTodos
      .filter(t => t.text.toLowerCase().includes(q))
      .slice(0, 4)
      .forEach(t => results.push({
        id: t.id,
        label: t.text,
        sub: t.date ?? undefined,
        group: 'todo',
        Icon: CheckSquare,
        action: () => { navigate('/'); onClose() },
      }))

    captures
      .filter(c => `${c.title} ${c.body ?? ''}`.toLowerCase().includes(q))
      .slice(0, 4)
      .forEach(c => results.push({
        id: c.id,
        label: c.title,
        sub: c.type,
        group: 'capture',
        Icon: CAPTURE_ICONS[c.type as CaptureType] ?? Lightbulb,
        action: () => { onOpenCapture?.(c); onClose() },
      }))

    return results
  }, [query, goals, milestones, recentTodos, captures, navigate, onClose, onOpenCapture])

  const [selected, setSelected] = useState(0)

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => { setSelected(0) }, [query])

  const isSearchMode = query.trim().length >= 2

  // Flat list for keyboard navigation
  const keyboardList = isSearchMode ? searchResults : filtered

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, keyboardList.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter') {
      if (isSearchMode && searchResults[selected]) {
        searchResults[selected].action()
      } else if (!isSearchMode && filtered[selected]) {
        filtered[selected].action()
      }
    }
  }

  if (!open) return null

  const showNavSection = filtered.some(c => c.group === 'nav')
  const showMilestoneSection = filtered.some(c => c.group === 'milestone')
  const navItems = filtered.filter(c => c.group === 'nav')
  const milestoneItems = filtered.filter(c => c.group === 'milestone')

  // Build flat list for selection index tracking (nav mode)
  const sections = [
    ...(showNavSection ? navItems : []),
    ...(showMilestoneSection ? milestoneItems : []),
  ]

  const GROUP_LABELS: Record<string, string> = {
    goal: 'Objetivos',
    milestone: 'Milestones',
    todo: 'Tareas',
    capture: 'Capturas',
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[20vh] bg-black/10 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white border border-mercury rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          placeholder="Type a command or search…"
          className="w-full px-4 py-3 text-sm border-b border-mercury outline-none bg-white text-burnham placeholder-shuttle/50"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="max-h-80 overflow-y-auto">
          {isSearchMode ? (
            searchResults.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-[11px] text-shuttle/30 font-mono">Sin resultados para &ldquo;{query}&rdquo;</p>
              </div>
            ) : (
              <div className="py-1">
                {(['goal', 'milestone', 'todo', 'capture'] as const).map(group => {
                  const groupItems = searchResults.filter(r => r.group === group)
                  if (groupItems.length === 0) return null
                  return (
                    <div key={group}>
                      <p className="text-[9px] uppercase tracking-widest text-shuttle/30 font-mono px-4 py-2 mt-1">
                        {GROUP_LABELS[group]}
                      </p>
                      {groupItems.map(item => {
                        const globalIdx = searchResults.indexOf(item)
                        return (
                          <button
                            key={item.id}
                            onClick={item.action}
                            onMouseEnter={() => setSelected(globalIdx)}
                            className={[
                              'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                              globalIdx === selected ? 'bg-mercury/30' : 'hover:bg-mercury/20',
                            ].join(' ')}
                          >
                            <item.Icon size={14} className="text-shuttle/40 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] text-burnham truncate">{item.label}</p>
                              {item.sub && <p className="text-[10px] text-shuttle/40 font-mono">{item.sub}</p>}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )
          ) : (
            sections.length === 0 ? (
              <p className="px-4 py-3 text-xs text-shuttle">No commands found</p>
            ) : (
              <>
                {showNavSection && (
                  <>
                    {!query.trim() && (
                      <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-shuttle/50">Navigate</p>
                    )}
                    {navItems.map((cmd) => {
                      const globalIdx = sections.indexOf(cmd)
                      return (
                        <button
                          key={cmd.id}
                          onClick={cmd.action}
                          className={[
                            'w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors',
                            globalIdx === selected ? 'bg-mercury/30 text-burnham' : 'text-burnham hover:bg-mercury/20',
                          ].join(' ')}
                          onMouseEnter={() => setSelected(globalIdx)}
                        >
                          <cmd.Icon size={14} className="text-shuttle shrink-0" />
                          <span>{cmd.label}</span>
                          {cmd.shortcut && (
                            <span className="ml-auto text-[10px] font-mono text-shuttle/40 bg-mercury/30 px-1.5 py-0.5 rounded">
                              {cmd.shortcut}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </>
                )}
                {showMilestoneSection && (
                  <>
                    {!query.trim() && (
                      <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-shuttle/50 border-t border-mercury/50 mt-1">
                        Mark milestone complete
                      </p>
                    )}
                    {milestoneItems.map((cmd) => {
                      const globalIdx = sections.indexOf(cmd)
                      return (
                        <button
                          key={cmd.id}
                          onClick={cmd.action}
                          className={[
                            'w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors',
                            globalIdx === selected ? 'bg-gossip/30 text-burnham' : 'text-burnham hover:bg-mercury/20',
                          ].join(' ')}
                          onMouseEnter={() => setSelected(globalIdx)}
                        >
                          <cmd.Icon size={14} className="text-pastel shrink-0" weight="bold" />
                          <span className="truncate">{cmd.label}</span>
                        </button>
                      )
                    })}
                  </>
                )}
              </>
            )
          )}
        </div>
        <div className="px-4 py-2 border-t border-mercury/50 flex items-center gap-3">
          <span className="text-[10px] text-shuttle/50 font-mono">&uarr;&darr; navigate &middot; &crarr; select &middot; esc close &middot; ⌘K open</span>
        </div>
      </div>
    </div>
  )
}
