import { Fragment, useState, useRef, useEffect, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { House, CalendarBlank, ChartPie, Gear } from '@phosphor-icons/react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useNavShortcuts, useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import CommandPalette from '@/components/CommandPalette'
import SettingsModal from '@/components/SettingsModal'
import type { UpdaterState } from '@/hooks/useUpdater'

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
  updater: UpdaterState & {
    isTauri: boolean
    checkForUpdates: () => Promise<void>
    downloadAndInstall: () => Promise<void>
    restartApp: () => Promise<void>
  }
}

export default function AppShell({ children, user, updater }: AppShellProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  useNavShortcuts()
  useKeyboardShortcuts({ 'cmd+k': () => setPaletteOpen(true) })

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!profileOpen) return
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [profileOpen])

  const avatarUrl = user.user_metadata?.avatar_url as string | undefined
  const fullName = user.user_metadata?.full_name as string | undefined
  const initials = (fullName || user.email || 'U')[0].toUpperCase()

  // Show a dot on avatar when an update is available or ready
  const showUpdateDot = updater.status === 'available' || updater.status === 'ready'

  return (
    <div className="min-h-screen bg-white text-burnham font-sans">
      {/* Main content */}
      <div className="pb-28">
        {children}
      </div>

      {/* Profile avatar — fixed top-right */}
      <div ref={profileRef} className="fixed top-4 right-4 z-50 flex flex-col items-end gap-2">
        <button
          onClick={() => setProfileOpen(v => !v)}
          className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-white shadow-md hover:shadow-lg transition-all ring-1 ring-mercury"
          title="Profile"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-burnham flex items-center justify-center text-white text-xs font-bold">
              {initials}
            </div>
          )}
          {/* Update available dot */}
          {showUpdateDot && (
            <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-pastel border-2 border-white rounded-full" />
          )}
        </button>

        {profileOpen && (
          <div className="bg-white border border-mercury rounded-xl shadow-lg p-4 w-56 space-y-3">
            {/* Identity */}
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-10 h-10 rounded-full shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-burnham flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {initials}
                </div>
              )}
              <div className="overflow-hidden">
                <p className="text-xs font-semibold text-burnham truncate">{fullName || 'User'}</p>
                <p className="text-[10px] text-shuttle/70 truncate">{user.email}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="border-t border-mercury pt-2 space-y-0.5">
              <button
                onClick={() => { navigate('/strategy'); setProfileOpen(false) }}
                className="w-full text-left text-xs text-burnham hover:bg-mercury/20 px-2 py-1.5 rounded-lg transition-colors"
              >
                Strategy & Goals
              </button>
              <button
                onClick={() => { setSettingsOpen(true); setProfileOpen(false) }}
                className="w-full text-left text-xs text-burnham hover:bg-mercury/20 px-2 py-1.5 rounded-lg transition-colors flex items-center gap-2"
              >
                <Gear size={12} className="text-shuttle" />
                Settings
                {showUpdateDot && (
                  <span className="ml-auto text-[10px] font-medium text-pastel bg-gossip/40 px-1.5 py-0.5 rounded-full">
                    update
                  </span>
                )}
              </button>
              <button
                onClick={() => { supabase.auth.signOut(); setProfileOpen(false) }}
                className="w-full text-left text-xs text-shuttle hover:text-burnham hover:bg-mercury/20 px-2 py-1.5 rounded-lg transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        )}
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
                        : 'text-shuttle hover:bg-mercury/10 hover:text-burnham',
                    ].join(' ')}
                  >
                    <Icon size={18} />
                    <span>{label}</span>
                  </button>
                </div>
              </Fragment>
            )
          })}
        </div>
      </nav>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        updater={updater}
      />
    </div>
  )
}
