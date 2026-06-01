import type { SupabaseClient } from '@supabase/supabase-js'
import { User, Buildings, Target } from '@phosphor-icons/react'
import type { Company, Contact, TodoMentionKind } from '@/types'
import type { Mention } from '@/screens/today/types'

export type CrmKind = TodoMentionKind

export interface CrmObjectOption extends Mention {
  kind: CrmKind
  score?: number
}

export interface CrmCreateResult {
  mention: Mention
  path: string
}

export function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

export function companyImage(logoUrl?: string | null, domain?: string | null): string | null {
  if (logoUrl) return logoUrl
  if (!domain) return null
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
}

export function pathForMention(mention: Pick<Mention, 'kind' | 'id'>) {
  if (!mention.id) return '/'
  if (mention.kind === 'person') return `/people/${mention.id}`
  if (mention.kind === 'company') return `/people/companies/${mention.id}`
  return `/people/opportunities/${mention.id}`
}

export function iconForCrmKind(kind: CrmKind) {
  if (kind === 'person') return User
  if (kind === 'company') return Buildings
  return Target
}

export function mentionFromContact(contact: Pick<Contact, 'id' | 'name' | 'profile_photo_url' | 'job_title' | 'company' | 'email'>): CrmObjectOption {
  const sub = [contact.job_title, contact.company].filter(Boolean).join(' · ') || contact.email || null
  return {
    id: contact.id,
    name: contact.name,
    kind: 'person',
    sub,
    imageUrl: contact.profile_photo_url ?? null,
    searchText: [contact.name, contact.job_title, contact.company, contact.email].filter(Boolean).join(' '),
  }
}

export function mentionFromCompany(company: Pick<Company, 'id' | 'name' | 'logo_url' | 'domain' | 'sector' | 'headline'>): CrmObjectOption {
  return {
    id: company.id,
    name: company.name,
    kind: 'company',
    sub: company.domain || company.sector || company.headline || null,
    imageUrl: companyImage(company.logo_url, company.domain),
    searchText: [company.name, company.domain, company.sector, company.headline].filter(Boolean).join(' '),
  }
}

interface OpportunityCompanyLite {
  id?: string | null
  name?: string | null
  logo_url?: string | null
  domain?: string | null
}

interface OpportunityWithCompany {
  id: string
  title?: string | null
  stage?: string | null
  type?: string | null
  company_id?: string | null
  company?: OpportunityCompanyLite | OpportunityCompanyLite[] | null
}

export function mentionFromOpportunity(opportunity: OpportunityWithCompany): CrmObjectOption {
  const company = firstRelation(opportunity.company)
  return {
    id: opportunity.id,
    name: opportunity.title ?? 'Opportunity',
    kind: 'opportunity',
    sub: [company?.name, opportunity.stage, opportunity.type].filter(Boolean).join(' · ') || null,
    imageUrl: companyImage(company?.logo_url, company?.domain),
    companyId: opportunity.company_id ?? company?.id ?? null,
    searchText: [opportunity.title, company?.name, opportunity.stage, opportunity.type].filter(Boolean).join(' '),
  }
}

function normalize(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

export function scoreCrmObject(option: Mention, rawQuery: string, usedKeys: Set<string> = new Set()) {
  const query = normalize(rawQuery.trim())
  if (!query) return 1
  const haystack = normalize([option.name, option.sub, option.searchText].filter(Boolean).join(' '))
  const name = normalize(option.name)
  if (!haystack.includes(query)) return 0
  let score = 10
  if (name === query) score += 90
  else if (name.startsWith(query)) score += 70
  else if (haystack.split(/\s+/).some(word => word.startsWith(query))) score += 45
  else score += 20
  if (usedKeys.has(`${option.kind}:${option.id ?? option.name}`)) score += 12
  if (option.imageUrl) score += 3
  if (option.kind === 'opportunity') score += 2
  return score
}

export function rankCrmObjects(options: Mention[], query: string, usedKeys: Set<string> = new Set(), limit = 18) {
  return options
    .map(option => ({ option, score: scoreCrmObject(option, query, usedKeys) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.option.name.localeCompare(b.option.name))
    .slice(0, limit)
    .map(item => item.option)
}

export function hasStrongCrmMatch(options: Mention[], query: string) {
  const normalizedQuery = normalize(query.trim())
  if (!normalizedQuery) return true
  return options.some(option => normalize(option.name) === normalizedQuery)
}

export async function createCrmObject(
  supabase: SupabaseClient,
  userId: string,
  kind: CrmKind,
  name: string,
  opts: { today?: string; companyId?: string | null } = {},
): Promise<CrmCreateResult | null> {
  const trimmed = name.trim()
  if (!trimmed) return null

  if (kind === 'person') {
    const { data, error } = await supabase.from('outreach_logs').insert({
      user_id: userId,
      name: trimmed,
      status: 'PROSPECT',
      log_date: opts.today ?? new Date().toISOString().slice(0, 10),
      health_score: 1,
      links: [],
    }).select('id, name, profile_photo_url, job_title, company, email').single()
    if (error || !data) return null
    const mention = mentionFromContact(data as Contact)
    return { mention, path: pathForMention(mention) }
  }

  if (kind === 'company') {
    const { data, error } = await supabase.from('companies').insert({
      user_id: userId,
      name: trimmed,
    }).select('id, name, logo_url, domain, sector, headline').single()
    if (error || !data) return null
    const mention = mentionFromCompany(data as Company)
    return { mention, path: pathForMention(mention) }
  }

  const { data, error } = await supabase.from('opportunities').insert({
    user_id: userId,
    title: trimmed,
    type: 'job',
    stage: 'exploring',
    company_id: opts.companyId ?? null,
  }).select('id, title, stage, type, company_id, company:companies(id, name, logo_url, domain)').single()
  if (error || !data) return null
  const mention = mentionFromOpportunity(data as OpportunityWithCompany)
  return { mention, path: pathForMention(mention) }
}
