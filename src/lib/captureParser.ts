import type { CaptureType } from '@/types'

const CAPTURE_TYPES: CaptureType[] = ['idea', 'learning', 'reflection', 'decision', 'win', 'question']
const CAPTURE_REGEX = /^\/(\w+)\s+(.+)$/

export function parseJournalCaptures(text: string): Array<{ type: CaptureType; title: string }> {
  return text
    .split('\n')
    .map(line => line.trim().match(CAPTURE_REGEX))
    .filter((m): m is RegExpMatchArray => m !== null && CAPTURE_TYPES.includes(m[1] as CaptureType))
    .map(m => ({ type: m[1] as CaptureType, title: m[2] }))
}

export type JournalSegment =
  | { kind: 'text'; content: string }
  | { kind: 'capture'; captureType: CaptureType; title: string }

export function splitJournalIntoSegments(text: string): JournalSegment[] {
  return text.split('\n').map(line => {
    const m = line.trim().match(CAPTURE_REGEX)
    if (m && CAPTURE_TYPES.includes(m[1] as CaptureType)) {
      return { kind: 'capture' as const, captureType: m[1] as CaptureType, title: m[2] }
    }
    return { kind: 'text' as const, content: line }
  })
}
