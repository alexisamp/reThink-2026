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

function extractProfileData() {
  // Name
  let name: string | null = null
  const h1 = document.querySelector('h1.text-heading-xlarge') as HTMLElement | null
  if (h1) name = h1.innerText?.trim() ?? null

  // Job title
  let jobTitle: string | null = null
  const titleEl = document.querySelector('.text-body-medium.break-words') as HTMLElement | null
  if (titleEl) jobTitle = titleEl.innerText?.trim() ?? null

  // Company (from experience section or headline fallback)
  let company: string | null = null
  const companyEl = document.querySelector('[data-field="experience_company_logo"] ~ div span[aria-hidden="true"]') as HTMLElement | null
  if (companyEl) company = companyEl.innerText?.trim() ?? null

  // LinkedIn URL (normalized)
  const linkedinUrl = cleanLinkedInUrl(window.location.href)

  // Photo — 5-step chain
  let profilePhotoUrl: string | null = null

  // Step 1: og:image meta
  const ogImage = document.querySelector('meta[property="og:image"]')
  if (ogImage) {
    const ogUrl = ogImage.getAttribute('content') ?? ''
    if (ogUrl && ogUrl.indexOf('media.licdn.com') !== -1) {
      profilePhotoUrl = ogUrl
    }
  }

  // Step 2: Specific class selectors
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

  // Step 3: Scan all imgs for 'profile-display'
  if (!profilePhotoUrl) {
    const imgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[]
    for (const img of imgs) {
      const url = extractPhotoUrl(img)
      if (url && url.indexOf('profile-display') !== -1) {
        profilePhotoUrl = url
        break
      }
    }
  }

  // Step 4: Top card fallback
  if (!profilePhotoUrl) {
    const topCard = document.querySelector('.pv-top-card') ?? document.querySelector('.artdeco-card')
    if (topCard) {
      const imgs = Array.from(topCard.querySelectorAll('img')) as HTMLImageElement[]
      for (const img of imgs) {
        const url = extractPhotoUrl(img)
        if (url && url.indexOf('media.licdn.com/dms/image') !== -1) {
          profilePhotoUrl = url
          break
        }
      }
    }
  }

  return { name, jobTitle, company, linkedinUrl, profilePhotoUrl }
}

// Wait for page to load then extract and send
function init() {
  const data = extractProfileData()
  if (data.linkedinUrl) {
    chrome.runtime.sendMessage({
      type: 'LINKEDIN_PROFILE_DATA',
      ...data,
    })
  }
}

// Run after LinkedIn SPA settles
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(init, 1500))
} else {
  setTimeout(init, 1500)
}
