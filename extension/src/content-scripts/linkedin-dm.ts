// Detect LinkedIn messages and report normalized outreach events to the service worker.

import { normalizeLinkedInUrl } from '../lib/linkedinNormalizer'

console.log('reThink People: LinkedIn DM content script loaded')

const MESSAGE_SELECTOR = [
  '.msg-s-event-listitem',
  '.msg-s-message-list-item',
  '.msg-s-message-list__event',
].join(', ')
const CONTAINER_SELECTOR = [
  '.msg-convo-wrapper',
  '.msg-thread',
  '.msg-s-message-list',
  '.msg-s-message-list-container',
  '.msg-overlay-conversation-bubble',
  '[data-control-name="message_body"]',
].join(', ')

const processedMessages = new Set<string>()
const observedContainers = new WeakSet<Element>()

function messageTimestamp(messageElement: HTMLElement): number | null {
  const dateTime = messageElement.querySelector('time[datetime]')?.getAttribute('datetime')
    ?? messageElement.getAttribute('data-created-at')
  if (!dateTime) return null
  const timestamp = Date.parse(dateTime)
  return Number.isFinite(timestamp) ? timestamp : null
}

function messageIdentifier(messageElement: HTMLElement, direction: 'inbound' | 'outbound', timestamp: number): string {
  const nativeId = messageElement.getAttribute('data-event-urn')
    ?? messageElement.getAttribute('data-urn')
    ?? messageElement.id
  if (nativeId) return nativeId
  const body = messageElement.querySelector('.msg-s-event-listitem__body, .msg-s-message-list__message-bubble')
    ?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? ''
  return `${direction}:${timestamp}:${body}`
}

function conversationProfileUrl(messageElement: HTMLElement): string | null {
  const conversation = messageElement.closest('.msg-convo-wrapper, .msg-thread, .msg-overlay-conversation-bubble') ?? document
  const selectors = [
    '.msg-thread__link-to-profile[href*="/in/"]',
    'a[data-control-name="view_profile"][href*="/in/"]',
    '.msg-overlay-bubble-header a[href*="/in/"]',
    '.msg-entity-lockup a[href*="/in/"]',
  ]
  for (const selector of selectors) {
    const link = conversation.querySelector(selector) as HTMLAnchorElement | null
    const normalized = link?.href ? normalizeLinkedInUrl(link.href) : null
    if (normalized) return normalized
  }
  return null
}

function handleMessage(messageElement: HTMLElement, existing = false) {
  try {
    const direction: 'inbound' | 'outbound' = messageElement.matches('.msg-s-event-listitem--other, .msg-s-message-list__event--other')
      || Boolean(messageElement.closest('.msg-s-event-listitem--other, .msg-s-message-list__event--other'))
      ? 'inbound'
      : 'outbound'
    const parsedTimestamp = messageTimestamp(messageElement)
    // Existing history is only safe to import when LinkedIn exposes a machine timestamp.
    if (existing && parsedTimestamp == null) return
    const timestamp = parsedTimestamp ?? Date.now()
    const messageId = messageIdentifier(messageElement, direction, timestamp)
    if (processedMessages.has(messageId)) return

    const linkedinUrl = conversationProfileUrl(messageElement)
    if (!linkedinUrl) {
      console.warn('reThink: Could not identify the LinkedIn conversation profile')
      return
    }
    processedMessages.add(messageId)

    chrome.runtime.sendMessage({
      type: 'linkedin_message',
      linkedinUrl,
      direction,
      timestamp,
      messageId,
    }).then(result => {
      if (result && !result.success) processedMessages.delete(messageId)
    }).catch(error => {
      processedMessages.delete(messageId)
      console.error('reThink: Failed to send LinkedIn DM event:', error)
    })
  } catch (error) {
    console.error('reThink: Error handling LinkedIn DM:', error)
  }
}

function observeContainer(container: Element) {
  if (observedContainers.has(container)) return
  observedContainers.add(container)

  container.querySelectorAll(MESSAGE_SELECTOR).forEach(element => handleMessage(element as HTMLElement, true))
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return
        const element = node as HTMLElement
        if (element.matches(MESSAGE_SELECTOR)) handleMessage(element)
        element.querySelectorAll(MESSAGE_SELECTOR).forEach(message => handleMessage(message as HTMLElement))
      })
    }
  })
  observer.observe(container, { childList: true, subtree: true })
  console.log('reThink: LinkedIn DM observer attached')
}

function findConversationContainers() {
  document.querySelectorAll(CONTAINER_SELECTOR).forEach(observeContainer)
}

let observedUrl = window.location.href
const pageObserver = new MutationObserver(() => {
  if (window.location.href !== observedUrl) {
    observedUrl = window.location.href
    processedMessages.clear()
  }
  findConversationContainers()
})

function init() {
  findConversationContainers()
  pageObserver.observe(document.documentElement, { childList: true, subtree: true })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true })
} else {
  init()
}
