import { useState, useCallback } from 'react'

const GEMINI_API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY as string | undefined
const GEMINI_MODEL = 'gemini-2.0-flash'

export interface EnrichResult {
  company_domain: string | null
  skills_suggestions: string[]
  enriched_about: string | null
}

interface UseContactEnricherReturn {
  enriching: boolean
  enrichError: string | null
  enrich: (opts: { name: string; company?: string | null; job_title?: string | null; about?: string | null }) => Promise<EnrichResult | null>
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
    job_title?: string | null
    about?: string | null
  }): Promise<EnrichResult | null> => {
    if (!GEMINI_API_KEY) return null
    setEnriching(true)
    setEnrichError(null)
    try {
      const prompt = [
        `You are a professional contact enrichment assistant. Use web search to find accurate data.`,
        `Person: ${opts.name}`,
        opts.job_title ? `Role: ${opts.job_title}` : '',
        opts.company ? `Company: ${opts.company}` : '',
        opts.about ? `Bio excerpt: ${opts.about.substring(0, 300)}` : '',
        ``,
        `Tasks:`,
        opts.company
          ? `1. Find the official website domain for the company "${opts.company}" (e.g. "granola.so", "fintual.com"). Return just the clean domain, no protocol or paths.`
          : `1. company_domain: null (no company provided)`,
        `2. Suggest 3-5 relevant professional skills based on their role and company. Be specific (e.g. "growth marketing", "product strategy", "B2B sales").`,
        `3. If their bio is truncated or missing, write a 1-sentence professional summary (max 100 chars). Otherwise return null.`,
        ``,
        `Respond ONLY with valid JSON (no markdown):`,
        `{"company_domain": "string or null", "skills_suggestions": ["skill1", "skill2"], "enriched_about": "string or null"}`,
      ].filter(Boolean).join('\n')

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            tools: [{ google_search: {} }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      )
      const data = await res.json()
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      const parsed: EnrichResult = JSON.parse(raw.replace(/```json|```/g, '').trim())
      return {
        company_domain: parsed.company_domain || null,
        skills_suggestions: Array.isArray(parsed.skills_suggestions) ? parsed.skills_suggestions : [],
        enriched_about: parsed.enriched_about || null,
      }
    } catch (e) {
      setEnrichError('Enrichment failed. Try again.')
      return null
    } finally {
      setEnriching(false)
    }
  }, [])

  return { enriching, enrichError, enrich }
}
