// LinkedIn content script
// Detects when user sends/receives DMs and reports to background service worker

import { normalizeLinkedInUrl } from '../lib/linkedinNormalizer'

console.log('reThink Auto-Capture: LinkedIn content script loaded')

// Track processed messages to avoid duplicates
const processedMessages = new Set<string>()

// Attach MutationObserver to detect new messages
function initMessageObserver() {
  const conversationWrapper = document.querySelector('div.msg-convo-wrapper')

  if (!conversationWrapper) {
    console.log('[LinkedIn] Conversation wrapper not found, retrying in 2s...')
    setTimeout(initMessageObserver, 2000)
    return
  }

  console.log('[LinkedIn] Conversation wrapper found, attaching observer')

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          // Check if this is a message element
          if (node.classList.contains('msg-s-event-listitem') ||
              node.querySelector('.msg-s-event-listitem')) {
            handleNewMessage(node)
          }
        }
      })
    })
  })

  observer.observe(conversationWrapper, {
    childList: true,
    subtree: true,
  })

  console.log('[LinkedIn] Observer attached successfully')
}

function handleNewMessage(element: HTMLElement) {
  try {
    // Find the actual message element
    const messageElement = element.classList.contains('msg-s-event-listitem')
      ? element
      : element.querySelector('.msg-s-event-listitem')

    if (!messageElement) return

    // Generate unique ID for this message to avoid duplicates
    const messageId = messageElement.getAttribute('data-event-urn') ||
                      messageElement.textContent?.substring(0, 50) ||
                      Date.now().toString()

    if (processedMessages.has(messageId)) {
      return // Already processed
    }
    processedMessages.add(messageId)

    // Detect direction: inbound if has class 'msg-s-event-listitem--other', else outbound
    const isInbound = messageElement.classList.contains('msg-s-event-listitem--other')
    const direction = isInbound ? 'inbound' : 'outbound'

    console.log(`[LinkedIn] New ${direction} message detected`)

    // Extract LinkedIn profile URL from conversation header
    const linkedinUrl = extractLinkedInUrl()

    if (!linkedinUrl) {
      console.warn('[LinkedIn] Could not extract LinkedIn URL, skipping')
      return
    }

    // Check if this is a group conversation (skip)
    if (isGroupConversation()) {
      console.log('[LinkedIn] Group conversation detected, skipping')
      return
    }

    console.log('[LinkedIn] Sending message event:', {
      linkedinUrl,
      direction,
      timestamp: Date.now(),
    })

    // Send event to background service worker
    chrome.runtime.sendMessage({
      type: 'linkedin_message',
      linkedinUrl,
      direction,
      timestamp: Date.now(),
    })
  } catch (error) {
    console.error('[LinkedIn] Error handling message:', error)
  }
}

function extractLinkedInUrl(): string | null {
  try {
    // Look for profile link in conversation header
    const profileLink = document.querySelector('a[data-control-name="view_profile"]') as HTMLAnchorElement

    if (!profileLink?.href) {
      console.warn('[LinkedIn] Profile link not found in header')
      return null
    }

    const normalizedUrl = normalizeLinkedInUrl(profileLink.href)

    if (!normalizedUrl) {
      console.warn('[LinkedIn] Failed to normalize URL:', profileLink.href)
      return null
    }

    console.log('[LinkedIn] Extracted LinkedIn URL:', normalizedUrl)
    return normalizedUrl
  } catch (error) {
    console.error('[LinkedIn] Error extracting LinkedIn URL:', error)
    return null
  }
}

function isGroupConversation(): boolean {
  try {
    // Check conversation header for participant count
    // Group conversations typically have multiple participant indicators
    const participantsText = document.querySelector('.msg-thread__link-to-profile')?.textContent || ''

    // If there's a "and X others" or multiple names separated by commas, it's a group
    if (participantsText.includes(' and ') || participantsText.includes(',')) {
      return true
    }

    // Alternative: Check for group conversation indicator
    const groupIndicator = document.querySelector('.msg-thread__group-conversation')
    if (groupIndicator) {
      return true
    }

    // Check for multiple participant avatars
    const participantAvatars = document.querySelectorAll('.msg-thread__participants-list .presence-entity')
    if (participantAvatars.length > 1) {
      return true
    }

    return false
  } catch (error) {
    console.error('[LinkedIn] Error checking group conversation:', error)
    // If we can't determine, err on the side of caution and skip
    return true
  }
}

// Initialize observer when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMessageObserver)
} else {
  initMessageObserver()
}
