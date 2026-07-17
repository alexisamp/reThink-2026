// Background service worker for reThink People extension
// Handles message events from content scripts and manages interaction logging

import { supabase } from '../lib/supabase'

const OUTREACH_SOURCE = 'linkedin'

const SUPABASE_URL = 'https://amvezbymrnvrwcypivkf.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtdmV6Ynltcm52cndjeXBpdmtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTIxNTgsImV4cCI6MjA4NDU4ODE1OH0.6qgaygMynKaKYB9TlcJAlyLMt87wc7D8PbA5ZeDGDUg'

console.log('reThink People: Background service worker loaded')

// ===== INSTALL =====

chrome.runtime.onInstalled.addListener(async () => {
  console.log('reThink People extension installed')
  // Allow sidebar to open on action click
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })

  // Enable sidebar + inject content scripts into already-open matching tabs
  // (content scripts only auto-inject on new page loads, not existing tabs)
  try {
    const tabs = await chrome.tabs.query({})
    for (const tab of tabs) {
      if (!tab.id || !tab.url) continue
      if (!tab.url.includes('linkedin.com')) continue

      // Inject content scripts manually
      const scripts = [
        'src/content-scripts/linkedin-profile.js',
        'src/content-scripts/floating-trigger.js',
        'src/content-scripts/linkedin-dm.js',
      ]
      for (const file of scripts) {
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [file] })
        } catch {
          // Tab may not be injectable (e.g. chrome:// pages)
        }
      }
    }
  } catch (e) {
    console.warn('onInstalled tab injection error:', e)
  }
})

// ===== ACTION CLICK — Open side panel =====

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return
  await chrome.sidePanel.open({ tabId: tab.id })
})

// ===== TAB EVENTS — Update context only (no enable/disable — panel always available) =====

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url) return

  // LinkedIn profile navigation (URL changed within LinkedIn)
  if (changeInfo.url.includes('linkedin.com/in/')) {
    setTimeout(async () => {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: extractLinkedInProfileBasicInfo,
        })
        if (results?.[0]?.result?.linkedinUrl) {
          await chrome.storage.local.set({
            currentLinkedInProfile: results[0].result,
          })
        }
      } catch {
        // Tab not injectable
      }
    }, 1200)
  } else if (changeInfo.url.includes('linkedin.com') && !changeInfo.url.includes('linkedin.com/in/')) {
    // Navigated to LinkedIn but not a profile page — clear profile
    await chrome.storage.local.set({ currentLinkedInProfile: null })
  }
})

// ===== TAB SWITCH — Clear stale context when user switches tabs =====

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId)
    if (!tab.url) return

    if (tab.url.includes('linkedin.com/in/')) {
      // Switched to a LinkedIn profile tab — extract LinkedIn
      setTimeout(async () => {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: extractLinkedInProfileBasicInfo,
          })
          if (results?.[0]?.result?.linkedinUrl) {
            await chrome.storage.local.set({
              currentLinkedInProfile: results[0].result,
            })
          }
        } catch {}
      }, 600)
    } else if (!tab.url.includes('linkedin.com')) {
      // Switched to an unrelated tab — clear LinkedIn context
      await chrome.storage.local.set({ currentLinkedInProfile: null })
    }
  } catch {
    // Tab may not be accessible
  }
})

// Injected into LinkedIn profile pages — must be self-contained (no imports)
function extractLinkedInProfileBasicInfo() {
  try {
    // Name — multiple fallbacks since LinkedIn changes class names frequently
    let name = null
    const nameSelectors = [
      'h1.text-heading-xlarge', 'h1[class*="text-heading"]',
      'h1.t-24', 'h1.t-bold', '.pv-top-card h1', '.ph5 h1', 'main h1', 'h1'
    ]
    for (const sel of nameSelectors) {
      const el = document.querySelector(sel) as HTMLElement | null
      if (el) {
        const text = el.innerText?.trim()
        if (text && text.length >= 2 && text.length < 60 && !text.includes('|') && !text.includes('·')) {
          name = text; break
        }
      }
    }

    let jobTitle = null
    const titleEl = document.querySelector('.text-body-medium.break-words') as HTMLElement | null
    if (titleEl) jobTitle = titleEl.innerText?.trim() ?? null

    const rawUrl = window.location.href
    const match = rawUrl.match(/linkedin\.com\/in\/([^/?#&]+)/)
    const linkedinUrl = match ? `https://www.linkedin.com/in/${match[1]}` : null

    // Birthday extraction
    let birthday: string | null = null

    // 1. Try script tags for embedded JSON: {"birthday":{"day":N,"month":N}}
    const scripts = document.querySelectorAll('script[type="application/json"], script:not([src])')
    for (const script of Array.from(scripts)) {
      const content = script.textContent ?? ''
      if (!content.includes('"birthday"')) continue
      const bdMatch = content.match(/"birthday"\s*:\s*\{\s*"day"\s*:\s*(\d+)\s*,\s*"month"\s*:\s*(\d+)\s*\}/)
        ?? content.match(/"birthday"\s*:\s*\{\s*"month"\s*:\s*(\d+)\s*,\s*"day"\s*:\s*(\d+)\s*\}/)
      if (bdMatch) {
        // Handle both capture group orderings
        let month: number, day: number
        // Check which match pattern: day first or month first
        const fullMatch = content.match(/"birthday"\s*:\s*\{[^}]*"day"\s*:\s*(\d+)[^}]*"month"\s*:\s*(\d+)/)
        if (fullMatch) {
          day = parseInt(fullMatch[1]); month = parseInt(fullMatch[2])
        } else {
          const fullMatch2 = content.match(/"birthday"\s*:\s*\{[^}]*"month"\s*:\s*(\d+)[^}]*"day"\s*:\s*(\d+)/)
          if (fullMatch2) { month = parseInt(fullMatch2[1]); day = parseInt(fullMatch2[2]) }
          else { month = parseInt(bdMatch[1]); day = parseInt(bdMatch[2]) }
        }
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          birthday = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          break
        }
      }
    }

    // 2. Try DOM: element with data-field="birthday" or nearby "Birthday" label
    if (!birthday) {
      const bdField = document.querySelector('[data-field="birthday"]') as HTMLElement | null
      if (bdField) {
        birthday = bdField.innerText?.trim() ?? null
      }
    }
    if (!birthday) {
      // Look for a span/dt containing "Birthday" and grab the adjacent value
      const allText = Array.from(document.querySelectorAll('dt, span, div'))
      for (const el of allText) {
        const htmlEl = el as HTMLElement
        if (htmlEl.innerText?.trim() === 'Birthday') {
          const sibling = htmlEl.nextElementSibling as HTMLElement | null
          if (sibling) {
            birthday = sibling.innerText?.trim() ?? null
          }
          break
        }
      }
    }

    return { name, jobTitle, linkedinUrl, url: rawUrl, birthday }
  } catch {
    return null
  }
}

