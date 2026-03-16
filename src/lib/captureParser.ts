import type { CaptureType } from '@/types'

const CAPTURE_TYPES: CaptureType[] = ['idea', 'learning', 'reflection', 'decision', 'win', 'question']

// Old block format: /type title (full line)
const BLOCK_RE = /^\/(\w+)\s+(.+)$/gm
// New inline format: [~type:title~]
const INLINE_RE = /\[~(\w+):([^\]~]+)~\]/g

export function parseJournalCaptures(text: string): Array<{ type: CaptureType; title: string }> {
  const results: Array<{ type: CaptureType; title: string }> = []
  let m: RegExpExecArray | null

  INLINE_RE.lastIndex = 0
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (CAPTURE_TYPES.includes(m[1] as CaptureType)) {
      results.push({ type: m[1] as CaptureType, title: m[2] })
    }
  }

  BLOCK_RE.lastIndex = 0
  while ((m = BLOCK_RE.exec(text)) !== null) {
    if (CAPTURE_TYPES.includes(m[1] as CaptureType)) {
      const already = results.some(r => r.type === m![1] && r.title === m![2])
      if (!already) results.push({ type: m[1] as CaptureType, title: m[2] })
    }
  }

  return results
}

export type JournalSegment =
  | { kind: 'text'; content: string }
  | { kind: 'capture'; captureType: CaptureType; title: string }

/** Legacy: kept for backward compat */
export function splitJournalIntoSegments(text: string): JournalSegment[] {
  return text.split('\n').map(line => {
    const m = line.trim().match(/^\/(\w+)\s+(.+)$/)
    if (m && CAPTURE_TYPES.includes(m[1] as CaptureType)) {
      return { kind: 'capture' as const, captureType: m[1] as CaptureType, title: m[2] }
    }
    return { kind: 'text' as const, content: line }
  })
}
