import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLists } from '@/hooks/useLists'
import { useAttioObjectBundle } from '@/hooks/useAttioObjects'
import { useCrmViews } from '@/hooks/useCrmViews'
import { supabase } from '@/lib/supabase'
import CrmViewSurface from '@/components/crm/CrmViewSurface'
import {
  ACCESS_RANK,
  createCustomAttribute,
  fetchObjectRecords,
  getEffectiveAccess,
  saveRecordAttributeValue,
  type CreatableAttributeType,
  type UnifiedRecord,
} from '@/lib/attioObjects'
import {
  activateListView,
  addCrmListEntries,
  fetchCrmListEntries,
  moveCrmListEntry,
  removeCrmListEntries,
  type CrmListEntry,
  type CrmViewStageSetting,
} from '@/lib/crmViews'
import { Icon, Logo, type TodayIconName } from '@/screens/today/TodayIcons'

function recordPath(slug: string, recordId: string) {
  return ['companies', 'people', 'deals'].includes(slug) ? `/${slug}/record/${recordId}` : `/records/${slug}/${recordId}`
}

function daysSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
}

function linkedinUrlForRecord(record: UnifiedRecord) {
  const raw = record.values.linkedin_url ?? record.values.linkedin ?? record.values.LinkedIn
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function openLinkedInBatchViaExtension(urls: string[]) {
  const requestId = crypto.randomUUID()
  return new Promise<{ success: boolean; opened: number; error?: string } | null>(resolve => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', onMessage)
      resolve(null)
    }, 2500)
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return
      const data = event.data as { source?: string; type?: string; requestId?: string; success?: boolean; opened?: number; error?: string }
      if (data?.source !== 'rethink-extension' || data.type !== 'OPEN_LINKEDIN_BATCH_RESULT' || data.requestId !== requestId) return
      window.clearTimeout(timeout)
      window.removeEventListener('message', onMessage)
      resolve({ success: Boolean(data.success), opened: Number(data.opened ?? 0), error: data.error })
    }
    window.addEventListener('message', onMessage)
    window.postMessage({ source: 'rethink-app', type: 'OPEN_LINKEDIN_BATCH', requestId, urls }, window.location.origin)
  })
}

function openLinkedInBatchLauncher(urls: string[]) {
  const key = crypto.randomUUID()
  window.localStorage.setItem(`rethink.linkedinBatch.${key}`, JSON.stringify({ urls, createdAt: Date.now() }))
  return window.open(`/linkedin-batch-open?key=${encodeURIComponent(key)}`, '_blank', 'noopener,noreferrer')
}

