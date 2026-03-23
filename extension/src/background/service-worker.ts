// Background service worker for reThink Auto-Capture extension
// Handles message events from content scripts and manages interaction logging

import { supabase } from '../lib/supabase'

console.log('reThink Auto-Capture: Background service worker loaded')

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('reThink Auto-Capture extension installed')
})

// Handle extension icon click - open side panel
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return

  // Open side panel
  await chrome.sidePanel.open({ tabId: tab.id })

  // If on WhatsApp Web, get current contact info
  if (tab.url?.includes('web.whatsapp.com')) {
    await updateWhatsAppContactInfo(tab.id)
  }
})

// Listen for tab URL changes to auto-update contact info when conversation changes
let lastWhatsAppUrl: string | null = null

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only process if URL changed and it's WhatsApp Web
  if (changeInfo.url && tab.url?.includes('web.whatsapp.com')) {
    // Avoid processing the same URL multiple times
    if (tab.url !== lastWhatsAppUrl) {
      lastWhatsAppUrl = tab.url

      // Wait a bit for WhatsApp to load the new conversation
      setTimeout(async () => {
        await updateWhatsAppContactInfo(tabId)
      }, 1000)
    }
  }
})

// Helper function to extract and update WhatsApp contact info
async function updateWhatsAppContactInfo(tabId: number) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractWhatsAppContactInfo,
    })

    if (results && results[0]?.result) {
      const contactInfo = results[0].result

      // Only update storage if data actually changed (prevents UI flashing)
      const { currentWhatsAppContact: existing } = await chrome.storage.local.get('currentWhatsAppContact')
      if (!existing || existing.phone !== contactInfo.phone || existing.name !== contactInfo.name) {
        await chrome.storage.local.set({ currentWhatsAppContact: contactInfo })
      }
    }
  } catch (error) {
    console.error('Failed to extract WhatsApp contact info:', error)
  }
}

// Function to extract contact info from WhatsApp Web page (injected into page context)
function extractWhatsAppContactInfo() {
  try {
    let contactName = null

    // Use innerText — it ONLY returns visible text on screen.
    // Icon names, aria-labels, data-testids, SVG titles are all invisible → excluded.
    const conversationHeader = document.querySelector('header [data-testid="conversation-info-header"]') as HTMLElement | null

    if (conversationHeader) {
      const visibleText = conversationHeader.innerText?.trim()
      if (visibleText) {
        // First line of visible text in the header = the contact name
        const firstLine = visibleText.split('\n')[0]?.trim()
        if (firstLine && firstLine.length >= 2 && firstLine.length < 100) {
          contactName = firstLine
        }
      }
    }

    // Try to get phone from the most recent message data-id
    const messages = document.querySelectorAll('[data-id]')
    let phone = null

    for (const msg of Array.from(messages).reverse()) {
      const dataId = msg.getAttribute('data-id')
      if (dataId?.includes('@c.us')) {
        const phoneMatch = dataId.match(/(?:true|false)_(.+?)@c\.us/)
        if (phoneMatch && phoneMatch[1]) {
          phone = phoneMatch[1]
          break
        }
      }
    }

    return {
      name: contactName,
      phone: phone,
      url: window.location.href,
    }
  } catch (error) {
    console.error('Error extracting contact info:', error)
    return null
  }
}

// Message handlers
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('Received message:', message)

  // Handle async message processing
  ;(async () => {
    try {
      if (message.type === 'whatsapp_message') {
        await handleWhatsAppMessage(message)
        sendResponse({ success: true })
      } else if (message.type === 'linkedin_message') {
        await handleLinkedInMessage(message)
        sendResponse({ success: true })
      } else if (message.type === 'get_whatsapp_contact') {
        // Refresh WhatsApp contact info
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (tab?.id && tab.url?.includes('web.whatsapp.com')) {
          try {
            const results = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: extractWhatsAppContactInfo,
            })

            if (results && results[0]?.result) {
              const contactInfo = results[0].result
              await chrome.storage.local.set({ currentWhatsAppContact: contactInfo })
              sendResponse({ success: true, contactInfo })
            } else {
              sendResponse({ success: false, error: 'No contact info found' })
            }
          } catch (error) {
            console.error('Error extracting contact info:', error)
            sendResponse({ success: false, error: String(error) })
          }
        } else {
          sendResponse({ success: false, error: 'Not on WhatsApp Web' })
        }
      } else {
        sendResponse({ success: false, error: 'Unknown message type' })
      }
    } catch (error) {
      console.error('Error handling message:', error)
      sendResponse({ success: false, error: String(error) })
    }
  })()

  return true // Keep channel open for async response
})

