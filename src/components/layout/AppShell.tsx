import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  House, BookBookmark, Users, Buildings, Target,
  Star, Flame, ChartBar, Gear, List as ListIcon,
  MagnifyingGlass, CaretDown, CaretRight,
  SignOut, ArrowLeft,
} from '@phosphor-icons/react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useLists } from '@/hooks/useLists'
import CommandPalette from '@/components/CommandPalette'
import SettingsModal from '@/components/SettingsModal'
import CaptureModal from '@/components/CaptureModal'
import type { UpdaterState } from '@/hooks/useUpdater'
import type { Capture } from '@/types'

const SIDEBAR_KEY = 'rethink-sidebar-collapsed'
const CRM_KEY = 'rethink-crm-collapsed'
const LISTS_KEY = 'rethink-lists-collapsed'
const ZOOM_KEY = 'rethink-ui-zoom'
const ZOOM_OPTIONS = [80, 90, 100] as const
type ZoomLevel = typeof ZOOM_OPTIONS[number]

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

interface NavItemProps {
  path: string
  icon: React.ReactNode
  label: string
  collapsed: boolean
  onClick?: () => void
  indent?: boolean
  iconColor?: string
}

function NavItem({ path, icon, label, collapsed, onClick, indent, iconColor }: NavItemProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isActive = pathname === path || (path !== '/today' && pathname !== '/' && pathname.startsWith(path))

  const handleClick = () => {
    if (onClick) onClick()
    else navigate(path)
  }

  return (
    <div className="relative group/item">
      <button
        onClick={handleClick}
        className={[
          'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all duration-150',
          indent && !collapsed ? 'pl-5 text-[11px]' : 'text-[12px]',
          isActive
            ? 'bg-gossip/70 text-burnham font-medium'
            : 'text-shuttle hover:bg-mercury/50 hover:text-burnham',
        ].join(' ')}
      >
        {isActive && (
          <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-burnham rounded-r" />
        )}
        <span className={['shrink-0 flex items-center justify-center', iconColor ?? ''].join(' ')}>
          {icon}
        </span>
        {!collapsed && <span className="truncate">{label}</span>}
      </button>
      {/* Tooltip in collapsed mode */}
      {collapsed && (
        <span className="pointer-events-none absolute left-12 top-1/2 -translate-y-1/2 z-50 bg-burnham text-white text-[11px] px-2 py-1 rounded-md whitespace-nowrap opacity-0 group-hover/item:opacity-100 transition-opacity shadow-md">
          {label}
        </span>
      )}
    </div>
  )
}

function SectionDivider({ collapsed }: { collapsed: boolean }) {
  return <div className={['border-t border-mercury/60 my-1', collapsed ? 'mx-1' : 'mx-0'].join(' ')} />
}

function SectionHeader({
  label,
  collapsed,
  open,
  onToggle,
}: {
  label: string
  collapsed: boolean
  open: boolean
  onToggle: () => void
}) {
  if (collapsed) return <SectionDivider collapsed={collapsed} />
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-shuttle/60 hover:text-shuttle transition-colors"
    >
      {open ? <CaretDown size={9} weight="bold" /> : <CaretRight size={9} weight="bold" />}
      {label}
    </button>
  )
}

