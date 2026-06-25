import type { CaptureEntityType, PageCaptureContext } from '../lib/pageCapture'
import { normalizeDomain } from '../lib/pageCapture'

export {}

const MAX_TEXT_CHARS = 120_000

function textOf(selector: string): string | null {
  const el = document.querySelector(selector) as HTMLElement | null
  const text = el?.innerText?.trim()
  return text || null
}

function meta(name: string): string | null {
  const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`) as HTMLMetaElement | null
  return el?.content?.trim() || null
}

function cleanText(value: string) {
  return value
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_TEXT_CHARS)
}

function cleanTitle(title: string) {
  return title
    .replace(/\s*\|\s*LinkedIn.*$/i, '')
    .replace(/\s*-\s*LinkedIn.*$/i, '')
    .replace(/\s*[|–—-]\s*.+$/i, '')
    .replace(/\s*:\s*(Overview|About|People|Jobs|Posts|Products|Life).*$/i, '')
    .trim()
}

function titleCaseDomain(domain: string) {
  const first = domain.replace(/^www\./, '').split('.')[0] || domain
  return first.charAt(0).toUpperCase() + first.slice(1)
}

function titleCaseSlug(slug: string) {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function absoluteUrl(value: string | null | undefined): string | null {
  if (!value) return null
  if (value.startsWith('blob:')) return null
  try {
    return new URL(value, window.location.href).href
  } catch {
    return null
  }
}

function logoText(): string | null {
  const selectors = [
    'header a[aria-label]',
    'nav a[aria-label]',
    'header img[alt]',
    'nav img[alt]',
    'a[href="/"] img[alt]',
    'a[href="/"]',
  ]
  for (const selector of selectors) {
    const el = document.querySelector(selector) as HTMLElement | HTMLImageElement | null
    const raw = el instanceof HTMLImageElement ? el.alt : el?.getAttribute('aria-label') || el?.innerText
    const text = raw?.replace(/\blogo\b/gi, '').replace(/\bhome\b/gi, '').trim()
    if (text && text.length > 1 && text.length < 40) return text
  }
  return null
}

function imageCandidate(img: HTMLImageElement | null): string | null {
  if (!img) return null
  const src = absoluteUrl(img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original'))
  if (!src) return null
  const width = img.naturalWidth || img.width
  const height = img.naturalHeight || img.height
  if (width > 0 && height > 0 && width < 12 && height < 12) return null
  return src
}

function isBadLogoCandidate(value: string) {
  return /meridian|cliente|customer|testimonial|case-stud|badge|capterra|getapp|softwareadvice|g2|gartner|partner|review/i.test(value)
}

function elementTextForLogo(el: Element) {
  return [
    el.getAttribute('alt'),
    el.getAttribute('aria-label'),
    el.getAttribute('title'),
    el.getAttribute('class'),
    el.getAttribute('src'),
  ].filter(Boolean).join(' ')
}

function svgCandidate(svg: SVGElement): string | null {
  const rect = svg.getBoundingClientRect()
  if (rect.width < 36 || rect.height < 14 || rect.width > 320 || rect.height > 120) return null
  if (!svg.closest('header, nav, [role="banner"]')) return null
  const clone = svg.cloneNode(true) as SVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const serialized = new XMLSerializer().serializeToString(clone)
  if (serialized.length > 24000) return null
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`
}

function scoreLogoElement(el: HTMLImageElement) {
  const rect = el.getBoundingClientRect()
  const text = elementTextForLogo(el)
  const src = imageCandidate(el)
  if (!src || isBadLogoCandidate(`${text} ${src}`)) return -1000
  let score = 0
  if (el.closest('header, nav, [role="banner"]')) score += 70
  if (rect.top >= 0 && rect.top < 180) score += 30
  if (rect.left >= 0 && rect.left < 360) score += 20
  if (/logo|brand|home/i.test(text)) score += 25
  if (rect.width >= 36 && rect.width <= 280 && rect.height >= 16 && rect.height <= 110) score += 12
  if (rect.width > 360 || rect.height > 180) score -= 35
  if (el.closest('[class*="client" i], [class*="customer" i], [class*="testimonial" i], [class*="partner" i], [class*="case" i]')) score -= 90
  return score
}

