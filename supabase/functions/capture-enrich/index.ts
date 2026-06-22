import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

type EntityType = 'company' | 'person' | 'opportunity'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return json({ error: 'Unauthorized' }, 401)

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) return json({ error: 'GEMINI_API_KEY not configured' }, 500)

  const body = await req.json() as {
    entity_type?: EntityType
    entity_id?: string
    snapshot_id?: string | null
    markdown?: string
  }

  if (!body.entity_type || !body.entity_id || !body.markdown) {
    return json({ error: 'entity_type, entity_id and markdown are required' }, 400)
  }

  if (body.snapshot_id) {
    await supabase
      .from('capture_snapshots')
      .update({ enrichment_status: 'queued' })
      .eq('id', body.snapshot_id)
      .eq('user_id', user.id)
  }

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptFor(body.entity_type, body.markdown.slice(0, 80_000)) }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
    })

    if (!response.ok) {
      const detail = await response.text()
      if (body.snapshot_id) {
        await supabase.from('capture_snapshots').update({ enrichment_status: 'failed' }).eq('id', body.snapshot_id)
      }
      return json({ error: `Gemini request failed (${response.status})`, detail }, 502)
    }

    const gemini = await response.json()
    const raw = gemini?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(raw)
    } catch {
      payload = { raw }
    }

    const appliedFields = await applyFields(supabase, user.id, body.entity_type, body.entity_id, payload)

    const { data: staged, error } = await supabase
      .from('conversation_ai_staged_outputs')
      .upsert({
        user_id: user.id,
        source_key: `capture:${body.entity_type}:${body.entity_id}`,
        dedupe_key: `capture:${body.snapshot_id ?? body.entity_id}:gemini`,
        target: 'review_item',
        title: `Enriched ${body.entity_type}`,
        body: `AI fields were applied to the captured ${body.entity_type}.`,
        payload: {
          entity_type: body.entity_type,
          entity_id: body.entity_id,
          snapshot_id: body.snapshot_id ?? null,
          proposed_fields: payload,
          applied_fields: appliedFields,
        },
        // Fields are applied directly to the entity above (applyFields), so this
        // staged row is an audit record, not a pending proposal. 'synced' is the
        // applied/done state allowed by the status check constraint; it keeps the
        // row out of the review queue (which fetches only pending/failed).
        status: 'synced',
      }, {
        onConflict: 'user_id,dedupe_key',
      })
      .select('id')
      .single()

    if (error) return json({ error: error.message }, 500)

    if (body.snapshot_id) {
      await supabase
        .from('capture_snapshots')
        .update({
          enrichment_status: 'complete',
          metadata: {
            ai_staged_output_id: staged.id,
            ai_applied_fields: appliedFields,
          },
        })
        .eq('id', body.snapshot_id)
        .eq('user_id', user.id)
    }

    return json({ staged_output_id: staged.id, proposed_fields: payload, applied_fields: appliedFields })
  } catch (error) {
    if (body.snapshot_id) {
      await supabase.from('capture_snapshots').update({ enrichment_status: 'failed' }).eq('id', body.snapshot_id)
    }
    return json({ error: error instanceof Error ? error.message : 'AI enrichment failed' }, 500)
  }
})

