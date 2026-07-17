// LinkedIn profile content script — Phase 5
// Extracts contact data from LinkedIn profile pages and sends to service worker
export {}

console.log('reThink People: LinkedIn profile content script loaded')

function cleanLinkedInUrl(url: string): string | null {
  const match = url.match(/linkedin\.com\/in\/([^/?#&]+)/)
  if (!match) return null
  return `https://www.linkedin.com/in/${match[1]}`
}

function extractPhotoUrl(el: HTMLImageElement | null): string | null {
  if (!el) return null
  // Keep full URL including query params — LinkedIn CDN requires ?e=&v=&t= tokens
  const url = el.src || el.getAttribute('data-delayed-url') || el.getAttribute('data-ghost-url') || ''
  if (url && url.indexOf('media.licdn.com') !== -1) return url
  return null
}

function cleanName(raw: string): string | null {
  // LinkedIn h1 often contains accessibility suffixes like "· 3rd+" or "| Open to work"
  // Strip them and take only the first line / first segment
  const text = raw.split(/\n/)[0]           // first line only
    .split(/\s*[|·•]\s*/)[0]               // strip everything after |, ·, or •
    .replace(/\s+/g, ' ')                   // collapse whitespace
    .trim()
  if (text && text.length >= 2 && text.length < 70) return text
  return null
}

function extractName(): string | null {
  // Multiple fallbacks — LinkedIn changes class names frequently
  const selectors = [
    'h1.text-heading-xlarge',
    'h1[class*="text-heading"]',
    'h1.t-24',
    'h1.t-bold',
    '.pv-top-card--list h1',
    '.pv-top-card h1',
    '.ph5 h1',
    'section.artdeco-card h1',
    'main h1',
    'h1',  // last resort
  ]
  for (const sel of selectors) {
    const el = document.querySelector(sel) as HTMLElement | null
    if (el) {
      const name = cleanName(el.innerText ?? '')
      if (name) return name
    }
  }
  return null  // do NOT fall back to URL slug — caller handles that
}

function extractJobTitle(): string | null {
  const selectors = [
    '.text-body-medium.break-words',
    '[data-field="headline"]',
    '.pv-text-details__left-panel .mt2 span[aria-hidden="true"]',
    '.ph5 .mt2 span[aria-hidden="true"]',
  ]
  for (const sel of selectors) {
    const el = document.querySelector(sel) as HTMLElement | null
    if (el) {
      const text = el.innerText?.trim()
      if (text && text.length > 2) return text
    }
  }
  return null
}

function extractCompany(): string | null {
  const selectors = [
    '[data-field="experience_company_logo"] ~ div span[aria-hidden="true"]',
    '.pv-entity__secondary-title',
    '.experience-item__subtitle',
  ]
  for (const sel of selectors) {
    const el = document.querySelector(sel) as HTMLElement | null
    if (el) {
      const text = el.innerText?.trim()
      if (text && text.length > 1) return text
    }
  }
  return null
}

function normalizeText(text: string) {
  return text.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

function sectionText(label: string): string | null {
  const main = document.querySelector('main')
  if (!main) return null
  const headings = Array.from(main.querySelectorAll('section h2, section [role="heading"], h2')) as HTMLElement[]
  const heading = headings.find(element => normalizeText(element.innerText || '').toLowerCase().startsWith(label.toLowerCase()))
  const section = heading?.closest('section') as HTMLElement | null
  const text = normalizeText(section?.innerText || '')
  if (!text) return null
  return text.replace(new RegExp(`^${label}\\s*`, 'i'), '').trim() || null
}

function extractLocation(): string | null {
  const selectors = [
    '.text-body-small.inline.t-black--light.break-words',
    '.pv-text-details__left-panel span.text-body-small',
    '.ph5 span.text-body-small',
  ]
  for (const sel of selectors) {
    const el = document.querySelector(sel) as HTMLElement | null
    const text = normalizeText(el?.innerText ?? '')
    if (text && text.length > 2 && !/contact info/i.test(text)) return text
  }
  return null
}

function extractProfileMarkdown(input: {
  name: string | null
  jobTitle: string | null
  company: string | null
  linkedinUrl: string
}) {
  const main = document.querySelector('main') as HTMLElement | null
  const location = extractLocation()
  const about = sectionText('About')
  const experience = sectionText('Experience')
  const education = sectionText('Education')
  const featured = sectionText('Featured')
  const activity = sectionText('Activity')
  const fullText = normalizeText(main?.innerText || '')
  const parts = [
    `# ${input.name || 'LinkedIn profile'}`,
    `- LinkedIn: ${input.linkedinUrl}`,
    `- Captured: ${new Date().toISOString()}`,
    input.jobTitle ? `- Headline: ${input.jobTitle}` : null,
    input.company ? `- Current company: ${input.company}` : null,
    location ? `- Location: ${location}` : null,
    about ? `\n## About\n${about}` : null,
    featured ? `\n## Featured\n${featured}` : null,
    experience ? `\n## Experience\n${experience}` : null,
    education ? `\n## Education\n${education}` : null,
    activity ? `\n## Activity\n${activity}` : null,
    fullText ? `\n## Full visible profile text\n${fullText}` : null,
  ]
  return parts.filter(Boolean).join('\n')
}

function findProfilePhotoUrl(): string | null {
  // The logged-in user's own avatar lives in the nav/header, NOT in <main>.
  // The visited contact's profile photo is always inside <main>.
  // So: only scan inside <main> to avoid picking up the wrong person's photo.
  const mainEl = document.querySelector('main')
  if (!mainEl) return null

  const imgs = Array.from(mainEl.querySelectorAll('img')) as HTMLImageElement[]

  // Step 1: prefer images whose URL contains 'profile-displayphoto' (the contact's main photo)
  for (const img of imgs) {
    const url = extractPhotoUrl(img)
    if (url && url.indexOf('profile-displayphoto') !== -1) return url
  }

  // Step 2: any media.licdn.com/dms/image inside main as fallback
  for (const img of imgs) {
    const url = extractPhotoUrl(img)
    if (url && url.indexOf('media.licdn.com/dms/image') !== -1) return url
  }

  return null
}

function extractConnectionState(): { state: 'connect_available' | 'pending' | 'connected'; rawLabel: string | null } | null {
  const mainEl = document.querySelector('main')
  if (!mainEl) return null
  const labels = Array.from(mainEl.querySelectorAll('button, a'))
    .map(element => ((element as HTMLElement).innerText || element.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const pending = labels.find(label => /pending|pendiente/i.test(label))
  if (pending) return { state: 'pending', rawLabel: pending }
  const connect = labels.find(label => /^(connect|conectar)$/i.test(label) || /connect with|conectar con/i.test(label))
  if (connect) return { state: 'connect_available', rawLabel: connect }
  const degree = (mainEl.textContent ?? '').match(/(?:·\s*1st\b|1st degree connection|conexi[oó]n de primer grado)/i)?.[0]
  if (degree) return { state: 'connected', rawLabel: degree }
  return null
}

function localDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function connectedOnFromText(text: string, capturedAt = new Date()): string | null {
  const absolute = text.match(/(?:connected|conectad[oa])(?:\s+on|\s+el)?\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/i)
  if (absolute) {
    const parsed = new Date(`${absolute[1]} 12:00:00`)
    if (!Number.isNaN(parsed.getTime())) return localDateKey(parsed)
  }
  const days = text.match(/(?:connected|conectad[oa])\s+(\d+)\s+(?:days?|d[ií]as?)\s+ago/i)
  if (days) {
    const parsed = new Date(capturedAt)
    parsed.setDate(parsed.getDate() - Number(days[1]))
    return localDateKey(parsed)
  }
  if (/(?:connected|conectad[oa])\s+(?:yesterday|ayer)/i.test(text)) {
    const parsed = new Date(capturedAt)
    parsed.setDate(parsed.getDate() - 1)
    return localDateKey(parsed)
  }
  if (/(?:connected|conectad[oa])\s+(?:today|hoy)/i.test(text)) return localDateKey(capturedAt)
  const compact = text.match(/\b(\d+)\s*([hdw])\b/i)
  if (compact) {
    const parsed = new Date(capturedAt)
    const quantity = Number(compact[1])
    const unit = compact[2].toLowerCase()
    if (unit === 'h') parsed.setHours(parsed.getHours() - quantity)
    else parsed.setDate(parsed.getDate() - quantity * (unit === 'w' ? 7 : 1))
    return localDateKey(parsed)
  }
  return null
}

const reportedConnections = new Set<string>()

function reportConnectedProfile(rawUrl: string, rawLabel: string, profileName?: string | null, connectedOn?: string | null) {
  const linkedinUrl = cleanLinkedInUrl(rawUrl)
  const reportKey = `${linkedinUrl}:${connectedOn ?? 'observed'}`
  if (!linkedinUrl || reportedConnections.has(reportKey)) return
  reportedConnections.add(reportKey)
  chrome.runtime.sendMessage({
    type: 'LINKEDIN_CONNECTION_STATE',
    linkedinUrl,
    state: 'connected',
    rawLabel,
    profileName: profileName?.trim() || null,
    connectedOn: connectedOn ?? null,
    timestamp: Date.now(),
  }).then(result => {
    if (result && !result.success) {
      reportedConnections.delete(reportKey)
    }
  }).catch(() => reportedConnections.delete(reportKey))
}

function scanConnectionSurfaces() {
  const main = document.querySelector('main')
  if (!main) return
  if (/\/mynetwork\/invite-connect\/connections/i.test(window.location.pathname)) {
    main.querySelectorAll('li, [class*="connection-card"]').forEach(row => {
      const link = row.querySelector('a[href*="linkedin.com/in/"], a[href^="/in/"]') as HTMLAnchorElement | null
      if (!link?.href) return
      const text = (row.textContent ?? '').replace(/\s+/g, ' ').trim()
      const name = (link.textContent ?? '').replace(/\s+/g, ' ').trim()
      const connectedOn = connectedOnFromText(text)
      if (connectedOn) reportConnectedProfile(link.href, 'Connections list', name, connectedOn)
    })
  }
  main.querySelectorAll('li, article').forEach(row => {
    const text = (row.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!/accepted your invitation|acept[oó] tu invitaci[oó]n/i.test(text)) return
    const link = row.querySelector('a[href*="linkedin.com/in/"], a[href^="/in/"]') as HTMLAnchorElement | null
    if (link?.href) {
      const name = (link.textContent ?? '').replace(/\s+/g, ' ').trim()
      reportConnectedProfile(link.href, 'Accepted invitation notification', name, connectedOnFromText(text))
    }
  })
}

// Fetch the photo from the content-script context (which has LinkedIn session cookies)
// and return a compact JPEG base64 data URL to avoid fetching from the service worker
// (which lacks LinkedIn auth cookies and would get a 401).
async function fetchPhotoBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: 'include', mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    // Re-encode as JPEG at 80% quality via canvas to keep size small (~20-40KB)
    return await compressToBase64(blob)
  } catch {
    return null
  }
}

function compressToBase64(blob: Blob): Promise<string | null> {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      URL.revokeObjectURL(url)
      try {
        // Target: max 200×200, JPEG 80%
        const MAX = 200
        const scale = Math.min(1, MAX / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve(null); return }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}

async function init() {
  scanConnectionSurfaces()
  const name = extractName()
  const jobTitle = extractJobTitle()
  const company = extractCompany()
  const linkedinUrl = cleanLinkedInUrl(window.location.href)

  if (!linkedinUrl) return

  const photoUrl = findProfilePhotoUrl()

  // Fetch photo in this content-script context (has LinkedIn cookies) and compress
  let photoBase64: string | null = null
  if (photoUrl) {
    photoBase64 = await fetchPhotoBase64(photoUrl)
  }

  console.log('reThink: LinkedIn profile extracted:', name, linkedinUrl, photoUrl ? '📷' : '(no photo)')

  chrome.runtime.sendMessage({
    type: 'LINKEDIN_PROFILE_DATA',
    name,
    jobTitle,
    company,
    linkedinUrl,
    profilePhotoUrl: photoUrl,   // keep raw URL as fallback
    photoBase64,                  // compressed base64 — preferred for upload
    profileMarkdown: extractProfileMarkdown({ name, jobTitle, company, linkedinUrl }),
  })

  const connectionState = extractConnectionState()
  if (connectionState) {
    const connectedOn = connectionState.state === 'connected'
      ? connectedOnFromText(document.querySelector('main')?.textContent ?? '')
      : null
    chrome.runtime.sendMessage({
      type: 'LINKEDIN_CONNECTION_STATE',
      linkedinUrl,
      state: connectionState.state,
      rawLabel: connectionState.rawLabel,
      profileName: name,
      connectedOn,
      timestamp: Date.now(),
    }).then(result => {
      if (result && !result.success) console.warn('reThink: connection state was not recorded:', result.error)
    }).catch(() => {})
  }
}

let observedUrl = window.location.href
let scheduleGeneration = 0
let surfaceScanTimer: ReturnType<typeof setTimeout> | null = null
function scheduleInit() {
  const generation = ++scheduleGeneration
  setTimeout(() => { if (generation === scheduleGeneration) void init() }, 1200)
  setTimeout(() => { if (generation === scheduleGeneration) void init() }, 3200)
}

function scheduleSurfaceScan() {
  if (surfaceScanTimer) clearTimeout(surfaceScanTimer)
  surfaceScanTimer = setTimeout(() => {
    surfaceScanTimer = null
    scanConnectionSurfaces()
  }, 500)
}

// LinkedIn navigates between profiles without reloading the document.
const routeObserver = new MutationObserver(() => {
  scheduleSurfaceScan()
  if (window.location.href === observedUrl) return
  observedUrl = window.location.href
  scheduleInit()
})
routeObserver.observe(document.documentElement, { childList: true, subtree: true })
window.addEventListener('popstate', () => {
  observedUrl = window.location.href
  scheduleInit()
})

// Run after LinkedIn settles and again after SPA route changes.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', scheduleInit)
} else {
  scheduleInit()
}
