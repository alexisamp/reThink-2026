// content.js — runs on linkedin.com pages
// Tracks the last right-clicked element so background can extract contact info

let lastRightClickTarget = null

document.addEventListener('contextmenu', (e) => {
  lastRightClickTarget = e.target
}, true) // capture phase

/**
 * Cleans a LinkedIn URL to only keep https://www.linkedin.com/in/{slug}
 * Strips query params, hash fragments, trailing slashes after the slug.
 * @param {string} url
 * @returns {string|null}
 */
function cleanLinkedInUrl(url) {
  const match = url.match(/linkedin\.com\/in\/([^/?#&]+)/)
  if (!match) return null
  return `https://www.linkedin.com/in/${match[1]}`
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'GET_CONTACT') return false

  // Find the closest anchor with a LinkedIn /in/ href
  let anchor = null

  if (lastRightClickTarget) {
    // Walk up the DOM from the right-clicked element
    let el = lastRightClickTarget
    while (el && el !== document.body) {
      if (el.tagName === 'A' && el.href && /linkedin\.com\/in\//.test(el.href)) {
        anchor = el
        break
      }
      el = el.parentElement
    }
  }

  if (!anchor) {
    sendResponse({ name: null, url: null })
    return false
  }

  const cleanUrl = cleanLinkedInUrl(anchor.href)

  // Try to extract the name from the anchor or nearby container
  let name = null

  // Walk up to find a container that might hold the name
  let container = anchor
  for (let i = 0; i < 6 && container; i++) {
    const selectors = [
      '.t-bold',
      '.entity-result__title-text',
      '.feed-shared-actor__name',
      '.mn-connection-card__name',
      '[data-anonymize="person-name"]',
    ]
    for (const sel of selectors) {
      const el = container.querySelector(sel)
      if (el) {
        const text = el.textContent.trim()
        if (text) {
          name = text.split('\n')[0].trim().substring(0, 80)
          break
        }
      }
    }
    if (name) break
    container = container.parentElement
  }

  // Fallback: use the anchor's own text content
  if (!name) {
    const raw = anchor.textContent.trim()
    if (raw) {
      name = raw.split('\n')[0].trim().substring(0, 80)
    }
  }

  sendResponse({ name: name || null, url: cleanUrl })
  return false
})
