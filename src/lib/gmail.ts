/**
 * Gmail integration.
 *
 * Gmail messages are logged as `interactions.type = email`.
 * We dedupe by Gmail message id, not thread id, so replies in an existing
 * thread still become fresh relationship activity.
 */

import { supabase } from '@/lib/supabase'

type GmailHeader = { name: string; value: string }

interface GmailMessage {
  id: string
  threadId: string
  labelIds?: string[]
  snippet?: string
  internalDate?: string
  payload?: { headers?: GmailHeader[] }
}

export interface GmailSyncContact {
  id: string
  name?: string | null
  email: string | null
  company_id?: string | null
  last_interaction_at?: string | null
}

export interface GmailSyncResult {
  synced: number
  skipped: number
  contactsTouched: string[]
  error?: string
}

function formatDate(epochMs: string): string {
  const d = new Date(parseInt(epochMs, 10))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function normalizeEmail(email: string | null | undefined): string {
  const raw = (email ?? '').trim()
  const knownTldMatch = raw.match(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(?:com|net|org|io|co|ai|edu|gov|me|dev|app|cl|es|mx))(?=$|[^A-Za-z0-9]|[A-Z])/)
  if (knownTldMatch?.[1]) return knownTldMatch[1].toLowerCase()
  const genericMatch = raw.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)
  return (genericMatch?.[0] ?? raw).toLowerCase()
}

function header(message: GmailMessage, name: string): string {
  const found = message.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())
  return found?.value ?? ''
}

function headerHasEmail(value: string, email: string): boolean {
  const clean = normalizeEmail(email)
  return Boolean(clean) && value.toLowerCase().includes(clean)
}

function emailDomain(email: string | null | undefined): string | null {
  const clean = normalizeEmail(email)
  const domain = clean.split('@')[1]?.toLowerCase().replace(/^www\./, '') ?? null
  return domain || null
}

function emailsFromHeader(value: string): string[] {
  return [...new Set((value.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [])
    .map(normalizeEmail)
    .filter(Boolean))]
}

function messageEmailDomains(message: GmailMessage, userEmail: string | null, contactEmail: string | null): string[] {
  const ignore = new Set([emailDomain(userEmail), emailDomain(contactEmail)].filter(Boolean))
  const emails = [
    ...emailsFromHeader(header(message, 'From')),
    ...emailsFromHeader(header(message, 'To')),
    ...emailsFromHeader(header(message, 'Cc')),
  ]
  return [...new Set(emails
    .map(emailDomain)
    .filter((domain): domain is string => Boolean(domain && !ignore.has(domain))))]
}

function sourceDomainMatchesEmailDomain(sourceDomain: string | null | undefined, domain: string) {
  const source = sourceDomain?.toLowerCase().replace(/^www\./, '')
  if (!source) return false
  return source === domain || source.endsWith(`.${domain}`) || domain.endsWith(`.${source}`)
}

function cleanSnippet(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^[-\s]+/, '')
    .trim()
}

function inferIntent(opts: { subject: string; snippet: string; direction: 'inbound' | 'outbound' }): string {
  const text = `${opts.subject} ${opts.snippet}`.toLowerCase()
  if (/(intro|introduc|connect you|presentar|conectar)/.test(text)) return 'introduction or connection'
  if (/(available|availability|schedule|meet|meeting|call|calendar|reuni[o\u00f3]n|llamada|agenda)/.test(text)) return 'scheduling a conversation'
  if (/(follow.?up|checking in|circling back|seguimiento|retom)/.test(text)) return 'follow-up'
  if (/(thank|thanks|gracias|appreciate)/.test(text)) return 'acknowledgement or gratitude'
  if (/[?\u00bf]|(could you|can you|would you|let me know|puedes|podr[i\u00ed]as|me dices)/.test(text)) return 'asks for a response'
  return opts.direction === 'outbound' ? 'outreach or update sent' : 'incoming email to review'
}

function buildEmailNotes(opts: {
  subject: string
  snippet: string
  intent: string
  from: string
  to: string
  threadId: string
}): string {
  return [
    opts.subject ? `Subject: ${opts.subject}` : null,
    opts.snippet ? `Summary: ${opts.snippet}` : null,
    `Intent: ${opts.intent}`,
    opts.from ? `From: ${opts.from}` : null,
    opts.to ? `To: ${opts.to}` : null,
    `Gmail thread: ${opts.threadId}`,
  ].filter(Boolean).join('\n')
}

