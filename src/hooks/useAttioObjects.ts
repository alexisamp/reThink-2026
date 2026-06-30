import { useCallback, useEffect, useState } from 'react'
import {
  countObjectRecords,
  ensureAttioObjects,
  fetchAttributeCounts,
  fetchObjectBundle,
  fetchObjects,
  type CrmAttribute,
  type CrmObject,
  type CrmObjectPermission,
} from '@/lib/attioObjects'

export interface ObjectWithCounts extends CrmObject {
  record_count: number
  attribute_count: number
}

export function useAttioObjects(userId: string | null | undefined, userEmail?: string | null, userName?: string | null) {
  const [objects, setObjects] = useState<ObjectWithCounts[]>([])
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      await ensureAttioObjects(userId, userEmail, userName)
      const rows = await fetchObjects(userId)
      const attributeCounts = await fetchAttributeCounts(userId, rows.map(object => object.id))
      const withCounts = await Promise.all(rows.map(async object => ({
        ...object,
        record_count: await countObjectRecords(userId, object),
        attribute_count: attributeCounts[object.id] ?? 0,
      })))
      setObjects(withCounts)
    } finally {
      setLoading(false)
    }
  }, [userEmail, userId, userName])

  useEffect(() => { void reload() }, [reload])

  return { objects, loading, reload }
}

export function useAttioObjectBundle(userId: string | null | undefined, slug: string | null | undefined) {
  const [object, setObject] = useState<CrmObject | null>(null)
  const [attributes, setAttributes] = useState<CrmAttribute[]>([])
  const [permissions, setPermissions] = useState<CrmObjectPermission[]>([])
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!userId || !slug) return
    setLoading(true)
    try {
      const bundle = await fetchObjectBundle(userId, slug)
      setObject(bundle?.object ?? null)
      setAttributes(bundle?.attributes ?? [])
      setPermissions(bundle?.permissions ?? [])
    } finally {
      setLoading(false)
    }
  }, [slug, userId])

  useEffect(() => { void reload() }, [reload])

  return { object, attributes, permissions, loading, reload }
}