export default function ListDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { lists, loading: listsLoading, updateList, reload: reloadLists } = useLists(user?.id)
  const list = lists.find(item => item.id === id)
  const objectSlug = list?.object_slug ?? null
  const { object, attributes, permissions, loading: objectLoading, reload: reloadBundle } = useAttioObjectBundle(user?.id, objectSlug)
  const viewStore = useCrmViews({ userId: user?.id, object, attributes, listId: list?.id ?? null })
  const [entries, setEntries] = useState<CrmListEntry[]>([])
  const [allRecords, setAllRecords] = useState<UnifiedRecord[]>([])
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addStage, setAddStage] = useState<string | null>(null)
  const [toast, setToast] = useState<{ icon: TodayIconName; text: string } | null>(null)
  const dataRequestId = useRef(0)
  const reloadTimer = useRef<number | null>(null)

  const effectiveAccess = getEffectiveAccess(permissions)
  const canWrite = ACCESS_RANK[effectiveAccess] >= ACCESS_RANK.read_write

  useEffect(() => {
    if (!list) return
    setActiveViewId(list.active_view_id ?? null)
  }, [list])

  const loadData = useCallback(async () => {
    if (!user || !list || !object) return
    const request = ++dataRequestId.current
    setEntries([])
    setAllRecords([])
    const [entryRows, recordRows] = await Promise.all([
      fetchCrmListEntries(user.id, list.id, list.object_slug),
      fetchObjectRecords(user.id, object),
    ])
    if (request !== dataRequestId.current || object.slug !== list.object_slug) return
    setEntries(entryRows)
    setAllRecords(recordRows)
  }, [list, object, user])

  useEffect(() => { void loadData() }, [loadData])

  useEffect(() => {
    if (!user || !list) return
    const schedule = () => {
      if (reloadTimer.current) window.clearTimeout(reloadTimer.current)
      reloadTimer.current = window.setTimeout(() => {
        reloadTimer.current = null
        void loadData()
        void reloadLists()
      }, 140)
    }
    const onFocus = () => schedule()
    const onVisibility = () => { if (document.visibilityState === 'visible') schedule() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    const channel = supabase.channel(`list-detail-sync-${user.id}-${list.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_list_entries', filter: `user_id=eq.${user.id}` }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_memberships', filter: `user_id=eq.${user.id}` }, schedule)
      .subscribe()
    return () => {
      if (reloadTimer.current) window.clearTimeout(reloadTimer.current)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      void supabase.removeChannel(channel)
    }
  }, [list, loadData, reloadLists, user])

  const records = useMemo(() => {
    const byId = new Map(allRecords.map(record => [record.id, record]))
    return entries.flatMap(entry => {
      const record = byId.get(entry.record_id)
      if (!record) return []
      return [{
        ...record,
        values: {
          ...record.values,
          ...entry.attributes,
          __stage: entry.current_stage,
          __stageDays: daysSince(entry.stage_changed_at),
          __listNotes: entry.notes,
        },
      }]
    })
  }, [allRecords, entries])

  const activeView = useMemo(() => {
    if (!viewStore.views.length) return null
    return viewStore.views.find(view => view.id === activeViewId) ?? viewStore.views[0]
  }, [activeViewId, viewStore.views])

  const stages = useMemo<CrmViewStageSetting[]>(() => (list?.stages ?? []).map((stage, index) => ({
    id: stage.key,
    label: stage.label,
    color: stage.color || list?.color || ['#E4EDFF', '#BAD0FA', '#538BF3', '#266DF0'][index % 4],
    trackTime: stage.trackTime,
    confetti: stage.confetti,
  })), [list])

  const notify = (text: string, icon: TodayIconName = 'article') => {
    setToast({ text, icon })
    window.setTimeout(() => setToast(null), 2200)
  }

  const openLinkedInBatch = async (visibleRecords: UnifiedRecord[]) => {
    const selected = visibleRecords
      .map(record => ({ record, url: linkedinUrlForRecord(record), entry: entries.find(item => item.record_id === record.id) }))
      .filter((item): item is { record: UnifiedRecord; url: string; entry: CrmListEntry | undefined } => Boolean(item.url))
      .slice(0, 15)

    if (!selected.length) {
      notify('No LinkedIn profiles in this view', 'linkedin')
      return
    }

    const urls = selected.map(item => item.url)
    const launcher = openLinkedInBatchLauncher(urls)
    const extensionResult = await openLinkedInBatchViaExtension(urls)
    const opened = extensionResult?.opened ?? 0
    if (extensionResult && !extensionResult.success) {
      notify(extensionResult.error === 'no_linkedin_urls' ? 'No LinkedIn profiles in this view' : 'Extension could not open profiles', 'x')
      return
    }

    if (!extensionResult) {
      notify(launcher ? 'Opened launcher fallback for LinkedIn batch' : 'Browser blocked the LinkedIn launcher', launcher ? 'linkedin' : 'x')
      if (!launcher) return
      const now = new Date().toISOString()
      void Promise.all(selected.map(async item => {
        if (!item.entry) return
        await supabase
          .from('crm_list_entries')
          .update({
            attributes: {
              ...(item.entry.attributes ?? {}),
              linkedin_opened_at: now,
              linkedin_capture_requested_at: now,
            },
          })
          .eq('id', item.entry.id)
          .eq('user_id', user?.id)
      })).then(() => loadData()).catch(error => {
        console.error('Could not mark LinkedIn profile batch opened', error)
      })
      return
    }

    if (opened === 0) { notify('Extension could not open profiles', 'x'); return }
    launcher?.close()

    const now = new Date().toISOString()
    const openedSelected = selected.slice(0, opened)
    void Promise.all(openedSelected.map(async item => {
      if (!item.entry) return
      await supabase
        .from('crm_list_entries')
        .update({
          attributes: {
            ...(item.entry.attributes ?? {}),
            linkedin_opened_at: now,
            linkedin_capture_requested_at: now,
          },
        })
        .eq('id', item.entry.id)
        .eq('user_id', user?.id)
    })).then(() => loadData()).catch(error => {
      console.error('Could not mark LinkedIn profile batch opened', error)
    })

    notify(`${opened} LinkedIn ${opened === 1 ? 'profile' : 'profiles'} opened`, 'linkedin')
  }

  if (listsLoading || objectLoading || !user) return <div className="lv"><div className="tbl-empty"><div className="glyph"><Icon name="list" size={30} /></div><h3>Loading list</h3></div></div>
  if (!list || !object) return <div className="lv"><div className="tbl-empty"><div className="glyph"><Icon name="list" size={30} /></div><h3>List not found</h3><button className="btn btn-primary" onClick={() => navigate('/lists')}>Back to lists</button></div></div>

  return <div className="handoff-list-detail">
    <CrmViewSurface
      object={object}
      attributes={attributes}
      records={records}
      views={viewStore.views}
      activeView={activeView}
      stages={stages}
      canWrite={canWrite}
      loading={viewStore.loading}
      listMode
      onSwitchView={async view => { setActiveViewId(view.id); await activateListView(list.id, view.id); await reloadLists() }}
      onCreateView={viewStore.create}
      onPatchView={(viewId, patch) => viewStore.patch(viewId, patch)}
      onDuplicateView={viewStore.duplicate}
      onDeleteView={async view => { const removed = await viewStore.remove(view.id); if (removed) { const next = viewStore.views.find(item => item.id !== view.id); setActiveViewId(next?.id ?? null); await reloadLists() } return removed }}
      onCreateAttribute={async (name, type) => {
        const { attribute, error } = await createCustomAttribute(user.id, object, { name, attribute_type: type as CreatableAttributeType })
        if (error) notify(error.message, 'x')
        return attribute
      }}
      onReloadAttributes={reloadBundle}
      onAddRecords={stageId => { setAddStage(stageId ?? null); setShowAdd(true) }}
      onOpenRecord={record => navigate(recordPath(object.slug, record.id))}
      onUpdateCell={async (record, attribute, value) => {
        const { error } = await saveRecordAttributeValue(user.id, object, record, attribute, value)
        if (error) notify(error.message, 'x')
        await loadData()
      }}
      onMoveStage={async (record, stageId) => {
        const entry = entries.find(item => item.record_id === record.id)
        if (!entry) return
        try { await moveCrmListEntry(entry.id, stageId); await loadData() } catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not move record', 'x') }
      }}
      onStageSettingsChange={async next => {
        const previousIds = new Set(stages.map(stage => stage.id))
        const nextIds = new Set(next.map(stage => stage.id))
        const removed = [...previousIds].filter(stageId => !nextIds.has(stageId))
        if (removed.length) await Promise.all(entries.filter(entry => removed.includes(entry.current_stage)).map(entry => moveCrmListEntry(entry.id, null)))
        await updateList(list.id, { stages: next.filter(stage => stage.id !== null).map(stage => ({ key: String(stage.id), label: stage.label, color: stage.color, trackTime: stage.trackTime, confetti: stage.confetti })) })
        await reloadLists(); await loadData()
      }}
      onRemoveRecords={async recordIds => {
        const ids = entries.filter(entry => recordIds.includes(entry.record_id)).map(entry => entry.id)
        await removeCrmListEntries(ids)
        await loadData()
      }}
      onAddToList={() => notify('Choose a destination list', 'list')}
      onOpenLinkedInBatch={object.slug === 'people' ? openLinkedInBatch : undefined}
      onNotify={notify}
    />

    {showAdd && <AddRecordsModal
      objectName={object.singular_name}
      records={allRecords}
      existingIds={new Set(entries.map(entry => entry.record_id))}
      onClose={() => setShowAdd(false)}
      onConfirm={async recordIds => {
        try {
          await addCrmListEntries(user.id, list.id, object.slug, recordIds, addStage ?? stages[0]?.id ?? null)
          setShowAdd(false); setAddStage(null); await loadData(); notify(`${recordIds.length} ${recordIds.length === 1 ? 'record' : 'records'} added`, 'checkcircle')
        } catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not add records', 'x') }
      }}
    />}
    {(toast || viewStore.error) && <div className="toast"><span className="em"><Icon name={toast?.icon ?? 'x'} size={13} /></span>{toast?.text ?? viewStore.error}</div>}
  </div>
}

function AddRecordsModal({ objectName, records, existingIds, onClose, onConfirm }: {
  objectName: string
  records: UnifiedRecord[]
  existingIds: Set<string>
  onClose: () => void
  onConfirm: (recordIds: string[]) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const available = records.filter(record => !existingIds.has(record.id)).filter(record => `${record.title} ${record.subtitle ?? ''}`.toLowerCase().includes(query.toLowerCase()))
  const toggle = (id: string) => setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  return <div className="scrim" onClick={onClose}><div className="modal" onClick={event => event.stopPropagation()}><div className="modal-hd">Add {objectName}<button className="x" onClick={onClose} aria-label={`Close add ${objectName} dialog`}><Icon name="x" size={15} /></button></div><div className="modal-bd"><div className="pop-search choose-search"><span className="ico"><Icon name="search" size={13} /></span><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${objectName.toLowerCase()}...`} /></div><div className="choose-list">{available.length ? available.map(record => <button className="rec-item" key={record.id} onClick={() => toggle(record.id)}><span className={`cb${selected.has(record.id) ? ' on' : ''}`}>{selected.has(record.id) && <Icon name="check" size={10} />}</span><Logo id={record.imageUrl || record.title} size={24} /><span><span className="rname">{record.title}</span><span className="rsub">{record.subtitle}</span></span></button>) : <div className="pop-empty">No records available.</div>}</div></div><div className="modal-ft"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!selected.size} onClick={() => void onConfirm([...selected])}>Add {selected.size || ''} {objectName}</button></div></div></div>
}
