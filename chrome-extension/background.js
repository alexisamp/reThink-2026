// background.js — service worker for reThink Outreach extension

const SUPABASE_URL = 'https://amvezbymrnvrwcypivkf.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtdmV6Ynltcm52cndjeXBpdmtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTIxNTgsImV4cCI6MjA4NDU4ODE1OH0.6qgaygMynKaKYB9TlcJAlyLMt87wc7D8PbA5ZeDGDUg'

/**
 * Cleans a LinkedIn URL to only keep https://www.linkedin.com/in/{slug}
 * Strips query params, hash fragments, and anything after the slug.
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
 * @returns {Promise<string|null>}
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
 * @param {string} title
 * @param {string} message
 */
function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    title,
    message,
  })
}

// Register the context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'rethink-outreach',
    title: 'Add to reThink Outreach',
    contexts: ['link'],
    documentUrlPatterns: ['https://www.linkedin.com/*'],
  })
})

// Handle context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'rethink-outreach') return

  const rawUrl = info.linkUrl || ''
  const cleanUrl = cleanLinkedInUrl(rawUrl)

  if (!cleanUrl) {
    showNotification('reThink Outreach', 'Not a LinkedIn profile URL')
    return
  }

  // Try to get contact name from the content script
  let name = null
  try {
    if (tab && tab.id) {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CONTACT' })
      if (response && response.name) {
        name = response.name
      }
      // If the content script returns a URL too, prefer it (cleaner extraction)
      if (response && response.url) {
        // Already cleaned in content.js, but let's trust background's clean too
      }
    }
  } catch (_err) {
    // Tab may not have the content script loaded (e.g. extension just installed)
    // Fall through with name = null
  }

  // Get a valid auth token
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
    const res = await fetch(`${SUPABASE_URL}/rest/v1/outreach_logs`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        user_id: userId,
        name: name || 'Unknown',
        linkedin_url: cleanUrl,
        contact_type: 'networking',
        status: 'CONTACTED',
        log_date: today,
      }),
    })

    if (res.ok) {
      showNotification('reThink Outreach', `Added "${name || 'Unknown'}" to Outreach`)
    } else {
      const errText = await res.text().catch(() => '')
      showNotification('reThink Outreach', `Error saving contact (${res.status})${errText ? ': ' + errText.substring(0, 80) : ''}`)
    }
  } catch (err) {
    showNotification('reThink Outreach', `Network error: ${err.message || 'Unknown error'}`)
  }
})
