import { useCallback, useEffect, useMemo, useState, type CSSProperties, type DragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { useAttioObjects } from '@/hooks/useAttioObjects'
import { useLists } from '@/hooks/useLists'
import { Icon, type TodayIconName } from '@/screens/today/TodayIcons'
import ListGlyph from '@/components/crm/ListGlyph'
import ListTitleEditor from '@/components/crm/ListTitleEditor'
import CrmPopFrame from '@/components/crm/CrmPopFrame'
import SettingsModal from '@/components/SettingsModal'
import type { UpdaterState } from '@/hooks/useUpdater'

const THEME_KEY = 'rethink.theme'
const SIDEBAR_WIDTH_KEY = 'rethink.sidebar.width'
const ZOOM_KEY = 'rethink-ui-zoom'
const ZOOM_OPTIONS = [80, 90, 100] as const
type ZoomLevel = typeof ZOOM_OPTIONS[number]

function initialSidebarWidth() {
  const parsed = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY))
  return Number.isFinite(parsed) ? Math.max(176, Math.min(340, parsed)) : 216
}

function initialTheme(): 'light' | 'dark' {
  const saved = window.localStorage.getItem(THEME_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function recordIcon(slug: string): TodayIconName {
  if (slug === 'people') return 'users'
  if (slug === 'deals') return 'dollar'
  return 'contact'
}

type FullAppShellProps = {
  children?: ReactNode
  user: User
  updater: UpdaterState & {
    isTauri: boolean
    checkForUpdates: () => Promise<void>
    downloadAndInstall: () => Promise<void>
    restartApp: () => Promise<void>
  }
}

export default function FullAppShell({ children, user, updater }: FullAppShellProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { lists, folders, updateList, deleteList, createFolder, updateFolder, reorderLists, reorderFolders } = useLists(user.id)
  const { objects } = useAttioObjects(user.id, user.email, user.user_metadata?.full_name as string | undefined)
  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme)
  const [toast, setToast] = useState<{ icon: TodayIconName; text: string } | null>(null)
  const [createMenuAnchor, setCreateMenuAnchor] = useState<DOMRect | null>(null)
  const [folderModal, setFolderModal] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [dragOverFolder, setDragOverFolder] = useState<{ id: string; placement: 'before' | 'after' } | null>(null)
  const [dragOverList, setDragOverList] = useState<{ id: string; placement: 'before' | 'after' } | null>(null)
  const [dragOverZone, setDragOverZone] = useState<string | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(initialSidebarWidth)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [zoom, setZoom] = useState<ZoomLevel>(() => {
    const saved = Number.parseInt(window.localStorage.getItem(ZOOM_KEY) ?? '100', 10)
    return (ZOOM_OPTIONS.includes(saved as ZoomLevel) ? saved : 100) as ZoomLevel
  })
  const fullName = (user.user_metadata?.full_name as string | undefined) || user.email || 'User'
  const initials = fullName.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined
  const showUpdateDot = updater.status === 'available' || updater.status === 'ready'

  const setZoomLevel = useCallback((level: number) => {
    const next = ZOOM_OPTIONS.includes(level as ZoomLevel) ? level as ZoomLevel : 100
    setZoom(next)
    window.localStorage.setItem(ZOOM_KEY, String(next))
  }, [])

  const records = useMemo(() => {
    const fallbacks = {
      companies: { id: 'companies', slug: 'companies', plural_name: 'Companies' },
      people: { id: 'people', slug: 'people', plural_name: 'People' },
      deals: { id: 'deals', slug: 'deals', plural_name: 'Deals' },
    }
    return (['companies', 'people', 'deals'] as const).map(slug => objects.find(object => object.slug === slug) ?? fallbacks[slug])
  }, [objects])

  const isToday = location.pathname === '/today'
  const isWeekPlan = location.pathname === '/week-plan'
  const isRecordDetail = /\/(record|records)\//.test(location.pathname) && !/\/view\//.test(location.pathname)
  const currentList = lists.find(list => location.pathname === `/lists/${list.id}`)
  const currentRecord = records.find(object => location.pathname.startsWith(`/${object.slug}/view`) || location.pathname === `/records/${object.slug}`)
  const title = location.pathname === '/__handoff-preview' ? 'Handoff QA' : currentList?.name ?? currentRecord?.plural_name ?? (isWeekPlan ? 'Week Plan' : location.pathname === '/lists' ? 'Lists' : 'Today')
  const sortedFolders = useMemo(() => [...folders].sort((left, right) => left.position - right.position || left.created_at.localeCompare(right.created_at)), [folders])
  const sortedLists = useMemo(() => [...lists].sort((left, right) => (left.position ?? 0) - (right.position ?? 0) || left.created_at.localeCompare(right.created_at)), [lists])
  const unfiledLists = useMemo(() => sortedLists.filter(list => !list.folder_id), [sortedLists])
  const listsByFolder = useMemo(() => {
    const grouped = new Map<string, typeof lists>()
    for (const folder of sortedFolders) grouped.set(folder.id, [])
    for (const list of sortedLists) {
      if (!list.folder_id) continue
      grouped.set(list.folder_id, [...(grouped.get(list.folder_id) ?? []), list])
    }
    return grouped
  }, [lists, sortedFolders, sortedLists])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    window.localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    if (window.localStorage.getItem(THEME_KEY)) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setTheme(media.matches ? 'dark' : 'light')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const notify = (icon: TodayIconName, text: string) => {
    setToast({ icon, text })
    window.setTimeout(() => setToast(null), 2200)
  }

  const startSidebarResize = (event: ReactMouseEvent) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = sidebarWidth
    let nextWidth = startWidth
    document.body.classList.add('resizing-sidebar')
    const move = (next: MouseEvent) => {
      nextWidth = Math.max(176, Math.min(340, startWidth + next.clientX - startX))
      setSidebarWidth(nextWidth)
    }
    const up = () => {
      document.body.classList.remove('resizing-sidebar')
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(nextWidth)))
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const dragPayload = (event: DragEvent<HTMLElement>) => {
    try {
      return JSON.parse(event.dataTransfer.getData('application/rethink-sidebar')) as { type: 'list' | 'folder'; id: string }
    } catch {
      return null
    }
  }

  const startSidebarDrag = (event: DragEvent<HTMLElement>, payload: { type: 'list' | 'folder'; id: string }) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/rethink-sidebar', JSON.stringify(payload))
  }

  const moveList = async (listId: string, targetFolderId: string | null, targetListId?: string | null, placement: 'before' | 'after' | 'end' = 'before') => {
    const dragged = lists.find(list => list.id === listId)
    if (!dragged || dragged.id === targetListId) return
    const sourceFolderId = dragged.folder_id ?? null
    const targetLists = sortedLists.filter(list => (list.folder_id ?? null) === targetFolderId && list.id !== listId)
    const targetIndex = targetListId ? targetLists.findIndex(list => list.id === targetListId) : -1
    const insertAt = placement === 'end' || targetIndex < 0 ? targetLists.length : placement === 'after' ? targetIndex + 1 : targetIndex
    targetLists.splice(insertAt, 0, { ...dragged, folder_id: targetFolderId })
    const affected = new Set([sourceFolderId, targetFolderId])
    const updates = [...affected].flatMap(folderId => {
      const group = folderId === targetFolderId
        ? targetLists
        : sortedLists.filter(list => (list.folder_id ?? null) === folderId && list.id !== listId)
      return group.map((list, position) => ({ id: list.id, folder_id: folderId, position }))
    })
    const result = await reorderLists(updates)
    if (result.error) notify('x', result.error.message || 'Could not reorder lists')
  }

  const moveFolder = async (folderId: string, targetFolderId?: string | null, placement: 'before' | 'after' | 'end' = 'before') => {
    if (folderId === targetFolderId) return
    const dragged = sortedFolders.find(folder => folder.id === folderId)
    if (!dragged) return
    const next = sortedFolders.filter(folder => folder.id !== folderId)
    const targetIndex = targetFolderId ? next.findIndex(folder => folder.id === targetFolderId) : -1
    const insertAt = placement === 'end' || targetIndex < 0 ? next.length : placement === 'after' ? targetIndex + 1 : targetIndex
    next.splice(insertAt, 0, dragged)
    const result = await reorderFolders(next.map((folder, position) => ({ id: folder.id, position })))
    if (result.error) notify('x', result.error.message || 'Could not reorder folders')
  }

  const onDropToList = (event: DragEvent<HTMLElement>, targetFolderId: string | null, beforeListId?: string | null) => {
    event.preventDefault()
    event.stopPropagation()
    const payload = dragPayload(event)
    const rect = event.currentTarget.getBoundingClientRect()
    const placement = event.clientY > rect.top + rect.height / 2 ? 'after' : 'before'
    setDragOverList(null)
    if (payload?.type === 'list') void moveList(payload.id, targetFolderId, beforeListId, placement)
  }

  const onDropToFolder = (event: DragEvent<HTMLElement>, folderId: string) => {
    event.preventDefault()
    event.stopPropagation()
    const payload = dragPayload(event)
    setDragOverFolder(null)
    if (payload?.type === 'list') void moveList(payload.id, folderId, null, 'end')
    if (payload?.type === 'folder') {
      const rect = event.currentTarget.getBoundingClientRect()
      const placement = event.clientY > rect.top + rect.height / 2 ? 'after' : 'before'
      void moveFolder(payload.id, folderId, placement)
    }
  }

  const createFolderFromModal = async () => {
    const folder = await createFolder(folderName.trim() || 'New folder')
    if (!folder) {
      notify('x', 'Could not create folder')
      return
    }
    setFolderName('')
    setFolderModal(false)
    notify('folder', 'Folder created')
  }

  const listDropClass = (id: string) => dragOverList?.id === id ? ` drop-${dragOverList.placement}` : ''
  const folderDropClass = (id: string) => dragOverFolder?.id === id ? ` drop-${dragOverFolder.placement}` : ''
  const onListDragOver = (event: DragEvent<HTMLElement>, id: string) => {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    setDragOverList({ id, placement: event.clientY > rect.top + rect.height / 2 ? 'after' : 'before' })
  }
  const onFolderDragOver = (event: DragEvent<HTMLElement>, id: string) => {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    setDragOverFolder({ id, placement: event.clientY > rect.top + rect.height / 2 ? 'after' : 'before' })
  }
  const onDropZone = (event: DragEvent<HTMLElement>, zone: string, folderId: string | null) => {
    event.preventDefault()
    event.stopPropagation()
    setDragOverZone(null)
    const payload = dragPayload(event)
    if (payload?.type === 'list') void moveList(payload.id, folderId, null, 'end')
    if (payload?.type === 'folder' && zone === 'root') void moveFolder(payload.id, null, 'end')
  }

  return (
    <div className="handoff-shell today-shell shell" style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}>
      <aside className="sidebar">
        <div className="sb-brand">
          <span className="logo">M</span><span className="word">Meridian 71</span>
          <span className="caret"><Icon name="caretDown" size={11} /></span>
          <button className="panel-ico" title="Collapse sidebar" onClick={() => notify('panel', 'Sidebar layout is fixed in this handoff')}><Icon name="panel" size={15} /></button>
        </div>
        <button className="sb-search" onClick={() => window.dispatchEvent(new CustomEvent('rethink:today-command'))}>
          <Icon name="search" size={14} /><span className="label">Quick actions</span><span className="shortcut">⌘K</span>
        </button>
        <div className="sb-scroll">
          <button className={`sb-row${isToday ? ' active' : ''}`} onClick={() => navigate('/today')}><span className="ico"><Icon name="home" size={16} /></span><span className="sb-label">Today</span></button>
          <button className={`sb-row${isWeekPlan ? ' active' : ''}`} onClick={() => navigate('/week-plan')}><span className="ico"><Icon name="calendar" size={16} /></span><span className="sb-label">Week Plan</span></button>
          {([['bell', 'Review'], ['sparkle', 'Suggestions'], ['article', 'Playbook']] as Array<[TodayIconName, string]>).map(([icon, label]) => (
            <button key={label} className="sb-row soon" disabled><span className="ico"><Icon name={icon} size={16} /></span><span className="sb-label">{label}</span><span className="soon-tag">Soon</span></button>
          ))}
          <div className="sb-divider" />
          <div className="sb-eyebrow"><span className="em"><Icon name="caretDown" size={9} sw={2} />Records</span><span className="acts"><button title="Manage records" onClick={() => notify('sliders', 'Record settings are managed from each object')}><Icon name="sliders" size={12} /></button></span></div>
          {records.map(object => (
            <button key={object.id} className={`sb-row indent${currentRecord?.slug === object.slug ? ' active' : ''}`} onClick={() => navigate(`/${object.slug}/view/all`)}>
              <span className={`sb-pip ${object.slug}`}><Icon name={recordIcon(object.slug)} size={10} /></span><span className="sb-label">{object.plural_name}</span>
            </button>
          ))}
          <div className="sb-divider" />
          <div className="sb-eyebrow" onDragOver={event => event.preventDefault()} onDrop={event => {
            event.preventDefault()
            const payload = dragPayload(event)
            if (payload?.type === 'list') void moveList(payload.id, null, null, 'end')
            if (payload?.type === 'folder') void moveFolder(payload.id, null, 'end')
          }}>
            <span className="em"><Icon name="caretDown" size={9} sw={2} />Lists</span>
            <span className="acts"><button title="Create list or folder" onClick={event => { event.stopPropagation(); setCreateMenuAnchor(event.currentTarget.getBoundingClientRect()) }}><Icon name="plus" size={13} /></button></span>
          </div>
          {unfiledLists.map(list => (
            <button key={list.id} draggable onDragStart={event => startSidebarDrag(event, { type: 'list', id: list.id })} onDragEnd={() => { setDragOverList(null); setDragOverZone(null) }} onDragOver={event => onListDragOver(event, list.id)} onDragLeave={() => setDragOverList(current => current?.id === list.id ? null : current)} onDrop={event => onDropToList(event, null, list.id)} className={`sb-row indent draggable${currentList?.id === list.id ? ' active' : ''}${listDropClass(list.id)}`} onClick={() => navigate(`/lists/${list.id}`)}>
              <ListGlyph value={list.icon} /><span className="sb-label">{list.name}</span>
              <span className="sb-more" title="List options"><Icon name="grip" size={13} /></span>
            </button>
          ))}
          <div className={`sb-drop-zone${dragOverZone === 'root' ? ' on' : ''}`} onDragOver={event => { event.preventDefault(); setDragOverZone('root') }} onDragLeave={() => setDragOverZone(current => current === 'root' ? null : current)} onDrop={event => onDropZone(event, 'root', null)} />
          {sortedFolders.map(folder => {
            const folderLists = listsByFolder.get(folder.id) ?? []
            return <div key={folder.id} className="sb-folder">
              <div draggable onDragStart={event => startSidebarDrag(event, { type: 'folder', id: folder.id })} onDragEnd={() => { setDragOverFolder(null); setDragOverZone(null) }} onDragOver={event => onFolderDragOver(event, folder.id)} onDragLeave={() => setDragOverFolder(current => current?.id === folder.id ? null : current)} onDrop={event => onDropToFolder(event, folder.id)} className={`sb-row sb-folder-row${folderDropClass(folder.id)}`}>
                <button className="sb-folder-toggle" title={folder.is_collapsed ? 'Expand folder' : 'Collapse folder'} onClick={() => void updateFolder(folder.id, { is_collapsed: !folder.is_collapsed })}><Icon name={folder.is_collapsed ? 'caretRight' : 'caretDown'} size={10} /></button>
                <span className="ico"><Icon name="folder" size={14} /></span><span className="sb-label">{folder.name}</span><span className="sb-count">{folderLists.length}</span><span className="sb-more"><Icon name="grip" size={13} /></span>
              </div>
              {!folder.is_collapsed && folderLists.map(list => (
                <button key={list.id} draggable onDragStart={event => startSidebarDrag(event, { type: 'list', id: list.id })} onDragEnd={() => { setDragOverList(null); setDragOverZone(null) }} onDragOver={event => onListDragOver(event, list.id)} onDragLeave={() => setDragOverList(current => current?.id === list.id ? null : current)} onDrop={event => onDropToList(event, folder.id, list.id)} className={`sb-row indent sublist draggable${currentList?.id === list.id ? ' active' : ''}${listDropClass(list.id)}`} onClick={() => navigate(`/lists/${list.id}`)}>
                  <ListGlyph value={list.icon} /><span className="sb-label">{list.name}</span><span className="sb-more" title="List options"><Icon name="grip" size={13} /></span>
                </button>
              ))}
              {!folder.is_collapsed && <div className={`sb-drop-zone folder-zone${dragOverZone === `folder:${folder.id}` ? ' on' : ''}`} onDragOver={event => { event.preventDefault(); setDragOverZone(`folder:${folder.id}`) }} onDragLeave={() => setDragOverZone(current => current === `folder:${folder.id}` ? null : current)} onDrop={event => onDropZone(event, `folder:${folder.id}`, folder.id)} />}
            </div>
          })}
        </div>
        <div className="sb-footer">
          <div className="sb-user">
            <span className="av">{avatarUrl ? <img src={avatarUrl} alt="" /> : initials}</span>
            <span>{fullName}</span>
          </div>
          <button className="sb-row" onClick={() => setSettingsOpen(true)}>
            <span className="ico"><Icon name="gear" size={15} /></span>
            <span className="sb-label">Settings</span>
            {showUpdateDot && <span className="soon-tag">Update</span>}
          </button>
        </div>
        <div className="sidebar-resizer" onMouseDown={startSidebarResize} />
      </aside>
      <main className="main" style={{ zoom: zoom / 100 }}>
        {!isRecordDetail && <div className="topbar">
          <div className="tb-title">{isToday && <Icon name="home" size={16} />}{isWeekPlan && <Icon name="calendar" size={16} />}{currentList ? <ListTitleEditor list={currentList} onUpdate={patch => updateList(currentList.id, patch)} onDelete={async () => { const result = await deleteList(currentList.id); if (result?.error) { notify('x', result.error.message || 'Could not delete list'); return }; notify('trash', 'List deleted'); navigate('/lists', { replace: true }) }} onNotify={notify} /> : title}</div>
          <div className="tb-spacer" />
          {!isToday && <><button className="tb-btn" onClick={() => notify('link', 'Share is a product stub')}><span className="av">{initials.slice(0, 1)}</span>Share</button><div className="tb-sep" /></>}
          <button className="tb-btn" title="Comments" onClick={() => notify('chat', 'Comments are a product stub')}><Icon name="chat" size={15} /></button>
          <button className="tb-btn" title="Layout" onClick={() => setTheme(value => value === 'light' ? 'dark' : 'light')}><Icon name="grip" size={15} /></button>
          <button className="tb-ask" onClick={() => notify('sparkle', 'Ask reThink is coming soon')}><Icon name="sparkle" size={13} />Ask reThink</button>
        </div>}
        {children ?? <Outlet />}
      </main>
      {createMenuAnchor && <CrmPopFrame anchor={createMenuAnchor} width={190} onClose={() => setCreateMenuAnchor(null)}><button className="pop-item" onClick={() => { setCreateMenuAnchor(null); navigate('/lists?new=1') }}><span className="ico"><Icon name="listadd" size={14} /></span><span className="lbl">New list</span></button><button className="pop-item" onClick={() => { setCreateMenuAnchor(null); setFolderModal(true) }}><span className="ico"><Icon name="folder" size={14} /></span><span className="lbl">New folder</span></button></CrmPopFrame>}
      {folderModal && <div className="scrim" onClick={() => setFolderModal(false)}><div className="modal sm" onClick={event => event.stopPropagation()}><div className="modal-hd"><Icon name="folder" size={15} />New folder<button className="x" onClick={() => setFolderModal(false)}><Icon name="x" size={15} /></button></div><div className="modal-bd"><div className="field-lbl">Folder name</div><input className="txt" autoFocus placeholder="Business lists" value={folderName} onChange={event => setFolderName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void createFolderFromModal(); if (event.key === 'Escape') setFolderModal(false) }} /></div><div className="modal-ft"><button className="btn btn-ghost" onClick={() => setFolderModal(false)}>Cancel</button><button className="btn btn-primary" onClick={() => void createFolderFromModal()}>Create folder<span className="kbd">Enter</span></button></div></div></div>}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        updater={updater}
        zoom={zoom}
        onZoomChange={setZoomLevel}
      />
      {toast && <div className="toast"><span className="em"><Icon name={toast.icon} size={13} /></span>{toast.text}</div>}
    </div>
  )
}
