// LinkedIn profile content script — Phase 5
// Extracts contact data from LinkedIn profile pages and sends to service worker

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

function isProfileDisplayPhoto(url: string): boolean {
  // LinkedIn profile photos contain 'profile-displayphoto' in the path.
  // Nav avatars, company logos, and post images do NOT.
  return url.indexOf('profile-displayphoto') !== -1
}

function findProfilePhotoUrl(): string | null {
  // Exclude images inside the global nav (that's the logged-in user's own avatar)
  const nav = document.querySelector('#global-nav, nav[aria-label]')

  // Step 1: specific class selectors scoped outside nav
  const selectors = [
    'img.pv-top-card-profile-picture__image--show',
    'img.pv-top-card-profile-picture__image',
    'img.profile-photo-edit__preview',
    'img.EntityPhoto-circle-5',
  ]
  for (const sel of selectors) {
    const el = document.querySelector(sel) as HTMLImageElement | null
    if (!el) continue
    if (nav?.contains(el)) continue  // skip if inside nav
    const url = extractPhotoUrl(el)
    if (url) return url
  }

  // Step 2: any img with 'profile-displayphoto' in the URL — most reliable signal
  for (const img of Array.from(document.querySelectorAll('img')) as HTMLImageElement[]) {
    if (nav?.contains(img)) continue
    const url = extractPhotoUrl(img)
    if (url && isProfileDisplayPhoto(url)) return url
  }

  // Step 3: profile photo inside the main content top card area
  const topCard = document.querySelector('main .pv-top-card, main section:first-of-type, .scaffold-layout__main section')
  if (topCard) {
    for (const img of Array.from(topCard.querySelectorAll('img')) as HTMLImageElement[]) {
      const url = extractPhotoUrl(img)
      if (url && url.indexOf('media.licdn.com/dms/image') !== -1) return url
    }
  }

  return null
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
  })
}

// Run after LinkedIn SPA settles — try at 1.5s and again at 4s in case page was slow
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => init(), 1500)
    setTimeout(() => init(), 4000)
  })
} else {
  setTimeout(() => init(), 1500)
  setTimeout(() => init(), 4000)
}