// ===== KEEPALIVE (content script holds a port to prevent SW sleep) =====

chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'keepalive') {
    port.onDisconnect.addListener(() => {})
  }
})

// ===== MESSAGE HANDLERS =====

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // OPEN_SIDEBAR must be called synchronously (no await) to preserve user gesture context
  if (message.type === 'OPEN_SIDEBAR') {
    const tabId = sender.tab?.id
    const tabUrl = sender.tab?.url ?? ''
    if (tabId) {
      chrome.sidePanel.open({ tabId }).catch(err => console.warn('sidePanel.open error:', err))
    }
    void tabUrl
    sendResponse({ success: true })
    return false
  }

  ;(async () => {
    try {
      switch (message.type) {
        case 'linkedin_message':
          await handleLinkedInMessage(message)
          sendResponse({ success: true })
          break

        case 'LINKEDIN_CONNECTION_STATE': {
          const result = await handleLinkedInConnectionState(message)
          sendResponse(result)
          break
        }

        case 'OPEN_LINKEDIN_BATCH': {
          const result = await openLinkedInBatchTabs(message.urls)
          sendResponse({ ...result, requestId: message.requestId })
          break
        }

        case 'CHECK_CONTACT_LINKEDIN': {
          const userId = await getCurrentUserId()
          if (!userId) { sendResponse({ exists: false }); break }
          const { data } = await supabase
            .from('outreach_logs')
            .select('id')
            .eq('user_id', userId)
            .eq('linkedin_url', message.linkedinUrl)
            .maybeSingle()
          sendResponse({ exists: !!data })
          break
        }

        // F01: Look up contact by LinkedIn URL, with Attio fallback auto-import
        case 'LOAD_CONTACT_BY_LINKEDIN': {
          const userId = await getCurrentUserId()
          if (!userId) { sendResponse({ contact: null }); break }
          const linkedinUrl: string = message.linkedinUrl
          const contact = await findContactByLinkedInUrl(userId, linkedinUrl)
          if (contact) {
            const { data: full } = await supabase
              .from('outreach_logs')
              .select('id, name, health_score, status, last_interaction_at, personal_context, category, job_title, company, profile_photo_url, birthday, links, email')
              .eq('id', contact.id)
              .single()
            sendResponse({ contact: full, source: 'local' })
            break
          }
          // Not found locally — try Attio by LinkedIn URL
          const attioKeyLI = await getStoredAttioKey()
          if (attioKeyLI && linkedinUrl) {
            try {
              const normalizedLI = normalizeLinkedInUrl(linkedinUrl)
              const searchRes = await fetch('https://api.attio.com/v2/objects/people/records/query', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${attioKeyLI}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  filter: { linkedin_profile_url: { "$eq": normalizedLI } },
                  limit: 1
                })
              })
              if (searchRes.ok) {
                const attioData = await searchRes.json()
                const person = attioData?.data?.[0]
                if (person) {
                  const name = person.values?.name?.[0]?.full_name ??
                               `${person.values?.first_name?.[0]?.value ?? ''} ${person.values?.last_name?.[0]?.value ?? ''}`.trim()
                  const email = person.values?.email_addresses?.[0]?.email_address ?? null
                  const title = person.values?.job_title?.[0]?.value ?? null
                  if (name) {
                    const { data: newContact } = await supabase
                      .from('outreach_logs')
                      .insert({
                        user_id: userId,
                        name,
                        linkedin_url: linkedinUrl,
                        email,
                        job_title: title,
                        attio_record_id: person.id?.record_id ?? null,
                        status: 'PROSPECT',
                        health_score: 0,
                      })
                      .select()
                      .single()
                    if (newContact) {
                      sendResponse({ contact: newContact, source: 'attio_auto_import' })
                      break
                    }
                  }
                }
              }
            } catch (e) {
              console.error('Attio auto-resolve error (linkedin):', e)
            }
          }
          sendResponse({ contact: null, source: 'not_found' })
          break
        }

        case 'UPDATE_PROSPECTING_HABIT': {
          const userId = await getCurrentUserId()
          if (userId) {
            const today = new Date().toISOString().split('T')[0]
            await updateProspectingHabit(userId, today)
          }
          sendResponse({ success: true })
          break
        }

        case 'LINKEDIN_PROFILE_DATA': {
          // Always update — overwrite with fresh data (2nd attempt at 4s may have better data)
          const existing = (await chrome.storage.local.get('currentLinkedInProfile')).currentLinkedInProfile
          const updated = {
            name: message.name ?? existing?.name ?? null,  // keep old name if new is null
            linkedinUrl: message.linkedinUrl,
            jobTitle: message.jobTitle ?? existing?.jobTitle ?? null,
            company: message.company ?? existing?.company ?? null,
            profilePhotoUrl: message.profilePhotoUrl ?? existing?.profilePhotoUrl ?? null,
            birthday: message.birthday ?? existing?.birthday ?? null,
          }
          await chrome.storage.local.set({
            currentLinkedInProfile: updated,
          })

          // Save birthday to outreach_logs if found
          if (message.birthday && message.linkedinUrl) {
            const userId = await getCurrentUserId()
            if (userId) {
              await supabase.from('outreach_logs')
                .update({ birthday: message.birthday })
                .eq('user_id', userId)
                .eq('linkedin_url', message.linkedinUrl)
            }
          }

          if (message.profileMarkdown && message.linkedinUrl) {
            void saveLinkedInProfileCapture({
              linkedinUrl: message.linkedinUrl,
              name: message.name ?? null,
              markdown: message.profileMarkdown,
            }).catch(error => console.warn('LinkedIn profile capture save failed:', error))
          }

          // Upload photo in background (non-blocking)
          // Prefer base64 from content script (has LinkedIn cookies) over URL fetch (no cookies)
          if (message.linkedinUrl) {
            const uploadFn = message.photoBase64
              ? () => uploadLinkedInPhotoFromBase64(message.photoBase64, message.linkedinUrl)
              : message.profilePhotoUrl
                ? () => uploadLinkedInPhoto(message.profilePhotoUrl, message.linkedinUrl)
                : null

            if (uploadFn) {
              uploadFn().then(async (permanentUrl) => {
                if (permanentUrl) {
                  const current = (await chrome.storage.local.get('currentLinkedInProfile')).currentLinkedInProfile
                  if (current?.linkedinUrl === message.linkedinUrl) {
                    await chrome.storage.local.set({
                      currentLinkedInProfile: { ...current, profilePhotoUrl: permanentUrl }
                    })
                  }
                  // Also persist to DB if contact exists
                  const userId = await getCurrentUserId()
                  if (userId) {
                    await supabase.from('outreach_logs')
                      .update({ profile_photo_url: permanentUrl })
                      .eq('user_id', userId)
                      .eq('linkedin_url', message.linkedinUrl)
                  }
                }
              }).catch(() => {})
            }
          }

          sendResponse({ success: true })
          break
        }

        // ── Quick-log an interaction from the sidebar ─────────────────────
        case 'QUICK_LOG_INTERACTION': {
          const userId = await getCurrentUserId()
          if (!userId) { sendResponse({ success: false, error: 'not_auth' }); break }
          const { contactId, interactionType, direction = 'outbound', notes = null } = message
          const today = new Date().toISOString().slice(0, 10)
          const { data: interaction, error } = await supabase
            .from('interactions')
            .insert({ user_id: userId, contact_id: contactId, type: interactionType, direction, notes, interaction_date: today })
            .select().single()
          if (error || !interaction) { sendResponse({ success: false, error: error?.message }); break }
          // Also insert an extension_interaction_window for consistency
          await supabase.from('extension_interaction_windows').insert({
            user_id: userId, contact_id: contactId, interaction_id: interaction.id,
            channel: interactionType, direction,
            window_start: new Date().toISOString(), window_end: new Date().toISOString(),
            message_count: 1,
          })
          // Recompute health score
          const { data: allInteractions } = await supabase
            .from('interactions').select('type, interaction_date').eq('contact_id', contactId)
          if (allInteractions) {
            const { data: contactRow } = await supabase.from('outreach_logs').select('category').eq('id', contactId).single()
            const score = computeHealthScoreLocal(allInteractions, contactRow?.category ?? null)
            const lastDate = allInteractions.reduce((l: string, i: { interaction_date: string }) =>
              i.interaction_date > l ? i.interaction_date : l, allInteractions[0]?.interaction_date ?? today)
            await supabase.from('outreach_logs').update({
              health_score: score, last_interaction_at: new Date(lastDate).toISOString()
            }).eq('id', contactId)
          }
          sendResponse({ success: true })
          break
        }

        // ── Update contact status (status bump) ───────────────────────────
        case 'UPDATE_CONTACT_STATUS': {
          const userId = await getCurrentUserId()
          if (!userId) { sendResponse({ success: false, error: 'not_auth' }); break }
          const { error } = await supabase
            .from('outreach_logs')
            .update({ status: message.status, updated_at: new Date().toISOString() })
            .eq('id', message.contactId).eq('user_id', userId)
          sendResponse({ success: !error, error: error?.message })
          break
        }

        // ── Append a quick note to personal_context ───────────────────────
        case 'APPEND_CONTACT_NOTE': {
          const userId = await getCurrentUserId()
          if (!userId) { sendResponse({ success: false, error: 'not_auth' }); break }
          const { data: row } = await supabase
            .from('outreach_logs').select('personal_context, attio_record_id').eq('id', message.contactId).single()
          const existing = row?.personal_context?.trim() ?? ''
          let newContext: string
          if (message.replace) {
            // Replace mode: the note IS the full new context value (from the context textarea)
            newContext = message.note.trim()
          } else {
            const timestamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            newContext = existing
              ? `${existing}\n[${timestamp}] ${message.note.trim()}`
              : `[${timestamp}] ${message.note.trim()}`
          }
          const { error } = await supabase
            .from('outreach_logs').update({ personal_context: newContext }).eq('id', message.contactId)

          // Push to Attio if the record is linked (bidirectional sync — reThink → Attio)
          // Note: Attio → reThink reverse sync would require a webhook/polling setup (out of scope)
          const attioRecordId = row?.attio_record_id
          if (!error && attioRecordId) {
            const attioKey = await getStoredAttioKey()
            if (attioKey) {
              try {
                await fetch(`https://api.attio.com/v2/objects/people/records/${attioRecordId}`, {
                  method: 'PATCH',
                  headers: { 'Authorization': `Bearer ${attioKey}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    data: { values: { description: [{ value: newContext }] } }
                  }),
                })
              } catch {
                // Attio sync failure is non-fatal — local save succeeded
              }
            }
          }

          sendResponse({ success: !error, updatedContext: newContext })
          break
        }

        // ── Add a link to a contact ────────────────────────────────────────
        case 'ADD_CONTACT_LINK': {
          const userId = await getCurrentUserId()
          if (!userId) { sendResponse({ success: false, error: 'not_auth' }); break }
          const { data: row } = await supabase
            .from('outreach_logs').select('links').eq('id', message.contactId).single()
          const links: Array<{ url: string; label: string; created_at: string }> = row?.links ?? []
          links.push({ url: message.url, label: message.label || message.url, created_at: new Date().toISOString() })
          const { error } = await supabase
            .from('outreach_logs').update({ links }).eq('id', message.contactId)
          sendResponse({ success: !error })
          break
        }

        // ── Remove a link from a contact ──────────────────────────────────
        case 'REMOVE_CONTACT_LINK': {
          const userId = await getCurrentUserId()
          if (!userId) { sendResponse({ success: false, error: 'not_auth' }); break }
          const { data: row } = await supabase
            .from('outreach_logs').select('links').eq('id', message.contactId).single()
          const links = (row?.links ?? []).filter((_: unknown, i: number) => i !== message.index)
          const { error } = await supabase
            .from('outreach_logs').update({ links }).eq('id', message.contactId)
          sendResponse({ success: !error })
          break
        }

        // ── Update contact name (fix slug) ────────────────────────────────
        case 'UPDATE_CONTACT_NAME': {
          const userId = await getCurrentUserId()
          if (!userId) { sendResponse({ success: false, error: 'not_auth' }); break }
          const { error } = await supabase
            .from('outreach_logs')
            .update({ name: message.name.trim(), updated_at: new Date().toISOString() })
            .eq('id', message.contactId).eq('user_id', userId)
          sendResponse({ success: !error, error: error?.message })
          break
        }

        // ── Open contact in reThink app (via Supabase signal) ─────────────
        case 'OPEN_IN_RETHINK': {
          const userId = await getCurrentUserId()
          if (!userId) { sendResponse({ success: false }); break }
          await supabase.from('app_signals').insert({
            user_id: userId,
            action: 'open_contact',
            payload: { contact_id: message.contactId },
          })
          sendResponse({ success: true })
          break
        }

        default:
          sendResponse({ success: false, error: 'Unknown message type' })
      } // end switch
    } catch (error) {
      console.error('Error handling message:', error)
      sendResponse({ success: false, error: String(error) })
    }
  })()

  return true
})


// ===== PHOTO UPLOAD =====

// Upload from base64 data URL — content script fetched the image with LinkedIn cookies
async function uploadLinkedInPhotoFromBase64(dataUrl: string, linkedinUrl: string): Promise<string | null> {
  try {
    const userId = await getCurrentUserId()
    if (!userId) return null
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return null

    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) return null
    const mimeType = match[1]
    const base64Data = match[2]

    const binaryString = atob(base64Data)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i)

    const slug = linkedinUrl.match(/\/in\/([^/?#]+)/)?.[1] ?? 'photo'
    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg'
    const storagePath = `${userId}/${slug}.${ext}`

    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/contact-photos/${storagePath}`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': mimeType || 'image/jpeg',
          'x-upsert': 'true',
        },
        body: bytes,
      }
    )
    if (uploadRes.ok) {
      return `${SUPABASE_URL}/storage/v1/object/public/contact-photos/${storagePath}`
    }
    return null
  } catch {
    return null
  }
}

// Upload by fetching a URL — fallback when content script didn't send base64
async function uploadLinkedInPhoto(photoUrl: string, linkedinUrl: string): Promise<string | null> {
  try {
    const userId = await getCurrentUserId()
    if (!userId) return null

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return null

    const res = await fetch(photoUrl)
    if (!res.ok) return null

    const blob = await res.blob()
    const slug = linkedinUrl.match(/\/in\/([^/?#]+)/)?.[1] ?? 'photo'
    const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg'
    const storagePath = `${userId}/${slug}.${ext}`

    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/contact-photos/${storagePath}`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': blob.type || 'image/jpeg',
          'x-upsert': 'true',
        },
        body: blob,
      }
    )

    if (uploadRes.ok) {
      return `${SUPABASE_URL}/storage/v1/object/public/contact-photos/${storagePath}`
    }
    return null
  } catch {
    return null
  }
}

// ===== HELPERS =====

// ── Health score (mirrors funnelDefaults.ts — kept in sync manually) ──────────
const INTERACTION_PTS: Record<string, number> = {
  in_person: 5, virtual_coffee: 4, call: 3, whatsapp: 3, email: 2, linkedin_msg: 1,
}
function _decayForProfile(daysAgo: number, profile: 'strict' | 'moderate' | 'lenient'): number {
  if (profile === 'strict') {
    if (daysAgo <= 3) return 1.0; if (daysAgo <= 14) return 0.7
    if (daysAgo <= 30) return 0.3; if (daysAgo <= 60) return 0.05; return 0
  }
  if (profile === 'lenient') {
    if (daysAgo <= 14) return 1.0; if (daysAgo <= 60) return 0.8
    if (daysAgo <= 180) return 0.4; if (daysAgo <= 365) return 0.1; return 0
  }
  if (daysAgo <= 7) return 1.0; if (daysAgo <= 30) return 0.7
  if (daysAgo <= 90) return 0.3; if (daysAgo <= 180) return 0.1; return 0
}
function computeHealthScoreLocal(interactions: Array<{ type: string; interaction_date: string }>, category: string | null): number {
  const profile = ({ friend: 'strict', family: 'strict', mentor: 'lenient' } as Record<string, string>)[category ?? ''] ?? 'moderate'
  const raw = interactions.reduce((sum, i) => {
    const daysAgo = Math.floor((Date.now() - new Date(i.interaction_date).getTime()) / 86400000)
    return sum + (INTERACTION_PTS[i.type] ?? 1) * _decayForProfile(daysAgo, profile as 'strict' | 'moderate' | 'lenient')
  }, 0)
  return Math.min(10, Math.max(1, Math.ceil(raw)))
}

async function getCurrentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user?.id ?? null
}

async function saveLinkedInProfileCapture(input: { linkedinUrl: string; name: string | null; markdown: string }) {
  const userId = await getCurrentUserId()
  if (!userId) return { success: false, error: 'not_authenticated' }
  const contact = await findContactByLinkedInUrl(userId, input.linkedinUrl)
  if (!contact) return { success: false, error: 'contact_not_found' }

  const capturedDate = localDateKey(new Date())
  const title = `LinkedIn profile capture — ${input.name || contact.name}`
  const { data: existing } = await supabase
    .from('captures')
    .select('id')
    .eq('user_id', userId)
    .eq('linked_record_slug', 'people')
    .eq('linked_record_id', contact.id)
    .eq('url', input.linkedinUrl)
    .eq('captured_date', capturedDate)
    .ilike('title', 'LinkedIn profile capture%')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    const { error } = await supabase
      .from('captures')
      .update({
        title,
        body: input.markdown,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .eq('user_id', userId)
    return error ? { success: false, error: error.message } : { success: true, updated: true }
  }

  const { error } = await supabase.from('captures').insert({
    user_id: userId,
    type: 'learning',
    title,
    body: input.markdown,
    url: input.linkedinUrl,
    captured_date: capturedDate,
    linked_record_slug: 'people',
    linked_record_id: contact.id,
  })
  return error ? { success: false, error: error.message } : { success: true }
}

function cleanBatchLinkedInUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw) return null
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const url = new URL(candidate)
    if (!/linkedin\.com$/i.test(url.hostname.replace(/^www\./, ''))) return null
    const match = url.pathname.match(/^\/in\/([^/?#]+)/)
    if (!match) return null
    return `https://www.linkedin.com/in/${match[1]}`
  } catch {
    return null
  }
}

async function openLinkedInBatchTabs(input: unknown) {
  const urls = Array.isArray(input)
    ? Array.from(new Set(input.map(cleanBatchLinkedInUrl).filter((url): url is string => Boolean(url)))).slice(0, 15)
    : []
  if (!urls.length) return { success: false, opened: 0, error: 'no_linkedin_urls' }

  let opened = 0
  for (const [index, url] of urls.entries()) {
    try {
      await chrome.tabs.create({ url, active: index === 0 })
      opened += 1
    } catch (error) {
      console.warn('Could not open LinkedIn tab:', url, error)
    }
  }
  return { success: opened > 0, opened }
}

interface Contact {
  id: string
  name: string
}

// F09: Normalize LinkedIn URLs for comparison (strip trailing slash, normalize www)
function normalizeLinkedInUrl(url: string): string {
  return url.replace(/\/$/, '').replace('www.linkedin.com', 'linkedin.com').toLowerCase()
}

async function findContactByLinkedInUrl(userId: string, linkedinUrl: string): Promise<Contact | null> {
  // F09: Generate all normalized variants for matching
  const normalized = linkedinUrl.replace(/\/$/, '')
  const withSlash = normalized + '/'
  const noWww = normalizeLinkedInUrl(linkedinUrl)
  const noWwwSlash = noWww + '/'
  const withWww = noWww.replace('linkedin.com', 'www.linkedin.com')
  const withWwwSlash = withWww + '/'
  const variants = Array.from(new Set([normalized, withSlash, noWww, noWwwSlash, withWww, withWwwSlash]))

  // Primary: contact_channels (new unified table)
  const { data: channelData } = await supabase
    .from('contact_channels')
    .select(`
      outreach_log_id,
      outreach_logs!inner (
        id,
        name
      )
    `)
    .eq('channel', 'linkedin')
    .in('channel_identifier', variants)
    .maybeSingle()

  if (channelData) {
    const contactData = channelData.outreach_logs as any
    return { id: contactData.id, name: contactData.name }
  }

  // Fallback: legacy outreach_logs.linkedin_url
  const { data, error } = await supabase
    .from('outreach_logs')
    .select('id, name')
    .eq('user_id', userId)
    .in('linkedin_url', variants)
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return { id: data.id, name: data.name }
}

async function resolveConnectedContact(userId: string, linkedinUrl: string, profileName?: string | null, connectedOn?: string | null): Promise<Contact | null> {
  const byUrl = await findContactByLinkedInUrl(userId, linkedinUrl)
  if (byUrl) return byUrl
  const cleanName = profileName?.replace(/\s+/g, ' ').trim()
  if (!cleanName) return null

  const { data: byName } = await supabase
    .from('outreach_logs')
    .select('id, name')
    .eq('user_id', userId)
    .ilike('name', cleanName)
    .limit(2)
  if (byName?.length === 1) {
    await supabase
      .from('outreach_logs')
      .update({ linkedin_url: linkedinUrl })
      .eq('id', byName[0].id)
      .eq('user_id', userId)
    return byName[0]
  }

  const { data: created, error } = await supabase.from('outreach_logs').insert({
    user_id: userId,
    name: cleanName,
    linkedin_url: linkedinUrl,
    status: 'CONNECTED',
    contact_type: 'networking',
    log_date: connectedOn ?? localDateKey(new Date()),
    notes: 'Created from LinkedIn Connections sync.',
  }).select('id, name').single()
  return error ? null : created
}

function localDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

async function logOutreachEvent(input: {
  userId: string
  contactId: string
  eventType: string
  payload?: Record<string, unknown>
  sourceExternalId?: string | null
  listId?: string | null
  membershipId?: string | null
  occurredAt?: string | null
}) {
  if (!input.contactId || !input.eventType) return { success: false, error: 'contactId and eventType are required' }
  const occurredAt = input.occurredAt ?? new Date().toISOString()
  const occurredOn = localDateKey(new Date(occurredAt))
  const { error } = await supabase.from('outreach_events').insert({
    user_id: input.userId,
    contact_id: input.contactId,
    list_id: input.listId ?? null,
    membership_id: input.membershipId ?? null,
    event_type: input.eventType,
    occurred_at: occurredAt,
    occurred_on: occurredOn,
    source: OUTREACH_SOURCE,
    source_external_id: input.sourceExternalId ?? null,
    payload: input.payload ?? {},
  })
  if (error?.code === '23505') return { success: true, duplicate: true }
  if (error) return { success: false, error: error.message }
  return { success: true }
}

async function latestRequestSentEvent(userId: string, contactId: string, occurredBefore?: string) {
  let query = supabase
    .from('outreach_events')
    .select('id, list_id, membership_id, occurred_at')
    .eq('user_id', userId)
    .eq('contact_id', contactId)
    .eq('event_type', 'request_sent')
  if (occurredBefore) query = query.lte('occurred_at', occurredBefore)
  const { data, error } = await query
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return data
}

async function recordLinkedInAcceptanceObservation(input: {
  userId: string
  contactId: string
  connectedOn: string | null
  observedAt: Date
  rawLabel: string | null
  request: { id: string; list_id: string | null; membership_id: string | null; occurred_at: string } | null
  linkedinUrl: string
  source?: string
  confidence?: number
  inferenceRule?: string
}) {
  const source = input.source ?? (input.rawLabel === 'Connections list'
    ? 'linkedin_connections_page'
    : input.rawLabel === 'Accepted invitation notification'
      ? 'linkedin_acceptance_notification'
      : 'linkedin_profile_state')
  const occurredOn = input.connectedOn ?? localDateKey(input.observedAt)
  const occurredAt = input.connectedOn
    ? new Date(`${input.connectedOn}T23:59:00`).toISOString()
    : input.observedAt.toISOString()
  const confidence = input.confidence ?? (input.connectedOn
    ? 100
    : source === 'linkedin_acceptance_notification'
      ? 90
      : 60)
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const sourceExternalId = `${source}:${input.contactId}:${occurredOn}`
  const { data, error } = await supabase.rpc('record_linkedin_acceptance_observation', {
    p_user_id: input.userId,
    p_contact_id: input.contactId,
    p_occurred_on: occurredOn,
    p_occurred_at: occurredAt,
    p_observed_at: input.observedAt.toISOString(),
    p_source: source,
    p_source_external_id: sourceExternalId,
    p_confidence: confidence,
    p_timezone: timezone,
    p_raw_label: input.rawLabel,
    p_payload: {
      linkedin_url: input.linkedinUrl,
      request_event_id: input.request?.id ?? null,
      connected_on: input.connectedOn,
      inference_rule: input.inferenceRule ?? (input.connectedOn ? 'linkedin_displayed_connection_date' : 'observed_connected_state'),
    },
    p_list_id: input.request?.list_id ?? null,
    p_membership_id: input.request?.membership_id ?? null,
  })
  if (error) return { success: false, error: error.message }
  return { success: true, eventId: data }
}

async function markContactConnected(userId: string, contactId: string) {
  await supabase
    .from('outreach_logs')
    .update({ status: 'CONNECTED', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', contactId)
    .eq('status', 'PROSPECT')
}

async function recordAcceptanceFromLinkedInInbound(userId: string, contactId: string, event: LinkedInMessageEvent) {
  const occurredAt = new Date(event.timestamp).toISOString()
  const request = await latestRequestSentEvent(userId, contactId, occurredAt)
  if (!request) return { success: true, ignored: true, reason: 'request_sent_not_found' }
  return recordLinkedInAcceptanceObservation({
    userId,
    contactId,
    connectedOn: null,
    observedAt: new Date(event.timestamp),
    rawLabel: 'Inbound LinkedIn reply visible',
    request,
    linkedinUrl: event.linkedinUrl,
    source: 'linkedin_dm_inbound',
    confidence: 85,
    inferenceRule: 'inbound_reply_received',
  })
}

async function handleLinkedInConnectionState(message: {
  linkedinUrl?: string
  state?: 'connect_available' | 'pending' | 'connected'
  rawLabel?: string | null
  profileName?: string | null
  connectedOn?: string | null
  timestamp?: number
}) {
  const userId = await getCurrentUserId()
  if (!userId) return { success: false, error: 'not_authenticated' }
  if (!message.linkedinUrl || !message.state) return { success: false, error: 'invalid_connection_state' }
  const contact = message.state === 'connected'
    ? await resolveConnectedContact(userId, message.linkedinUrl, message.profileName, message.connectedOn)
    : await findContactByLinkedInUrl(userId, message.linkedinUrl)
  if (!contact) return { success: false, error: 'contact_not_found' }
  const request = await latestRequestSentEvent(userId, contact.id)

  const observedAt = new Date(message.timestamp ?? Date.now())
  const occurredAt = message.connectedOn
    ? new Date(`${message.connectedOn}T12:00:00`).toISOString()
    : observedAt.toISOString()
  const payload = {
    linkedin_url: message.linkedinUrl,
    detected_state: message.state,
    raw_label: message.rawLabel ?? null,
    connected_on: message.connectedOn ?? null,
    request_event_id: request?.id ?? null,
  }
  if (message.state === 'pending') {
    if (!request) return { success: false, error: 'request_sent_not_found', contactId: contact.id }
    return logOutreachEvent({
      userId, contactId: contact.id, listId: request.list_id, membershipId: request.membership_id,
      eventType: 'linkedin_pending_detected', occurredAt,
      sourceExternalId: `linkedin-request:${request.id}:pending`, payload,
    })
  }
  if (message.state === 'connected') {
    const isNotification = message.rawLabel === 'Accepted invitation notification'
    const requestAge = request ? observedAt.getTime() - new Date(request.occurred_at).getTime() : Number.POSITIVE_INFINITY
    if (!message.connectedOn && !isNotification && (!request || requestAge > 30 * 24 * 60 * 60 * 1000)) {
      await markContactConnected(userId, contact.id)
      return { success: true, ignored: true, reason: 'acceptance_date_not_observable' }
    }
    const result = await recordLinkedInAcceptanceObservation({
      userId,
      contactId: contact.id,
      connectedOn: message.connectedOn ?? null,
      observedAt,
      rawLabel: message.rawLabel ?? null,
      request,
      linkedinUrl: message.linkedinUrl,
    })
    if (result.success) await markContactConnected(userId, contact.id)
    return result
  }
  return { success: true, ignored: true }
}

// F01: Get stored Attio API key from chrome.storage.local
async function getStoredAttioKey(): Promise<string | null> {
  try {
    // 1. Check chrome.storage.local (fastest — cached from previous lookup)
    const result = await chrome.storage.local.get('attio_api_key')
    if (result.attio_api_key?.trim()) return result.attio_api_key.trim()

    // 2. Fallback: read from Supabase user metadata (set by reThink Settings)
    const { data: { user } } = await supabase.auth.getUser()
    const keyFromMeta = user?.user_metadata?.attio_api_key?.trim() ?? null
    if (keyFromMeta) {
      // Cache locally so next call is instant
      await chrome.storage.local.set({ attio_api_key: keyFromMeta })
      return keyFromMeta
    }
    return null
  } catch {
    return null
  }
}

interface ActiveWindow {
  id: string
  message_count: number
  window_end: string
}

async function findActiveWindow(userId: string, contactId: string, channel: string): Promise<ActiveWindow | null> {
  const { data, error } = await supabase
    .from('extension_interaction_windows')
    .select('id, message_count, window_end')
    .eq('user_id', userId)
    .eq('contact_id', contactId)
    .eq('channel', channel)
    .gt('window_end', new Date().toISOString())
    .order('window_end', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return null
  return data
}

async function queueFailedEvent(event: LinkedInMessageEvent) {
  try {
    const { pendingEvents = [] } = await chrome.storage.local.get('pendingEvents')
    pendingEvents.push(event)
    await chrome.storage.local.set({ pendingEvents })
  } catch {
    // Best effort
  }
}



// ===== LINKEDIN MESSAGE HANDLER =====

interface LinkedInMessageEvent {
  type: 'linkedin_message'
  linkedinUrl: string
  direction: 'inbound' | 'outbound'
  timestamp: number
  messageId?: string
}

async function handleLinkedInMessage(event: LinkedInMessageEvent) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) return

    const contact = await findContactByLinkedInUrl(userId, event.linkedinUrl)
    if (!contact) return // Unknown LinkedIn contact — no popup for DMs

    const activeWindow = await findActiveWindow(userId, contact.id, 'linkedin_msg')
    const eventKey = event.messageId || String(event.timestamp)

    if (activeWindow) {
      await supabase
        .from('extension_interaction_windows')
        .update({ message_count: activeWindow.message_count + 1, updated_at: new Date().toISOString() })
        .eq('id', activeWindow.id)
      await logOutreachEvent({
        userId,
        contactId: contact.id,
        eventType: event.direction === 'inbound' ? 'inbound_reply_received' : 'follow_up_sent',
        occurredAt: new Date(event.timestamp).toISOString(),
        sourceExternalId: event.messageId
          ? `linkedin-message:${event.messageId}:${event.direction}`
          : `linkedin-dm:${contact.id}:${event.direction}:${eventKey}`,
        payload: {
          linkedin_url: event.linkedinUrl,
          direction: event.direction,
          interaction_window_id: activeWindow.id,
        },
      })
      if (event.direction === 'inbound') {
        await recordAcceptanceFromLinkedInInbound(userId, contact.id, event)
        await markContactConnected(userId, contact.id)
      }
    } else {
      const interactionDate = localDateKey(new Date(event.timestamp))

      const { data: interaction, error: interactionError } = await supabase
        .from('interactions')
        .insert({
          user_id: userId,
          contact_id: contact.id,
          type: 'linkedin_msg',
          direction: event.direction,
          notes: null,
          interaction_date: interactionDate,
        })
        .select()
        .single()

      if (interactionError || !interaction) {
        await queueFailedEvent(event)
        throw interactionError
      }

      const windowStart = new Date(event.timestamp)
      const windowEnd = new Date(event.timestamp)
      windowEnd.setHours(windowEnd.getHours() + 6)

      const { error: windowError } = await supabase
        .from('extension_interaction_windows')
        .insert({
          user_id: userId,
          contact_id: contact.id,
          interaction_id: interaction!.id,
          channel: 'linkedin_msg',
          window_start: windowStart.toISOString(),
          window_end: windowEnd.toISOString(),
          direction: event.direction,
          message_count: 1,
        })

      if (windowError) throw windowError

      await logOutreachEvent({
        userId,
        contactId: contact.id,
        eventType: event.direction === 'inbound' ? 'inbound_reply_received' : 'follow_up_sent',
        occurredAt: new Date(event.timestamp).toISOString(),
        sourceExternalId: event.messageId
          ? `linkedin-message:${event.messageId}:${event.direction}`
          : `linkedin-dm:${contact.id}:${event.direction}:${eventKey}`,
        payload: {
          linkedin_url: event.linkedinUrl,
          direction: event.direction,
          interaction_id: interaction.id,
        },
      })
      if (event.direction === 'inbound') {
        await recordAcceptanceFromLinkedInInbound(userId, contact.id, event)
        await markContactConnected(userId, contact.id)
      }

      await updateNetworkingHabit(userId, interactionDate)
    }
  } catch (error) {
    console.error('Error in handleLinkedInMessage:', error)
    throw error
  }
}

// ===== NETWORKING HABIT AUTO-UPDATE =====

async function updateNetworkingHabit(userId: string, interactionDate: string) {
  try {
    const { data: habit } = await supabase
      .from('habits')
      .select('id')
      .eq('user_id', userId)
      .eq('tracks_outreach', 'networking')
      .eq('is_active', true)
      .maybeSingle()

    if (!habit) return

    const { data: todayInteractions } = await supabase
      .from('interactions')
      .select('contact_id')
      .eq('user_id', userId)
      .eq('interaction_date', interactionDate)

    const distinctContacts = new Set(
      (todayInteractions ?? []).map((i: any) => i.contact_id)
    ).size

    await supabase
      .from('habit_logs')
      .upsert(
        { user_id: userId, habit_id: habit.id, log_date: interactionDate, value: distinctContacts },
        { onConflict: 'habit_id,log_date' }
      )
  } catch {
    // Non-critical
  }
}

// ===== PROSPECTING HABIT AUTO-UPDATE =====

async function updateProspectingHabit(userId: string, date: string) {
  try {
    const { data: habit } = await supabase
      .from('habits')
      .select('id')
      .eq('user_id', userId)
      .eq('tracks_outreach', 'prospecting')
      .eq('is_active', true)
      .maybeSingle()

    if (!habit) return

    const { count } = await supabase
      .from('outreach_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('log_date', date)

    await supabase
      .from('habit_logs')
      .upsert(
        { user_id: userId, habit_id: habit.id, log_date: date, value: count ?? 0 },
        { onConflict: 'habit_id,log_date' }
      )
  } catch {
    // Non-critical
  }
}

// ===== PENDING EVENTS RETRY =====

chrome.alarms.create('processPendingEvents', { periodInMinutes: 5 })

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'processPendingEvents') {
    processPendingEvents()
  }
})

async function processPendingEvents() {
  try {
    const { pendingEvents = [] } = await chrome.storage.local.get('pendingEvents')
    if (pendingEvents.length === 0) return

    const successfulIndexes: number[] = []

    for (let i = 0; i < pendingEvents.length; i++) {
      const event = pendingEvents[i]
      try {
        if (event.type === 'linkedin_message') {
          await handleLinkedInMessage(event)
          successfulIndexes.push(i)
        }
      } catch {
        // Stays in queue
      }
    }

    if (successfulIndexes.length > 0) {
      const remaining = pendingEvents.filter((_: any, i: number) => !successfulIndexes.includes(i))
      await chrome.storage.local.set({ pendingEvents: remaining })
    }
  } catch {
    // Best effort
  }
}

// Export for use in sidebar (via chrome.storage workaround)
// updateProspectingHabit is called from service worker context only
export { updateProspectingHabit }
