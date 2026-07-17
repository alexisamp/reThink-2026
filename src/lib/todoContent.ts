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
  | { type: 'file'; file: TodoFileSegment }

export type TodoFileSegment = Extract<TodoContentSegment, { type: 'file' }>

const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"']+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"']*)?)/gi
const TRAILING_URL_PUNCT = /[),.;:!?]+$/

export function mentionKey(m: Pick<Mention, 'kind' | 'id' | 'name'>) {
  return `${m.kind}:${m.id ?? m.name}`
}

export function fileKey(file: Pick<TodoFileSegment, 'id' | 'label'>) {
  return `file:${file.id || file.label}`
}

function normalizedUrl(raw: string) {
  const trimmed = raw.trim().replace(TRAILING_URL_PUNCT, '')
  if (!trimmed || trimmed.includes('@')) return null
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(candidate)
    if (!url.hostname.includes('.')) return null
    return url.toString()
  } catch {
    return null
  }
}

function titleCaseSlug(value: string) {
  return value
    .replace(/\.[a-z0-9]{1,8}$/i, '')
    .replace(/[-_+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b([a-z])([a-z]*)/gi, (_, first: string, rest: string) => `${first.toUpperCase()}${rest}`)
}

export function linkLabelFromUrl(raw: string) {
  const href = normalizedUrl(raw) ?? raw
  try {
    const url = new URL(href)
    const host = url.hostname.replace(/^www\./i, '')
    const parts = url.pathname.split('/').map(part => decodeURIComponent(part)).filter(Boolean)
    if (parts.length) {
      const slug = titleCaseSlug(parts[parts.length - 1])
      if (slug) return `${host} · ${slug}`
    }
    return host
  } catch {
    return raw.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')
  }
}

export function urlToFileSegment(raw: string): TodoFileSegment | null {
  const href = normalizedUrl(raw)
  if (!href) return null
  return {
    type: 'file',
    id: `url:${href}`,
    label: linkLabelFromUrl(href),
    source: href.includes('docs.google.com') || href.includes('drive.google.com') ? 'google_drive' : 'url',
    mimeType: 'text/uri-list',
    url: href,
    openMode: href.includes('/spreadsheets/') ? 'sheets' : 'browser',
  }
}

function textToAutoLinkedSegments(text: string): EditorSegment[] {
  const out: EditorSegment[] = []
  let cursor = 0
  URL_RE.lastIndex = 0
  for (const match of text.matchAll(URL_RE)) {
    const token = match[0]
    const index = match.index ?? 0
    const segment = urlToFileSegment(token)
    if (!segment) continue
    const cleanToken = token.replace(TRAILING_URL_PUNCT, '')
    const end = index + cleanToken.length
    if (index > cursor) out.push({ type: 'text', text: text.slice(cursor, index) })
    out.push({ type: 'file', file: segment })
    if (end < index + token.length) out.push({ type: 'text', text: token.slice(cleanToken.length) })
    cursor = index + token.length
  }
  if (cursor < text.length) out.push({ type: 'text', text: text.slice(cursor) })
  return out.length ? out : [{ type: 'text', text }]
}

export function autoLinkEditorSegments(segments: EditorSegment[]): EditorSegment[] {
  const out: EditorSegment[] = []
  for (const segment of segments) {
    if (segment.type === 'text') out.push(...textToAutoLinkedSegments(segment.text))
    else out.push(segment)
  }
  return out
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
  for (const segment of autoLinkEditorSegments(segments)) {
    if (segment.type === 'text') pushText(segment.text)
    else if (segment.type === 'mention') {
      const mention = mentionToSegment(segment.mention)
      if (mention) out.push(mention)
    } else {
      out.push(segment.file)
    }
  }
  return out.filter(s => s.type !== 'text' || s.text.length > 0)
}

export function contentToEditorSegments(segments: TodoContentSegment[] | null | undefined, options: Mention[] = []): EditorSegment[] {
  const out: EditorSegment[] = []
  for (const segment of segments ?? []) {
    if (segment.type === 'text') out.push({ type: 'text', text: segment.text })
    else if (segment.type === 'mention') {
      const mention = segmentToMention(segment, options)
      if (mention) out.push({ type: 'mention', mention })
    } else {
      out.push({ type: 'file', file: segment })
    }
  }
  return normalizeEditorSegments(out)
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
  return normalizeEditorSegments(segments)
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
  if (todo.text) out.push(...textToAutoLinkedSegments(todo.text))
  linked.forEach((mention, index) => {
    if (out.length > 0 || index > 0) out.push({ type: 'text', text: ' ' })
    out.push({ type: 'mention', mention })
  })
  return out
}

export function plainTextFromEditorSegments(segments: EditorSegment[]) {
  return segments
    .map(s => {
      if (s.type === 'text') return s.text
      if (s.type === 'mention') return `@${s.mention.name}`
      return s.file.label
    })
    .join('')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function plainTextFromContentSegments(segments: TodoContentSegment[] | null | undefined) {
  return (segments ?? [])
    .map(s => {
      if (s.type === 'text') return s.text
      if (s.type === 'mention') return `@${s.label}`
      return s.label
    })
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
  for (const segment of autoLinkEditorSegments(segments)) {
    if (segment.type === 'text') pushText(segment.text)
    else out.push(segment)
  }
  return out
}
