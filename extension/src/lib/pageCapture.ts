export type CaptureEntityType = 'company' | 'person' | 'opportunity'

export interface PageCaptureContext {
  url: string
  canonicalUrl: string | null
  title: string
  hostname: string
  domain: string | null
  entityType: CaptureEntityType
  source: 'linkedin' | 'gmail' | 'job_board' | 'website'
  suggestedName: string
  description: string | null
  linkedinUrl: string | null
  linkedinSlug: string | null
  companyLinkedinUrl?: string | null
  companyLinkedinSlug?: string | null
  faviconUrl: string | null
  logoCandidates?: string[]
  profilePhotoUrl: string | null
  emailAddress?: string | null
  emailCandidates?: Array<{ name: string | null; email: string }>
  applicationSourceUrl?: string | null
  applicationSourceDomain?: string | null
  applicationSourceName?: string | null
  companyName: string | null
  jobTitle: string | null
  location: string | null
  capturedAt: string
  text: string
  markdown: string
}

export interface CaptureSnapshotRecord {
  id: string
  entity_type: CaptureEntityType
  entity_id: string
  title: string
  source_url: string
  domain: string | null
  storage_path: string | null
  local_path: string | null
  created_at: string
}

export function normalizeDomain(hostname: string): string | null {
  const lower = hostname.toLowerCase().replace(/^www\./, '')
  if (!lower || lower === 'linkedin.com' || lower.endsWith('.linkedin.com')) return null
  return lower
}

export function cleanFilePart(value: string) {
  return value
    .trim()
    .replace(/https?:\/\//gi, '')
    .replace(/[^a-z0-9._ -]+/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 90) || 'capture'
}

export function localMarkdownPath(context: PageCaptureContext, entityType = context.entityType) {
  const companyFolder = cleanFilePart(context.domain || context.companyName || context.hostname || 'unknown')
  const filename = `${cleanFilePart(context.suggestedName)}.md`
  if (entityType === 'person') return `Opportunities/${companyFolder}/People/${filename}`
  if (entityType === 'opportunity') {
    const opportunityFolder = cleanFilePart(context.suggestedName)
    return `Opportunities/${companyFolder}/${opportunityFolder}/${filename}`
  }
  if (context.source === 'linkedin') return `Opportunities/${companyFolder}/linkedin-company.md`
  return `Opportunities/${companyFolder}/company.md`
}

export function storagePath(userId: string, context: PageCaptureContext, entityType = context.entityType) {
  return `${userId}/${localMarkdownPath(context, entityType)}`
}
