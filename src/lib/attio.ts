const BASE = 'https://api.attio.com'

function getApiKey(): string | null {
  return localStorage.getItem('attio_api_key')?.trim() ?? null
}

// ── Attio select option ID maps (workspace-specific) ──────────────────────────
const ATTIO_CATEGORY_OPTIONS: Record<string, string> = {
  peer:          '7f69457d-db06-4c23-84af-1f4d8d35497c',
  mentor:        'bdfae3cb-fa6d-4d90-9b0f-e8280c3f10b6',
  investor:      '12837d45-cc1c-43a7-b324-04ec21696814',
  client:        '2038c16d-d170-4709-a9e3-a780efca8fe2',
  collaborator:  'c5627708-856c-460d-ac22-025256f68360',
  community:     '6e63fbf0-5356-44c3-b11a-10e9b256c94f',
  family:        'af467c1c-ba81-45a1-bb1a-10bec578009a',
  other:         'd8df078a-e373-455c-90e4-c2bb8da84e97',
}

const ATTIO_STATUS_OPTIONS: Record<string, string> = {
  PROSPECT:  '4c74e487-8324-47a0-acca-7c217b2e3507',
  INTRO:     '5d60f4bd-b96e-45e6-ad0a-219f3b388691',
  CONNECTED: 'a1783f4e-530c-401d-a6f0-e6da89c92e7c',
  RECONNECT: 'c748396f-45c5-4b5f-aa08-f80059fcfc40',
  ENGAGED:   'f91b13ba-c8e8-461b-a672-6fb1c1eb95d2',
  NURTURING: '6ee1ef55-e590-46f5-b3d0-18169f01d720',
  DORMANT:   '8a3108aa-4fba-4760-a0f8-e8ef1d3d25ca',
}

// Known skills option IDs — new skills are created on-the-fly via API
const ATTIO_KNOWN_SKILLS: Record<string, string> = {
  'design':             '4e9a6739-d689-4123-b774-6d50a4c176cd',
  'community building': '0385e961-381d-46b2-9cfc-da2e9d98d410',
  'pr':                 'fecf8475-f9c1-4963-ba8d-b4777a3ff4e5',
  'product':            'ffb0d33c-5e2a-47b0-bae5-c2c8b006c69a',
}

/** Gets or creates a skill option in Attio, returns the option_id */
async function resolveSkillOption(apiKey: string, skillTitle: string): Promise<string | null> {
  const normalized = skillTitle.toLowerCase().trim()
  if (ATTIO_KNOWN_SKILLS[normalized]) return ATTIO_KNOWN_SKILLS[normalized]
  try {
    const res = await fetch(`${BASE}/v2/objects/people/attributes/skills/options`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { title: skillTitle.trim() } }),
    })
    if (!res.ok) return null
    const json = await res.json()
    const id = json?.data?.id?.option_id as string | undefined
    if (id) ATTIO_KNOWN_SKILLS[normalized] = id // cache for session
    return id ?? null
  } catch { return null }
}

export const hasAttioKey = (): boolean => !!getApiKey()

export interface AttioPersonResult {
  record_id: string
  full_name: string
  linkedin_url: string | null
  job_title?: string
  email?: string
}

interface AttioCreateResult {
  record_id: string
}

