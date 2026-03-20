import { useState, useCallback } from 'react'

const GEMINI_API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY as string | undefined
const GEMINI_MODEL = 'gemini-2.0-flash'

export interface EnrichResult {
  company_domain: string | null
  skills: string | null
  about: string | null
  relationship_context: string | null
  approach_angles: string | null
  enrichment_notes: string | null
}

interface UseContactEnricherReturn {
  enriching: boolean
  enrichError: string | null
  enrich: (opts: {
    name: string
    company?: string | null
    company_domain?: string | null
    job_title?: string | null
    about?: string | null
    personal_context?: string | null
    linkedin_url?: string | null
  }) => Promise<EnrichResult | null>
}

export function hasGeminiEnrichKey() {
  return !!GEMINI_API_KEY
}

export function useContactEnricher(): UseContactEnricherReturn {
  const [enriching, setEnriching] = useState(false)
  const [enrichError, setEnrichError] = useState<string | null>(null)

  const enrich = useCallback(async (opts: {
    name: string
    company?: string | null
    company_domain?: string | null
    job_title?: string | null
    about?: string | null
    personal_context?: string | null
    linkedin_url?: string | null
  }): Promise<EnrichResult | null> => {
    if (!GEMINI_API_KEY) return null
    setEnriching(true)
    setEnrichError(null)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    try {
      const prompt = [
        `You are a relationship intelligence assistant. Given information about a person, enrich their profile.`,
        ``,
        `Person: ${opts.name}`,
        opts.company ? `Company: ${opts.company}${opts.company_domain ? ` (${opts.company_domain})` : ''}` : '',
        opts.job_title ? `Job Title: ${opts.job_title}` : '',
        opts.about ? `About (LinkedIn): ${opts.about.substring(0, 500)}` : '',
        opts.personal_context ? `Personal Context: ${opts.personal_context}` : '',
        opts.linkedin_url ? `LinkedIn URL: ${opts.linkedin_url}` : '',
        ``,
        `Return a JSON object with these fields (omit fields you're not confident about):`,
        `{`,
        `  "company_domain": "string — the company's official website domain (e.g. granola.so), search the web",`,
        `  "skills": "string — 3-5 comma-separated professional skills based on their background",`,
        `  "about": "string — improved/expanded bio if the LinkedIn about is missing or too short",`,
        `  "relationship_context": "string — 1-2 sentences on why this person could be valuable based on the personal context",`,
        `  "approach_angles": "string — 2-3 specific ways to add value or start a conversation with this person",`,
        `  "enrichment_notes": "string — any other relevant context (mutual connections, recent news about their company, etc.)"`,
        `}`,
        `Only return valid JSON. No markdown, no explanation.`,
      ].filter(Boolean).join('\n')

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            tools: [{ google_search: {} }],
            // NOTE: responseMimeType is NOT set here — it is incompatible with google_search tool;
            // the response will be plain text that we parse manually.
          }),
        }
      )

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        const msg = (errBody as any)?.error?.message ?? `HTTP ${res.status}`
        throw new Error(msg)
      }

      const data = await res.json()
      const raw: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

      // Extract JSON from text response (may be wrapped in markdown or prose)
      const jsonStr = raw.match(/\{[\s\S]*\}/)?.[0] ?? 'null'
      const parsed: EnrichResult | null = JSON.parse(jsonStr)

      if (!parsed) throw new Error('No JSON found in Gemini response')

      return {
        company_domain: (parsed as any).company_domain || null,
        skills: (parsed as any).skills || null,
        about: (parsed as any).about || null,
        relationship_context: (parsed as any).relationship_context || null,
        approach_angles: (parsed as any).approach_angles || null,
        enrichment_notes: (parsed as any).enrichment_notes || null,
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') {
        setEnrichError('Enrichment timed out after 30 seconds.')
      } else {
        const msg = e instanceof Error ? e.message : String(e)
        setEnrichError(`Enrichment failed: ${msg}`)
      }
      return null
    } finally {
      clearTimeout(timeout)
      setEnriching(false)
    }
  }, [])

  return { enriching, enrichError, enrich }
}
