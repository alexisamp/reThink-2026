import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLists } from '@/hooks/useLists'
import { useAttioObjects } from '@/hooks/useAttioObjects'
import { activateListView, createCrmView, defaultViewColumns } from '@/lib/crmViews'
import { fetchObjectBundle } from '@/lib/attioObjects'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/screens/today/TodayIcons'
import ListGlyph from '@/components/crm/ListGlyph'
import { ListIconPickerPopover } from '@/components/crm/ListTitleEditor'

const DEFAULT_STAGES = [
  { key: 'new', label: 'New', color: '#BAD0FA' },
  { key: 'in-progress', label: 'In progress', color: '#538BF3' },
  { key: 'done', label: 'Done', color: '#266DF0' },
]

export default function Lists() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { lists, loading, createList } = useLists(user?.id)
  const { objects } = useAttioObjects(user?.id, user?.email, user?.user_metadata?.full_name as string | undefined)
  const requestedObject = searchParams.get('object')
  const [objectSlug, setObjectSlug] = useState(() => requestedObject && ['companies', 'people', 'deals'].includes(requestedObject) ? requestedObject : 'companies')
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('icon:list')
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [iconPreviewUrl, setIconPreviewUrl] = useState<string | null>(null)
  const [pickerAnchor, setPickerAnchor] = useState<DOMRect | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supported = useMemo(() => objects.filter(object => ['companies', 'people', 'deals'].includes(object.slug)), [objects])
  const showCreate = searchParams.get('new') === '1' || (!loading && lists.length === 0)

  useEffect(() => {
    if (requestedObject && ['companies', 'people', 'deals'].includes(requestedObject)) setObjectSlug(requestedObject)
  }, [requestedObject])

  useEffect(() => () => {
    if (iconPreviewUrl) URL.revokeObjectURL(iconPreviewUrl)
  }, [iconPreviewUrl])

  if (loading) return <div className="lv"><div className="tbl-empty"><div className="glyph"><Icon name="list" size={30} /></div><h3>Loading lists</h3></div></div>
  if (!showCreate && lists.length) return <Navigate to={`/lists/${lists[0].id}`} replace />

  const submit = async () => {
    if (!user || saving) return
    setSaving(true); setError(null)
    const created = await createList({
      name: name.trim() || 'New list',
      purpose: null,
      icon,
      color: '#1C1D1F',
      stages: DEFAULT_STAGES,
      object_slug: objectSlug,
    })
    if (!created) { setSaving(false); setError('Could not create list'); return }
    if (iconFile) {
      const ext = iconFile.name.split('.').pop()?.toLowerCase() || (iconFile.type === 'image/svg+xml' ? 'svg' : 'png')
      const path = `${user.id}/${created.id}/${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('list-icons').upload(path, iconFile, { cacheControl: '31536000', upsert: false })
      if (uploadError) setError(uploadError.message)
      else {
        await supabase.from('lists').update({ icon: `storage:list-icons:${path}` }).eq('id', created.id).eq('user_id', user.id)
        created.icon = `storage:list-icons:${path}`
      }
    }
    try {
      const object = supported.find(item => item.slug === objectSlug)
      const bundle = object ? await fetchObjectBundle(user.id, object.slug) : null
      if (object) {
        const view = await createCrmView(user.id, object.id, created.id, {
          title: created.name,
          view_type: 'table',
          columns: defaultViewColumns(bundle?.attributes ?? [], object.slug),
        }, 0)
        if (view?.id) await activateListView(created.id, view.id)
      }
    } catch (viewError) {
      console.error('Could not create initial list view', viewError)
    }
    setSaving(false)
    navigate(`/lists/${created.id}`, { replace: true })
  }

  return <div className="sv"><div className="sv-inner"><h2>{lists.length ? 'Create a list' : 'Start with a list'}</h2><p className="sub">Choose the object this list will organize.</p><div className="pick-grid">{supported.map(object => <button key={object.id} className={`pick${objectSlug === object.slug ? ' on' : ''}`} onClick={() => setObjectSlug(object.slug)}><span className={`pico ${object.slug}`}><Icon name={object.slug === 'people' ? 'users' : object.slug === 'deals' ? 'dollar' : 'contact'} size={14} /></span><span className="pt">{object.plural_name}</span></button>)}</div><div className="field-lbl">List name</div><div className="name-row"><button type="button" className="emoji-btn" title="Choose list icon" aria-expanded={Boolean(pickerAnchor)} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); setPickerAnchor(current => current ? null : rect) }}>{iconPreviewUrl ? <span className="list-uploaded-icon" style={{ width: 22, height: 22 }}><img src={iconPreviewUrl} alt="" /></span> : <ListGlyph value={icon} size={20} />}</button><input className="txt" autoFocus placeholder="New list" value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !pickerAnchor) void submit(); if (event.key === 'Escape') setPickerAnchor(null) }} />{pickerAnchor && <ListIconPickerPopover anchor={pickerAnchor} className="create-list-emoji-pop" onClose={() => setPickerAnchor(null)} onPick={value => { setIcon(value); setIconFile(null); if (iconPreviewUrl) URL.revokeObjectURL(iconPreviewUrl); setIconPreviewUrl(null); setPickerAnchor(null) }} onUpload={file => { const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']; if (!allowed.includes(file.type)) { setError('Use PNG, JPG, WebP, or SVG'); return }; if (file.size > 1024 * 1024) { setError('Icon must be under 1MB'); return }; if (iconPreviewUrl) URL.revokeObjectURL(iconPreviewUrl); setIconFile(file); setIconPreviewUrl(URL.createObjectURL(file)); setPickerAnchor(null) }} />}</div>{error && <div className="rm-warn">{error}</div>}<div className="modal-ft inline"><button className="btn btn-ghost" onClick={() => navigate(lists[0] ? `/lists/${lists[0].id}` : '/today')}>Cancel</button><button className="btn btn-primary" disabled={saving} onClick={() => void submit()}>{saving ? 'Creating...' : 'Create list'}<span className="kbd">Enter</span></button></div></div></div>
}