/** Creates a person record in Attio. Returns the Attio record_id, or throws on error. */
export async function createAttioPerson(values: {
  fullName: string
  linkedinUrl?: string | null
}): Promise<AttioCreateResult> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('No Attio API key configured')

  const nameParts = values.fullName.trim().split(' ')
  const firstName = nameParts[0] ?? ''
  const lastName = nameParts.slice(1).join(' ') || ''

  const personValues: Record<string, unknown> = {
    // Attio v2: name must be an array of name objects
    name: [{ first_name: firstName, last_name: lastName, full_name: values.fullName.trim() }],
  }
  if (values.linkedinUrl) {
    // Attio v2: URL attributes must be array of { value: "..." } objects
    personValues['linkedin_profile_url'] = [{ value: values.linkedinUrl }]
  }

  const res = await fetch(`${BASE}/v2/objects/people/records`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: { values: personValues } }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Attio error ${res.status}: ${text}`)
  }

  const json = await res.json()
  const recordId = json?.data?.id?.record_id as string | undefined
  if (!recordId) throw new Error('Attio response missing record_id')
  return { record_id: recordId }
}

/** Updates a person record in Attio. Non-blocking — caller should catch errors. */
export async function updateAttioPerson(
  recordId: string,
  values: { fullName?: string; linkedinUrl?: string | null }
): Promise<void> {
  const apiKey = getApiKey()
  if (!apiKey) return

  const personValues: Record<string, unknown> = {}

  if (values.fullName) {
    const nameParts = values.fullName.trim().split(' ')
    personValues['name'] = [{ first_name: nameParts[0] ?? '', last_name: nameParts.slice(1).join(' ') || '', full_name: values.fullName.trim() }]
  }
  if (values.linkedinUrl !== undefined) {
    personValues['linkedin_profile_url'] = values.linkedinUrl ? [{ value: values.linkedinUrl }] : []
  }

  if (Object.keys(personValues).length === 0) return

  const res = await fetch(`${BASE}/v2/objects/people/records/${recordId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: { values: personValues } }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Attio update error ${res.status}: ${text}`)
  }
}

/** Searches for people in Attio by name. Returns [] on any error (non-blocking). */
export async function searchAttioPersons(query: string): Promise<AttioPersonResult[]> {
  const apiKey = getApiKey()
  if (!apiKey || !query.trim()) return []

  try {
    // Attio v2: correct endpoint is /v2/objects/people/records/query
    const res = await fetch(`${BASE}/v2/objects/people/records/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: {
          name: { $contains: query.trim() },
        },
        limit: 5,
      }),
    })

    if (!res.ok) return []
    const json = await res.json()
    const records = json?.data as Array<Record<string, unknown>> | undefined
    if (!Array.isArray(records)) return []

    return records.map(r => {
      const values = r['values'] as Record<string, unknown> | undefined
      const nameObj = (values?.['name'] as Array<{ full_name?: string }> | undefined)?.[0]
      const linkedinArr = values?.['linkedin_profile_url'] as Array<{ value?: string }> | undefined
      const recordId = (r['id'] as Record<string, string> | undefined)?.['record_id'] ?? ''
      return {
        record_id: recordId,
        full_name: nameObj?.full_name ?? '',
        linkedin_url: linkedinArr?.[0]?.value ?? null,
      }
    }).filter(r => r.record_id && r.full_name)
  } catch {
    return []
  }
}

