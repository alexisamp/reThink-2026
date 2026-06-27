import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { syncGmailInteractionsForContacts, type GmailSyncContact } from '@/lib/gmail'

const GMAIL_SYNC_EVENT = 'rethink:gmail-sync'
const SYNC_INTERVAL_MS = 5 * 60 * 1000
const MIN_SYNC_GAP_MS = 4 * 60 * 1000

export interface GmailSyncEventDetail {
  synced: number
  skipped: number
  contactsTouched: string[]
  error?: string
}

export function useGmailAutoSync(userId: string | null | undefined, enabled = true) {
  const runningRef = useRef(false)

  useEffect(() => {
    if (!userId || !enabled) return
    let cancelled = false
    let timer: number | null = null
    const storageKey = `rethink:gmail:last-sync:${userId}`

    const run = async (force = false) => {
      if (runningRef.current || cancelled) return
      const last = Number(localStorage.getItem(storageKey) ?? '0')
      if (!force && Date.now() - last < MIN_SYNC_GAP_MS) return

      runningRef.current = true
      try {
        const { data } = await supabase
          .from('outreach_logs')
          .select('id, name, email, company_id, last_interaction_at')
          .eq('user_id', userId)
          .not('email', 'is', null)
          .order('last_interaction_at', { ascending: false, nullsFirst: false })
          .limit(250)

        const contacts = ((data ?? []) as GmailSyncContact[]).filter(contact => contact.email?.trim())
        if (contacts.length === 0) return

        const result = await syncGmailInteractionsForContacts({
          contacts,
          maxPerContact: 8,
          newerThanDays: 120,
        })

        localStorage.setItem(storageKey, String(Date.now()))
        window.dispatchEvent(new CustomEvent<GmailSyncEventDetail>(GMAIL_SYNC_EVENT, { detail: result }))
      } finally {
        runningRef.current = false
      }
    }

    timer = window.setTimeout(() => { void run(true) }, 8000)
    const interval = window.setInterval(() => { void run() }, SYNC_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, userId])
}

export { GMAIL_SYNC_EVENT }
