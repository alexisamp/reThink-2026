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
    // Company may have extra context after · | • — take only the first part
    var companyRaw = atMatch[2].trim()
    var company = companyRaw.split(/\s*[\u00B7|•]\s*/)[0].trim().substring(0, 100)
    return {
      job_title: atMatch[1].trim().substring(0, 100),
      company: company,
    }
  }
  return { job_title: headline.substring(0, 100), company: null }
}

function extractCompanyLinkedInUrl() {
  var links = Array.from(document.querySelectorAll('a[href*="/company/"]'))
  for (var i = 0; i < links.length; i++) {
    var href = links[i].href || ''
    var match = href.match(/linkedin\.com\/company\/([^/?#&]+)/)
    if (match) return 'https://www.linkedin.com/company/' + match[1]
  }
  return null
}

function cleanDomain(url) {
  try {
    var u = new URL(url.startsWith('http') ? url : 'https://' + url)
    return u.hostname.replace(/^www\./, '')
  } catch (_) { return null }
}

// Fetch the company page (with session cookies) and extract the website domain
function fetchCompanyDomain(companyUrl, callback) {
  if (!companyUrl) { callback(null); return }
  fetch(companyUrl, { credentials: 'include' })
    .then(function(res) { return res.text() })
    .then(function(html) {
      // Try multiple patterns LinkedIn uses for the website field
      var patterns = [
        /data-tracking-control-name="about_website"[^>]*href="([^"]+)"/,
        /"websiteUrl"\s*:\s*"([^"]+)"/,
        /"website"\s*:\s*\{\s*"value"\s*:\s*"([^"]+)"/,
        /companyPageUrl"\s*:\s*"([^"\\]+)"/
      ]
      for (var i = 0; i < patterns.length; i++) {
        var m = html.match(patterns[i])
        if (m && m[1] && m[1].indexOf('linkedin.com') === -1) {
          var domain = cleanDomain(m[1])
          if (domain) { callback(domain); return }
        }
      }
      callback(null)
    })
    .catch(function() { callback(null) })
}

function extractProfilePageData() {
  var url = cleanLinkedInUrl(window.location.href)

  // LinkedIn uses data-testid="lazy-column" as the profile card container
  var col = document.querySelector('[data-testid="lazy-column"]')

  // Name: first h1 or h2 that isn't a section title
  var name = null
  var SECTION_TITLES = ['Highlights','About','Activity','Experience','Education','Skills',
    'Following','Followers','Recommendations','Courses','Languages','Certifications',
    'Volunteering','Projects','Publications','Honors','Organizations']
  if (col) {
    var nameEl = Array.from(col.querySelectorAll('h1, h2')).find(function(e) {
      var t = e.textContent.trim()
      return t.length > 2 && t.length < 80 && SECTION_TITLES.indexOf(t) === -1
    })
    if (nameEl) name = nameEl.textContent.trim().split('\n')[0].trim().substring(0, 120)
  }
  // Fallback: derive name from URL slug
  if (!name && url) {
    var slugMatch = url.match(/\/in\/([^/]+)/)
    if (slugMatch) {
      name = slugMatch[1].split('-').map(function(w) {
        return w.charAt(0).toUpperCase() + w.slice(1)
      }).join(' ')
    }
  }

  var headline = null
  var company = null
  var location = null
  var connections_count = null
  if (col) {
    var ps = Array.from(col.querySelectorAll('p'))
      .map(function(p) { return p.textContent.trim() })
      .filter(function(t) { return t.length > 15 })

    // Headline: first p (may contain | or •)
    if (ps.length > 0) headline = ps[0].substring(0, 200)

    // Company: second p — no pipe, no bullet, no comma, no "connections", len < 80
    if (ps.length > 1) {
      var c = ps[1]
      if (c.indexOf('|') === -1 && c.indexOf('•') === -1 && c.indexOf(',') === -1 &&
          c.toLowerCase().indexOf('connections') === -1 && c.length < 80) {
        company = c.substring(0, 100)
      }
    }

    // Location: first p with comma, no pipe/bullet/parens, len < 80
    // Excludes taglines that have parentheses like "Keep moving.(by riding the bus)"
    for (var j = 0; j < ps.length; j++) {
      var t = ps[j]
      if (t.indexOf(',') !== -1 && t.indexOf('|') === -1 && t.indexOf('•') === -1 &&
          t.indexOf('(') === -1 && t.indexOf(')') === -1 && t.length < 80) {
        location = t.substring(0, 120); break
      }
    }

    // Connections count: p matching "NNN+ connections" or "NNN connections"
    for (var k = 0; k < ps.length; k++) {
      if (/\d[\d,+]* connections/i.test(ps[k])) {
        connections_count = ps[k].replace(/\s*connections.*/i, '').trim().substring(0, 20); break
      }
    }
  }

  // Followers: p with "follower" text near the Activity h2
  var followers_count = null
  if (col) {
    var activityH2 = Array.from(col.querySelectorAll('h2')).find(function(e) {
      return e.textContent.trim() === 'Activity'
    })
    if (activityH2) {
      // Walk up to find a container with the followers p sibling
      var actContainer = activityH2
      for (var fi = 0; fi < 5; fi++) {
        actContainer = actContainer.parentElement
        if (!actContainer) break
        var followerP = Array.from(actContainer.querySelectorAll('p')).find(function(p) {
          return /\d[\d,]* followers?/i.test(p.textContent) && p.children.length === 0
        })
        if (followerP) {
          followers_count = followerP.textContent.trim().substring(0, 30)
          break
        }
      }
    }
  }

  // About: find the h2 "About", walk up to its section, then get the expandable-text-box inside it
  var about = null
  if (col) {
    var aboutH2 = Array.from(col.querySelectorAll('h2')).find(function(e) {
      return e.textContent.trim() === 'About'
    })
    if (aboutH2) {
      var aboutContainer = aboutH2
      for (var ai = 0; ai < 6; ai++) {
        aboutContainer = aboutContainer.parentElement
        if (!aboutContainer) break
        var aboutEl = aboutContainer.querySelector('[data-testid="expandable-text-box"]')
        if (aboutEl) {
          var aboutText = aboutEl.textContent.trim()
          if (aboutText.length > 20) about = aboutText.substring(0, 2000)
          break
        }
      }
    }
  }

  var company_linkedin_url = extractCompanyLinkedInUrl()

  var parsed = parseHeadline(headline)
  // Prefer explicit company over headline-parsed company
  var finalCompany = company || parsed.company
  return { name: name, url: url, job_title: parsed.job_title, company: finalCompany, location: location, connections_count: connections_count, followers_count: followers_count, about: about, company_linkedin_url: company_linkedin_url }
}

