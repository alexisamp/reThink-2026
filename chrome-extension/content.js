// content.js — runs on linkedin.com pages
// Injects a floating button on profile pages and handles data extraction

/**
 * Cleans a LinkedIn URL to only keep https://www.linkedin.com/in/{slug}
 */
function cleanLinkedInUrl(url) {
  if (!url) return null
  var match = url.match(/linkedin\.com\/in\/([^/?#&]+)/)
  if (!match) return null
  return 'https://www.linkedin.com/in/' + match[1]
}

function isProfilePage() {
  return /linkedin\.com\/in\/[^/?#]+/.test(window.location.href)
}

function extractText(selectors, root) {
  root = root || document
  for (var i = 0; i < selectors.length; i++) {
    try {
      var el = root.querySelector(selectors[i])
      if (el) {
        var text = (el.textContent || '').trim()
        if (text) return text.split('\n')[0].trim().substring(0, 120)
      }
    } catch (_) {}
  }
  return null
}

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

function extractProfilePageData() {
  var url = cleanLinkedInUrl(window.location.href)

  var name = extractText([
    'h1.text-heading-xlarge',
    'h1[class*="text-heading-xlarge"]',
    '.pv-text-details__left-panel h1',
    '.ph5 h1',
    'h1',
  ])

  // Fallback: derive name from URL slug
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

  return { name: name, url: url, job_title: parsed.job_title, company: parsed.company, location: location }
}

// ── Floating button ──────────────────────────────────────────────────────────

var BUTTON_ID = 'rethink-outreach-btn'

function injectButton() {
  if (document.getElementById(BUTTON_ID)) return
  if (!isProfilePage()) return

  var btn = document.createElement('button')
  btn.id = BUTTON_ID
  btn.innerHTML = '<img src="' + chrome.runtime.getURL('icon48.png') + '" style="width:16px;height:16px;border-radius:3px;vertical-align:middle;margin-right:6px;" /><span>Add to Outreach</span>'
  btn.style.cssText = [
    'position:fixed',
    'top:80px',
    'right:24px',
    'z-index:99999',
    'background:#003720',
    'color:#ffffff',
    'border:none',
    'border-radius:10px',
    'padding:10px 16px',
    'font-size:13px',
    'font-weight:600',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'cursor:pointer',
    'display:flex',
    'align-items:center',
    'box-shadow:0 4px 16px rgba(0,0,0,0.25)',
    'transition:opacity 0.15s',
    'letter-spacing:0.01em',
  ].join(';')

  btn.addEventListener('mouseenter', function() { btn.style.opacity = '0.88' })
  btn.addEventListener('mouseleave', function() { btn.style.opacity = '1' })

  btn.addEventListener('click', function() {
    var data = extractProfilePageData()
    if (!data.url) {
      setButtonState(btn, 'error', 'Not a profile URL')
      return
    }
    setButtonState(btn, 'loading', 'Saving…')
    chrome.runtime.sendMessage({ type: 'SAVE_CONTACT', data: data }, function(response) {
      if (chrome.runtime.lastError) {
        setButtonState(btn, 'error', 'Extension error')
        setTimeout(function() { setButtonState(btn, 'idle') }, 2500)
        return
      }
      if (response && response.ok) {
        setButtonState(btn, 'success', 'Saved ✓')
        setTimeout(function() { setButtonState(btn, 'idle') }, 2000)
      } else {
        setButtonState(btn, 'error', response && response.error ? response.error.substring(0, 40) : 'Error')
        setTimeout(function() { setButtonState(btn, 'idle') }, 3000)
      }
    })
  })

  document.body.appendChild(btn)
}

function setButtonState(btn, state, label) {
  var span = btn.querySelector('span')
  if (state === 'idle') {
    btn.style.background = '#003720'
    btn.disabled = false
    if (span) span.textContent = 'Add to Outreach'
  } else if (state === 'loading') {
    btn.style.background = '#536471'
    btn.disabled = true
    if (span) span.textContent = label || 'Saving…'
  } else if (state === 'success') {
    btn.style.background = '#1a7a3a'
    btn.disabled = false
    if (span) span.textContent = label || 'Saved ✓'
  } else if (state === 'error') {
    btn.style.background = '#b91c1c'
    btn.disabled = false
    if (span) span.textContent = label || 'Error'
  }
}

function removeButton() {
  var btn = document.getElementById(BUTTON_ID)
  if (btn) btn.remove()
}

// Inject on load
if (isProfilePage()) {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButton)
  } else {
    setTimeout(injectButton, 800)
  }
}

// Handle LinkedIn's SPA navigation (URL changes without page reload)
var lastUrl = window.location.href
var navObserver = new MutationObserver(function() {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href
    removeButton()
    if (isProfilePage()) {
      setTimeout(injectButton, 800)
    }
  }
})
navObserver.observe(document.body, { childList: true, subtree: true })
