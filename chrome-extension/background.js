// background.js — service worker for reThink Outreach extension

const SUPABASE_URL = 'https://amvezbymrnvrwcypivkf.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtdmV6Ynltcm52cndjeXBpdmtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTIxNTgsImV4cCI6MjA4NDU4ODE1OH0.6qgaygMynKaKYB9TlcJAlyLMt87wc7D8PbA5ZeDGDUg'

/**
 * Cleans a LinkedIn URL to only keep https://www.linkedin.com/in/{slug}
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
 * Fetches a LinkedIn company page and extracts the website domain.
 * LinkedIn company pages show the website in the About section.
 * Returns the domain string (e.g. "fintual.com") or null if not found.
 */
async function extractCompanyDomain(companyLinkedInUrl) {
  try {
    const res = await fetch(companyLinkedInUrl, { credentials: 'include' })
    if (!res.ok) return null
    const html = await res.text()

    // LinkedIn encodes the website in multiple ways — try each:
    // 1. data-tracking-control-name="about_website" href="..."
    const trackingMatch = html.match(/data-tracking-control-name="about_website"[^>]*href="([^"]+)"/)
    if (trackingMatch) return cleanDomain(trackingMatch[1])

    // 2. "companyPageUrl":"https://..." near website context
    const jsonMatch = html.match(/"websiteUrl"\s*:\s*"([^"]+)"/)
    if (jsonMatch) return cleanDomain(jsonMatch[1])

    // 3. Plain text pattern: website URL after "Website" label in structured data
    const aboutMatch = html.match(/"website"\s*:\s*\{\s*"value"\s*:\s*"([^"]+)"/)
    if (aboutMatch) return cleanDomain(aboutMatch[1])

    return null
  } catch { return null }
}

function cleanDomain(url) {
  try {
    const u = new URL(url.startsWith('http') ? url : 'https://' + url)
    return u.hostname.replace(/^www\./, '')
  } catch { return null }
}

/**
 * Gets a valid access token, refreshing if expired.
 * Returns null if not authenticated.
 */
async function getValidToken() {
  const result = await chrome.storage.local.get('authData')
  const authData = result.authData
  if (!authData) return null

  const { access_token, refresh_token, expires_at } = authData

  // expires_at is a Unix timestamp in seconds; add 60s margin
  const nowInSeconds = Math.floor(Date.now() / 1000)
  if (expires_at && nowInSeconds < expires_at - 60) {
    return access_token
  }

  // Token expired — attempt refresh
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ refresh_token }),
    })

    if (!res.ok) {
      await chrome.storage.local.remove('authData')
      return null
    }

    const data = await res.json()
    const newAuthData = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user_id: authData.user_id,
      expires_at: data.expires_at ?? Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    }
    await chrome.storage.local.set({ authData: newAuthData })
    return newAuthData.access_token
  } catch (_err) {
    await chrome.storage.local.remove('authData')
    return null
  }
}

/**
 * Shows a Chrome notification.
 */
function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon48.png',
    title,
    message,
  })
}

// Register context menus on install (remove first to avoid duplicate ID errors on reload)
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'rethink-outreach-page',
      title: 'Add to reThink Outreach',
      contexts: ['page'],
      documentUrlPatterns: ['https://www.linkedin.com/in/*'],
    })
    chrome.contextMenus.create({
      id: 'rethink-outreach-link',
      title: 'Add to reThink Outreach',
      contexts: ['link'],
      documentUrlPatterns: ['https://www.linkedin.com/*'],
      targetUrlPatterns: ['https://www.linkedin.com/in/*'],
    })
  })
})

