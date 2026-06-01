import type { Todo, TodoContentSegment, TodoMentionKind } from '@/types'
import type { Mention } from '@/screens/today/types'

export interface TodoLinks {
  contactId?: string | null
  companyId?: string | null
  opportunityId?: string | null
}

export const MENTION_TOKEN_RE = /\[\[mention:(person|company|opportunity):([^\]]+)\]\]/g
export const MENTION_CLIPBOARD = 'application/x-rethink-mention-segments'

export type EditorSegment =
  | { type: 'text'; text: string }
  | { type: 'mention'; mention: Mention }

export function mentionKey(m: Pick<Mention, 'kind' | 'id' | 'name'>) {
  return `${m.kind}:${m.id ?? m.name}`
}

export function hasMentionTokens(text: string) {
  MENTION_TOKEN_RE.lastIndex = 0
  return MENTION_TOKEN_RE.test(text)
}

export function stripMentionTokens(text: string) {
  MENTION_TOKEN_RE.lastIndex = 0
  return text.replace(MENTION_TOKEN_RE, '').replace(/\s{2,}/g, ' ').trim()
}

export function mentionByKindId(kind: TodoMentionKind, id: string, mentions: Mention[]) {
  return mentions.find(m => m.kind === kind && m.id === id) ?? null
}

export function mentionToSegment(mention: Mention): TodoContentSegment | null {
  if (!mention.id) return null
  return {
    type: 'mention',
    kind: mention.kind,
    id: mention.id,
    label: mention.name,
    imageUrl: mention.imageUrl ?? null,
    companyId: mention.companyId ?? null,
  }
}

export function segmentToMention(segment: TodoContentSegment, options: Mention[] = []): Mention | null {
  if (segment.type !== 'mention') return null
  return mentionByKindId(segment.kind, segment.id, options) ?? {
    id: segment.id,
    kind: segment.kind,
    name: segment.label,
    imageUrl: segment.imageUrl ?? null,
    companyId: segment.companyId ?? null,
  }
}

export function editorToContentSegments(segments: EditorSegment[]): TodoContentSegment[] {
  const out: TodoContentSegment[] = []
  const pushText = (text: string) => {
    if (!text) return
    const last = out[out.length - 1]
    if (last?.type === 'text') last.text += text
    else out.push({ type: 'text', text })
  }
  for (const segment of segments) {
    if (segment.type === 'text') pushText(segment.text)
    else {
      const mention = mentionToSegment(segment.mention)
      if (mention) out.push(mention)
    }
  }
  return out.filter(s => s.type === 'mention' || s.text.length > 0)
}

export function contentToEditorSegments(segments: TodoContentSegment[] | null | undefined, options: Mention[] = []): EditorSegment[] {
  const out: EditorSegment[] = []
  for (const segment of segments ?? []) {
    if (segment.type === 'text') out.push({ type: 'text', text: segment.text })
    else {
      const mention = segmentToMention(segment, options)
      if (mention) out.push({ type: 'mention', mention })
    }
  }
  return out
}

export function legacyTextToEditorSegments(text: string, options: Mention[] = []): EditorSegment[] {
  const segments: EditorSegment[] = []
  let last = 0
  MENTION_TOKEN_RE.lastIndex = 0
  text.replace(MENTION_TOKEN_RE, (token, kind: TodoMentionKind, id: string, index: number) => {
    if (index > last) segments.push({ type: 'text', text: text.slice(last, index) })
    const mention = mentionByKindId(kind, id, options)
    segments.push(mention ? { type: 'mention', mention } : { type: 'text', text: token })
    last = index + token.length
    return token
  })
  if (last < text.length) segments.push({ type: 'text', text: text.slice(last) })
  return segments
}

export function segmentsForTodo(todo: Todo, linked: Mention[] = [], options: Mention[] = []): EditorSegment[] {
  const source = [...linked, ...options]
  if (Array.isArray(todo.content_segments) && todo.content_segments.length > 0) {
    return contentToEditorSegments(todo.content_segments, source)
  }
  if (hasMentionTokens(todo.text)) {
    return legacyTextToEditorSegments(todo.text, source)
  }
  const out: EditorSegment[] = []
  if (todo.text) out.push({ type: 'text', text: todo.text })
  linked.forEach((mention, index) => {
    if (out.length > 0 || index > 0) out.push({ type: 'text', text: ' ' })
    out.push({ type: 'mention', mention })
  })
  return out
}

export function plainTextFromEditorSegments(segments: EditorSegment[]) {
  return segments
    .map(s => s.type === 'text' ? s.text : `@${s.mention.name}`)
    .join('')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function plainTextFromContentSegments(segments: TodoContentSegment[] | null | undefined) {
  return (segments ?? [])
    .map(s => s.type === 'text' ? s.text : `@${s.label}`)
    .join('')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function linksFromMentions(items: Mention[]): TodoLinks {
  return {
    contactId: items.find(m => m.kind === 'person')?.id ?? null,
    companyId: items.find(m => m.kind === 'company')?.id ?? items.find(m => m.kind === 'opportunity')?.companyId ?? null,
    opportunityId: items.find(m => m.kind === 'opportunity')?.id ?? null,
  }
}

export function linksFromContentSegments(segments: TodoContentSegment[]): TodoLinks {
  const mentions = contentToEditorSegments(segments)
    .filter((s): s is { type: 'mention'; mention: Mention } => s.type === 'mention')
    .map(s => s.mention)
  return linksFromMentions(mentions)
}

export function normalizeEditorSegments(segments: EditorSegment[]): EditorSegment[] {
  const out: EditorSegment[] = []
  const pushText = (text: string) => {
    if (!text) return
    const last = out[out.length - 1]
    if (last?.type === 'text') last.text += text
    else out.push({ type: 'text', text })
  }
  for (const segment of segments) {
    if (segment.type === 'text') pushText(segment.text)
    else out.push(segment)
  }
  return out
}
