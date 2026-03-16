import { useState, useCallback } from 'react'

export interface ScoringResult {
  score: number
  corrected: string
  explanation: string
}

interface UseGeminiScorerReturn {
  result: ScoringResult | null
  loading: boolean
  error: string | null
  scoreText: (text: string) => Promise<void>
  clear: () => void
}

const GEMINI_API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY as string | undefined

export const hasGeminiKey = !!GEMINI_API_KEY

export function useGeminiScorer(): UseGeminiScorerReturn {
  const [result, setResult] = useState<ScoringResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scoreText = useCallback(async (text: string) => {
    if (!GEMINI_API_KEY || !text.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const prompt = `You are an English writing coach. Score this text 1-10 for English quality and naturalness, provide a corrected version, and explain in 1-2 sentences what to improve. If already excellent, say so. Text: "${text.trim()}". Respond ONLY with valid JSON: {"score": number, "corrected": "string", "explanation": "string"}`
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      )
      const data = await res.json()
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      const parsed: ScoringResult = JSON.parse(raw)
      setResult(parsed)
    } catch {
      setError('No se pudo evaluar. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }, [])

  const clear = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return { result, loading, error, scoreText, clear }
}
