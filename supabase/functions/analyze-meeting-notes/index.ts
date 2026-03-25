import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  // Verify Supabase JWT — reject unauthenticated callers
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const body = await req.json()
  const { contact_name, notes, meeting_date } = body

  if (!contact_name || typeof contact_name !== 'string') {
    return new Response(JSON.stringify({ error: 'contact_name is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (!notes || typeof notes !== 'string') {
    return new Response(JSON.stringify({ error: 'notes is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (!meeting_date || typeof meeting_date !== 'string') {
    return new Response(JSON.stringify({ error: 'meeting_date is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const prompt = `You are a relationship intelligence assistant. Analyze the following meeting notes and extract structured data.

Contact name: ${contact_name}
Meeting date: ${meeting_date}
Meeting notes:
${notes}

Return a JSON object (no markdown, no explanation, just raw JSON) with:
1. "milestones": array of relationship milestones extracted from the notes (birthdays, anniversaries, important upcoming events, commitments/follow-ups with a specific date). For each:
   - type: one of birthday_contact, birthday_child, birthday_partner, anniversary, anniversary_work, custom
   - label: short descriptive label
   - isAnnual: true if it repeats yearly (birthdays, anniversaries), false if one-time
   - date_mm_dd: "MM-DD" string only if isAnnual=true and you know the date (e.g. "07-15")
   - date_full: "YYYY-MM-DD" string only if isAnnual=false and you know the date
   - show_days_before: 7 for birthdays/anniversaries, 3 for other events
   - notes: optional short note

2. "context_bullets": array of 2-5 short strings capturing key insights about this person from the notes (professional situation, interests, personal context, relationship notes). Each bullet max 15 words.

3. "interaction_type": "in_person" if the meeting was in-person, "virtual_coffee" if virtual/online.

4. "meeting_summary": one sentence summarizing what was discussed.

Return only valid JSON. If no milestones found, return empty array. If no context bullets, return empty array.`

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    }),
  })

  // Check Anthropic API success before parsing
  if (!response.ok) {
    const errBody = await response.text()
    console.error('Anthropic API error:', response.status, errBody)
    return new Response(JSON.stringify({ error: 'AI service temporarily unavailable. Try again in a moment.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  const data = await response.json()
  const rawText = data?.content?.[0]?.text ?? ''

  const fallback = {
    milestones: [],
    context_bullets: [],
    interaction_type: 'virtual_coffee',
    meeting_summary: '',
  }

  let parsed
  try {
    parsed = JSON.parse(rawText)
  } catch (_e) {
    console.error('Failed to parse Claude response as JSON:', rawText)
    parsed = fallback
  }

  return new Response(JSON.stringify(parsed), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
})
