import { type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { House, CalendarBlank, Strategy, ChartPie, SignOut, Repeat } from '@phosphor-icons/react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useNavShortcuts } from '@/hooks/useKeyboardShortcuts'

interface NavItem {
  label: string
  path: string
  Icon: React.ElementType
  shortcut: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Today',     path: '/today',     Icon: House,         shortcut: '⌘1' },
  { label: 'Monthly',   path: '/monthly',   Icon: CalendarBlank, shortcut: '⌘2' },
  { label: 'Strategy',  path: '/strategy',  Icon: Strategy,      shortcut: '⌘3' },
  { label: 'Dashboard', path: '/dashboard', Icon: ChartPie,      shortcut: '⌘4' },
  { label: 'Review',    path: '/weekly-review', Icon: Repeat,   shortcut: '⌘5' },
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
              <button
                key={path}
                onClick={() => navigate(path)}
                className={[
                  'flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all',
                  isActive
                    ? 'bg-mercury/30 ring-1 ring-mercury text-burnham shadow-sm'
                    : 'text-shuttle hover:bg-gray-50 hover:text-burnham',
                ].join(' ')}
              >
                <Icon size={18} />
                <span>{label}</span>
                <span className={[
                  'text-[10px] font-mono px-1 py-0.5 rounded',
                  isActive
                    ? 'text-shuttle/60 bg-white/60'
                    : 'text-shuttle/40 bg-mercury/20',
                ].join(' ')}>
                  {shortcut}
                </span>
              </button>
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
    </div>
  )
}