async function googleAccessToken() {
  const { data } = await supabase.auth.getSession()
  const session = data.session
  return session?.provider_token
    ?? (session?.user?.user_metadata?.google_access_token as string | undefined)
    ?? null
}

async function refreshGoogleAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('google-refresh-token')
  if (error) return null
  const token = (data as { access_token?: string } | null)?.access_token
  return token ?? null
}

async function gmailFetch(url: string, token: string): Promise<{ res: Response; token: string }> {
  let res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status !== 401 && res.status !== 403) return { res, token }

  const freshToken = await refreshGoogleAccessToken()
  if (!freshToken) return { res, token }

  res = await fetch(url, {
    headers: { Authorization: `Bearer ${freshToken}` },
  })
  return { res, token: freshToken }
}

async function gmailErrorMessage(res: Response) {
  try {
    const json = await res.json() as { error?: { message?: string; status?: string; details?: Array<{ reason?: string }> } }
    const message = json.error?.message ?? ''
    const reason = json.error?.details?.map(detail => detail.reason).filter(Boolean).join(' ') ?? ''
    if (/has not been used|disabled|SERVICE_DISABLED|accessNotConfigured/i.test(`${message} ${reason}`)) {
      return 'Gmail API is disabled in Google Cloud for this OAuth project. Enable Gmail API, then try again.'
    }
    if (message) return message
  } catch {}
  return `Gmail request failed (${res.status}).`
}

async function currentSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

function gmailDate(message: GmailMessage): string {
  if (message.internalDate) return formatDate(message.internalDate)
  const dateHeader = header(message, 'Date')
  if (dateHeader) {
    const parsed = new Date(dateHeader).getTime()
    if (!Number.isNaN(parsed)) return formatDate(String(parsed))
  }
  return new Date().toISOString().split('T')[0]
}

function directionForMessage(message: GmailMessage, contactEmail: string, userEmail: string | null): 'inbound' | 'outbound' {
  const from = header(message, 'From')
  const to = `${header(message, 'To')} ${header(message, 'Cc')}`
  const labels = new Set(message.labelIds ?? [])
  if (labels.has('SENT')) return 'outbound'
  if (headerHasEmail(from, contactEmail)) return 'inbound'
  if (userEmail && headerHasEmail(from, userEmail)) return 'outbound'
  if (headerHasEmail(to, contactEmail)) return 'outbound'
  return labels.has('INBOX') ? 'inbound' : 'outbound'
}

async function upsertEmailChannel(contactId: string, email: string) {
  const clean = normalizeEmail(email)
  if (!clean) return
  await supabase.from('contact_channels').upsert({
    outreach_log_id: contactId,
    channel: 'email',
    channel_identifier: clean,
    channel_name: clean,
    verified: true,
  }, { onConflict: 'channel,channel_identifier' }).then(() => undefined)
}

async function updateLastInteraction(contact: GmailSyncContact, latestDate: string) {
  const current = contact.last_interaction_at?.slice(0, 10) ?? null
  if (current && current >= latestDate) return
  await supabase
    .from('outreach_logs')
    .update({ last_interaction_at: `${latestDate}T12:00:00.000Z`, updated_at: new Date().toISOString() })
    .eq('id', contact.id)
}

async function findOpportunityForGmailMessage(userId: string, contact: GmailSyncContact, message: GmailMessage, userEmail: string | null): Promise<string | null> {
  const domains = messageEmailDomains(message, userEmail, contact.email)
  if (domains.length === 0) return null

  const { data } = await supabase
    .from('opportunities')
    .select('id, company_id, application_source_domain, created_at')
    .eq('user_id', userId)
    .not('application_source_domain', 'is', null)
    .order('created_at', { ascending: false })
    .limit(100)

  const opportunities = (data ?? []) as Array<{
    id: string
    company_id?: string | null
    application_source_domain?: string | null
  }>

  const matches = opportunities.filter(opportunity =>
    domains.some(domain => sourceDomainMatchesEmailDomain(opportunity.application_source_domain, domain)),
  )
  if (matches.length === 0) return null

  const sameCompany = contact.company_id
    ? matches.find(opportunity => opportunity.company_id === contact.company_id)
    : null
  return (sameCompany ?? matches[0])?.id ?? null
}

