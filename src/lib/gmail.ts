/**
 * Gmail integration — F05
 * Fetches email threads with a contact and logs them as `email` interactions.
 * Requires `gmail.readonly` OAuth scope (added to signInWithOAuth).
 * Deduplicates via external_id (Gmail thread ID) unique index on interactions table.
 */

import { supabase } from '@/lib/supabase'

interface GmailThread {
  id: string
  snippet: string
  messages?: Array<{
    id: string
    internalDate: string
    payload: { headers: Array<{ name: string; value: string }> }
  }>
}

function formatDate(epochMs: string): string {
  const d = new Date(parseInt(epochMs))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function syncGmailInteractions(params: {
  contactId: string
  contactEmail: string
  attioRecordId?: string | null
  category?: string | null
  maxResults?: number
}): Promise<{ synced: number; skipped: number; error?: string }> {
  const { contactId, contactEmail, maxResults = 20 } = params

  // Get session with provider_token (Google access token)
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.provider_token
  if (!token) {
    return { synced: 0, skipped: 0, error: 'No Google token — re-sign in with Gmail access' }
  }

  const userId = session.user.id

  // 1. Search threads involving this email address
  const query = encodeURIComponent(`from:${contactEmail} OR to:${contactEmail}`)
  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/threads?q=${query}&maxResults=${maxResults}`

  let threads: Array<{ id: string; snippet: string }> = []
  try {
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!listRes.ok) {
      const txt = await listRes.text()
      if (listRes.status === 401) return { synced: 0, skipped: 0, error: 'Gmail access expired — re-sign in' }
      if (listRes.status === 403) return { synced: 0, skipped: 0, error: 'Gmail permission denied — re-sign in with Gmail access' }
      return { synced: 0, skipped: 0, error: `Gmail API error: ${txt}` }
    }
    const listData = await listRes.json()
    threads = listData.threads ?? []
  } catch (e) {
    return { synced: 0, skipped: 0, error: 'Network error fetching Gmail threads' }
  }

  if (threads.length === 0) return { synced: 0, skipped: 0 }

  // 2. For each thread, get the first message date
  let synced = 0
  let skipped = 0

  for (const thread of threads) {
    const threadId = thread.id
    const externalId = `gmail_thread_${threadId}`

    // Try to insert — unique index prevents duplicates silently
    const threadUrl = `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=Date&metadataHeaders=Subject`
    try {
      const threadRes = await fetch(threadUrl, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!threadRes.ok) { skipped++; continue }

      const threadData: GmailThread = await threadRes.json()
      const firstMsg = threadData.messages?.[0]
      const dateHeader = firstMsg?.payload?.headers?.find(h => h.name === 'Date')?.value
      const subjectHeader = firstMsg?.payload?.headers?.find(h => h.name === 'Subject')?.value ?? ''
      const epochMs = firstMsg?.internalDate
      const interaction_date = epochMs ? formatDate(epochMs) : dateHeader
        ? formatDate(String(new Date(dateHeader).getTime()))
        : new Date().toISOString().split('T')[0]

      const { error } = await supabase.from('interactions').insert({
        user_id: userId,
        contact_id: contactId,
        type: 'email',
        direction: 'outbound',
        notes: subjectHeader ? `Subject: ${subjectHeader}` : null,
        interaction_date,
        external_id: externalId,
      })

      if (error) {
        // Unique constraint violation = already synced
        if (error.code === '23505') { skipped++; continue }
        skipped++
      } else {
        synced++
      }
    } catch {
      skipped++
    }
  }

  return { synced, skipped }
}

/** Check if current session has Gmail read access */
export async function hasGmailAccess(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.provider_token
  if (!token) return false
  // Quick probe — list 1 thread
  try {
    const res = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=1',
      { headers: { Authorization: `Bearer ${token}` } }
    )
    return res.ok
  } catch {
    return false
  }
}
