// Background service worker for reThink Auto-Capture extension
// Handles message events from content scripts and manages interaction logging

import { supabase } from '../lib/supabase'
import { normalizePhoneNumber } from '../lib/phoneNormalizer'

console.log('reThink Auto-Capture: Background service worker loaded')

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('reThink Auto-Capture extension installed')
})

// Message handlers
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
  // TODO: Retry failed events from chrome.storage.local.pendingEvents
  console.log('Processing pending events...')
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
      // Create new interaction + window
      console.log('Creating new interaction and window')
      const interactionDate = new Date(event.timestamp).toISOString().split('T')[0]

      const { data: interaction, error: interactionError } = await supabase
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
  console.log('LinkedIn message handling not yet implemented:', event)
  // Will be implemented in Phase 5
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
  console.log('Opening contact mapping popup')

  // Store pending data in chrome.storage (temp)
  await chrome.storage.local.set({
    pendingPhone: phone ?? null,
    pendingLinkedInUrl: linkedinUrl ?? null,
  })

  // Open popup in new tab (not inline popup, need more space)
  // This will be implemented in Phase 4, for now just log
  console.log('TODO: Open contact mapping popup for:', phone ?? linkedinUrl)
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