// Helper: Get current user ID from stored session
async function getCurrentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user?.id ?? null
}

// Periodic check for pending events (Phase 7 - error handling)
chrome.alarms.create('processPendingEvents', { periodInMinutes: 5 })

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'processPendingEvents') {
    processPendingEvents()
  }
})

async function processPendingEvents() {
  console.log('Processing pending events...')

  try {
    const { pendingEvents = [] } = await chrome.storage.local.get('pendingEvents')

    if (pendingEvents.length === 0) {
      return
    }

    console.log('Found', pendingEvents.length, 'pending events to retry')

    const successfulEvents: number[] = []

    for (let i = 0; i < pendingEvents.length; i++) {
      const event = pendingEvents[i]

      try {
        if (event.type === 'whatsapp_message') {
          await handleWhatsAppMessage(event)
          successfulEvents.push(i)
          console.log('Successfully retried WhatsApp event')
        } else if (event.type === 'linkedin_message') {
          await handleLinkedInMessage(event)
          successfulEvents.push(i)
          console.log('Successfully retried LinkedIn event')
        }
      } catch (error) {
        console.error('Failed to retry event:', error)
        // Event stays in queue for next retry
      }
    }

    // Remove successful events from queue
    if (successfulEvents.length > 0) {
      const remainingEvents = pendingEvents.filter((_: any, i: number) => !successfulEvents.includes(i))
      await chrome.storage.local.set({ pendingEvents: remainingEvents })
      console.log('Retried', successfulEvents.length, 'events,', remainingEvents.length, 'remaining')
    }
  } catch (error) {
    console.error('Error in processPendingEvents:', error)
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
  console.log('Handling WhatsApp message event:', event)

  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      console.warn('User not logged in, skipping message')
      return
    }

    // 1. Find contact by phone
    const contact = await findContactByPhone(userId, event.phone)
    if (!contact) {
      console.log('Unknown phone number, opening contact mapping popup')
      await openContactMappingPopup(event.phone)
      return
    }

    console.log('Found contact:', contact.name)

    // 2. Check for active window (window_end > now)
    const activeWindow = await findActiveWindow(userId, contact.id, 'whatsapp')

    if (activeWindow) {
      // Extend existing window: increment message_count
      console.log('Extending existing window:', activeWindow.id)
      const { error } = await supabase
        .from('extension_interaction_windows')
        .update({
          message_count: activeWindow.message_count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeWindow.id)

      if (error) {
        console.error('Failed to update window:', error)
        await queueFailedEvent(event)
        throw error
      }

      console.log('Window updated, message count:', activeWindow.message_count + 1)
    } else {
      // No active window - check if interaction already exists for today
      const interactionDate = new Date(event.timestamp).toISOString().split('T')[0]

      // Check for existing interaction for this contact + date
      const { data: existingInteraction } = await supabase
        .from('interactions')
        .select('id')
        .eq('user_id', userId)
        .eq('contact_id', contact.id)
        .eq('interaction_date', interactionDate)
        .eq('type', 'whatsapp')
        .maybeSingle()

      let interaction

      if (existingInteraction) {
        // Interaction already exists (from previous message today) - reuse it
        console.log('Reusing existing interaction for today:', existingInteraction.id)
        interaction = existingInteraction
      } else {
        // Create new interaction
        console.log('Creating new interaction and window')
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
          console.error('Failed to create interaction:', interactionError)
          await queueFailedEvent(event)
          throw interactionError
        }

        console.log('Interaction created:', newInteraction.id)
        interaction = newInteraction
      }

      // Create window (6 hours from now)
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
        console.error('Failed to create window:', windowError)
        throw windowError
      }

      console.log('Window created, expires at:', windowEnd.toISOString())

      // Update networking habit count
      await updateNetworkingHabit(userId, interactionDate)

      // Update last processed message timestamp for this contact
      await updateLastProcessedMessage(userId, event.phone, event.timestamp)
    }
  } catch (error) {
    console.error('Error in handleWhatsAppMessage:', error)
    // Show notification to user
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '/icons/icon-48.png',
      title: 'reThink Auto-Capture',
      message: 'Failed to log WhatsApp interaction. Check your connection.',
    })
    throw error
  }
}

