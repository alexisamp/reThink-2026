import { useCallback, useEffect, useRef, useState } from 'react'
import type { CrmAttribute, CrmObject } from '@/lib/attioObjects'
import { supabase } from '@/lib/supabase'
import {
  activateListView,
  createCrmView,
  deleteCrmView,
  duplicateCrmView,
  ensureDefaultCrmView,
  fetchCrmViews,
  patchCrmView,
  type CreateCrmViewInput,
  type CrmSavedView,
} from '@/lib/crmViews'

export function useCrmViews({
  userId,
  object,
  attributes,
  listId = null,
}: {
  userId?: string | null
  object?: CrmObject | null
  attributes: CrmAttribute[]
  listId?: string | null
}) {
  const [views, setViews] = useState<CrmSavedView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const viewsRef = useRef<CrmSavedView[]>([])
  const patchQueues = useRef(new Map<string, Promise<unknown>>())
  const patchRevisions = useRef(new Map<string, number>())
  const loadRequestId = useRef(0)
  const reloadTimer = useRef<number | null>(null)

  const replaceViews = useCallback((next: CrmSavedView[] | ((current: CrmSavedView[]) => CrmSavedView[])) => {
    setViews(current => {
      const resolved = typeof next === 'function' ? next(current) : next
      viewsRef.current = resolved
      return resolved
    })
  }, [])

  const load = useCallback(async () => {
    const request = ++loadRequestId.current
    if (!userId || !object) {
      replaceViews([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const next = listId
        ? await fetchCrmViews(userId, object.id, listId)
        : await ensureDefaultCrmView(userId, object, attributes)
      if (request !== loadRequestId.current) return
      replaceViews(next)
      setError(null)
    } catch (reason) {
      if (request !== loadRequestId.current) return
      setError(reason instanceof Error ? reason.message : 'Could not load views')
    } finally {
      if (request === loadRequestId.current) setLoading(false)
    }
  }, [attributes, listId, object, replaceViews, userId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!userId || !object) return
    const schedule = () => {
      if (reloadTimer.current) window.clearTimeout(reloadTimer.current)
      reloadTimer.current = window.setTimeout(() => {
        reloadTimer.current = null
        void load()
      }, 140)
    }
    const onFocus = () => schedule()
    const onVisibility = () => { if (document.visibilityState === 'visible') schedule() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    const channel = supabase.channel(`crm-views-sync-${userId}-${object.id}-${listId ?? 'object'}`).on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'crm_views',
      filter: `user_id=eq.${userId}`,
    }, schedule).subscribe()
    return () => {
      if (reloadTimer.current) window.clearTimeout(reloadTimer.current)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      void supabase.removeChannel(channel)
    }
  }, [listId, load, object, userId])

  const create = useCallback(async (input: CreateCrmViewInput) => {
    if (!userId || !object) return null
    try {
      const created = await createCrmView(userId, object.id, listId, input, views.length)
      replaceViews(current => [...current, created])
      if (listId) await activateListView(listId, created.id)
      return created
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create view')
      return null
    }
  }, [listId, object, replaceViews, userId, views.length])

  const patch = useCallback(async (viewId: string, updates: Parameters<typeof patchCrmView>[1]) => {
    const before = viewsRef.current.find(view => view.id === viewId)
    const revision = (patchRevisions.current.get(viewId) ?? 0) + 1
    patchRevisions.current.set(viewId, revision)
    replaceViews(current => current.map(view => view.id === viewId ? { ...view, ...updates } : view))

    const previous = patchQueues.current.get(viewId) ?? Promise.resolve()
    const request = previous.catch(() => undefined).then(() => patchCrmView(viewId, updates))
    patchQueues.current.set(viewId, request)
    try {
      const saved = await request
      if (patchRevisions.current.get(viewId) === revision) {
        replaceViews(current => current.map(view => view.id === viewId ? saved : view))
      }
      setError(null)
      return saved
    } catch (reason) {
      if (patchRevisions.current.get(viewId) === revision && before) {
        replaceViews(current => current.map(view => view.id === viewId ? { ...view, ...Object.fromEntries(Object.keys(updates).map(key => [key, before[key as keyof CrmSavedView]])) } : view))
      }
      setError(reason instanceof Error ? reason.message : 'Could not save view')
      return null
    } finally {
      if (patchQueues.current.get(viewId) === request) patchQueues.current.delete(viewId)
    }
  }, [replaceViews])

  const duplicate = useCallback(async (view: CrmSavedView) => {
    try {
      const copy = await duplicateCrmView(view, views.length)
      replaceViews(current => [...current, copy])
      if (listId) await activateListView(listId, copy.id)
      return copy
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not duplicate view')
      return null
    }
  }, [listId, replaceViews, views.length])

  const remove = useCallback(async (viewId: string) => {
    const target = views.find(view => view.id === viewId)
    if (!target || (!listId && views.length <= 1)) return false
    const next = views.filter(view => view.id !== viewId)
    replaceViews(next)
    try {
      await deleteCrmView(viewId)
      if (listId) await activateListView(listId, next[0]?.id ?? null)
      return true
    } catch (reason) {
      replaceViews(views)
      setError(reason instanceof Error ? reason.message : 'Could not delete view')
      return false
    }
  }, [listId, replaceViews, views])

  return { views, loading, error, clearError: () => setError(null), reload: load, create, patch, duplicate, remove }
}
