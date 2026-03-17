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

// Register context menus on install
chrome.runtime.onInstalled.addListener(() => {
  // "page" context: works when right-clicking anywhere on a profile page
  chrome.contextMenus.create({
    id: 'rethink-outreach-page',
    title: 'Add to reThink Outreach',
    contexts: ['page'],
    documentUrlPatterns: ['https://www.linkedin.com/in/*'],
  })

  // "link" context: works when right-clicking a profile link in feed/search
  chrome.contextMenus.create({
    id: 'rethink-outreach-link',
    title: 'Add to reThink Outreach',
    contexts: ['link'],
    documentUrlPatterns: ['https://www.linkedin.com/*'],
    targetUrlPatterns: ['https://www.linkedin.com/in/*'],
  })
})

// Handle context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'rethink-outreach-page' && info.menuItemId !== 'rethink-outreach-link') return

  // Determine URL: for page context use tab URL, for link context use linkUrl
  const rawUrl = info.menuItemId === 'rethink-outreach-page'
    ? (tab?.url || '')
    : (info.linkUrl || '')

  const cleanUrl = cleanLinkedInUrl(rawUrl)
  if (!cleanUrl) {
    showNotification('reThink Outreach', 'Not a LinkedIn profile URL')
    return
  }

  // Get contact data from the content script
  let name = null
  let job_title = null
  let company = null
  let location = null

  try {
    if (tab && tab.id) {
      const msgType = info.menuItemId === 'rethink-outreach-page' ? 'GET_PROFILE_DATA' : 'GET_CONTACT'
      const response = await chrome.tabs.sendMessage(tab.id, { type: msgType })
      if (response) {
        name = response.name || null
        job_title = response.job_title || null
        company = response.company || null
        location = response.location || null
      }
    }
  } catch (_err) {
    // Content script may not be ready — continue with name = null
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
      contact_type: 'networking',
      status: 'CONTACTED',
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