// ===== LINKEDIN MESSAGE HANDLER (STUB FOR NOW) =====

interface LinkedInMessageEvent {
  type: 'linkedin_message'
  linkedinUrl: string
  direction: 'inbound' | 'outbound'
  timestamp: number
}

async function handleLinkedInMessage(event: LinkedInMessageEvent) {
  console.log('Handling LinkedIn message event:', event)

  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      console.warn('User not logged in, skipping message')
      return
    }

    // 1. Find contact by LinkedIn URL
    const contact = await findContactByLinkedInUrl(userId, event.linkedinUrl)
    if (!contact) {
      console.log('Unknown LinkedIn profile, opening contact mapping popup')
      await openContactMappingPopup(undefined, event.linkedinUrl)
      return
    }

    console.log('Found contact:', contact.name)

    // 2. Check for active window (window_end > now)
    const activeWindow = await findActiveWindow(userId, contact.id, 'linkedin_msg')

    if (activeWindow) {
      // Extend existing window: increment message_count
      console.log('Extending existing window:', activeWindow.id)
      const { error } = await supabase
        .from('extension_interaction_windows')
        .update({
          message_count: activeWindow.message_count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeWindow.id)

      if (error) {
        console.error('Failed to update window:', error)
        await queueFailedEvent(event)
        throw error
      }

      console.log('Window updated, message count:', activeWindow.message_count + 1)
    } else {
      // Create new interaction + window
      console.log('Creating new interaction and window')
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
        console.error('Failed to create interaction:', interactionError)
        await queueFailedEvent(event)
        throw interactionError
      }

      console.log('Interaction created:', interaction.id)

      // Create window (6 hours from now)
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

      if (windowError) {
        console.error('Failed to create window:', windowError)
        throw windowError
      }

      console.log('Window created, expires at:', windowEnd.toISOString())

      // Update networking habit count
      await updateNetworkingHabit(userId, interactionDate)
    }
  } catch (error) {
    console.error('Error in handleLinkedInMessage:', error)
    // Show notification to user
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '/icons/icon-48.png',
      title: 're Think Auto-Capture',
      message: 'Failed to log LinkedIn interaction. Check your connection.',
    })
    throw error
  }
}

// ===== HELPER FUNCTIONS =====

interface Contact {
  id: string
  name: string
}

async function findContactByPhone(userId: string, phone: string): Promise<Contact | null> {
  console.log('Finding contact by phone:', phone)

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

  if (error) {
    console.error('Error finding contact by phone:', error)
    return null
  }

  if (!data) {
    console.log('No contact found for phone:', phone)
    return null
  }

  // Extract contact info from the JOIN
  const contactData = data.outreach_logs as any
  return {
    id: contactData.id,
    name: contactData.name,
  }
}

async function findContactByLinkedInUrl(userId: string, linkedinUrl: string): Promise<Contact | null> {
  console.log('Finding contact by LinkedIn URL:', linkedinUrl)

  const { data, error } = await supabase
    .from('outreach_logs')
    .select('id, name')
    .eq('user_id', userId)
    .eq('linkedin_url', linkedinUrl)
    .maybeSingle()

  if (error) {
    console.error('Error finding contact by LinkedIn URL:', error)
    return null
  }

  if (!data) {
    console.log('No contact found for LinkedIn URL:', linkedinUrl)
    return null
  }

  return {
    id: data.id,
    name: data.name,
  }
}

