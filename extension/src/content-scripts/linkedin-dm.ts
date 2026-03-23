// LinkedIn DM content script — Phase 6
// Detects when user sends/receives LinkedIn messages and reports to service worker

import { normalizeLinkedInUrl } from '../lib/linkedinNormalizer'

console.log('reThink People: LinkedIn DM content script loaded')

const processedMessages = new Set<string>()

function initLinkedInDMObserver() {
  const checkReady = setInterval(() => {
    const container = document.querySelector('.msg-convo-wrapper') ?? document.querySelector('[data-control-name="message_body"]')
    if (container) {
      clearInterval(checkReady)
      startObserving(container)
      console.log('reThink: LinkedIn DM observer attached')
    }
  }, 1000)
  setTimeout(() => clearInterval(checkReady), 30000)
}

function startObserving(container: Element) {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return
        const el = node as HTMLElement
        if (el.classList.contains('msg-s-event-listitem') || el.classList.contains('msg-s-message-list-item')) {
          handleNewMessage(el)
        }
        el.querySelectorAll('.msg-s-event-listitem, .msg-s-message-list-item').forEach(msg => {
          handleNewMessage(msg as HTMLElement)
        })
      })
    }
  })
  observer.observe(container, { childList: true, subtree: true })
}

function handleNewMessage(messageElement: HTMLElement) {
  try {
    // Deduplicate — use text content as ID
    const msgId = messageElement.querySelector('.msg-s-event-listitem__body')?.textContent?.slice(0, 50) ?? messageElement.innerText?.slice(0, 50)
    if (!msgId || processedMessages.has(msgId)) return
    processedMessages.add(msgId)

    // Detect direction: messages from others have class msg-s-event-listitem--other
    const isInbound = messageElement.classList.contains('msg-s-event-listitem--other')
    const direction: 'inbound' | 'outbound' = isInbound ? 'inbound' : 'outbound'

    // Get LinkedIn URL from conversation header
    const profileLink = document.querySelector('a[data-control-name="view_profile"]') as HTMLAnchorElement | null
    if (!profileLink?.href) {
      console.warn('reThink: Could not find profile link in LinkedIn DM')
      return
    }

    const linkedinUrl = normalizeLinkedInUrl(profileLink.href)
    if (!linkedinUrl) {
      console.warn('reThink: Could not normalize LinkedIn URL:', profileLink.href)
      return
    }

    chrome.runtime.sendMessage({
      type: 'linkedin_message',
      linkedinUrl,
      direction,
      timestamp: Date.now(),
    }).catch(err => console.error('reThink: Failed to send LinkedIn DM event:', err))
  } catch (error) {
    console.error('reThink: Error handling LinkedIn DM:', error)
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLinkedInDMObserver)
} else {
  initLinkedInDMObserver()
}
