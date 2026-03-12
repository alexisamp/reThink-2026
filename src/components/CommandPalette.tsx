import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { House, CalendarBlank, Strategy, ChartPie, Repeat, BookOpen, Timer, Check } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'

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
}

export default function CommandPalette({ open, onClose, onStartTimer }: CommandPaletteProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [pendingMilestones, setPendingMilestones] = useState<MilestoneItem[]>([])

  // Load pending milestones when palette opens
  useEffect(() => {
    if (!open) return
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('milestones')
        .select('id, text')
        .eq('user_id', user.id)
        .eq('status', 'PENDING')
        .limit(10)
        .then(({ data }) => setPendingMilestones(data ?? []))
    })
  }, [open])

  const markMilestoneComplete = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('milestones').update({ status: 'COMPLETE' }).eq('id', id).eq('user_id', user.id)
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

  const [selected, setSelected] = useState(0)

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => { setSelected(0) }, [query])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter' && filtered[selected]) { filtered[selected].action() }
  }

  if (!open) return null

  const showNavSection = filtered.some(c => c.group === 'nav')
  const showMilestoneSection = filtered.some(c => c.group === 'milestone')
  const navItems = filtered.filter(c => c.group === 'nav')
  const milestoneItems = filtered.filter(c => c.group === 'milestone')

  // Build a flat list for selection index tracking
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
          placeholder="Type a command or search milestones..."
          className="w-full px-4 py-3 text-sm border-b border-mercury outline-none bg-white text-burnham placeholder-shuttle/50"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="max-h-80 overflow-y-auto">
          {sections.length === 0 ? (
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
          )}
        </div>
        <div className="px-4 py-2 border-t border-mercury/50 flex items-center gap-3">
          <span className="text-[10px] text-shuttle/50 font-mono">&uarr;&darr; navigate &middot; &crarr; select &middot; esc close &middot; ⌘K open</span>
        </div>
      </div>
    </div>
  )
}
