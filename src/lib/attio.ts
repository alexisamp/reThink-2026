const BASE = 'https://api.attio.com'

function getApiKey(): string | null {
  return localStorage.getItem('attio_api_key')?.trim() ?? null
}

export const hasAttioKey = (): boolean => !!getApiKey()

export interface AttioPersonResult {
  record_id: string
  full_name: string
  linkedin_url: string | null
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
