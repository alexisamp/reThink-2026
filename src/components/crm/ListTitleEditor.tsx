import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { List } from '@/types'
import { supabase } from '@/lib/supabase'
import { Icon, type TodayIconName } from '@/screens/today/TodayIcons'
import ListGlyph from '@/components/crm/ListGlyph'
import CrmPopFrame from '@/components/crm/CrmPopFrame'

const EMOJI_CATEGORIES = [
  { name: 'Smileys & Emotion', items: '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤔 🤐 😐 😑 😶 😏 😒 🙄 😬 🤥 😌 😔 🥱 😴 🤤 😪 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 😵 🤯 🤠 🥳 😎 🤓 🧐'.split(' ') },
  { name: 'Objects & Symbols', items: '🔥 ⭐ ✨ 💡 🚀 🎯 📈 📊 💼 🧾 📌 📁 🗂️ 🏷️ 🔑 🔒 🧩 🛠️ ⚙️ 🧠 💎 🏆 🥇 🎉 🎊 💰 💵 🪙 🤝 👋 👀 ✅ ☑️ 🔔 📣 💬 📝 📎'.split(' ') },
  { name: 'Animals & Nature', items: '🍀 🌿 🌱 🌳 🌸 🌺 🌻 🌼 🐝 🦄 🐢 🐬 🦋 🐙 🌍 🌎 🌏 ⛰️ 🏔️ 🌋'.split(' ') },
]

const LINE_ICONS: TodayIconName[] = ['list', 'target', 'funnel', 'dollar', 'users', 'contact', 'star', 'calendar', 'folder', 'article', 'bolt', 'sparkle']

export function ListIconPickerPanel({ onPick, onUpload, className = '', style }: {
  onPick: (value: string) => void | Promise<void>
  onUpload?: (file: File) => void | Promise<void>
  className?: string
  style?: CSSProperties
}) {
  const [query, setQuery] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const normalizedQuery = query.trim().toLowerCase()
  const matchingIcons = normalizedQuery
    ? LINE_ICONS.filter(icon => icon.includes(normalizedQuery))
    : LINE_ICONS
  const categories = normalizedQuery
    ? EMOJI_CATEGORIES.filter(category => category.name.toLowerCase().includes(normalizedQuery) || category.items.includes(query.trim()))
    : EMOJI_CATEGORIES

  return <div className={`emoji-pop ${className}`.trim()} style={style} onClick={event => event.stopPropagation()}>
    <input className="emoji-search" autoFocus placeholder="Search icons" value={query} onChange={event => setQuery(event.target.value)} />
    {onUpload && <button type="button" className="emoji-upload" onClick={() => fileRef.current?.click()}><Icon name="image" size={15} /><span>Upload icon</span></button>}
    {onUpload && <input
      ref={fileRef}
      className="sr-only"
      type="file"
      accept="image/png,image/jpeg,image/webp,image/svg+xml"
      onChange={event => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (file) void onUpload(file)
      }}
    />}
    {matchingIcons.length > 0 && <><div className="emoji-cat">Icons</div><div className="emoji-grid icons">{matchingIcons.map(icon => <button type="button" key={icon} title={icon} onClick={() => void onPick(icon)}><Icon name={icon} size={18} /></button>)}</div></>}
    {categories.map(category => <div key={category.name}><div className="emoji-cat">{category.name}</div><div className="emoji-grid">{category.items.map(emoji => <button type="button" key={emoji} onClick={() => void onPick(emoji)}>{emoji}</button>)}</div></div>)}
    {matchingIcons.length === 0 && categories.length === 0 && <div className="pop-empty">No matching icons.</div>}
  </div>
}

