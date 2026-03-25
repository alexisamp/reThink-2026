// Background service worker for reThink People extension
// Handles message events from content scripts and manages interaction logging

import { supabase } from '../lib/supabase'

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
      const isWA = tab.url.includes('web.whatsapp.com')
      const isLI = tab.url.includes('linkedin.com')
      if (!isWA && !isLI) continue

      // Inject content scripts manually
      const scripts: string[] = []
      if (isWA) scripts.push('src/content-scripts/whatsapp.js', 'src/content-scripts/floating-trigger.js')
      if (isLI) scripts.push('src/content-scripts/linkedin-profile.js', 'src/content-scripts/floating-trigger.js', 'src/content-scripts/linkedin-dm.js')

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
  if (tab.url?.includes('web.whatsapp.com')) {
    await updateWhatsAppContactInfo(tab.id)
  }
})

// ===== TAB EVENTS — Update context only (no enable/disable — panel always available) =====

let lastWhatsAppUrl: string | null = null

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url) return

  const isWhatsApp = changeInfo.url.includes('web.whatsapp.com')

  // WhatsApp conversation change
  if (isWhatsApp && tab.url !== lastWhatsAppUrl) {
    lastWhatsAppUrl = tab.url ?? null
    setTimeout(async () => {
      await updateWhatsAppContactInfo(tabId)
    }, 1000)
  }

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
            currentWhatsAppContact: null,
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
      // Switched to a LinkedIn profile tab — clear WhatsApp, extract LinkedIn
      await chrome.storage.local.set({ currentWhatsAppContact: null })
      setTimeout(async () => {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: extractLinkedInProfileBasicInfo,
          })
          if (results?.[0]?.result?.linkedinUrl) {
            await chrome.storage.local.set({
              currentLinkedInProfile: results[0].result,
              currentWhatsAppContact: null,
            })
          }
        } catch {}
      }, 600)
    } else if (tab.url.includes('web.whatsapp.com')) {
      // Switched to WhatsApp — clear LinkedIn, extract WhatsApp contact
      await chrome.storage.local.set({ currentLinkedInProfile: null })
      setTimeout(async () => {
        await updateWhatsAppContactInfo(tabId)
      }, 600)
    } else if (!tab.url.includes('linkedin.com')) {
      // Switched to an unrelated tab — clear both
      await chrome.storage.local.set({ currentWhatsAppContact: null, currentLinkedInProfile: null })
    }
  } catch {
    // Tab may not be accessible
  }
})

// ===== WHATSAPP CONTACT INFO EXTRACTION =====

async function updateWhatsAppContactInfo(tabId: number, attempt = 1) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractWhatsAppContactInfo,
    })

    if (results && results[0]?.result) {
      const contactInfo = results[0].result
      if (contactInfo.phone) {
        // Add '+' prefix if not present (WhatsApp data-id has full intl number without +)
        if (!contactInfo.phone.startsWith('+')) {
          contactInfo.phone = '+' + contactInfo.phone
        }
        // Phone found — update storage to trigger onChanged → determineState()
        await chrome.storage.local.set({
          currentWhatsAppContact: contactInfo,
          currentLinkedInProfile: null,
        })
      } else {
        // Phone not found yet — could be new chat that hasn't loaded messages
        if (contactInfo.name) {
          // Write partial data (name only) so sidebar shows something
          await chrome.storage.local.set({
            currentWhatsAppContact: { ...contactInfo, phone: null },
            currentLinkedInProfile: null,
          })
        }
        if (attempt < 4) {
          // Retry after messages load
          setTimeout(() => updateWhatsAppContactInfo(tabId, attempt + 1), 1200)
        }
      }
    }
  } catch (error) {
    console.error('Failed to extract WhatsApp contact info:', error)
  }
}

