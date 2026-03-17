// content.js — runs on linkedin.com pages
// Extracts contact info from the current page and right-click context

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
  if (!url) return null
  const match = url.match(/linkedin\.com\/in\/([^/?#&]+)/)
  if (!match) return null
  return `https://www.linkedin.com/in/${match[1]}`
}

/**
 * Returns true if the current page is a LinkedIn person profile (/in/slug)
 */
function isProfilePage() {
  return /linkedin\.com\/in\/[^/?#]+/.test(window.location.href)
}

/**
 * Extracts the first non-empty text from a list of CSS selectors.
 */
function extractText(selectors, root) {
  root = root || document
  for (var i = 0; i < selectors.length; i++) {
    try {
      var el = root.querySelector(selectors[i])
      if (el) {
        var text = (el.textContent || '').trim()
        if (text) return text.split('\n')[0].trim().substring(0, 120)
      }
    } catch (_) { /* ignore invalid selectors */ }
  }
  return null
}

/**
 * Parses "Job Title at Company" into { job_title, company }
 */
function parseHeadline(headline) {
  if (!headline) return { job_title: null, company: null }
  var atMatch = headline.match(/^(.+?)\s+(?:at|en|@)\s+(.+)$/i)
  if (atMatch) {
    return {
      job_title: atMatch[1].trim().substring(0, 100),
      company: atMatch[2].trim().substring(0, 100),
    }
  }
  return { job_title: headline.substring(0, 100), company: null }
}

/**
 * Extracts profile data when on a LinkedIn /in/ profile page.
 */
function extractProfilePageData() {
  var url = cleanLinkedInUrl(window.location.href)

  var name = extractText([
    'h1.text-heading-xlarge',
    'h1[class*="text-heading-xlarge"]',
    '.pv-text-details__left-panel h1',
    '.ph5 h1',
    'h1',
  ])

  // Fallback: derive name from URL slug (e.g. maria-jose-zuniga → Maria Jose Zuniga)
  if (!name && url) {
    var slugMatch = url.match(/\/in\/([^/]+)/)
    if (slugMatch) {
      name = slugMatch[1].split('-').map(function(w) {
        return w.charAt(0).toUpperCase() + w.slice(1)
      }).join(' ')
    }
  }

  var headline = extractText([
    '.text-body-medium.break-words',
    '.pv-text-details__left-panel .text-body-medium',
    '.ph5 .text-body-medium',
  ])

  var parsed = parseHeadline(headline)

  var location = extractText([
    '.pv-text-details__left-panel .text-body-small.inline',
    '.text-body-small.inline.t-black--light',
    '.ph5 .text-body-small.inline',
  ])

  return {
    name: name,
    url: url,
    job_title: parsed.job_title,
    company: parsed.company,
    location: location,
  }
}

chrome.runtime.onMessage.addListener(function(message, _sender, sendResponse) {
  if (message.type === 'GET_PROFILE_DATA') {
    sendResponse(extractProfilePageData())
    return false
  }

  if (message.type === 'GET_CONTACT') {
    // If on a profile page, use richer extraction
    if (isProfilePage()) {
      sendResponse(extractProfilePageData())
      return false
    }

    // Otherwise find the closest /in/ link from the right-click target
    var anchor = null
    if (lastRightClickTarget) {
      var el = lastRightClickTarget
      while (el && el !== document.body) {
        if (el.tagName === 'A' && el.href && /linkedin\.com\/in\//.test(el.href)) {
          anchor = el
          break
        }
        el = el.parentElement
      }
    }

    if (!anchor) {
      sendResponse({ name: null, url: null, job_title: null, company: null, location: null })
      return false
    }

    var url = cleanLinkedInUrl(anchor.href)
    var name = null
    var container = anchor

    for (var i = 0; i < 6 && container; i++) {
      var nameSelectors = [
        '.t-bold',
        '.entity-result__title-text',
        '.feed-shared-actor__name',
        '.mn-connection-card__name',
        '[data-anonymize="person-name"]',
      ]
      for (var j = 0; j < nameSelectors.length; j++) {
        var nameEl = container.querySelector(nameSelectors[j])
        if (nameEl) {
          var nameText = (nameEl.textContent || '').trim()
          if (nameText) {
            name = nameText.split('\n')[0].trim().substring(0, 80)
            break
          }
        }
      }
      if (name) break
      container = container.parentElement
    }

    if (!name) {
      var raw = (anchor.textContent || '').trim()
      if (raw) name = raw.split('\n')[0].trim().substring(0, 80)
    }

    // Try to find headline/subtitle near the link
    var job_title = null
    var company = null
    if (anchor.parentElement) {
      var subtitleEl = anchor.parentElement.querySelector(
        '.entity-result__primary-subtitle, .t-14.t-black--light.t-normal, [data-anonymize="headline"]'
      )
      if (subtitleEl) {
        var subtitle = (subtitleEl.textContent || '').trim()
        var subtitleParsed = parseHeadline(subtitle)
        job_title = subtitleParsed.job_title
        company = subtitleParsed.company
      }
    }

    sendResponse({ name: name || null, url: url, job_title: job_title, company: company, location: null })
    return false
  }

  return false
})