// ── Contact info overlay extraction ─────────────────────────────────────────

function extractContactInfoFromOverlay() {
  var result = {}
  var all = Array.from(document.querySelectorAll('*'))
  var contactSection = null
  for (var i = 0; i < all.length; i++) {
    var e = all[i]
    var t = e.textContent.trim()
    if (t.indexOf('Contact info') === 0 && t.length < 1200 && e.children.length > 0) {
      contactSection = e; break
    }
  }
  if (!contactSection) return result
  var fullText = contactSection.textContent.trim()
  var emailMatch = fullText.match(/Email([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-z]{2,6})(?=[^a-z]|$)/)
  if (emailMatch) result.email = emailMatch[1].trim()
  var phoneMatch = fullText.match(/Phone([+\d\s().\-]+?)(?=\s*(?:Email|Birthday|Connected|Website|Twitter|Address|$))/)
  if (phoneMatch) result.phone = phoneMatch[1].trim().substring(0, 30)
  var websiteMatch = fullText.match(/Website(https?:\/\/\S+)/)
  if (websiteMatch) result.website = websiteMatch[1].trim().substring(0, 200)
  return result
}

function getContactInfo(callback) {
  var col = document.querySelector('[data-testid="lazy-column"]')
  var contactLink = col ? Array.from(col.querySelectorAll('a')).find(function(e) {
    return e.textContent.trim() === 'Contact info'
  }) : null
  if (!contactLink) { callback({}); return }

  var done = false
  function finish(result) {
    if (done) return
    done = true
    window.__rethinkFetchingContact = false
    callback(result || {})
  }

  window.__rethinkFetchingContact = true
  contactLink.click()

  var attempts = 0
  var poller = setInterval(function() {
    attempts++
    if (window.location.href.indexOf('/overlay/contact-info/') !== -1) {
      clearInterval(poller)
      setTimeout(function() {
        var result = extractContactInfoFromOverlay()
        history.back()
        var backAttempts = 0
        var backPoller = setInterval(function() {
          backAttempts++
          if (window.location.href.indexOf('/overlay/contact-info/') === -1 || backAttempts > 20) {
            clearInterval(backPoller)
            finish(result)
          }
        }, 100)
      }, 1000)
    } else if (attempts > 50) {
      clearInterval(poller)
      finish({})
    }
  }, 100)
  setTimeout(function() { finish({}) }, 8000)
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
    setButtonState(btn, 'loading', 'Getting contact info…')
    getContactInfo(function(contactInfo) {
      if (contactInfo.email) data.email = contactInfo.email
      if (contactInfo.phone) data.phone = contactInfo.phone
      if (contactInfo.website) data.website = contactInfo.website
      // Re-extract profile data in case DOM changed after navigation back
      var refreshed = extractProfilePageData()
      if (!data.name && refreshed.name) data.name = refreshed.name

      // Fetch company domain from the company page (has session cookies in content script)
      fetchCompanyDomain(data.company_linkedin_url, function(domain) {
        if (domain) data.company_domain = domain
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
    if (window.__rethinkFetchingContact) return
    removeButton()
    if (isProfilePage()) {
      setTimeout(injectButton, 800)
    }
  }
})
navObserver.observe(document.body, { childList: true, subtree: true })