/** Fetches a single person record from Attio by record_id. Returns null on error. */
export async function getAttioPerson(recordId: string): Promise<Record<string, unknown> | null> {
  const apiKey = getApiKey()
  if (!apiKey) return null

  try {
    const res = await fetch(`${BASE}/v2/objects/people/records/${recordId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return null
    const json = await res.json()
    return json?.data ?? null
  } catch {
    return null
  }
}

/** Syncs all available fields for a contact to Attio. Creates or updates.
 *  Attribute formats follow Attio REST API v2 spec for the People object. */
export async function syncFullContact(contact: {
  attio_record_id?: string | null
  name: string
  email?: string | null
  phone?: string | null
  job_title?: string | null
  about?: string | null
  linkedin_url?: string | null
  location?: string | null
  category?: string | null
  status?: string | null
  health_score?: number | null
  skills?: string | null
  notes?: string | null
  followers_count?: number | string | null
  connections_count?: number | string | null
  company_domain?: string | null
  company_linkedin_url?: string | null
  attio_company_id?: string | null
  profile_photo_url?: string | null
}, options?: { includeNotes?: boolean }): Promise<{ record_id: string }> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('No Attio API key configured')
  if (contact.category === 'family') throw new Error('Family contacts are not synced to Attio')

  const nameParts = contact.name.trim().split(' ')
  const firstName = nameParts[0] ?? ''
  const lastName = nameParts.slice(1).join(' ') || ''

  // ── Core fields (standard Attio People attributes — always sent) ─────────
  const coreValues: Record<string, unknown> = {
    name: [{ first_name: firstName, last_name: lastName, full_name: contact.name.trim() }],
  }
  if (contact.email)     coreValues['email_addresses'] = [{ email_address: contact.email }]
  if (contact.phone)     coreValues['phone_numbers']   = [{ original_phone_number: contact.phone }]
  if (contact.job_title) coreValues['job_title']   = contact.job_title   // plain string
  if (contact.about)     coreValues['description'] = contact.about       // plain string
  // avatar_url is a protected system attribute in Attio — skip (Attio manages it automatically)
  // primary_location requires full structured address (line_1, country_code, lat/long) — skip

  // ── Custom fields (our 4 custom attributes + skills) — sent separately ───
  // Sent in a second PATCH so a bad slug never kills the core sync
  const customValues: Record<string, unknown> = {}
  // LinkedIn — slug varies by workspace; try 'linkedin' (fails silently if wrong)
  if (contact.linkedin_url) customValues['linkedin'] = [{ value: contact.linkedin_url }]
  if (contact.health_score != null) customValues['health_score'] = [{ value: contact.health_score }]
  if (contact.category && ATTIO_CATEGORY_OPTIONS[contact.category]) {
    customValues['category'] = [{ option: ATTIO_CATEGORY_OPTIONS[contact.category] }]
  }
  if (contact.status && ATTIO_STATUS_OPTIONS[contact.status]) {
    customValues['relationship_status'] = [{ option: ATTIO_STATUS_OPTIONS[contact.status] }]
  }
  if (contact.skills) {
    const skillTitles = contact.skills.split(',').map(s => s.trim()).filter(Boolean)
    const optionIds = (await Promise.all(skillTitles.map(s => resolveSkillOption(apiKey, s)))).filter(Boolean)
    if (optionIds.length > 0) customValues['skills'] = optionIds.map(id => ({ option: id }))
  }
  // LinkedIn social stats — slugs: linkedin_followers, linkedin_contacts (custom attributes, must be numbers)
  const followersNum = contact.followers_count != null ? (typeof contact.followers_count === 'number' ? contact.followers_count : parseInt(String(contact.followers_count).replace(/,/g, ''), 10)) : null
  const connectionsNum = contact.connections_count != null ? (typeof contact.connections_count === 'number' ? contact.connections_count : parseInt(String(contact.connections_count).replace(/,/g, ''), 10)) : null
  if (followersNum) customValues['linkedin_followers'] = [{ value: followersNum }]
  if (connectionsNum) customValues['linkedin_contacts'] = [{ value: connectionsNum }]

  const patchCustom = async (recordId: string): Promise<string | null> => {
    if (Object.keys(customValues).length === 0) return null
    const res = await fetch(`${BASE}/v2/objects/people/records/${recordId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { values: customValues } }),
    })
    if (!res.ok) { const t = await res.text(); return `Custom fields error ${res.status}: ${t}` }
    return null
  }

  const pushNote = async (recordId: string) => {
    if (!options?.includeNotes || !contact.notes?.trim()) return
    await fetch(`${BASE}/v2/notes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          parent_object: 'people',
          parent_record_id: recordId,
          title: 'reThink Notes',
          content: contact.notes.trim(),
          format: 'plaintext',
        },
      }),
    }) // fire-and-forget — notes are additive, failures are non-critical
  }

  if (contact.attio_record_id) {
    const res = await fetch(`${BASE}/v2/objects/people/records/${contact.attio_record_id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { values: coreValues } }),
    })
    if (!res.ok) { const t = await res.text(); throw new Error(`Attio update error ${res.status}: ${t}`) }
    const customErr = await patchCustom(contact.attio_record_id)
    if (customErr) throw new Error(customErr)
    await pushNote(contact.attio_record_id)
    // Link person to their company in Attio
    if (contact.attio_company_id) {
      try {
        await fetch(`${BASE}/v2/objects/companies/records/${contact.attio_company_id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: { values: { team: [{ target_object: 'people', target_record_id: contact.attio_record_id }] } } }),
        })
      } catch (_) {} // non-critical
    }
    return { record_id: contact.attio_record_id }
  } else {
    const res = await fetch(`${BASE}/v2/objects/people/records`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { values: coreValues } }),
    })
    if (!res.ok) { const t = await res.text(); throw new Error(`Attio create error ${res.status}: ${t}`) }
    const json = await res.json()
    const recordId = json?.data?.id?.record_id as string | undefined
    if (!recordId) throw new Error('Attio response missing record_id')
    const customErr = await patchCustom(recordId)
    if (customErr) throw new Error(customErr)
    await pushNote(recordId)
    // Link person to their company in Attio
    if (contact.attio_company_id) {
      try {
        await fetch(`${BASE}/v2/objects/companies/records/${contact.attio_company_id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: { values: { team: [{ target_object: 'people', target_record_id: recordId }] } } }),
        })
      } catch (_) {} // non-critical
    }
    return { record_id: recordId }
  }
}