export function ListIconPickerPopover({ anchor, onPick, onUpload, onClose, className = '' }: {
  anchor: DOMRect
  onPick: (value: string) => void | Promise<void>
  onUpload?: (file: File) => void | Promise<void>
  onClose: () => void
  className?: string
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const width = Math.min(340, window.innerWidth - 16)
  const left = Math.min(Math.max(8, anchor.left), window.innerWidth - width - 8)
  const roomBelow = window.innerHeight - anchor.bottom - 16
  const top = roomBelow >= 220 ? anchor.bottom + 8 : Math.max(8, anchor.top - Math.min(440, window.innerHeight - 16) - 8)
  const maxHeight = roomBelow >= 220 ? Math.min(440, roomBelow) : Math.min(440, anchor.top - 16)

  return createPortal(<>
    <button type="button" className="list-icon-picker-scrim" aria-label="Close icon picker" onClick={onClose} />
    <ListIconPickerPanel className={`list-icon-picker-portal ${className}`.trim()} style={{ position: 'fixed', top, left, width, maxHeight }} onPick={onPick} onUpload={onUpload} />
  </>, document.body)
}

export default function ListTitleEditor({ list, onUpdate, onDelete, onNotify }: {
  list: List
  onUpdate: (patch: Pick<List, 'name'> | Pick<List, 'icon'>) => Promise<unknown>
  onDelete?: () => Promise<void>
  onNotify: (icon: TodayIconName, text: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(list.name)
  const [pickerAnchor, setPickerAnchor] = useState<DOMRect | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [pendingIcon, setPendingIcon] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setName(list.name) }, [list.name])
  useEffect(() => { if (pendingIcon === list.icon) setPendingIcon(null) }, [list.icon, pendingIcon])
  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])
  const saveName = async () => {
    const next = name.trim()
    setEditing(false)
    if (!next || next === list.name) { setName(list.name); return }
    const result = await onUpdate({ name: next }) as { error?: { message?: string } | null } | undefined
    if (result?.error) { setName(list.name); onNotify('x', result.error.message || 'Could not rename list') }
  }

  const saveIcon = async (icon: string) => {
    const previous = list.icon
    setPendingIcon(icon)
    setPickerAnchor(null)
    const result = await onUpdate({ icon }) as { error?: { message?: string } | null } | undefined
    if (result?.error) { setPendingIcon(previous); onNotify('x', result.error.message || 'Could not update list icon') }
  }

  const uploadIcon = async (file: File) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
    if (!allowed.includes(file.type)) { onNotify('x', 'Use PNG, JPG, WebP, or SVG'); return }
    if (file.size > 1024 * 1024) { onNotify('x', 'Icon must be under 1MB'); return }
    const ext = file.name.split('.').pop()?.toLowerCase() || (file.type === 'image/svg+xml' ? 'svg' : 'png')
    const path = `${list.user_id}/${list.id}/${crypto.randomUUID()}.${ext}`
    setPickerAnchor(null)
    const { error } = await supabase.storage.from('list-icons').upload(path, file, { cacheControl: '31536000', upsert: false })
    if (error) { onNotify('x', error.message || 'Could not upload list icon'); return }
    await saveIcon(`storage:list-icons:${path}`)
  }

  return <div className="tb-list-identity">
    <button className="tb-list-icon-btn" title="Change list icon" aria-expanded={Boolean(pickerAnchor)} onClick={event => {
      const rect = event.currentTarget.getBoundingClientRect()
      setPickerAnchor(current => current ? null : rect)
    }}><ListGlyph value={pendingIcon ?? list.icon} size={15} /></button>
    {editing ? <input
      ref={inputRef}
      className="tb-title-input"
      value={name}
      onChange={event => setName(event.target.value)}
      onBlur={() => void saveName()}
      onKeyDown={event => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') { setName(list.name); setEditing(false) }
      }}
    /> : <button className="tb-list-name" title="Rename list" onClick={() => setEditing(true)}>{list.name}</button>}
    <button className="tb-list-more" title="List options" aria-expanded={Boolean(menuAnchor)} onClick={event => {
      const rect = event.currentTarget.getBoundingClientRect()
      setMenuAnchor(current => current ? null : rect)
    }}><Icon name="dots" size={14} style={{ transform: 'rotate(90deg)' }} /></button>
    {pickerAnchor && <ListIconPickerPopover anchor={pickerAnchor} className="tb-emoji-pop" onClose={() => setPickerAnchor(null)} onPick={saveIcon} onUpload={uploadIcon} />}
    {menuAnchor && <CrmPopFrame anchor={menuAnchor} width={190} align="right" onClose={() => setMenuAnchor(null)}>
      <button className="pop-item" onClick={() => { setMenuAnchor(null); setEditing(true) }}><span className="ico"><Icon name="pencil" size={14} /></span><span className="lbl">Rename</span></button>
      <button className="pop-item" onClick={() => { setMenuAnchor(null); const button = document.querySelector('.tb-list-icon-btn') as HTMLElement | null; if (button) setPickerAnchor(button.getBoundingClientRect()) }}><span className="ico"><Icon name="sparkle" size={14} /></span><span className="lbl">Change icon</span></button>
      <div className="pop-sep" />
      <button className="pop-item danger" disabled={!onDelete} onClick={() => { setMenuAnchor(null); setDeleteOpen(true) }}><span className="ico"><Icon name="trash" size={14} /></span><span className="lbl">Delete list</span></button>
    </CrmPopFrame>}
    {deleteOpen && <div className="scrim" onClick={() => setDeleteOpen(false)}><div className="modal sm delete-list-modal" onClick={event => event.stopPropagation()}><div className="modal-hd"><Icon name="trash" size={15} />Delete list<button className="x" onClick={() => setDeleteOpen(false)}><Icon name="x" size={15} /></button></div><div className="modal-bd"><p className="delete-copy">Delete <strong>{list.name}</strong>? This removes the list, its views, and list memberships. The underlying records and outreach history stay in your account.</p></div><div className="modal-ft"><button className="btn btn-ghost" onClick={() => setDeleteOpen(false)}>Cancel</button><button className="btn btn-danger" disabled={deleting || !onDelete} onClick={async () => { if (!onDelete) return; setDeleting(true); await onDelete(); setDeleting(false); setDeleteOpen(false) }}>{deleting ? 'Deleting...' : 'Delete list'}</button></div></div></div>}
  </div>
}