export default function AppShell({ children, user, updater }: AppShellProps) {
  const navigate = useNavigate()
  const { lists } = useLists(user.id)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === 'true')
  const [crmOpen, setCrmOpen] = useState(() => localStorage.getItem(CRM_KEY) !== 'false')
  const [listsOpen, setListsOpen] = useState(() => localStorage.getItem(LISTS_KEY) !== 'false')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [captureToOpen, setCaptureToOpen] = useState<Capture | null>(null)
  const [zoom, setZoom] = useState<ZoomLevel>(() => {
    const saved = parseInt(localStorage.getItem(ZOOM_KEY) ?? '100', 10)
    return (ZOOM_OPTIONS.includes(saved as ZoomLevel) ? saved : 100) as ZoomLevel
  })

  const setZoomLevel = useCallback((level: ZoomLevel) => {
    setZoom(level)
    localStorage.setItem(ZOOM_KEY, String(level))
  }, [])
  const handleOpenCapture = useCallback((capture: Capture) => {
    setCaptureToOpen(capture)
  }, [])

  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem(SIDEBAR_KEY, String(next))
      return next
    })
  }, [])

  const toggleCrm = () => {
    setCrmOpen(prev => { localStorage.setItem(CRM_KEY, String(!prev)); return !prev })
  }
  const toggleLists = () => {
    setListsOpen(prev => { localStorage.setItem(LISTS_KEY, String(!prev)); return !prev })
  }

  useKeyboardShortcuts({
    'cmd+k': () => setPaletteOpen(true),
    'cmd+\\': toggleCollapsed,
    'cmd+1': () => navigate('/today'),
    'cmd+2': () => navigate('/plan'),
    'cmd+3': () => navigate('/people'),
    'cmd+4': () => navigate('/playbook'),
  })

  const showUpdateDot = updater.status === 'available' || updater.status === 'ready'

  const avatarUrl = user.user_metadata?.avatar_url as string | undefined
  const fullName = user.user_metadata?.full_name as string | undefined
  const initials = (fullName || user.email || 'U')[0].toUpperCase()

  const sidebarWidth = collapsed ? 'w-12' : 'w-[200px]'
  const contentMargin = collapsed ? 'ml-12' : 'ml-[200px]'
  const sidebarPx = collapsed ? '48px' : '200px'

  return (
    <div
      className="flex min-h-screen bg-canvas text-burnham font-sans"
      style={{ '--sidebar-width': sidebarPx } as React.CSSProperties}
    >
      {/* Left sidebar */}
      <aside
        className={[
          'fixed top-0 left-0 h-screen z-30 flex flex-col bg-sidebar border-r border-mercury/50',
          'transition-all duration-200 overflow-hidden',
          sidebarWidth,
        ].join(' ')}
      >
        {/* Logo */}
        <div className={['flex items-center gap-2.5 px-3 py-4 shrink-0', collapsed ? 'justify-center' : ''].join(' ')}>
          <img src="/logo-sm.png" alt="reThink" className="w-6 h-6 shrink-0 rounded-sm" />
          {!collapsed && (
            <span className="text-[13px] font-semibold text-burnham truncate tracking-[-0.01em]">reThink 2026</span>
          )}
        </div>

        {/* Quick actions / search */}
        <div className="px-2 pb-1 shrink-0">
          <button
            onClick={() => setPaletteOpen(true)}
            className={[
              'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-shuttle hover:bg-mercury/50 hover:text-burnham transition-all',
              collapsed ? 'justify-center' : '',
            ].join(' ')}
          >
            <MagnifyingGlass size={14} className="shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Quick actions</span>
                <span className="text-[10px] font-mono bg-mercury/40 px-1.5 py-0.5 rounded">⌘K</span>
              </>
            )}
          </button>
        </div>

        <SectionDivider collapsed={collapsed} />

        {/* Main nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
          <NavItem path="/today" icon={<House size={16} />} label="Today" collapsed={collapsed} />
          <NavItem path="/playbook" icon={<BookBookmark size={16} />} label="Playbook" collapsed={collapsed} />

          <SectionDivider collapsed={collapsed} />

          {/* CRM section */}
          <SectionHeader label="CRM" collapsed={collapsed} open={crmOpen} onToggle={toggleCrm} />
          {(crmOpen || collapsed) && (
            <>
              <NavItem
                path="/people"
                icon={<span className="w-3.5 h-3.5 rounded-sm bg-[#1A1A1A] flex items-center justify-center"><Users size={9} weight="fill" className="text-white" /></span>}
                label="People"
                collapsed={collapsed}
                indent
              />
              <NavItem
                path="/people/companies"
                icon={<span className="w-3.5 h-3.5 rounded-sm bg-shuttle flex items-center justify-center"><Buildings size={9} weight="fill" className="text-white" /></span>}
                label="Companies"
                collapsed={collapsed}
                indent
              />
              <NavItem
                path="/people/opportunities"
                icon={<span className="w-3.5 h-3.5 rounded-sm bg-burnham flex items-center justify-center"><Target size={9} weight="fill" className="text-gossip" /></span>}
                label="Opportunities"
                collapsed={collapsed}
                indent
              />
            </>
          )}

          <SectionDivider collapsed={collapsed} />

          {/* Lists section */}
          <SectionHeader label="Lists" collapsed={collapsed} open={listsOpen} onToggle={toggleLists} />
          {(listsOpen || collapsed) && (
            <>
              <NavItem
                path="/lists"
                icon={<span className="w-3.5 h-3.5 rounded-sm bg-burnham flex items-center justify-center"><ListIcon size={9} weight="fill" className="text-white" /></span>}
                label="All Lists"
                collapsed={collapsed}
                indent
              />
              {/* User-created lists */}
              {lists.map(l => (
                <NavItem
                  key={l.id}
                  path={`/lists/${l.id}`}
                  icon={
                    l.icon ? (
                      <span className="text-[13px] leading-none">{l.icon}</span>
                    ) : (
                      <span
                        className="w-3.5 h-3.5 rounded-sm"
                        style={{ backgroundColor: l.color ?? '#9CA3AF' }}
                      />
                    )
                  }
                  label={l.name}
                  collapsed={collapsed}
                  indent
                />
              ))}
              {/* Legacy static presets */}
              <NavItem
                path="/people?list=board"
                icon={<Star size={14} weight="fill" className="text-yellow-500" />}
                label="Board of Directors"
                collapsed={collapsed}
                indent
              />
              <NavItem
                path="/people/opportunities?list=active"
                icon={<Flame size={14} weight="fill" className="text-orange-400" />}
                label="Active Pipeline"
                collapsed={collapsed}
                indent
              />
            </>
          )}

          <SectionDivider collapsed={collapsed} />

          <NavItem path="/plan" icon={<ChartBar size={16} />} label="Plan" collapsed={collapsed} />
        </nav>

        {/* Bottom: profile + settings + collapse toggle */}
        <div className="shrink-0 px-2 pb-3 space-y-0.5 border-t border-mercury/60 pt-2">
          {/* User avatar + name */}
          <div className={['flex items-center gap-2 px-2 py-1.5', collapsed ? 'justify-center' : ''].join(' ')}>
            <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 ring-1 ring-mercury relative">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-burnham flex items-center justify-center text-white text-[10px] font-bold">
                  {initials}
                </div>
              )}
              {showUpdateDot && (
                <span className="absolute top-0 right-0 w-2 h-2 bg-pastel border border-white rounded-full" />
              )}
            </div>
            {!collapsed && (
              <span className="text-[11px] text-burnham truncate font-medium">{fullName || user.email}</span>
            )}
          </div>

          <button
            onClick={() => setSettingsOpen(true)}
            className={[
              'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm text-shuttle hover:bg-mercury/50 hover:text-burnham transition-all',
              collapsed ? 'justify-center' : '',
            ].join(' ')}
          >
            <Gear size={15} className="shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left text-[11px]">Settings</span>
                {showUpdateDot && (
                  <span className="text-[10px] font-medium text-pastel bg-gossip/40 px-1.5 py-0.5 rounded-full">update</span>
                )}
              </>
            )}
          </button>

          <button
            onClick={() => supabase.auth.signOut()}
            className={[
              'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm text-shuttle hover:bg-mercury/50 hover:text-burnham transition-all',
              collapsed ? 'justify-center' : '',
            ].join(' ')}
          >
            <SignOut size={15} className="shrink-0" />
            {!collapsed && <span className="text-[11px]">Sign out</span>}
          </button>

          <SectionDivider collapsed={collapsed} />

          {/* Collapse toggle */}
          <button
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand sidebar (⌘\\)' : 'Collapse sidebar (⌘\\)'}
            className={[
              'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs text-shuttle/60 hover:bg-mercury/50 hover:text-burnham transition-all',
              collapsed ? 'justify-center' : '',
            ].join(' ')}
          >
            {collapsed ? (
              <ArrowLeft size={13} className="rotate-180" />
            ) : (
              <>
                <ListIcon size={13} />
                <span>Collapse</span>
                <span className="ml-auto text-[10px] font-mono bg-mercury/40 px-1 py-0.5 rounded">⌘\</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main
        className={['flex-1 min-h-screen transition-all duration-200 bg-[#F4F4F4]', contentMargin].join(' ')}
        style={{ zoom: zoom / 100 }}
      >
        {children}
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onOpenCapture={handleOpenCapture} />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        updater={updater}
        zoom={zoom}
        onZoomChange={setZoomLevel}
      />

      <CaptureModal
        capture={captureToOpen}
        onClose={() => setCaptureToOpen(null)}
        goals={[]}
        milestones={[]}
        onUpdate={() => {}}
      />
    </div>
  )
}
