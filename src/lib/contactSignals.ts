import type { ContactFact } from '@/types'

const SIGNAL_LABELS = new Set(['News/post', 'Shared post', 'Mobile capture'])

function lineValue(value: string, key: string) {
  const match = value.match(new RegExp(`^${key}:\\s*(.+)$`, 'im'))
  return match?.[1]?.trim() ?? ''
}

export function isLinkedSignalFact(fact: ContactFact) {
  return fact.source === 'import'
    && fact.category === 'career_intel'
    && SIGNAL_LABELS.has(fact.label ?? '')
    && /^URL:\s*https?:\/\//im.test(fact.value)
}

export function parseLinkedSignalFact(fact: ContactFact) {
  const url = lineValue(fact.value, 'URL')
  const title = lineValue(fact.value, 'Title') || fact.label || 'Linked signal'
  const sharedText = lineValue(fact.value, 'Shared text')
  const note = lineValue(fact.value, 'Note')
  const relationship = lineValue(fact.value, 'Relationship')
  let domain = ''
  try {
    domain = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    domain = ''
  }
  return { url, title, sharedText, note, relationship, domain }
}
