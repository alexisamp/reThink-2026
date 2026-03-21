// WhatsApp Web content script
// Detects when user sends/receives messages and reports to background service worker

import { normalizePhoneNumber } from '../lib/phoneNormalizer'

console.log('reThink Auto-Capture: WhatsApp content script loaded')

// Track processed messages to avoid duplicates
const processedMessages = new Set<string>()

// Main observer
function initWhatsAppObserver() {
  // Wait for WhatsApp Web to load
  const checkReady = setInterval(() => {
    const conversationPanel = document.querySelector('div[data-testid="conversation-panel-messages"]')
    if (conversationPanel) {
      clearInterval(checkReady)
      startObserving(conversationPanel)
      console.log('reThink: WhatsApp observer attached')
    }
  }, 1000)

  // Timeout after 30 seconds
  setTimeout(() => clearInterval(checkReady), 30000)
}

function startObserving(conversationPanel: Element) {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement
            // Check if this is a message
            if (element.classList.contains('message-in') || element.classList.contains('message-out')) {
              handleNewMessage(element)
            }
            // Also check children in case message is nested
            element.querySelectorAll('.message-in, .message-out').forEach((msg) => {
              handleNewMessage(msg as HTMLElement)
            })
          }
        })
      }
    }
  })

  observer.observe(conversationPanel, {
    childList: true,
    subtree: true,
  })
}

function handleNewMessage(messageElement: HTMLElement) {
  try {
    // Generate a unique ID for this message to avoid duplicates
    const messageId = messageElement.getAttribute('data-id') ?? messageElement.innerText.slice(0, 50)

    if (processedMessages.has(messageId)) {
      return // Already processed
    }
    processedMessages.add(messageId)

    // Detect direction
    const isOutbound = messageElement.classList.contains('message-out')
    const direction = isOutbound ? 'outbound' : 'inbound'

    // Extract phone number from conversation header
    const headerElement = document.querySelector('header span[data-testid="conversation-info-header-chat-title"]')
    if (!headerElement) {
      console.warn('reThink: Could not find conversation header')
      return
    }

    const rawPhone = headerElement.textContent?.trim()
    if (!rawPhone) {
      console.warn('reThink: Could not extract phone from header')
      return
    }

    // Skip group chats (check for "group" in header or if there's a participant count indicator)
    const headerText = rawPhone.toLowerCase()
    if (headerText.includes('group') || headerText.includes('grupo')) {
      console.log('reThink: Skipping group chat')
      return
    }

    // Check for group indicators in DOM
    const participantInfo = document.querySelector('header [data-testid="conversation-info-header"] span[title]')
    if (participantInfo && participantInfo.textContent?.includes(',')) {
      console.log('reThink: Skipping group chat (multiple participants)')
      return
    }

    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(rawPhone)
    if (!normalizedPhone) {
      console.warn('reThink: Could not normalize phone number:', rawPhone)
      return
    }

    // Send event to background service worker
    const event = {
      type: 'whatsapp_message',
      phone: normalizedPhone,
      direction,
      timestamp: Date.now(),
    }

    console.log('reThink: Sending WhatsApp message event:', event)

    chrome.runtime.sendMessage(event).catch((err) => {
      console.error('reThink: Failed to send message to background:', err)
    })
  } catch (error) {
    console.error('reThink: Error handling WhatsApp message:', error)
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWhatsAppObserver)
} else {
  initWhatsAppObserver()
}
