// WhatsApp Web content script
// Detects when user sends/receives messages and reports to background service worker

import { normalizePhoneNumber } from '../lib/phoneNormalizer'

console.log('reThink People: WhatsApp content script loaded')

const processedMessages = new Set<string>()

// ===== CONVERSATION CHANGE DETECTOR =====
// Polls the phone number from message data-id attributes.
// WhatsApp Web doesn't change the URL when switching chats, but every message
// carries the contact's phone in its data-id ("true_PHONE@c.us_MSGID").
// When the phone changes, a new conversation is active.

let currentConversationPhone: string | null = null
let lastConversationSwitchTime = Date.now()  // init to now so initial history load is treated as a switch

function getPhoneFromDom(): string | null {
  const msgs = document.querySelectorAll('[data-id*="@c.us"]')
  for (const msg of Array.from(msgs)) {
    const dataId = msg.getAttribute('data-id')
    if (!dataId) continue
    const m = dataId.match(/(?:true|false)_(.+?)@c\.us/)
    if (m?.[1]) return m[1]
  }
  return null
}

function startConversationChangeDetector() {
  setInterval(() => {
    const phone = getPhoneFromDom()
    if (!phone) return  // messages not loaded yet
    if (phone !== currentConversationPhone) {
      currentConversationPhone = phone
      lastConversationSwitchTime = Date.now()
      // Send the phone directly so service worker doesn't need to re-extract
      chrome.runtime.sendMessage({
        type: 'WHATSAPP_CONVERSATION_CHANGED',
        phone: '+' + phone,
      }).catch(() => {})
    }
  }, 600)
}

function initWhatsAppObserver() {
  startConversationChangeDetector()

  const checkReady = setInterval(() => {
    const panel = document.querySelector('[data-testid="conversation-panel-messages"]')
      ?? document.querySelector('div.copyable-area')
    if (panel) {
      clearInterval(checkReady)
      startObserving(panel)
      console.log('reThink: WhatsApp observer attached')
    }
  }, 1000)
  setTimeout(() => clearInterval(checkReady), 30000)
}

function startObserving(panel: Element) {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return
        const el = node as HTMLElement

        // Direct match: element has data-id with @c.us
        if (el.hasAttribute('data-id') && el.getAttribute('data-id')?.includes('@c.us')) {
          handleNewMessage(el)
        }

        // Nested match: container holds message elements
        el.querySelectorAll('[data-id*="@c.us"]').forEach(msg => {
          handleNewMessage(msg as HTMLElement)
        })
      })
    }
  })
  observer.observe(panel, { childList: true, subtree: true })
}

function handleNewMessage(messageElement: HTMLElement) {
  try {
    const dataId = messageElement.getAttribute('data-id')
    if (!dataId || !dataId.includes('@c.us')) return

    // Deduplicate by data-id
    if (processedMessages.has(dataId)) return
    processedMessages.add(dataId)

    // Skip messages that appear within 5s of a chat switch/open — those are history loads, not new messages
    if (Date.now() - lastConversationSwitchTime < 5000) return

    // Extract phone from data-id (format: "true_PHONE@c.us_MSGID" or "false_PHONE@c.us_MSGID")
    const phoneMatch = dataId.match(/(?:true|false)_(.+?)@c\.us/)
    if (!phoneMatch?.[1]) return
    const rawPhone = phoneMatch[1]

    // Skip group chats — check for multiple participant indicator in header
    const participantEl = document.querySelector('header [data-testid="conversation-info-header"] span[title]')
      ?? document.querySelector('header [data-testid="conversation-info-header"] span[dir]')
      ?? document.querySelector('header span[data-testid="conversation-info-header-chat-title"]')
      ?? document.querySelector('[data-testid="conversation-header"] span[title]')
    if (participantEl?.textContent?.includes(',')) return

    // Normalize phone
    const normalizedPhone = normalizePhoneNumber(rawPhone)
    if (!normalizedPhone) {
      console.warn('reThink: Could not normalize phone:', rawPhone)
      return
    }

    // Detect direction from class (message-out = sent by user, else received)
    const isOutbound = messageElement.classList.contains('message-out')
    const direction: 'outbound' | 'inbound' = isOutbound ? 'outbound' : 'inbound'

    console.log('reThink: Sending WhatsApp message event:', { phone: normalizedPhone, direction })

    chrome.runtime.sendMessage({
      type: 'whatsapp_message',
      phone: normalizedPhone,
      direction,
      timestamp: Date.now(),
    }).catch(err => console.error('reThink: Failed to send message:', err))
  } catch (error) {
    console.error('reThink: Error handling WhatsApp message:', error)
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWhatsAppObserver)
} else {
  initWhatsAppObserver()
}
