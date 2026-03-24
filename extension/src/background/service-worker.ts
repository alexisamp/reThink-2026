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
      if (isLI && tab.url.includes('/in/')) scripts.push('src/content-scripts/linkedin-profile.js', 'src/content-scripts/floating-trigger.js')
      if (isLI && tab.url.includes('/messaging/')) scripts.push('src/content-scripts/linkedin-dm.js')

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
  // Removed: setOptions enable/disable — was causing panel to be disabled when tab.url was briefly undefined

  // WhatsApp conversation change
  if (isWhatsApp && tab.url !== lastWhatsAppUrl) {
    lastWhatsAppUrl = tab.url ?? null
    setTimeout(async () => {
      await updateWhatsAppContactInfo(tabId)
    }, 1000)
  }

  // LinkedIn profile navigation
  if (changeInfo.url.includes('linkedin.com/in/')) {
    setTimeout(async () => {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: extractLinkedInProfileBasicInfo,
        })
        if (results?.[0]?.result) {
          const existing = (await chrome.storage.local.get('currentLinkedInProfile')).currentLinkedInProfile
          const newData = results[0].result
          if (!existing || existing.linkedinUrl !== newData.linkedinUrl) {
            await chrome.storage.local.set({
              currentLinkedInProfile: newData,
              currentWhatsAppContact: null,
            })
          }
        }
      } catch {
        // Tab not injectable
      }
    }, 1200)
  }
})

// ===== WHATSAPP CONTACT INFO EXTRACTION =====

async function updateWhatsAppContactInfo(tabId: number) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractWhatsAppContactInfo,
    })

    if (results && results[0]?.result) {
      const contactInfo = results[0].result
      const existing = (await chrome.storage.local.get('currentWhatsAppContact')).currentWhatsAppContact
      if (!existing || existing.phone !== contactInfo.phone || existing.name !== contactInfo.name) {
        await chrome.storage.local.set({
          currentWhatsAppContact: contactInfo,
          currentLinkedInProfile: null,
        })
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

    let phone = null
    const messages = document.querySelectorAll('[data-id]')
    for (const msg of Array.from(messages).reverse()) {
      const dataId = msg.getAttribute('data-id')
      if (dataId?.includes('@c.us')) {
        const match = dataId.match(/(?:true|false)_(.+?)@c\.us/)
        if (match?.[1]) { phone = match[1]; break }
      }
    }

    return { name: contactName, phone, url: window.location.href }
  } catch {
    return null
  }
}

// Injected into LinkedIn profile pages — must be self-contained
function extractLinkedInProfileBasicInfo() {
  try {
    let name = null
    const h1 = document.querySelector('h1.text-heading-xlarge') as HTMLElement | null
    if (h1) name = h1.innerText?.trim() ?? null

    let jobTitle = null
    const titleEl = document.querySelector('.text-body-medium.break-words') as HTMLElement | null
    if (titleEl) jobTitle = titleEl.innerText?.trim() ?? null

    const rawUrl = window.location.href
    const match = rawUrl.match(/linkedin\.com\/in\/([^/?#&]+)/)
    const linkedinUrl = match ? `https://www.linkedin.com/in/${match[1]}` : null

    return { name, jobTitle, linkedinUrl, url: rawUrl }
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
    if (tabId) {
      chrome.sidePanel.open({ tabId }).catch(err => console.warn('sidePanel.open error:', err))
    }
    sendResponse({ success: true })
    return false
  }

  ;(async () => {
    try {
      switch (message.type) {
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

        case 'GET_WHATSAPP_CONTACT_STATUS': {
          const stored = await chrome.storage.local.get('currentWhatsAppContact')
          if (!stored.currentWhatsAppContact?.phone) { sendResponse({ isMapped: false }); break }
          const userId = await getCurrentUserId()
          if (!userId) { sendResponse({ isMapped: false }); break }
          const contact = await findContactByPhone(userId, stored.currentWhatsAppContact.phone)
          sendResponse({ isMapped: !!contact })
          break
        }

        case 'LINKEDIN_PROFILE_DATA': {
          // Store basic info immediately for sidebar routing
          const existing = (await chrome.storage.local.get('currentLinkedInProfile')).currentLinkedInProfile
          if (!existing || existing.linkedinUrl !== message.linkedinUrl) {
            await chrome.storage.local.set({
              currentLinkedInProfile: {
                name: message.name,
                linkedinUrl: message.linkedinUrl,
                jobTitle: message.jobTitle,
                company: message.company,
                profilePhotoUrl: message.profilePhotoUrl,
              },
              currentWhatsAppContact: null,
            })
          }

          // Upload photo in background (non-blocking)
          if (message.profilePhotoUrl && message.linkedinUrl) {
            uploadLinkedInPhoto(message.profilePhotoUrl, message.linkedinUrl).then(async (permanentUrl) => {
              if (permanentUrl && permanentUrl !== message.profilePhotoUrl) {
                const current = (await chrome.storage.local.get('currentLinkedInProfile')).currentLinkedInProfile
                if (current?.linkedinUrl === message.linkedinUrl) {
                  await chrome.storage.local.set({
                    currentLinkedInProfile: { ...current, profilePhotoUrl: permanentUrl }
                  })
                }
              }
            }).catch(() => {})
          }

          sendResponse({ success: true })
          break
        }

        default:
          sendResponse({ success: false, error: 'Unknown message type' })
      }
    } catch (error) {
      console.error('Error handling message:', error)
      sendResponse({ success: false, error: String(error) })
    }
  })()

  return true
})

// ===== PHOTO UPLOAD =====

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

async function findContactByLinkedInUrl(userId: string, linkedinUrl: string): Promise<Contact | null> {
  const { data, error } = await supabase
    .from('outreach_logs')
    .select('id, name')
    .eq('user_id', userId)
    .eq('linkedin_url', linkedinUrl)
    .maybeSingle()

  if (error || !data) return null
  return { id: data.id, name: data.name }
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

async function handleWhatsAppMessage(event: WhatsAppMessageEvent) {
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
          interaction_id: interaction.id,
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
          interaction_id: interaction.id,
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
        { onConflict: 'user_id,habit_id,log_date' }
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
        { onConflict: 'user_id,habit_id,log_date' }
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
