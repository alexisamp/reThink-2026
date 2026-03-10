import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { House, CalendarBlank, Strategy, ChartPie, Repeat, BookOpen, Timer } from '@phosphor-icons/react'

interface Command {
  id: string
  label: string
  Icon: React.ElementType
  shortcut?: string
  action: () => void
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

  const commands: Command[] = [
    { id: 'today', label: 'Go to Today', Icon: House, shortcut: '⌘1', action: () => { navigate('/today'); onClose() } },
    { id: 'monthly', label: 'Go to Monthly', Icon: CalendarBlank, shortcut: '⌘2', action: () => { navigate('/monthly'); onClose() } },
    { id: 'strategy', label: 'Go to Strategy', Icon: Strategy, shortcut: '⌘3', action: () => { navigate('/strategy'); onClose() } },
    { id: 'dashboard', label: 'Go to Dashboard', Icon: ChartPie, shortcut: '⌘4', action: () => { navigate('/dashboard'); onClose() } },
    { id: 'review', label: 'Go to Weekly Review', Icon: Repeat, shortcut: '⌘5', action: () => { navigate('/weekly-review'); onClose() } },
    { id: 'library', label: 'Go to Library', Icon: BookOpen, action: () => { navigate('/library'); onClose() } },
    { id: 'timer', label: 'Start Focus Timer', Icon: Timer, action: () => { navigate('/today'); onStartTimer?.(); onClose() } },
  ]

  const filtered = query.trim()
    ? commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))
    : commands

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
          placeholder="Type a command..."
          className="w-full px-4 py-3 text-sm border-b border-mercury outline-none bg-white text-burnham placeholder-shuttle/50"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-xs text-shuttle">No commands found</p>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                onClick={cmd.action}
                className={[
                  'w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors',
                  i === selected ? 'bg-mercury/30 text-burnham' : 'text-burnham hover:bg-mercury/20',
                ].join(' ')}
                onMouseEnter={() => setSelected(i)}
              >
                <cmd.Icon size={14} className="text-shuttle shrink-0" />
                <span>{cmd.label}</span>
                {cmd.shortcut && (
                  <span className="ml-auto text-[10px] font-mono text-shuttle/40 bg-mercury/30 px-1.5 py-0.5 rounded">
                    {cmd.shortcut}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
        <div className="px-4 py-2 border-t border-mercury/50 flex items-center gap-3">
          <span className="text-[10px] text-shuttle/50 font-mono">&uarr;&darr; navigate &middot; &crarr; select &middot; esc close</span>
        </div>
      </div>
    </div>
  )
}
