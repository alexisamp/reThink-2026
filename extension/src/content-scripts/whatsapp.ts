// WhatsApp Web content script
// Detects when user sends/receives messages and reports to background service worker

import { normalizePhoneNumber } from '../lib/phoneNormalizer'

console.log('reThink People: WhatsApp content script loaded')

const processedMessages = new Set<string>()

function initWhatsAppObserver() {
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

    // Extract phone from data-id (format: "true_PHONE@c.us_MSGID" or "false_PHONE@c.us_MSGID")
    const phoneMatch = dataId.match(/(?:true|false)_(.+?)@c\.us/)
    if (!phoneMatch?.[1]) return
    const rawPhone = phoneMatch[1]

    // Skip group chats — check for multiple participant indicator in header
    const participantEl = document.querySelector('header [data-testid="conversation-info-header"] span[title]')
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