function uniqueUrls(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function emailFromText(value: string | null | undefined): string | null {
  const match = value?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return match?.[0]?.toLowerCase() ?? null
}

function nameFromEmail(email: string) {
  const local = email.split('@')[0] || email
  return titleCaseSlug(local.replace(/[._]+/g, '-'))
}

function isVisibleElement(el: HTMLElement) {
  const rect = el.getBoundingClientRect()
  const style = window.getComputedStyle(el)
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
}

function gmailParticipantScore(node: HTMLElement, email: string) {
  let score = 0
  const rect = node.getBoundingClientRect()
  const message = node.closest('.adn, .h7, [role="listitem"], .Bk') as HTMLElement | null
  const text = `${node.innerText} ${node.getAttribute('aria-label') ?? ''} ${node.getAttribute('title') ?? ''} ${message?.innerText ?? ''}`

  if (isVisibleElement(node)) score += 25
  if (rect.top >= 0 && rect.top <= window.innerHeight) score += 18
  if (node.matches('[email].gD, .gD[email], span[email], [data-hovercard-id][name]')) score += 55
  if (/\bto me\b/i.test(text) || /\bpara mí\b/i.test(text)) score += 30
  if (message && isVisibleElement(message)) score += 25
  if (message?.querySelector('.a3s, .ii, [role="listitem"] [dir="ltr"]')) score += 45
  if (node.closest('header, nav, [role="banner"], [aria-label*="Google Account" i], [aria-label*="Google apps" i]')) score -= 220
  if (/mail delivery subsystem|address not found|message wasn'?t delivered/i.test(text)) score -= 200
  if (/^(mailer-daemon|postmaster|no-reply|noreply|notifications?|support)@/i.test(email)) score -= 200
  return score
}

function gmailParticipants(): Array<{ name: string | null; email: string }> {
  const nodes = Array.from(document.querySelectorAll('[email], [data-hovercard-id*="@"], [aria-label*="@"], [title*="@"]')) as HTMLElement[]
  const people = new Map<string, { name: string | null; email: string; score: number }>()
  for (const node of nodes) {
    const email = emailFromText(node.getAttribute('email'))
      || emailFromText(node.getAttribute('data-hovercard-id'))
      || emailFromText(node.getAttribute('aria-label'))
      || emailFromText(node.getAttribute('title'))
      || emailFromText(node.innerText)
    if (!email || /^(mailer-daemon|postmaster|no-reply|noreply|notifications?|support)@/i.test(email)) continue
    const rawName = node.getAttribute('name')
      || node.getAttribute('data-name')
      || node.getAttribute('aria-label')
      || node.getAttribute('title')
      || node.innerText
    const cleanedName = rawName
      ?.replace(email, '')
      .replace(/[<>"]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    const score = gmailParticipantScore(node, email)
    const previous = people.get(email)
    if (previous && previous.score >= score) continue
    people.set(email, {
      email,
      name: cleanedName && cleanedName.length <= 80 ? cleanedName : nameFromEmail(email),
      score,
    })
  }
  return [...people.values()]
    .filter(person => person.score > -100)
    .sort((a, b) => b.score - a.score)
    .map(({ name, email }) => ({ name, email }))
}

function siteLogoUrls(): string[] {
  const scored = Array.from(document.querySelectorAll('header img, nav img, [role="banner"] img, a[href="/"] img, a[href="./"] img, img[alt*="logo" i], img[src*="logo" i]') as NodeListOf<HTMLImageElement>)
    .map(img => ({ src: imageCandidate(img), score: scoreLogoElement(img) }))
    .filter((item): item is { src: string; score: number } => Boolean(item.src) && item.score > -100)
    .sort((a, b) => b.score - a.score)

  const svgs = Array.from(document.querySelectorAll('header svg, nav svg, [role="banner"] svg') as NodeListOf<SVGElement>)
    .map(svgCandidate)
    .filter((value): value is string => Boolean(value))

  const ogImage = absoluteUrl(meta('og:image'))
  return uniqueUrls([
    ...scored.map(item => item.src),
    ...svgs,
    ogImage && /logo|icon|brand/i.test(ogImage) && !isBadLogoCandidate(ogImage) ? ogImage : null,
  ])
}

function linkedInPersonUrl(url: URL): string | null {
  const match = url.href.match(/linkedin\.com\/in\/([^/?#&]+)/)
  return match ? `https://www.linkedin.com/in/${match[1]}` : null
}

function linkedInCompanyUrl(url: URL): string | null {
  const match = url.href.match(/linkedin\.com\/(?:company|school|showcase)\/([^/?#&]+)/)
  return match ? `https://www.linkedin.com/company/${match[1]}` : null
}

function linkedInSlug(url: URL): string | null {
  const match = url.href.match(/linkedin\.com\/(?:in|company|school|showcase)\/([^/?#&]+)/)
  return match?.[1] ?? null
}

function linkedInCompanySlugFromHref(value: string | null | undefined): string | null {
  if (!value) return null
  const match = value.match(/linkedin\.com\/(?:company|school|showcase)\/([^/?#&]+)/) || value.match(/\/(?:company|school|showcase)\/([^/?#&]+)/)
  return match?.[1] ?? null
}

function linkedInCompanyUrlFromHref(value: string | null | undefined): string | null {
  const slug = linkedInCompanySlugFromHref(value)
  return slug ? `https://www.linkedin.com/company/${slug}` : null
}

function faviconUrl(url: URL, domain: string | null): string | null {
  const icon = document.querySelector('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]') as HTMLLinkElement | null
  if (icon?.href && !url.hostname.includes('linkedin.com')) return absoluteUrl(icon.href)
  if (domain) return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
  return null
}

function applicationSourceName(hostname: string) {
  const clean = hostname.toLowerCase().replace(/^www\./, '')
  if (clean.includes('greenhouse.io')) return 'Greenhouse'
  if (clean.includes('lever.co')) return 'Lever'
  if (clean.includes('ashbyhq.com')) return 'Ashby'
  if (clean.includes('recruitee.com')) return 'Recruitee'
  if (clean.includes('workable.com')) return 'Workable'
  if (clean.includes('smartrecruiters.com')) return 'SmartRecruiters'
  if (clean.includes('applytojob.com')) return 'JazzHR'
  return clean
}

function linkedInImageUrl(entityType: CaptureEntityType): string | null {
  const main = document.querySelector('main') || document.body
  const imgs = Array.from(main.querySelectorAll('img')) as HTMLImageElement[]
  const imageSrc = (img: HTMLImageElement) => img.src || img.getAttribute('data-delayed-url') || img.getAttribute('data-ghost-url') || ''
  if (entityType === 'person') {
    const topCard = document.querySelector('.pv-top-card, .ph5, section.artdeco-card') || main
    const topImgs = Array.from(topCard.querySelectorAll('img')) as HTMLImageElement[]
    const profileSelectors = [
      'img.pv-top-card-profile-picture__image',
      'img.profile-photo-edit__preview',
      'button[aria-label*="profile photo" i] img',
      'button[aria-label*="Photo" i] img',
      '.pv-top-card__photo img',
    ]
    for (const selector of profileSelectors) {
      const img = topCard.querySelector(selector) as HTMLImageElement | null
      const src = img ? imageSrc(img) : ''
      if (src.includes('media.licdn.com')) return src
    }
    const profile = topImgs.find(img => imageSrc(img).includes('profile-displayphoto'))
      || topImgs.find(img => /profile|photo/i.test(img.alt || '') && imageSrc(img).includes('media.licdn.com') && (img.width >= 80 || img.height >= 80))
      || imgs.find(img => imageSrc(img).includes('profile-displayphoto'))
    return profile ? imageSrc(profile) : null
  }
  if (entityType === 'company') {
    const company = imgs.find(img => /logo/i.test(img.alt || '') && imageSrc(img).includes('media.licdn.com'))
      || imgs.find(img => imageSrc(img).includes('media.licdn.com') && (img.width >= 72 || img.height >= 72))
    return company ? imageSrc(company) : null
  }
  return null
}

function cleanLinkedInCompanyText(value: string | null | undefined): string | null {
  const firstLine = value
    ?.replace(/\bcompany logo\b/gi, '')
    .replace(/\bfollow\b/gi, '')
    .replace(/\bview company page\b/gi, '')
    .split(/\n|·|\|/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .find(line => line && !/^(company|school|showcase)$/i.test(line))
  if (!firstLine || firstLine.length > 80) return null
  return firstLine
}

function linkedInProfileCompany(): { name: string | null; url: string | null; slug: string | null } | null {
  const selectors = [
    '.pv-text-details__right-panel a[href*="/company/"]',
    '.pv-text-details__right-panel a[href*="/school/"]',
    '.pv-top-card a[href*="/company/"]',
    '.pv-top-card a[href*="/school/"]',
    'main section a[href*="/company/"]',
    'main section a[href*="/school/"]',
  ]

  for (const selector of selectors) {
    const anchors = Array.from(document.querySelectorAll(selector)) as HTMLAnchorElement[]
    for (const anchor of anchors) {
      const url = linkedInCompanyUrlFromHref(anchor.href)
      const slug = linkedInCompanySlugFromHref(anchor.href)
      if (!slug || /linkedin|feed|jobs|search/i.test(slug)) continue
      const imageAlt = (anchor.querySelector('img[alt]') as HTMLImageElement | null)?.alt
      const name = cleanLinkedInCompanyText(anchor.innerText)
        || cleanLinkedInCompanyText(anchor.getAttribute('aria-label'))
        || cleanLinkedInCompanyText(anchor.getAttribute('title'))
        || cleanLinkedInCompanyText(imageAlt)
        || titleCaseSlug(slug)
      return { name, url, slug }
    }
  }

  return null
}

function inferEntityType(url: URL, title: string, text: string): CaptureEntityType {
  if (url.hostname === 'mail.google.com') return 'person'
  if (linkedInPersonUrl(url)) return 'person'
  if (linkedInCompanyUrl(url)) return 'company'

  const haystack = `${url.hostname} ${url.pathname} ${title} ${text.slice(0, 1200)}`.toLowerCase()
  if (
    /\/jobs?\b|\/careers?\b|\/positions?\b|\/openings?\b|greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|applytojob\.com/.test(haystack) ||
    /\bjob description\b|\bapply now\b|\babout the role\b|\bwhat you('|’)ll do\b/.test(haystack)
  ) {
    return 'opportunity'
  }
  return 'company'
}

function extractCompanyName(entityType: CaptureEntityType, hostname: string, title: string, linkedinUrl: string | null) {
  if (entityType === 'company') {
    if (linkedinUrl && hostname.includes('linkedin.com')) {
      const titleName = cleanTitle(title)
      const slug = linkedinUrl.split('/').filter(Boolean).pop()
      return titleName || cleanTitle(textOf('main h1') || '') || (slug ? titleCaseSlug(slug) : null)
    }
    return cleanTitle(
      logoText() ||
      meta('application-name') ||
      meta('og:site_name') ||
      title ||
      titleCaseDomain(hostname),
    )
  }
  if (entityType === 'opportunity') {
    return extractOpportunityCompanyName(hostname, title)
  }
  const profileCompany = hostname.includes('linkedin.com') ? linkedInProfileCompany()?.name : null
  const currentCompany =
    profileCompany ||
    textOf('[data-field="experience_company_logo"] ~ div span[aria-hidden="true"]') ||
    textOf('.pv-entity__secondary-title') ||
    null
  return currentCompany
}

function extractOpportunityCompanyName(hostname: string, title: string): string | null {
  const sourceName = applicationSourceName(hostname).toLowerCase()
  const sourceRoot = hostname.toLowerCase().replace(/^www\./, '').split('.')[0]
  const candidates = [
    linkedInJobCompanyName(),
    logoText(),
    meta('og:site_name'),
    title.match(/\b(?:at|@)\s+([A-Z][A-Za-z0-9&.,'’ -]{1,60})(?:\s*[|–—-]|$)/)?.[1] ?? null,
    textOf('[data-testid*="company" i]'),
    textOf('[class*="company" i]'),
    (document.body?.innerText || '').match(/\bAbout\s+([A-Z][A-Za-z0-9&.,'’ -]{1,60})\b/)?.[1] ?? null,
  ]
  for (const candidate of candidates) {
    const clean = cleanCompanyCandidate(candidate)
    if (!clean) continue
    const normalized = clean.toLowerCase()
    if (normalized === sourceName || normalized.includes(sourceName) || normalized === sourceRoot) continue
    if (/job|career|opening|position|application|greenhouse|lever|ashby|workable|smartrecruiters/i.test(clean)) continue
    return clean
  }
  return null
}

function linkedInJobCompanyName(): string | null {
  if (!location.hostname.includes('linkedin.com')) return null
  const selectors = [
    '.job-details-jobs-unified-top-card__company-name a',
    '.job-details-jobs-unified-top-card__primary-description-container a[href*="/company/"]',
    '.jobs-unified-top-card__company-name a',
    '.jobs-unified-top-card__subtitle-primary-grouping a[href*="/company/"]',
    'main a[href*="/company/"]',
  ]
  for (const selector of selectors) {
    const value = textOf(selector)
    const clean = cleanCompanyCandidate(value)
    if (clean) return clean
  }
  const text = cleanText(document.body?.innerText || '')
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
  const titleLine = cleanTitle(textOf('h1') || document.title || '')
  const titleIndex = lines.findIndex(line => cleanTitle(line) === titleLine)
  const nearby = titleIndex >= 0 ? lines.slice(Math.max(0, titleIndex - 4), titleIndex + 8) : lines.slice(0, 40)
  for (const line of nearby) {
    const clean = cleanCompanyCandidate(line)
    if (!clean) continue
    if (/^(apply|save|hybrid|full-time|part-time|contract|responses managed|promoted|view|share)$/i.test(clean)) continue
    if (cleanTitle(clean) === titleLine) continue
    return clean
  }
  return null
}

function cleanCompanyCandidate(value: string | null | undefined): string | null {
  const clean = value
    ?.replace(/\blogo\b/gi, '')
    .replace(/\bcareers?\b/gi, '')
    .replace(/\bjobs?\b/gi, '')
    .replace(/\s*[|–—-]\s*(job|career|opening|application).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean || clean.length < 2 || clean.length > 70) return null
  return clean
}

function buildMarkdown(context: Omit<PageCaptureContext, 'markdown'>) {
  const lines = [
    `# ${context.suggestedName}`,
    '',
    `- Source: ${context.url}`,
    `- Captured at: ${context.capturedAt}`,
    `- Type: ${context.entityType}`,
  ]

  if (context.domain) lines.push(`- Domain: ${context.domain}`)
  if (context.applicationSourceDomain) lines.push(`- Application source domain: ${context.applicationSourceDomain}`)
  if (context.applicationSourceUrl) lines.push(`- Application source URL: ${context.applicationSourceUrl}`)
  if (context.emailAddress) lines.push(`- Email: ${context.emailAddress}`)
  if (context.emailCandidates?.length) lines.push(`- Email candidates: ${context.emailCandidates.map(person => person.name ? `${person.name} <${person.email}>` : person.email).join(', ')}`)
  if (context.companyName) lines.push(`- Company: ${context.companyName}`)
  if (context.companyLinkedinUrl) lines.push(`- Company LinkedIn: ${context.companyLinkedinUrl}`)
  if (context.jobTitle) lines.push(`- Job title: ${context.jobTitle}`)
  if (context.location) lines.push(`- Location: ${context.location}`)
  if (context.description) lines.push('', '## Description', '', context.description)

  lines.push('', '## Raw page text', '', context.text)
  return lines.join('\n')
}

function extractContext(): PageCaptureContext {
  const url = new URL(window.location.href)
  const canonicalUrl = (document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)?.href || null
  const pageTitle = document.title || textOf('h1') || url.hostname
  const text = cleanText(document.body?.innerText || '')
  const entityType = inferEntityType(url, pageTitle, text)
  const source: PageCaptureContext['source'] = url.hostname.includes('linkedin.com')
    ? 'linkedin'
    : url.hostname === 'mail.google.com'
      ? 'gmail'
      : entityType === 'opportunity'
        ? 'job_board'
        : 'website'
  const domain = normalizeDomain(url.hostname)
  const applicationSourceDomain = entityType === 'opportunity' ? domain : null
  const applicationSourceUrl = entityType === 'opportunity' ? window.location.href : null
  const appSourceName = entityType === 'opportunity' ? applicationSourceName(url.hostname) : null
  const linkedinUrl = linkedInPersonUrl(url) || linkedInCompanyUrl(url)
  const slug = linkedInSlug(url)
  const emailCandidates = source === 'gmail' ? gmailParticipants() : []
  const primaryEmail = emailCandidates[0] ?? null
  const profileCompany = entityType === 'person' && url.hostname.includes('linkedin.com') ? linkedInProfileCompany() : null
  const companyName = profileCompany?.name || extractCompanyName(entityType, url.hostname, pageTitle, linkedinUrl)
  const jobTitle = entityType === 'person'
    ? textOf('.text-body-medium.break-words') || null
    : entityType === 'opportunity'
      ? cleanTitle(textOf('h1') || pageTitle)
      : null
  const location = textOf('.text-body-small.inline.t-black--light.break-words') || null
  const description = meta('description') || meta('og:description')
  const suggestedName = entityType === 'person'
    ? cleanTitle(primaryEmail?.name || textOf('main h1') || textOf('h1') || pageTitle)
    : entityType === 'opportunity'
      ? cleanTitle(textOf('h1') || pageTitle)
      : cleanTitle(companyName || pageTitle)

  const linkedInImage = linkedInImageUrl(entityType)
  const fallbackIcon = faviconUrl(url, domain)
  const logoCandidates = uniqueUrls([
    linkedInImage,
    ...(entityType === 'company' || entityType === 'opportunity' ? siteLogoUrls() : []),
    fallbackIcon,
  ])

  const base: Omit<PageCaptureContext, 'markdown'> = {
    url: window.location.href,
    canonicalUrl,
    title: pageTitle,
    hostname: url.hostname,
    domain,
    entityType,
    source,
    suggestedName,
    description,
    linkedinUrl,
    linkedinSlug: slug,
    companyLinkedinUrl: profileCompany?.url ?? null,
    companyLinkedinSlug: profileCompany?.slug ?? null,
    faviconUrl: fallbackIcon,
    logoCandidates,
    profilePhotoUrl: entityType === 'person' ? linkedInImage : null,
    emailAddress: primaryEmail?.email ?? null,
    emailCandidates,
    applicationSourceUrl,
    applicationSourceDomain,
    applicationSourceName: appSourceName,
    companyName,
    jobTitle,
    location,
    capturedAt: new Date().toISOString(),
    text,
  }

  return { ...base, markdown: buildMarkdown(base) }
}

async function publishContext() {
  try {
    const context = extractContext()
    chrome.runtime.sendMessage({ type: 'PAGE_CONTEXT_UPDATED', context }).catch(() => {})
  } catch {
    // Ignore pages whose DOM cannot be inspected.
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'GET_PAGE_CONTEXT') return false
  try {
    sendResponse({ context: extractContext() })
  } catch (error) {
    sendResponse({ context: null, error: String(error) })
  }
  return false
})

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(publishContext, 500)
    setTimeout(publishContext, 2500)
  })
} else {
  setTimeout(publishContext, 500)
  setTimeout(publishContext, 2500)
}

let lastHref = window.location.href
let lastSignature = `${window.location.href}|${document.title}|${textOf('main h1') || textOf('h1') || ''}`
let publishTimer: number | null = null
const observer = new MutationObserver(() => {
  const signature = `${window.location.href}|${document.title}|${textOf('main h1') || textOf('h1') || ''}`
  if (window.location.href === lastHref && signature === lastSignature) return
  lastHref = window.location.href
  lastSignature = signature
  if (publishTimer) window.clearTimeout(publishTimer)
  publishTimer = window.setTimeout(() => {
    publishTimer = null
    publishContext()
    setTimeout(publishContext, 1800)
  }, 700)
})
observer.observe(document.documentElement, { childList: true, subtree: true })