// ── Message handler (from floating button in content script) ─────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'SAVE_CONTACT') return false

  const { data } = message
  const cleanUrl = cleanLinkedInUrl(data.url || '')
  if (!cleanUrl) {
    sendResponse({ ok: false, error: 'Invalid URL' })
    return false
  }

  // Async handler — must return true to keep the channel open
  ;(async () => {
    const token = await getValidToken()
    if (!token) {
      sendResponse({ ok: false, error: 'Not connected' })
      return
    }

    const result = await chrome.storage.local.get('authData')
    const userId = result.authData?.user_id
    const today = new Date().toISOString().split('T')[0]

    const name = data.name || (() => {
      const m = cleanUrl.match(/\/in\/([^/]+)/)
      return m ? m[1].split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ') : 'Unknown'
    })()

    // Try to extract company domain from the LinkedIn company page
    let companyDomain = data.company_domain || null
    if (!companyDomain && data.company_linkedin_url) {
      companyDomain = await extractCompanyDomain(data.company_linkedin_url)
    }

    const body = {
      user_id: userId,
      name,
      linkedin_url: cleanUrl,
      category: data.category || 'peer',
      status: 'PROSPECT',
      log_date: today,
    }
    if (data.job_title) body.job_title = data.job_title
    if (data.company) body.company = data.company
    if (data.location) body.location = data.location
    if (data.connections_count) body.connections_count = typeof data.connections_count === 'number' ? data.connections_count : (parseInt(String(data.connections_count).replace(/,/g, ''), 10) || null)
    if (data.followers_count) body.followers_count = typeof data.followers_count === 'number' ? data.followers_count : (parseInt(String(data.followers_count).replace(/,/g, ''), 10) || null)
    if (data.about) body.about = data.about
    if (data.email) body.email = data.email
    if (data.phone) body.phone = data.phone
    if (data.website) body.website = data.website
    body.company_linkedin_url = data.company_linkedin_url || null
    body.company_domain = companyDomain
    body.profile_photo_url = data.profile_photo_url || null

    try {
      // Check for existing record with the same LinkedIn URL to avoid duplicates
      // Use ilike with slug only to avoid URL-encoding issues with PostgREST
      if (data.url) {
        const slugMatch = cleanUrl.match(/\/in\/([^/?#]+)/)
        const slug = slugMatch ? slugMatch[1] : null
        if (slug) {
          const existingRes = await fetch(
            `${SUPABASE_URL}/rest/v1/outreach_logs?select=id,profile_photo_url,followers_count,connections_count,about,location,company,company_linkedin_url,company_domain,job_title&user_id=eq.${userId}&linkedin_url=ilike.*${slug}*&limit=1`,
            {
              headers: {
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
              },
            }
          )
          if (existingRes.ok) {
            const existingArr = await existingRes.json().catch(() => [])
            const existing = existingArr && existingArr.length > 0 ? existingArr[0] : null
            if (existing) {
              // PATCH: update nulls + always refresh photo + fix bad location
              const patch = {}
              if (!existing.followers_count && body.followers_count) patch.followers_count = body.followers_count
              if (!existing.connections_count && body.connections_count) patch.connections_count = body.connections_count
              if (!existing.about && body.about) patch.about = body.about
              if (!existing.company && body.company) patch.company = body.company
              if (!existing.company_linkedin_url && body.company_linkedin_url) patch.company_linkedin_url = body.company_linkedin_url
              if (!existing.company_domain && body.company_domain) patch.company_domain = body.company_domain
              if (!existing.job_title && body.job_title) patch.job_title = body.job_title
              // Always update photo and location (they may have been wrong before)
              if (body.profile_photo_url) patch.profile_photo_url = body.profile_photo_url
              if (body.location && body.location.toLowerCase().indexOf('connection') === -1) {
                patch.location = body.location
              }

              if (Object.keys(patch).length > 0) {
                await fetch(`${SUPABASE_URL}/rest/v1/outreach_logs?id=eq.${existing.id}`, {
                  method: 'PATCH',
                  headers: {
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    Prefer: 'return=minimal',
                  },
                  body: JSON.stringify(patch),
                })
              }
              sendResponse({ ok: true, updated: true })
              return
            }
          }
        }
      }

      const res = await fetch(`${SUPABASE_URL}/rest/v1/outreach_logs`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        sendResponse({ ok: true })
      } else {
        const errText = await res.text().catch(() => '')
        sendResponse({ ok: false, error: `${res.status}: ${errText.substring(0, 60)}` })
      }
    } catch (err) {
      sendResponse({ ok: false, error: err.message || 'Network error' })
    }
  })()

  return true // keep message channel open for async response
})

// Handle context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'rethink-outreach-page' && info.menuItemId !== 'rethink-outreach-link') return

  // Get contact data from the content script first — it knows the real current URL
  let name = null
  let job_title = null
  let company = null
  let location = null
  let contentUrl = null

  try {
    if (tab && tab.id) {
      const msgType = info.menuItemId === 'rethink-outreach-page' ? 'GET_PROFILE_DATA' : 'GET_CONTACT'
      const response = await chrome.tabs.sendMessage(tab.id, { type: msgType })
      if (response) {
        name = response.name || null
        job_title = response.job_title || null
        company = response.company || null
        location = response.location || null
        // Trust the content script URL (window.location.href) over tab.url
        contentUrl = response.url || null
      }
    }
  } catch (_err) {
    // Content script may not be ready — fall back to tab/link URL
  }

  // Determine URL: prefer content script URL, fall back to link/tab URL
  const rawUrl = contentUrl
    || (info.menuItemId === 'rethink-outreach-link' ? (info.linkUrl || '') : (tab?.url || ''))

  const cleanUrl = cleanLinkedInUrl(rawUrl)
  if (!cleanUrl) {
    showNotification('reThink Outreach', 'Not a LinkedIn profile URL')
    return
  }

  // If name extraction failed, derive a best-guess name from the URL slug
  if (!name) {
    const slugMatch = cleanUrl.match(/\/in\/([^/]+)/)
    if (slugMatch) {
      name = slugMatch[1]
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    }
  }

  // Get auth token
  const token = await getValidToken()
  if (!token) {
    showNotification('reThink Outreach', 'Not connected. Open the extension popup to connect.')
    return
  }

  const result = await chrome.storage.local.get('authData')
  const authData = result.authData
  const userId = authData?.user_id

  const today = new Date().toISOString().split('T')[0]

  try {
    const body = {
      user_id: userId,
      name: name || 'Unknown',
      linkedin_url: cleanUrl,
      category: null,
      status: 'PROSPECT',
      log_date: today,
    }

    if (job_title) body.job_title = job_title
    if (company) body.company = company
    if (location) body.location = location

    const res = await fetch(`${SUPABASE_URL}/rest/v1/outreach_logs`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      const details = [company, job_title].filter(Boolean).join(' · ')
      const msg = details ? `${name || 'Unknown'} · ${details}` : (name || 'Unknown')
      showNotification('reThink Outreach ✓', msg)
    } else {
      const errText = await res.text().catch(() => '')
      showNotification('reThink Outreach', `Error saving contact (${res.status})${errText ? ': ' + errText.substring(0, 80) : ''}`)
    }
  } catch (err) {
    showNotification('reThink Outreach', `Network error: ${err.message || 'Unknown error'}`)
  }
})