/** Pulls contact data from Attio (only fields Attio may update). Used for auto-pull on drawer open. */
export async function pullFromAttio(recordId: string): Promise<{
  name?: string; email?: string; phone?: string; job_title?: string; location?: string
} | null> {
  const apiKey = getApiKey()
  if (!apiKey) return null
  try {
    const res = await fetch(`${BASE}/v2/objects/people/records/${recordId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return null
    const json = await res.json()
    const v = json?.data?.values as Record<string, unknown> | undefined
    if (!v) return null

    const nameArr = v['name'] as Array<{ full_name?: string }> | undefined
    const emailArr = v['email_addresses'] as Array<{ email_address?: string }> | undefined
    const phoneArr = v['phone_numbers'] as Array<{ phone_number?: string }> | undefined
    const locArr = v['primary_location'] as Array<{ locality?: string }> | undefined
    // job_title in Attio v2 is an array of objects [{value: "...", active_from: ..., ...}]
    const jobTitleArr = v['job_title'] as Array<{ value?: string }> | undefined

    return {
      name: nameArr?.[0]?.full_name,
      email: emailArr?.[0]?.email_address,
      phone: phoneArr?.[0]?.phone_number,
      job_title: jobTitleArr?.[0]?.value,
      location: locArr?.[0]?.locality,
    }
  } catch { return null }
}

/** Returns a patch object with only fields that differ between contact and Attio data.
 *  Only touches contact-data fields, never relationship fields. */
export function diffAttioFields(
  contact: { name: string; email?: string | null; phone?: string | null; job_title?: string | null; location?: string | null },
  attioData: { name?: string; email?: string; phone?: string; job_title?: string; location?: string } | null
): Record<string, string> {
  if (!attioData) return {}
  const diff: Record<string, string> = {}
  if (attioData.name && attioData.name !== contact.name) diff.name = attioData.name
  if (attioData.email && attioData.email !== contact.email) diff.email = attioData.email
  if (attioData.phone && attioData.phone !== contact.phone) diff.phone = attioData.phone
  if (attioData.job_title && attioData.job_title !== contact.job_title) diff.job_title = attioData.job_title
  if (attioData.location && attioData.location !== contact.location) diff.location = attioData.location
  return diff
}

/** Fetches ALL person records from Attio (paginated, up to 500). Used for sync comparison. */
export async function listAllAttioPersons(): Promise<AttioPersonResult[]> {
  const apiKey = getApiKey()
  if (!apiKey) return []

  const results: AttioPersonResult[] = []
  let offset = 0
  const limit = 100

  try {
    while (true) {
      const res = await fetch(`${BASE}/v2/objects/people/records/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit, offset }),
      })
      if (!res.ok) break
      const json = await res.json()
      const records = json?.data as Array<Record<string, unknown>> | undefined
      if (!Array.isArray(records) || records.length === 0) break

      for (const r of records) {
        const values = r['values'] as Record<string, unknown> | undefined
        const nameObj = (values?.['name'] as Array<{ full_name?: string }> | undefined)?.[0]
        const linkedinArr = values?.['linkedin_profile_url'] as Array<{ value?: string }> | undefined
        const jobArr = values?.['job_title'] as Array<{ value?: string }> | undefined
        const emailArr = values?.['email_addresses'] as Array<{ email_address?: string }> | undefined
        const recordId = (r['id'] as Record<string, string> | undefined)?.['record_id'] ?? ''
        if (!recordId || !nameObj?.full_name) continue
        results.push({
          record_id: recordId,
          full_name: nameObj.full_name,
          linkedin_url: linkedinArr?.[0]?.value ?? null,
          job_title: jobArr?.[0]?.value ?? undefined,
          email: emailArr?.[0]?.email_address ?? undefined,
        } as AttioPersonResult & { job_title?: string; email?: string })
      }

      if (records.length < limit) break
      offset += limit
    }
  } catch { /* non-blocking */ }

  return results
}

