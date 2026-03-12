import { Fragment, useState, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { House, CalendarBlank, ChartPie, SignOut } from '@phosphor-icons/react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useNavShortcuts, useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import CommandPalette from '@/components/CommandPalette'

interface NavItem {
  label: string
  path: string
  Icon: React.ElementType
  shortcut: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Today',     path: '/today',     Icon: House,         shortcut: '⌘1' },
  { label: 'Monthly',   path: '/monthly',   Icon: CalendarBlank, shortcut: '⌘2' },
  { label: 'Dashboard', path: '/dashboard', Icon: ChartPie,      shortcut: '⌘3' },
]

interface AppShellProps {
  children: ReactNode
  user: User
}

export default function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const signOut = () => supabase.auth.signOut()
  useNavShortcuts()

  const [paletteOpen, setPaletteOpen] = useState(false)
  useKeyboardShortcuts({ 'cmd+k': () => setPaletteOpen(true) })

  return (
    <div className="min-h-screen bg-white text-burnham font-sans">
      {/* Main content */}
      <div className="pb-28">
        {children}
      </div>

      {/* Bottom floating pill nav */}
      <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
        <div className="flex items-center gap-1 bg-white/90 backdrop-blur-md border border-mercury p-1.5 rounded-full shadow-lg">
          {NAV_ITEMS.map(({ label, path, Icon, shortcut }) => {
            const isActive = pathname === path || (path !== '/today' && pathname.startsWith(path))
            return (
              <Fragment key={path}>
                <div className="relative group">
                  {/* Shortcut hint tooltip */}
                  <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-[9px] font-mono bg-burnham text-white px-1.5 py-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-sm">
                    {shortcut}
                  </span>
                  <button
                    onClick={() => navigate(path)}
                    className={[
                      'flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-all',
                      isActive
                        ? 'bg-mercury/30 ring-1 ring-mercury text-burnham shadow-sm'
                        : 'text-shuttle hover:bg-gray-50 hover:text-burnham',
                    ].join(' ')}
                  >
                    <Icon size={18} />
                    <span>{label}</span>
                  </button>
                </div>
              </Fragment>
            )
          })}
          <div className="w-px h-5 bg-mercury/60 mx-1" />
          <button
            onClick={signOut}
            title="Sign out"
            className="flex items-center justify-center w-9 h-9 rounded-full text-shuttle hover:text-burnham hover:bg-gray-100 transition-all"
          >
            <SignOut size={16} />
          </button>
        </div>
      </nav>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