interface ActiveWindow {
  id: string
  message_count: number
  window_end: string
}

async function findActiveWindow(
  userId: string,
  contactId: string,
  channel: string
): Promise<ActiveWindow | null> {
  console.log('Finding active window for contact:', contactId, 'channel:', channel)

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

  if (error) {
    console.error('Error finding active window:', error)
    return null
  }

  if (data) {
    console.log('Found active window:', data.id, 'expires:', data.window_end)
  }

  return data
}

async function openContactMappingPopup(phone?: string, linkedinUrl?: string) {
  console.log('Opening contact mapping popup for:', phone ?? linkedinUrl)

  // Store pending data in chrome.storage (temp)
  await chrome.storage.local.set({
    pendingPhone: phone ?? null,
    pendingLinkedInUrl: linkedinUrl ?? null,
  })

  // Open popup in new tab for contact mapping
  const popupUrl = chrome.runtime.getURL('src/popup/index.html#map-contact')
  await chrome.tabs.create({ url: popupUrl })
}

async function queueFailedEvent(event: WhatsAppMessageEvent | LinkedInMessageEvent) {
  console.log('Queueing failed event:', event)

  try {
    const { pendingEvents = [] } = await chrome.storage.local.get('pendingEvents')
    pendingEvents.push(event)
    await chrome.storage.local.set({ pendingEvents })
    console.log('Event queued, total pending:', pendingEvents.length)
  } catch (error) {
    console.error('Failed to queue event:', error)
  }
}

// ===== NETWORKING HABIT AUTO-UPDATE (Phase 6) =====

async function updateNetworkingHabit(userId: string, interactionDate: string) {
  console.log('Updating networking habit for date:', interactionDate)

  try {
    // 1. Get the user's networking habit
    const { data: habit, error: habitError } = await supabase
      .from('habits')
      .select('id')
      .eq('user_id', userId)
      .eq('tracks_outreach', 'networking')
      .eq('is_active', true)
      .maybeSingle()

    if (habitError) throw habitError

    if (!habit) {
      console.log('User does not have a networking habit configured')
      return
    }

    console.log('Found networking habit:', habit.id)

    // 2. Count distinct contacts talked to today
    const { data: todayInteractions, error: interactionsError } = await supabase
      .from('interactions')
      .select('contact_id')
      .eq('user_id', userId)
      .eq('interaction_date', interactionDate)

    if (interactionsError) throw interactionsError

    const distinctContacts = new Set(
      (todayInteractions ?? []).map((i: any) => i.contact_id)
    ).size

    console.log('Distinct contacts for', interactionDate, ':', distinctContacts)

    // 3. Upsert habit_log
    const { error: upsertError } = await supabase
      .from('habit_logs')
      .upsert(
        {
          user_id: userId,
          habit_id: habit.id,
          log_date: interactionDate,
          value: distinctContacts,
        },
        {
          onConflict: 'user_id,habit_id,log_date',
        }
      )

    if (upsertError) throw upsertError

    console.log('Networking habit updated, value:', distinctContacts)
  } catch (error) {
    console.error('Error updating networking habit:', error)
    // Don't throw - habit update is nice-to-have, not critical
  }
}

/**
 * Update the last processed message timestamp for a phone number mapping
 */
async function updateLastProcessedMessage(userId: string, phone: string, timestamp: number) {
  try {
    const { error } = await supabase
      .from('contact_phone_mappings')
      .update({
        last_processed_at: new Date(timestamp).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('phone_number', phone)

    if (error) {
      console.error('Failed to update last processed message:', error)
    }
  } catch (error) {
    console.error('Error updating last processed message:', error)
    // Don't throw - this is tracking only, not critical
  }
}