async function applyFields(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  entityType: EntityType,
  entityId: string,
  payload: Record<string, unknown>,
) {
  if (entityType === 'company') {
    const patch = compact({
      name: stringValue(payload.name),
      domain: firstString(payload.domains) ?? stringValue(payload.domain),
      description: stringValue(payload.description),
      hq_location: stringValue(payload.primary_location),
      linkedin_url: stringValue(payload.linkedin),
      sector: firstString(payload.categories),
      last_enriched_at: new Date().toISOString(),
    })
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('companies').update(patch).eq('id', entityId).eq('user_id', userId)
      if (error) throw new Error(error.message)
    }
    return patch
  }

  if (entityType === 'person') {
    const companyName = entityName(payload.company)
    const company = companyName ? await ensureCompany(supabase, userId, companyName) : null
    const patch = compact({
      name: stringValue(payload.name),
      email: firstString(payload.email_addresses),
      personal_context: stringValue(payload.description),
      job_title: stringValue(payload.job_title),
      phone: firstString(payload.phone_numbers),
      location: stringValue(payload.primary_location),
      linkedin_url: stringValue(payload.linkedin),
      company: company?.name ?? companyName,
      company_id: company?.id,
      ai_enriched_at: new Date().toISOString(),
    })
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('outreach_logs').update(patch).eq('id', entityId).eq('user_id', userId)
      if (error) throw new Error(error.message)
    }
    return patch
  }

  const companyName = entityName(payload.associated_company)
  const company = companyName ? await ensureCompany(supabase, userId, companyName) : null
  const patch = compact({
    title: stringValue(payload.name),
    stage: stageValue(payload.stage),
    estimated_value: numberValue(payload.value),
    notes: stringValue(payload.summary),
    company_id: company?.id,
  })
  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from('opportunities').update(patch).eq('id', entityId).eq('user_id', userId)
    if (error) throw new Error(error.message)
  }
  await linkOpportunityPeople(supabase, userId, entityId, stringArray(payload.associated_people))
  return patch
}

async function ensureCompany(supabase: ReturnType<typeof createClient>, userId: string, name: string) {
  const clean = name.trim()
  if (!clean) return null
  const { data: existing } = await supabase
    .from('companies')
    .select('id, name, domain')
    .eq('user_id', userId)
    .ilike('name', clean)
    .limit(1)
    .maybeSingle()
  if (existing) return existing

  const { data, error } = await supabase
    .from('companies')
    .insert({ user_id: userId, name: clean, source: 'ai_capture', account_stage: 'captured' })
    .select('id, name, domain')
    .single()
  if (error) throw new Error(error.message)
  return data
}

async function linkOpportunityPeople(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  opportunityId: string,
  people: string[],
) {
  for (const person of people) {
    const { data } = await supabase
      .from('outreach_logs')
      .select('id')
      .eq('user_id', userId)
      .ilike('name', person)
      .limit(1)
      .maybeSingle()
    if (!data?.id) continue
    await supabase
      .from('opportunity_contacts')
      .upsert({ opportunity_id: opportunityId, outreach_log_id: data.id, role: 'associated' }, { onConflict: 'opportunity_id,outreach_log_id' })
  }
}

function promptFor(entityType: EntityType, markdown: string) {
  return `
You enrich CRM records from a raw browser capture.
Return only JSON. Do not include markdown or prose.

Entity type: ${entityType}

For company return keys: name, domains, description, categories, primary_location, linkedin, twitter, facebook, instagram.
For person return keys: name, email_addresses, description, job_title, company, phone_numbers, primary_location, linkedin, twitter, facebook, instagram, relationship_type.
For opportunity return keys: name, stage, value, associated_company, associated_people, summary, fit_signals, risks.
Use null or [] when unknown. Keep confidence per field in a "confidence" object from 0 to 1.

Raw capture:
${markdown}
`.trim()
}

function compact(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ''))
}

function stringValue(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number') return String(value)
  return null
}

function firstString(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = stringValue(item)
      if (text) return text
    }
    return null
  }
  return stringValue(value)
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    const text = entityName(value)
    return text ? [text] : []
  }
  return value.map(entityName).filter((entry): entry is string => Boolean(entry))
}

function entityName(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  return stringValue(record.name) ?? stringValue(record.title) ?? stringValue(record.value)
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const parsed = Number(value.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function stageValue(value: unknown): 'exploring' | 'active' | 'negotiating' | 'won' | 'lost' | null {
  const text = stringValue(value)?.toLowerCase()
  if (!text) return null
  if (text.includes('won')) return 'won'
  if (text.includes('lost')) return 'lost'
  if (text.includes('progress') || text.includes('active')) return 'active'
  if (text.includes('negotiat')) return 'negotiating'
  if (text.includes('lead') || text.includes('explor')) return 'exploring'
  return null
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