/** Creates a task in Attio linked to a person record. */
export async function createAttioTask(
  attioRecordId: string,
  text: string,
  dueDate?: string | null
): Promise<{ task_id: string } | null> {
  const apiKey = getApiKey()
  if (!apiKey) return null
  try {
    const res = await fetch(`${BASE}/v2/tasks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          content: text,
          deadline_at: dueDate ? `${dueDate}T23:59:59Z` : null,
          linked_records: [{ target_object: 'people', target_record_id: attioRecordId }],
          is_completed: false,
        },
      }),
    })
    if (!res.ok) return null
    const json = await res.json()
    const taskId = json?.data?.id?.task_id as string | undefined
    return taskId ? { task_id: taskId } : null
  } catch { return null }
}

/** Marks an Attio task as completed. Fire-and-forget. */
export async function completeAttioTask(taskId: string): Promise<void> {
  const apiKey = getApiKey()
  if (!apiKey) return
  try {
    await fetch(`${BASE}/v2/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { is_completed: true } }),
    })
  } catch { /* fire and forget */ }
}

/** Syncs both person and company (if domain exists) to Attio in one call.
 *  Returns both record IDs (company_record_id may be null if no domain). */
export async function syncAll(contact: {
  attio_record_id?: string | null
  name: string
  email?: string | null
  phone?: string | null
  job_title?: string | null
  about?: string | null
  linkedin_url?: string | null
  location?: string | null
  category?: string | null
  status?: string | null
  health_score?: number | null
  skills?: string | null
  notes?: string | null
  followers_count?: number | string | null
  connections_count?: number | string | null
  company_domain?: string | null
  company?: string | null
  company_linkedin_url?: string | null
  attio_company_id?: string | null
  profile_photo_url?: string | null
}): Promise<{ person_record_id: string; company_record_id: string | null }> {
  const personResult = await syncFullContact(contact, { includeNotes: true })
  let company_record_id: string | null = null
  if (contact.company_domain) {
    const companyResult = await syncCompanyToAttio({
      domain: contact.company_domain,
      name: contact.company ?? undefined,
      existingCompanyId: contact.attio_company_id,
    })
    company_record_id = companyResult.record_id
  }
  return { person_record_id: personResult.record_id, company_record_id }
}

/** Creates a Note in Attio for a logged interaction. Fire-and-forget. */
export async function pushInteractionNote(
  attioRecordId: string,
  interaction: { type: string; direction: string; notes?: string | null; interaction_date: string }
): Promise<void> {
  const apiKey = getApiKey()
  if (!apiKey) return
  const typeLabel = interaction.type.charAt(0).toUpperCase() + interaction.type.slice(1).toLowerCase()
  const dirLabel = interaction.direction === 'inbound' ? '↙ Inbound' : '↗ Outbound'
  const title = `${typeLabel} — ${dirLabel} (${interaction.interaction_date})`
  const content = interaction.notes?.trim() || `${typeLabel} interaction logged from reThink`
  try {
    await fetch(`${BASE}/v2/notes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          parent_object: 'people',
          parent_record_id: attioRecordId,
          title,
          content,
          format: 'plaintext',
        },
      }),
    })
  } catch { /* fire and forget */ }
}

/** Creates or updates a Company record in Attio using the domain for enrichment.
 *  Returns the Attio company record_id. */
export async function syncCompanyToAttio(opts: {
  name?: string | null
  domain: string
  existingCompanyId?: string | null
}): Promise<{ record_id: string }> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('No Attio API key configured')

  const values: Record<string, unknown> = {
    domains: [{ domain: opts.domain.replace(/^https?:\/\//, '').replace(/\/$/, '') }],
  }
  if (opts.name) values['name'] = [{ value: opts.name }]

  if (opts.existingCompanyId) {
    const res = await fetch(`${BASE}/v2/objects/companies/records/${opts.existingCompanyId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { values } }),
    })
    if (!res.ok) { const t = await res.text(); throw new Error(`Attio company update error ${res.status}: ${t}`) }
    return { record_id: opts.existingCompanyId }
  } else {
    const res = await fetch(`${BASE}/v2/objects/companies/records`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { values } }),
    })
    if (!res.ok) { const t = await res.text(); throw new Error(`Attio company create error ${res.status}: ${t}`) }
    const json = await res.json()
    const recordId = json?.data?.id?.record_id as string | undefined
    if (!recordId) throw new Error('Attio company response missing record_id')
    return { record_id: recordId }
  }
}