// Injected into WhatsApp Web page — must be self-contained
function extractWhatsAppContactInfo() {
  try {
    let contactName = null

    // Try specific span selectors first (most reliable)
    const nameSelectors = [
      'header [data-testid="conversation-info-header"] span[title]',
      'header span[data-testid="conversation-info-header-chat-title"]',
      '[data-testid="conversation-header"] span[title]',
      'header [data-testid="conversation-info-header"] span[dir]',
    ]
    for (const sel of nameSelectors) {
      const el = document.querySelector(sel) as HTMLElement | null
      if (el) {
        const text = (el.getAttribute('title') || el.innerText)?.trim()
        if (text && text.length >= 2 && text.length < 100) {
          contactName = text
          break
        }
      }
    }

    // Fallback: first span innerText in conversation header
    if (!contactName) {
      const header = document.querySelector('header [data-testid="conversation-info-header"]') as HTMLElement | null
      if (header) {
        const firstSpan = header.querySelector('span') as HTMLElement | null
        if (firstSpan) {
          const text = firstSpan.innerText?.trim()
          if (text && text.length >= 2 && text.length < 100) contactName = text
        }
      }
    }

    // Fallback: full header innerText first line
    if (!contactName) {
      const header = document.querySelector('header [data-testid="conversation-info-header"]') as HTMLElement | null
      if (header) {
        const text = header.innerText?.trim()
        if (text) {
          const firstLine = text.split('\n')[0]?.trim()
          if (firstLine && firstLine.length >= 2 && firstLine.length < 100) {
            contactName = firstLine
          }
        }
      }
    }

    let phone = null
    const messages = document.querySelectorAll('[data-id]')
    for (const msg of Array.from(messages).reverse()) {
      const dataId = msg.getAttribute('data-id')
      if (dataId?.includes('@c.us')) {
        const match = dataId.match(/(?:true|false)_(.+?)@c\.us/)
        if (match?.[1]) {
          // WhatsApp data-id has full international number — just add +
          const raw = match[1]
          phone = raw.startsWith('+') ? raw : '+' + raw
          break
        }
      }
    }

    return { name: contactName, phone, url: window.location.href }
  } catch {
    return null
  }
}

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
      // Async: extract contact info so panel has fresh data (storage.onChanged re-triggers determineState)
      if (tabUrl.includes('web.whatsapp.com')) {
        updateWhatsAppContactInfo(tabId)  // intentionally not awaited
      }
    }
    sendResponse({ success: true })
    return false
  }

  ;(async () => {
    try {
      switch (message.type) {
        case 'WHATSAPP_CONVERSATION_CHANGED': {
          const tabId = sender.tab?.id
          if (tabId) {
            if (message.phone) {
              await chrome.storage.local.set({
                currentWhatsAppContact: { phone: message.phone, name: null },
                currentLinkedInProfile: null,
              })
              // Auto-backfill after 2s so messages have time to render in DOM
              setTimeout(() => autoBackfillWhatsApp(tabId, message.phone), 2000)
            } else {
              await chrome.storage.local.remove('currentWhatsAppContact')
            }
            updateWhatsAppContactInfo(tabId)
          }
          sendResponse({ success: true })
          break
        }

        case 'whatsapp_message':
          await handleWhatsAppMessage(message)
          sendResponse({ success: true })
          break

        case 'linkedin_message':
          await handleLinkedInMessage(message)
          sendResponse({ success: true })
          break

        case 'get_whatsapp_contact': {
          const tabId = sender.tab?.id ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id
          if (tabId) {
            const tab = await chrome.tabs.get(tabId)
            if (tab.url?.includes('web.whatsapp.com')) {
              const results = await chrome.scripting.executeScript({
                target: { tabId },
                func: extractWhatsAppContactInfo,
              })
              if (results?.[0]?.result) {
                await chrome.storage.local.set({ currentWhatsAppContact: results[0].result })
                sendResponse({ success: true, contactInfo: results[0].result })
              } else {
                sendResponse({ success: false, error: 'No contact info found' })
              }
            } else {
              sendResponse({ success: false, error: 'Not on WhatsApp Web' })
            }
          } else {
            sendResponse({ success: false, error: 'Not on WhatsApp Web' })
          }
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

        // F01: Look up contact by phone, with Attio fallback auto-import
        case 'LOAD_CONTACT_BY_PHONE': {
          const userId = await getCurrentUserId()
          if (!userId) { sendResponse({ contact: null }); break }
          const phone: string = message.phone
          const contact = await findContactByPhone(userId, phone)
          if (contact) {
            const { data: full } = await supabase
              .from('outreach_logs')
              .select('id, name, health_score, status, last_interaction_at, personal_context, category, job_title, company, profile_photo_url, birthday, links')
              .eq('id', contact.id)
              .single()
            sendResponse({ contact: full, source: 'local' })
            break
          }
          // Not found locally — try Attio by phone number
          const attioKey = await getStoredAttioKey()
          if (attioKey && phone) {
            try {
              const searchRes = await fetch('https://api.attio.com/v2/objects/people/records/query', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${attioKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  filter: { phone_numbers: { "$any_of": [{ "$eq": phone }] } },
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
                  const linkedin = person.values?.linkedin?.[0]?.value ?? null
                  const title = person.values?.job_title?.[0]?.value ?? null
                  if (name) {
                    const { data: newContact } = await supabase
                      .from('outreach_logs')
                      .insert({
                        user_id: userId,
                        name,
                        phone,
                        email,
                        linkedin_url: linkedin,
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
              console.error('Attio auto-resolve error (phone):', e)
            }
          }
          sendResponse({ contact: null, source: 'not_found' })
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
              .select('id, name, health_score, status, last_interaction_at, personal_context, category, job_title, company, profile_photo_url, birthday, links')
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

        case 'GET_WHATSAPP_CONTACT_STATUS': {
          const stored = await chrome.storage.local.get('currentWhatsAppContact')
          if (!stored.currentWhatsAppContact?.phone) { sendResponse({ isMapped: false }); break }
          const userId = await getCurrentUserId()
          if (!userId) { sendResponse({ isMapped: false }); break }
          const contact = await findContactByPhone(userId, stored.currentWhatsAppContact.phone)
          sendResponse({ isMapped: !!contact })
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
            currentWhatsAppContact: null,
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

        case 'BACKFILL_WHATSAPP_HISTORY': {
          const userId = await getCurrentUserId()
          if (!userId) { sendResponse({ success: false, error: 'not_auth' }); break }

          const contact = await findContactByPhone(userId, message.phone)
          if (!contact) { sendResponse({ success: false, error: 'no_contact' }); break }

          const waTabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' })
          const waTab = waTabs[0]
          if (!waTab?.id) { sendResponse({ success: false, error: 'no_tab' }); break }

          const injected = await chrome.scripting.executeScript({
            target: { tabId: waTab.id },
            func: scanWhatsAppMessageHistory,
          })
          const rawEntries: Array<{ timestamp: number; direction: 'inbound' | 'outbound' }> = injected?.[0]?.result ?? []

          const result = await backfillWindowsForContact(userId, contact, rawEntries)
          sendResponse({ success: true, ...result })
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

// ===== WHATSAPP AUTO BACKFILL =====
// Called silently every time the user switches to a mapped WhatsApp contact.
// Scans visible messages and fills in any 6-hour windows not yet in the DB.
// Safe to call repeatedly — deduplicates by interaction_date.

async function autoBackfillWhatsApp(tabId: number, phone: string) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) return
    const contact = await findContactByPhone(userId, phone)
    if (!contact) return  // Not mapped — nothing to do

    const injected = await chrome.scripting.executeScript({
      target: { tabId },
      func: scanWhatsAppMessageHistory,
    })
    const rawEntries: Array<{ timestamp: number; direction: 'inbound' | 'outbound' }> = injected?.[0]?.result ?? []
    if (rawEntries.length === 0) return

    await backfillWindowsForContact(userId, contact, rawEntries)
  } catch {
    // Non-critical — fail silently
  }
}

// Shared logic used by both auto-backfill and the manual BACKFILL_WHATSAPP_HISTORY message
async function backfillWindowsForContact(
  userId: string,
  contact: Contact,
  rawEntries: Array<{ timestamp: number; direction: 'inbound' | 'outbound' }>
): Promise<{ found: number; created: number }> {
  const windows = groupInto6HourWindows(rawEntries)
  let created = 0

  for (const win of windows) {
    const interactionDate = new Date(win.timestamp).toISOString().split('T')[0]

    const { data: existing } = await supabase
      .from('interactions')
      .select('id')
      .eq('user_id', userId)
      .eq('contact_id', contact.id)
      .eq('interaction_date', interactionDate)
      .eq('type', 'whatsapp')
      .maybeSingle()

    if (existing) continue

    const { data: interaction, error: iErr } = await supabase
      .from('interactions')
      .insert({
        user_id: userId,
        contact_id: contact.id,
        type: 'whatsapp',
        direction: win.direction,
        notes: `[backfill] ${win.messageCount} messages`,
        interaction_date: interactionDate,
      })
      .select()
      .single()

    if (iErr || !interaction) continue

    const windowStart = new Date(win.timestamp)
    const windowEnd = new Date(win.timestamp)
    windowEnd.setHours(windowEnd.getHours() + 6)

    await supabase.from('extension_interaction_windows').insert({
      user_id: userId,
      contact_id: contact.id,
      interaction_id: interaction.id,
      channel: 'whatsapp',
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      direction: win.direction,
      message_count: win.messageCount,
    })

    created++
  }

  if (created > 0) {
    const affectedDates = [...new Set(windows.map(w => new Date(w.timestamp).toISOString().split('T')[0]))]
    for (const date of affectedDates) {
      await updateNetworkingHabit(userId, date)
    }
  }

  return { found: rawEntries.length, created }
}

// ===== WHATSAPP HISTORY BACKFILL =====

// Injected into WhatsApp tab — MUST be self-contained (no imports, no closure references)
function scanWhatsAppMessageHistory(): Array<{ timestamp: number; direction: 'inbound' | 'outbound' }> {
  function parseWATimestamp(s: string): number | null {
    // s examples: "3:45 PM, 3/21/2026" | "15:45, 21/3/2026" | "3:45 p.\u00a0m., 21/3/2026"
    const commaIdx = s.lastIndexOf(',')
    if (commaIdx === -1) return null
    const timeStr = s.slice(0, commaIdx).trim()
    const dateStr = s.slice(commaIdx + 1).trim()

    const parts = dateStr.trim().split('/')
    if (parts.length !== 3) return null

    const p0 = parseInt(parts[0]), p1 = parseInt(parts[1])
    let year = parseInt(parts[2].trim()), month: number, day: number
    if (isNaN(year) || parts[2].trim().length !== 4) return null
    // DD/MM vs MM/DD: if first part > 12 it must be day
    if (p0 > 12) { day = p0; month = p1 } else { month = p0; day = p1 }

    const timeMatch = timeStr.match(/(\d+):(\d+)/)
    if (!timeMatch) return null
    let h = parseInt(timeMatch[1]), m = parseInt(timeMatch[2])
    if (/p[.\s]*m/i.test(timeStr) && h !== 12) h += 12
    else if (/a[.\s]*m/i.test(timeStr) && h === 12) h = 0

    const d = new Date(year, month - 1, day, h, m)
    return isNaN(d.getTime()) ? null : d.getTime()
  }

  try {
    const entries: Array<{ timestamp: number; direction: 'inbound' | 'outbound' }> = []
    const seen = new Set<string>()

    const copyables = document.querySelectorAll('[data-pre-plain-text]')
    for (const el of Array.from(copyables)) {
      const prePlain = el.getAttribute('data-pre-plain-text') ?? ''
      const bracketMatch = prePlain.match(/\[([^\]]+)\]/)
      if (!bracketMatch) continue

      const timestamp = parseWATimestamp(bracketMatch[1])
      if (!timestamp) continue

      const bubble = el.closest('[data-id]') as HTMLElement | null
      const dataId = bubble?.getAttribute('data-id') ?? ''
      if (dataId && seen.has(dataId)) continue
      if (dataId) seen.add(dataId)

      const isInbound = !!(el.closest('.message-in') || bubble?.closest('.message-in'))
      entries.push({ timestamp, direction: isInbound ? 'inbound' : 'outbound' })
    }

    return entries
  } catch {
    return []
  }
}

interface BackfillWindow {
  timestamp: number
  direction: 'inbound' | 'outbound'
  messageCount: number
}

function groupInto6HourWindows(entries: Array<{ timestamp: number; direction: 'inbound' | 'outbound' }>): BackfillWindow[] {
  if (entries.length === 0) return []
  entries.sort((a, b) => a.timestamp - b.timestamp)

  const SIX_HOURS = 6 * 60 * 60 * 1000
  const windows: BackfillWindow[] = []
  let group: typeof entries = []
  let windowStart = entries[0].timestamp

  for (const entry of entries) {
    if (entry.timestamp - windowStart > SIX_HOURS) {
      if (group.length > 0) {
        const out = group.filter(m => m.direction === 'outbound').length
        windows.push({ timestamp: windowStart, direction: out >= group.length - out ? 'outbound' : 'inbound', messageCount: group.length })
      }
      windowStart = entry.timestamp
      group = [entry]
    } else {
      group.push(entry)
    }
  }
  if (group.length > 0) {
    const out = group.filter(m => m.direction === 'outbound').length
    windows.push({ timestamp: windowStart, direction: out >= group.length - out ? 'outbound' : 'inbound', messageCount: group.length })
  }

  return windows
}

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

interface Contact {
  id: string
  name: string
}

async function findContactByPhone(userId: string, phone: string): Promise<Contact | null> {
  const { data, error } = await supabase
    .from('contact_phone_mappings')
    .select(`
      contact_id,
      outreach_logs!inner (
        id,
        name
      )
    `)
    .eq('user_id', userId)
    .eq('phone_number', phone)
    .maybeSingle()

  if (error || !data) return null

  const contactData = data.outreach_logs as any
  return { id: contactData.id, name: contactData.name }
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

  const { data, error } = await supabase
    .from('outreach_logs')
    .select('id, name')
    .eq('user_id', userId)
    .in('linkedin_url', variants)
    .maybeSingle()

  if (error || !data) return null
  return { id: data.id, name: data.name }
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

async function queueFailedEvent(event: WhatsAppMessageEvent | LinkedInMessageEvent) {
  try {
    const { pendingEvents = [] } = await chrome.storage.local.get('pendingEvents')
    pendingEvents.push(event)
    await chrome.storage.local.set({ pendingEvents })
  } catch {
    // Best effort
  }
}

async function updateLastProcessedMessage(userId: string, phone: string, timestamp: number) {
  try {
    await supabase
      .from('contact_phone_mappings')
      .update({
        last_processed_at: new Date(timestamp).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('phone_number', phone)
  } catch {
    // Non-critical
  }
}

// ===== WHATSAPP MESSAGE HANDLER =====

interface WhatsAppMessageEvent {
  type: 'whatsapp_message'
  phone: string
  direction: 'inbound' | 'outbound'
  timestamp: number
}

// In-memory mutex: prevents race conditions when multiple messages arrive simultaneously
// (e.g., WhatsApp history load fires many events at once — all find "no active window" → all create interactions)
const processingPhones = new Set<string>()

async function handleWhatsAppMessage(event: WhatsAppMessageEvent) {
  // Skip if already processing this phone — prevents duplicate interaction creation from concurrent events
  if (processingPhones.has(event.phone)) return
  processingPhones.add(event.phone)
  try {
    await _handleWhatsAppMessage(event)
  } finally {
    // Release mutex after a short delay so rapid messages are still grouped into the same window
    setTimeout(() => processingPhones.delete(event.phone), 2000)
  }
}

async function _handleWhatsAppMessage(event: WhatsAppMessageEvent) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) return

    const contact = await findContactByPhone(userId, event.phone)
    if (!contact) {
      // Store pending phone so sidebar can prompt for mapping
      await chrome.storage.local.set({ pendingPhone: event.phone })
      return
    }

    const activeWindow = await findActiveWindow(userId, contact.id, 'whatsapp')

    if (activeWindow) {
      await supabase
        .from('extension_interaction_windows')
        .update({ message_count: activeWindow.message_count + 1, updated_at: new Date().toISOString() })
        .eq('id', activeWindow.id)
    } else {
      const interactionDate = new Date(event.timestamp).toISOString().split('T')[0]

      const { data: existingInteraction } = await supabase
        .from('interactions')
        .select('id')
        .eq('user_id', userId)
        .eq('contact_id', contact.id)
        .eq('interaction_date', interactionDate)
        .eq('type', 'whatsapp')
        .maybeSingle()

      let interaction = existingInteraction

      if (!interaction) {
        const { data: newInteraction, error: interactionError } = await supabase
          .from('interactions')
          .insert({
            user_id: userId,
            contact_id: contact.id,
            type: 'whatsapp',
            direction: event.direction,
            notes: null,
            interaction_date: interactionDate,
          })
          .select()
          .single()

        if (interactionError || !newInteraction) {
          await queueFailedEvent(event)
          throw interactionError
        }
        interaction = newInteraction
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
          channel: 'whatsapp',
          window_start: windowStart.toISOString(),
          window_end: windowEnd.toISOString(),
          direction: event.direction,
          message_count: 1,
        })

      if (windowError) {
        await queueFailedEvent(event)
        throw windowError
      }

      await updateNetworkingHabit(userId, interactionDate)
      await updateLastProcessedMessage(userId, event.phone, event.timestamp)
    }
  } catch (error) {
    console.error('Error in handleWhatsAppMessage:', error)
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '/icons/icon-48.png',
      title: 'reThink People',
      message: 'Failed to log WhatsApp interaction. Check your connection.',
    })
    throw error
  }
}

// ===== LINKEDIN MESSAGE HANDLER =====

interface LinkedInMessageEvent {
  type: 'linkedin_message'
  linkedinUrl: string
  direction: 'inbound' | 'outbound'
  timestamp: number
}

async function handleLinkedInMessage(event: LinkedInMessageEvent) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) return

    const contact = await findContactByLinkedInUrl(userId, event.linkedinUrl)
    if (!contact) return // Unknown LinkedIn contact — no popup for DMs

    const activeWindow = await findActiveWindow(userId, contact.id, 'linkedin_msg')

    if (activeWindow) {
      await supabase
        .from('extension_interaction_windows')
        .update({ message_count: activeWindow.message_count + 1, updated_at: new Date().toISOString() })
        .eq('id', activeWindow.id)
    } else {
      const interactionDate = new Date(event.timestamp).toISOString().split('T')[0]

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
        if (event.type === 'whatsapp_message') {
          await handleWhatsAppMessage(event)
          successfulIndexes.push(i)
        } else if (event.type === 'linkedin_message') {
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