export async function syncGmailInteractionsForContacts(params: {
  contacts: GmailSyncContact[]
  maxPerContact?: number
  newerThanDays?: number
}): Promise<GmailSyncResult> {
  const { maxPerContact = 10, newerThanDays = 180 } = params
  const session = await currentSession()
  let token = await googleAccessToken()
  if (!session?.user?.id || !token) {
    return { synced: 0, skipped: 0, contactsTouched: [], error: 'Reconnect Google in Settings to enable Gmail access.' }
  }

  const userId = session.user.id
  const userEmail = normalizeEmail(session.user.email)
  let synced = 0
  let skipped = 0
  const touched = new Set<string>()

  const contacts = params.contacts
    .map(contact => ({ ...contact, email: normalizeEmail(contact.email) }))
    .filter((contact): contact is GmailSyncContact & { email: string } => Boolean(contact.email))

  for (const contact of contacts) {
    await upsertEmailChannel(contact.id, contact.email)

    const q = `(from:${contact.email} OR to:${contact.email}) newer_than:${newerThanDays}d`
    const listParams = new URLSearchParams({
      q,
      maxResults: String(maxPerContact),
      fields: 'messages(id,threadId),resultSizeEstimate',
    })

    const listFetch = await gmailFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${listParams}`, token)
    const listRes = listFetch.res
    token = listFetch.token
    if (!listRes.ok) {
      if (listRes.status === 401 || listRes.status === 403) {
        return { synced, skipped, contactsTouched: [...touched], error: await gmailErrorMessage(listRes) }
      }
      skipped++
      continue
    }

    const listData = await listRes.json() as { messages?: Array<{ id: string; threadId: string }> }
    const messages = listData.messages ?? []
    let latestInsertedDate: string | null = null

    for (const item of messages) {
      const params = new URLSearchParams({
        format: 'metadata',
        metadataHeaders: 'Date',
      })
      ;['Subject', 'From', 'To', 'Cc'].forEach(name => params.append('metadataHeaders', name))

      const messageFetch = await gmailFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?${params}`, token)
      const messageRes = messageFetch.res
      token = messageFetch.token
      if (!messageRes.ok) {
        skipped++
        continue
      }

      const message = await messageRes.json() as GmailMessage
      const direction = directionForMessage(message, contact.email, userEmail)
      const subject = header(message, 'Subject')
      const snippet = cleanSnippet(message.snippet)
      const intent = inferIntent({ subject, snippet, direction })
      const interactionDate = gmailDate(message)
      const notes = buildEmailNotes({
        subject,
        snippet,
        intent,
        from: header(message, 'From'),
        to: header(message, 'To'),
        threadId: message.threadId,
      })
      const opportunityId = await findOpportunityForGmailMessage(userId, contact, message, userEmail)

      const { error } = await supabase.from('interactions').insert({
        user_id: userId,
        contact_id: contact.id,
        opportunity_id: opportunityId,
        type: 'email',
        direction,
        notes,
        interaction_date: interactionDate,
        channel: 'email',
        external_id: `gmail_msg_${message.id}`,
      })

      if (error) {
        skipped++
        continue
      }

      synced++
      touched.add(contact.id)
      if (!latestInsertedDate || interactionDate > latestInsertedDate) {
        latestInsertedDate = interactionDate
      }
    }

    if (latestInsertedDate) await updateLastInteraction(contact, latestInsertedDate)
  }

  return { synced, skipped, contactsTouched: [...touched] }
}

export async function syncGmailInteractions(params: {
  contactId: string
  contactEmail: string
  attioRecordId?: string | null
  category?: string | null
  maxResults?: number
}): Promise<{ synced: number; skipped: number; error?: string }> {
  const result = await syncGmailInteractionsForContacts({
    contacts: [{ id: params.contactId, email: params.contactEmail }],
    maxPerContact: params.maxResults ?? 20,
  })
  return { synced: result.synced, skipped: result.skipped, error: result.error }
}

/** Check if current session has Gmail read access */
export async function hasGmailAccess(): Promise<boolean> {
  let token = await googleAccessToken()
  if (!token) token = await refreshGoogleAccessToken()
  if (!token) return false
  try {
    const { res } = await gmailFetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1',
      token,
    )
    return res.ok
  } catch {
    return false
  }
}
