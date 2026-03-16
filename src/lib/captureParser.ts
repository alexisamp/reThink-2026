import type { CaptureType } from '@/types'

const CAPTURE_TYPES: CaptureType[] = ['idea', 'learning', 'reflection', 'decision', 'win', 'question']

// Old block format: /type title (full line)
const BLOCK_RE = /^\/(\w+)\s+(.+)$/gm
// New inline format (5-part): [~type:title:gid:mid:tid~]
// Backward compat (2-part):   [~type:title~]
// Both matched by a single regex: [~type:title(:gid:mid:tid)?~]
const INLINE_RE = /\[~(\w+):([^\]~:]+)(?::([^~\]]*):([^~\]]*):([^~\]]*))?~\]/g

export interface ParsedCapture {
  type: CaptureType
  title: string
  goalId: string | null
  milestoneId: string | null
  todoId: string | null
}

export function parseJournalCaptures(text: string): ParsedCapture[] {
  const results: ParsedCapture[] = []
  let m: RegExpExecArray | null

  INLINE_RE.lastIndex = 0
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (CAPTURE_TYPES.includes(m[1] as CaptureType)) {
      results.push({
        type: m[1] as CaptureType,
        title: m[2],
        goalId: m[3] != null && m[3] !== '' ? m[3] : null,
        milestoneId: m[4] != null && m[4] !== '' ? m[4] : null,
        todoId: m[5] != null && m[5] !== '' ? m[5] : null,
      })
    }
  }

  BLOCK_RE.lastIndex = 0
  while ((m = BLOCK_RE.exec(text)) !== null) {
    if (CAPTURE_TYPES.includes(m[1] as CaptureType)) {
      const already = results.some(r => r.type === m![1] && r.title === m![2])
      if (!already) {
        results.push({
          type: m[1] as CaptureType,
          title: m[2],
          goalId: null,
          milestoneId: null,
          todoId: null,
        })
      }
    }
  }

  return results
}

/**
 * Serialize a pill to the new 5-part inline format.
 * Use empty string for nulls so the format is always [~type:title:gid:mid:tid~].
 */
export function serializePill(
  type: CaptureType,
  title: string,
  goalId?: string | null,
  milestoneId?: string | null,
  todoId?: string | null,
): string {
  const gid = goalId ?? ''
  const mid = milestoneId ?? ''
  const tid = todoId ?? ''
  return `[~${type}:${title}:${gid}:${mid}:${tid}~]`
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
