import { supabase } from '@/lib/supabase'

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const SYNC_THROTTLE_MS = 5 * 60 * 1000
const SYNC_KEY = 'rethink.job-applications.last-sync'

interface GmailHeader {
  name: string
  value: string
}

interface GmailPart {
  mimeType?: string
  body?: { data?: string }
  parts?: GmailPart[]
}

interface GmailMessage {
  id: string
  internalDate?: string
  snippet?: string
  payload?: GmailPart & { headers?: GmailHeader[] }
}

interface OpportunityRow {
  id: string
  title: string
  stage: string
  applied_at: string | null
  created_at: string
  notes: string | null
  application_confirmation_id: string | null
  company_id: string | null
  company: { id: string; name: string } | Array<{ id: string; name: string }> | null
}

interface ParsedApplication {
  company: string | null
  role: string | null
}

export interface JobApplicationSyncResult {
  status: 'synced' | 'throttled' | 'disconnected' | 'error'
  matched: number
  created: number
  unmatched: number
  changed: boolean
}

function normalize(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&amp;/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function companyFor(opportunity: OpportunityRow) {
  if (Array.isArray(opportunity.company)) return opportunity.company[0] ?? null
  return opportunity.company
}

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find(item => item.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function decodeBase64Url(value: string) {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(padded), character => character.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return ''
  }
}

function messageBody(part: GmailPart | undefined): string {
  if (!part) return ''
  const own = part.body?.data ? decodeBase64Url(part.body.data) : ''
  const children = (part.parts ?? []).map(messageBody).join('\n')
  return `${own}\n${children}`
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanCapture(value: string | undefined) {
  return value?.replace(/\s+/g, ' ').replace(/^["']|["']$/g, '').replace(/[.!,:;\s]+$/, '').trim() || null
}

function senderCompany(sender: string) {
  const display = sender.replace(/<[^>]+>/g, '').replace(/^['"]|['"]$/g, '').trim()
  return cleanCapture(display.replace(/\s+(Hiring|Talent|Recruiting|Careers?)\s+Team$/i, ''))
}

function parseApplication(subject: string, body: string, sender: string): ParsedApplication {
  const text = `${subject}\n${body}`
  const apply4Me = text.match(/application sent[^:]*:\s*(.+?)\s+at\s+([^.!\n]+)[.!]?/i)
  if (apply4Me) return { role: cleanCapture(apply4Me[1]), company: cleanCapture(apply4Me[2]) }

  const withCompany = text.match(/applying to (?:the )?(.+?) role with ([^,.!\n]+)/i)
  if (withCompany) return { role: cleanCapture(withCompany[1]), company: cleanCapture(withCompany[2]) }

  const joiningAs = text.match(/joining ([^.!\n]+?) as (?:a|an) (.+?)(?:\.|\n| we have)/i)
  if (joiningAs) return { company: cleanCapture(joiningAs[1]), role: cleanCapture(joiningAs[2]) }

  const companyFromSubject = subject.match(/(?:applying to(?: work with)?|application to|application at)\s+([^!|:]+)/i)
    ?? subject.match(/^(.+?) received your application/i)
  const roleFromBody = text.match(/(?:application for|apply for|application to) (?:the )?(.+?) (?:role|position|opening)(?:\s|[,.!])/i)
    ?? text.match(/received your application for (?:the )?(.+?)(?:\.\s|,\s| we will| our hiring|$)/i)
  return {
    company: cleanCapture(companyFromSubject?.[1]) ?? senderCompany(sender),
    role: cleanCapture(roleFromBody?.[1]),
  }
}

function isApplicationConfirmation(subject: string, body: string) {
  const text = normalize(`${subject} ${body.slice(0, 1200)}`)
  const confirmation = /thank(?:s| you) for apply|application received|received your application|application (?:was )?sent|successfully received your application|taking the time to apply/.test(text)
  const rejection = /update on your application|not moving forward|decided not to proceed|other candidates/.test(text)
  return confirmation && !rejection
}

function findOpportunity(opportunities: OpportunityRow[], parsed: ParsedApplication, searchableText: string) {
  const text = normalize(searchableText)
  const role = normalize(parsed.role)
  const company = normalize(parsed.company)
  const jobIds = new Set((`${parsed.role ?? ''} ${searchableText}`.match(/\b\d{7,9}\b/g) ?? []))
  const scored = opportunities.map(opportunity => {
    const title = normalize(opportunity.title)
    const opportunityCompany = normalize(companyFor(opportunity)?.name)
    const companyMatches = !company || !opportunityCompany
      || company.includes(opportunityCompany)
      || opportunityCompany.includes(company)
      || text.includes(opportunityCompany)
    let score = 0
    if (companyMatches && company && opportunityCompany) score += 10
    if (title.length >= 6 && role && (role.includes(title) || title.includes(role))) score += 50
    else if (title.length >= 6 && text.includes(title)) score += 35
    if ([...jobIds].some(id => opportunity.title.includes(id) || (opportunity.notes ?? '').includes(id))) score += 100
    if (!companyMatches && score < 100) score = 0
    return { opportunity, score }
  }).filter(candidate => candidate.score >= 35)
    .sort((a, b) => b.score - a.score || a.opportunity.created_at.localeCompare(b.opportunity.created_at))
  if (scored.length > 0) return scored[0].opportunity

  if (!company) return null
  const companyMatches = opportunities.filter(opportunity => {
    const candidate = normalize(companyFor(opportunity)?.name)
    return candidate && (company.includes(candidate) || candidate.includes(company))
  })
  return companyMatches.length === 1 ? companyMatches[0] : null
}

async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const stored = session.provider_token ?? (session.user.user_metadata?.google_access_token as string | undefined) ?? null
  if (!stored) return null

  const probe = await fetch(`${GMAIL_API}/messages?maxResults=1`, { headers: { Authorization: `Bearer ${stored}` } })
  if (probe.ok) return stored
  if (probe.status !== 401 && probe.status !== 403) return stored

  const { data, error } = await supabase.functions.invoke('google-refresh-token', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (error) return null
  return (data as { access_token?: string } | null)?.access_token ?? null
}

async function gmailMessages(token: string) {
  const query = 'newer_than:180d {subject:"thank you for applying" subject:"thanks for applying" subject:"application received" subject:"received your application" subject:"application was sent" subject:"application sent"}'
  const ids: string[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({ q: query, maxResults: '100' })
    if (pageToken) params.set('pageToken', pageToken)
    const response = await fetch(`${GMAIL_API}/messages?${params}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) throw new Error(`Gmail search failed (${response.status})`)
    const page = await response.json() as { messages?: Array<{ id: string }>; nextPageToken?: string }
    ids.push(...(page.messages ?? []).map(message => message.id))
    pageToken = page.nextPageToken
  } while (pageToken && ids.length < 300)

  const messages: GmailMessage[] = []
  for (let index = 0; index < ids.length; index += 10) {
    const batch = ids.slice(index, index + 10)
    const loaded = await Promise.all(batch.map(async id => {
      const response = await fetch(`${GMAIL_API}/messages/${id}?format=full`, { headers: { Authorization: `Bearer ${token}` } })
      return response.ok ? await response.json() as GmailMessage : null
    }))
    messages.push(...loaded.filter((message): message is GmailMessage => Boolean(message)))
  }
  return messages
}

function validStructuredApplication(parsed: ParsedApplication) {
  const company = parsed.company?.trim() ?? ''
  const role = parsed.role?.trim() ?? ''
  return company.length >= 2 && company.length <= 100 && role.length >= 4 && role.length <= 180
}

async function createOpportunity(userId: string, parsed: ParsedApplication, receivedAt: string, confirmationId: string) {
  if (!validStructuredApplication(parsed)) return null
  const companyName = parsed.company as string
  const role = parsed.role as string
  const { data: existingCompanies } = await supabase
    .from('companies')
    .select('id, name')
    .eq('user_id', userId)
    .ilike('name', companyName)
    .limit(2)
  let companyId = existingCompanies?.length === 1 ? existingCompanies[0].id : null
  if (!companyId) {
    const { data: createdCompany, error } = await supabase
      .from('companies')
      .insert({ user_id: userId, name: companyName, source: 'gmail_application_confirmation' })
      .select('id')
      .single()
    if (error) return null
    companyId = createdCompany.id
  }
  const { data, error } = await supabase.from('opportunities').insert({
    user_id: userId,
    company_id: companyId,
    title: role,
    type: 'job',
    stage: 'applied',
    applied_at: receivedAt,
    application_confirmation_id: confirmationId,
    application_source_name: 'Gmail confirmation',
    notes: 'Application confirmed from Gmail.',
  }).select('id').single()
  if (!error) return data.id as string
  if (error.code === '23505') {
    const { data: existing } = await supabase.from('opportunities')
      .select('id')
      .eq('user_id', userId)
      .eq('application_confirmation_id', confirmationId)
      .maybeSingle()
    return existing?.id ?? null
  }
  return null
}

let activeSync: Promise<JobApplicationSyncResult> | null = null

async function runJobApplicationSync(userId: string, force = false): Promise<JobApplicationSyncResult> {
  const empty = { matched: 0, created: 0, unmatched: 0, changed: false }
  const lastSync = Number(localStorage.getItem(SYNC_KEY) ?? 0)
  if (!force && Date.now() - lastSync < SYNC_THROTTLE_MS) return { status: 'throttled', ...empty }

  const token = await accessToken()
  if (!token) return { status: 'disconnected', ...empty }

  try {
    const [{ data: opportunitiesData, error: opportunitiesError }, messages] = await Promise.all([
      supabase.from('opportunities')
        .select('id, title, stage, applied_at, created_at, notes, application_confirmation_id, company_id, company:companies(id, name)')
        .eq('user_id', userId)
        .eq('type', 'job'),
      gmailMessages(token),
    ])
    if (opportunitiesError) throw opportunitiesError
    const opportunities = (opportunitiesData ?? []) as OpportunityRow[]
    let matched = 0
    let created = 0
    let unmatched = 0
    let changed = false

    for (const message of messages) {
      const subject = header(message, 'Subject')
      const sender = header(message, 'From')
      const body = messageBody(message.payload) || message.snippet || ''
      if (!isApplicationConfirmation(subject, body)) continue
      const receivedDate = message.internalDate
        ? new Date(Number(message.internalDate))
        : new Date(header(message, 'Date'))
      if (!Number.isFinite(receivedDate.getTime())) continue
      const receivedAt = receivedDate.toISOString()

      const parsed = parseApplication(subject, body, sender)
      const { data: confirmation, error: confirmationError } = await supabase
        .from('job_application_confirmations')
        .upsert({
          user_id: userId,
          gmail_message_id: message.id,
          subject,
          sender,
          received_at: receivedAt,
          company_name: parsed.company,
          role_title: parsed.role,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,gmail_message_id' })
        .select('id, opportunity_id')
        .single()
      if (confirmationError || !confirmation) continue

      let opportunity = confirmation.opportunity_id
        ? opportunities.find(candidate => candidate.id === confirmation.opportunity_id) ?? null
        : findOpportunity(opportunities, parsed, `${subject} ${body}`)
      let opportunityId = opportunity?.id ?? null
      let matchStatus: 'matched' | 'created' | 'unmatched' = opportunity ? 'matched' : 'unmatched'

      if (!opportunityId && validStructuredApplication(parsed)) {
        opportunityId = await createOpportunity(userId, parsed, receivedAt, confirmation.id)
        if (opportunityId) {
          matchStatus = 'created'
          opportunities.push({ id: opportunityId, title: parsed.role as string, stage: 'applied', applied_at: receivedAt, created_at: new Date().toISOString(), notes: 'Application confirmed from Gmail.', application_confirmation_id: confirmation.id, company_id: null, company: parsed.company ? { id: '', name: parsed.company } : null })
          created++
          changed = true
        }
      }

      if (opportunity && opportunityId) {
        const existingAppliedAt = opportunity.applied_at ? new Date(opportunity.applied_at).getTime() : Number.POSITIVE_INFINITY
        const confirmationAt = new Date(receivedAt).getTime()
        const update: { applied_at?: string; stage?: string } = {}
        if (confirmationAt < existingAppliedAt) update.applied_at = receivedAt
        if (['exploring', 'ready_to_apply'].includes(opportunity.stage.toLowerCase())) update.stage = 'applied'
        if (Object.keys(update).length > 0) {
          const { error } = await supabase.from('opportunities').update(update).eq('id', opportunityId).eq('user_id', userId)
          if (!error) changed = true
        }
        matched++
      } else if (!opportunityId) {
        unmatched++
      }

      await supabase.from('job_application_confirmations').update({
        opportunity_id: opportunityId,
        match_status: matchStatus,
        updated_at: new Date().toISOString(),
      }).eq('id', confirmation.id).eq('user_id', userId)
    }
    localStorage.setItem(SYNC_KEY, String(Date.now()))
    return { status: 'synced', matched, created, unmatched, changed }
  } catch (error) {
    console.warn('Gmail application reconciliation failed:', error)
    return { status: 'error', ...empty }
  }
}

export function syncJobApplicationsFromGmail(userId: string, force = false): Promise<JobApplicationSyncResult> {
  if (activeSync) return activeSync
  const run = () => runJobApplicationSync(userId, force)
  const pending: Promise<JobApplicationSyncResult> = 'locks' in navigator
    ? navigator.locks.request('rethink-job-application-sync', run).then(result => result)
    : run()
  const tracked = pending.finally(() => { activeSync = null })
  activeSync = tracked
  return tracked
}
