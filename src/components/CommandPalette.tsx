import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  House, CalendarBlank, Strategy, ChartPie, Repeat, BookOpen, Timer, Check,
  Target, Flag, CheckSquare, Lightbulb, Eye, Scales, Trophy, Question as PhQuestion,
  Plus,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { Goal, Milestone, Todo, Capture, CaptureType, TodoMentionKind } from '@/types'
import type { Mention } from '@/screens/today/types'
import {
  createCrmObject,
  hasStrongCrmMatch,
  iconForCrmKind,
  mentionFromCompany,
  mentionFromContact,
  mentionFromOpportunity,
  pathForMention,
  rankCrmObjects,
} from '@/lib/crmObjects'

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
  group: 'goal' | 'milestone' | 'todo' | 'capture' | 'person' | 'company' | 'opportunity' | 'create'
  Icon: React.ElementType
  action: () => void
  score: number
  badge?: string
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
  const [crmOptions, setCrmOptions] = useState<Mention[]>([])
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

    Promise.all([
      supabase.from('outreach_logs').select('id, name, profile_photo_url, company, job_title, email').eq('user_id', userId).order('name'),
      supabase.from('companies').select('id, name, logo_url, domain, sector, headline').eq('user_id', userId).order('name'),
      supabase.from('opportunities').select('id, title, stage, type, company_id, company:companies(id, name, logo_url, domain)').eq('user_id', userId).order('created_at', { ascending: false }),
    ]).then(([peopleRes, companiesRes, oppsRes]) => {
      const people = (peopleRes.data ?? []).map(c => mentionFromContact(c))
      const companies = (companiesRes.data ?? []).map(c => mentionFromCompany(c))
      const opps = ((oppsRes.data ?? []) as Parameters<typeof mentionFromOpportunity>[0][])
        .filter(o => o.stage !== 'won' && o.stage !== 'lost')
        .map(o => mentionFromOpportunity(o))
      setCrmOptions([...people, ...companies, ...opps])
    })
  }, [open, userId])

  const markMilestoneComplete = async (id: string) => {
    if (!userId) return
    await supabase.from('milestones').update({ status: 'COMPLETE' }).eq('id', id).eq('user_id', userId)
    setPendingMilestones(prev => prev.filter(m => m.id !== id))
    onClose()
  }

  const createFromPalette = async (kind: TodoMentionKind, name: string) => {
    if (!userId) return
    const created = await createCrmObject(supabase, userId, kind, name)
    if (!created) return
    setCrmOptions(prev => {
      const exists = prev.some(m => m.kind === created.mention.kind && m.id === created.mention.id)
      return exists ? prev : [...prev, created.mention]
    })
    navigate(created.path)
    onClose()
  }

  const scoreText = (value: string, rawQuery: string, base: number) => {
    const q = rawQuery.trim().toLowerCase()
    const v = value.toLowerCase()
    if (!q || !v.includes(q)) return 0
    if (v === q) return base + 90
    if (v.startsWith(q)) return base + 70
    if (v.split(/\s+/).some(w => w.startsWith(q))) return base + 45
    return base + 20
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
  const buildSearchResults = (): SearchResult[] => {
    if (query.trim().length < 2) return []
    const q = query.trim().toLowerCase()
    const results: SearchResult[] = []

    goals
      .map(g => ({ item: g, score: scoreText(`${g.text} ${g.alias ?? ''}`, q, 48) }))
      .filter(x => x.score > 0)
      .forEach(({ item, score }) => results.push({
        id: `goal:${item.id}`,
        label: item.alias ?? item.text,
        sub: item.text !== (item.alias ?? item.text) ? item.text : undefined,
        group: 'goal',
        Icon: Target,
        score,
        badge: 'Goal',
        action: () => { navigate('/strategy'); onClose() },
      }))

    milestones
      .map(m => ({ item: m, score: scoreText(m.text, q, 42) }))
      .filter(x => x.score > 0)
      .forEach(({ item, score }) => results.push({
        id: `milestone:${item.id}`,
        label: item.text,
        sub: item.target_date ?? undefined,
        group: 'milestone',
        Icon: Flag,
        score,
        badge: 'Milestone',
        action: () => { onClose() },
      }))

    recentTodos
      .map(t => ({ item: t, score: scoreText(t.text, q, 36) }))
      .filter(x => x.score > 0)
      .forEach(({ item, score }) => results.push({
        id: `todo:${item.id}`,
        label: item.text,
        sub: item.date ?? undefined,
        group: 'todo',
        Icon: CheckSquare,
        score,
        badge: 'Todo',
        action: () => { navigate('/'); onClose() },
      }))

    captures
      .map(c => ({ item: c, score: scoreText(`${c.title} ${c.body ?? ''}`, q, 34) }))
      .filter(x => x.score > 0)
      .forEach(({ item, score }) => results.push({
        id: `capture:${item.id}`,
        label: item.title,
        sub: item.type,
        group: 'capture',
        Icon: CAPTURE_ICONS[item.type as CaptureType] ?? Lightbulb,
        score,
        badge: 'Capture',
        action: () => { onOpenCapture?.(item); onClose() },
      }))

    rankCrmObjects(crmOptions, q, new Set(), 12).forEach((mention, index) => results.push({
      id: `${mention.kind}:${mention.id}`,
      label: mention.name,
      sub: mention.sub ?? undefined,
      group: mention.kind,
      Icon: iconForCrmKind(mention.kind),
      score: 84 - index,
      badge: mention.kind === 'person' ? 'Person' : mention.kind === 'company' ? 'Company' : 'Opportunity',
      action: () => { navigate(pathForMention(mention)); onClose() },
    }))

    if (!hasStrongCrmMatch(crmOptions, q)) {
      ;(['person', 'company', 'opportunity'] as TodoMentionKind[]).forEach((kind, index) => {
        results.push({
          id: `create:${kind}`,
          label: `Create ${kind} "${query.trim()}"`,
          sub: kind === 'opportunity' ? 'New opportunity' : kind === 'company' ? 'New company' : 'New person',
          group: 'create',
          Icon: Plus,
          score: 24 - index,
          badge: 'Create',
          action: () => { void createFromPalette(kind, query.trim()) },
        })
      })
    }

    return results.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, 16)
  }
  const searchResults = buildSearchResults()

  const [selected, setSelected] = useState(0)

  useEffect(() => {
    if (open) {
      window.setTimeout(() => {
        setQuery('')
        setSelected(0)
        inputRef.current?.focus()
      }, 50)
    }
  }, [open])

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
          onChange={e => { setQuery(e.target.value); setSelected(0) }}
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
                <p className="text-[9px] uppercase tracking-widest text-shuttle/30 font-mono px-4 py-2 mt-1">
                  Search
                </p>
                {searchResults.map((item, globalIdx) => (
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
                      {item.sub && <p className="text-[10px] text-shuttle/40 font-mono truncate">{item.sub}</p>}
                    </div>
                    {item.badge && (
                      <span className="text-[9px] font-mono text-shuttle/45 bg-mercury/30 px-1.5 py-0.5 rounded">
                        {item.badge}
                      </span>
                    )}
                  </button>
                ))}
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
