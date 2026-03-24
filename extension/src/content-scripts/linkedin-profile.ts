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
  const url = el.src || el.getAttribute('data-delayed-url') || el.getAttribute('data-ghost-url') || ''
  if (url && url.indexOf('media.licdn.com') !== -1) return url.split('?')[0]
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
      const text = el.innerText?.trim()
      // Sanity check: a name is 2-60 chars and doesn't look like a job title
      if (text && text.length >= 2 && text.length < 60 && !text.includes('|') && !text.includes('·')) {
        return text
      }
    }
  }
  // Fallback: extract from URL slug
  const match = window.location.href.match(/linkedin\.com\/in\/([^/?#&]+)/)
  if (match?.[1]) {
    return match[1]
      .split('-')
      .filter(w => w.length > 1)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  }
  return null
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

function extractProfileData() {
  const name = extractName()
  const jobTitle = extractJobTitle()
  const company = extractCompany()
  const linkedinUrl = cleanLinkedInUrl(window.location.href)

  // Photo — 5-step chain
  let profilePhotoUrl: string | null = null

  // Step 1: og:image meta
  const ogImage = document.querySelector('meta[property="og:image"]')
  if (ogImage) {
    const ogUrl = ogImage.getAttribute('content') ?? ''
    if (ogUrl && ogUrl.indexOf('media.licdn.com') !== -1) profilePhotoUrl = ogUrl
  }

  // Step 2: known class selectors
  if (!profilePhotoUrl) {
    const selectors = [
      'img.pv-top-card-profile-picture__image--show',
      'img.pv-top-card-profile-picture__image',
      'img.profile-photo-edit__preview',
      'img.EntityPhoto-circle-5',
      'img[data-ghost-classes]',
    ]
    for (const sel of selectors) {
      const el = document.querySelector(sel) as HTMLImageElement | null
      const url = extractPhotoUrl(el)
      if (url) { profilePhotoUrl = url; break }
    }
  }

  // Step 3: scan imgs for 'profile-display'
  if (!profilePhotoUrl) {
    for (const img of Array.from(document.querySelectorAll('img')) as HTMLImageElement[]) {
      const url = extractPhotoUrl(img)
      if (url && url.indexOf('profile-display') !== -1) { profilePhotoUrl = url; break }
    }
  }

  // Step 4: top card fallback
  if (!profilePhotoUrl) {
    const topCard = document.querySelector('.pv-top-card') ?? document.querySelector('.artdeco-card')
    if (topCard) {
      for (const img of Array.from(topCard.querySelectorAll('img')) as HTMLImageElement[]) {
        const url = extractPhotoUrl(img)
        if (url && url.indexOf('media.licdn.com/dms/image') !== -1) { profilePhotoUrl = url; break }
      }
    }
  }

  return { name, jobTitle, company, linkedinUrl, profilePhotoUrl }
}

function init() {
  const data = extractProfileData()
  if (!data.linkedinUrl) return

  console.log('reThink: LinkedIn profile extracted:', data.name, data.linkedinUrl)
  chrome.runtime.sendMessage({ type: 'LINKEDIN_PROFILE_DATA', ...data })
}

// Run after LinkedIn SPA settles — try at 1.5s and again at 3s in case page was slow
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(init, 1500)
    setTimeout(init, 3000)
  })
} else {
  setTimeout(init, 1500)
  setTimeout(init, 3000)
}
