import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  House, Users, Buildings, Target,
  Gear,
  MagnifyingGlass, CaretDown, CaretRight,
  SignOut, Bell, Note,
  Plus, Sparkle,
} from '@phosphor-icons/react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useLists } from '@/hooks/useLists'
import CommandPalette from '@/components/CommandPalette'
import SettingsModal from '@/components/SettingsModal'
import ListCreateModal from '@/components/ListCreateModal'
import type { UpdaterState } from '@/hooks/useUpdater'

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
          'sb-row',
          isActive ? 'active' : '',
          indent ? 'indent' : '',
        ].join(' ')}
      >
        <span className={iconColor ?? ''}>
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

function SectionDivider({ collapsed: _collapsed }: { collapsed: boolean }) {
  return <div className="sb-divider" />
}

function SectionHeader({
  label,
  collapsed,
  open,
  onToggle,
  actions,
}: {
  label: string
  collapsed: boolean
  open: boolean
  onToggle: () => void
  actions?: ReactNode
}) {
  if (collapsed) return <SectionDivider collapsed={collapsed} />
  return (
    <div className="sb-eyebrow flex w-full items-center">
      <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
        {open ? <CaretDown size={9} weight="bold" /> : <CaretRight size={9} weight="bold" />}
        <span className="truncate">{label}</span>
      </button>
      {actions && <span className="ml-auto flex items-center gap-0.5">{actions}</span>}
    </div>
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
  const [listCreateOpen, setListCreateOpen] = useState(false)
  const [reviewCount, setReviewCount] = useState(0)
  const [zoom, setZoom] = useState<ZoomLevel>(() => {
    const saved = parseInt(localStorage.getItem(ZOOM_KEY) ?? '100', 10)
    return (ZOOM_OPTIONS.includes(saved as ZoomLevel) ? saved : 100) as ZoomLevel
  })

  const setZoomLevel = useCallback((level: ZoomLevel) => {
    setZoom(level)
    localStorage.setItem(ZOOM_KEY, String(level))
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
    'cmd+2': () => navigate('/review'),
    'cmd+3': () => navigate('/suggestions'),
    'cmd+4': () => navigate('/playbook'),
    'cmd+5': () => navigate('/milestones'),
  })

  useEffect(() => {
    let cancelled = false
    const loadReviewCount = async () => {
      const { count } = await supabase
        .from('review_items')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .eq('proposed_payload->>source_kind', 'identity_resolution')
      if (!cancelled) setReviewCount(count ?? 0)
    }
    loadReviewCount()
    const interval = window.setInterval(loadReviewCount, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [user.id])

  const showUpdateDot = updater.status === 'available' || updater.status === 'ready'

  const avatarUrl = user.user_metadata?.avatar_url as string | undefined
  const fullName = user.user_metadata?.full_name as string | undefined
  const initials = (fullName || user.email || 'U')[0].toUpperCase()

  const sidebarPx = collapsed ? '48px' : '212px'

  return (
    <div
      className="shell"
      style={{ '--sidebar-width': sidebarPx } as React.CSSProperties}
    >
      {/* Left sidebar */}
      <aside
        className={[
          'sidebar',
          collapsed ? 'collapsed' : 'expanded',
        ].join(' ')}
      >
        {/* Logo */}
        <div className="sb-brand">
          <img src="/logo.png" alt="reThink" />
          {!collapsed && (
            <span className="word">Meridian 71</span>
          )}
        </div>

        {/* Quick actions / search */}
        <div className="shrink-0">
          <button onClick={() => setPaletteOpen(true)} className="sb-search w-[calc(100%-16px)]">
            <MagnifyingGlass size={14} className="shrink-0" />
            {!collapsed && (
              <>
                <span className="label">Quick actions</span>
                <span className="shortcut">⌘K</span>
              </>
            )}
          </button>
        </div>

        <SectionDivider collapsed={collapsed} />

        {/* Main nav */}
        <nav className="flex-1 overflow-y-auto py-1">
          <NavItem path="/today" icon={<House size={15} />} label="Home" collapsed={collapsed} />
          <NavItem
            path="/review"
            icon={<Bell size={15} />}
            label={reviewCount > 0 ? `Review (${reviewCount})` : 'Review'}
            collapsed={collapsed}
          />
          <NavItem path="/suggestions" icon={<Sparkle size={15} />} label="Suggestions" collapsed={collapsed} />
          <NavItem path="/playbook" icon={<Note size={15} />} label="Playbook" collapsed={collapsed} />
          <NavItem path="/milestones" icon={<Target size={15} />} label="Plan" collapsed={collapsed} />

          <SectionDivider collapsed={collapsed} />

          {/* CRM section */}
          <SectionHeader label="Records" collapsed={collapsed} open={crmOpen} onToggle={toggleCrm} />
          {(crmOpen || collapsed) && (
            <>
              <NavItem
                path="/people/companies"
                icon={<span className="sb-pip" style={{ background: '#2563eb' }}><Buildings size={9} weight="fill" /></span>}
                label="Companies"
                collapsed={collapsed}
                indent
              />
              <NavItem
                path="/people"
                icon={<span className="sb-pip" style={{ background: '#2563eb' }}><Users size={9} weight="fill" /></span>}
                label="People"
                collapsed={collapsed}
                indent
              />
              <NavItem
                path="/people/opportunities"
                icon={<span className="sb-pip" style={{ background: '#ff6b2c' }}><Target size={9} weight="fill" /></span>}
                label="Deals"
                collapsed={collapsed}
                indent
              />
            </>
          )}

          <SectionDivider collapsed={collapsed} />

          {/* Lists section */}
          <SectionHeader
            label="Lists"
            collapsed={collapsed}
            open={listsOpen}
            onToggle={toggleLists}
            actions={(
              <>
                <button
                  onClick={event => {
                    event.stopPropagation()
                    setSettingsOpen(true)
                  }}
                  className="rounded p-0.5 text-shuttle hover:bg-mercury/40 hover:text-midnight"
                  title="List settings"
                >
                  <Gear size={11} />
                </button>
                <button
                  onClick={event => {
                    event.stopPropagation()
                    setListCreateOpen(true)
                  }}
                  className="rounded p-0.5 text-shuttle hover:bg-mercury/40 hover:text-midnight"
                  title="Create a list"
                >
                  <Plus size={12} />
                </button>
              </>
            )}
          />
          {(listsOpen || collapsed) && (
            <>
              {lists.map(l => (
                <NavItem
                  key={l.id}
                  path={`/lists/${l.id}`}
                  icon={
                    l.icon ? (
                      <span className="text-[13px] leading-none">{l.icon}</span>
                    ) : (
                      <span
                        className="sb-pip"
                        style={{ backgroundColor: l.color ?? '#9CA3AF' }}
                      />
                    )
                  }
                  label={l.name}
                  collapsed={collapsed}
                  indent
                />
              ))}
            </>
          )}
        </nav>

        {/* Bottom: profile + settings + collapse toggle */}
        <div className="sb-footer">
          {/* User avatar + name */}
          <div className="sb-user">
            <span className="av">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" />
              ) : (
                initials
              )}
              {showUpdateDot && (
                <span className="absolute top-0 right-0 w-2 h-2 bg-pastel border border-white rounded-full" />
              )}
            </span>
            {!collapsed && (
              <span>{fullName || user.email}</span>
            )}
          </div>

          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            className="sb-row sb-settings w-[calc(100%-16px)]"
          >
            <Gear size={15} className="shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Settings</span>
                {showUpdateDot && (
                  <span className="text-[10px] font-medium text-pastel bg-gossip/40 px-1.5 py-0.5 rounded-full">update</span>
                )}
              </>
            )}
          </button>

          <button
            onClick={() => supabase.auth.signOut()}
            className="sb-row w-[calc(100%-16px)]"
          >
            <SignOut size={15} className="shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>

          <SectionDivider collapsed={collapsed} />
        </div>
      </aside>

      {/* Main content */}
      <main
        className="main"
        style={{ zoom: zoom / 100 }}
      >
        {children}
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        updater={updater}
        zoom={zoom}
        onZoomChange={setZoomLevel}
      />

      <ListCreateModal
        open={listCreateOpen}
        onClose={() => setListCreateOpen(false)}
        onCreated={list => {
          setListCreateOpen(false)
          navigate(`/lists/${list.id}`)
        }}
      />

    </div>
  )
}
