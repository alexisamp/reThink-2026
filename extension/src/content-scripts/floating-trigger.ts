// Floating trigger button — Phase 4
// Injects the reThink People trigger button on LinkedIn profiles and WhatsApp Web

const BUTTON_ID = 'rethink-people-trigger'
const BURNHAM = '#003720'
const PASTEL = '#79D65E'

function isWhatsApp() { return window.location.hostname === 'web.whatsapp.com' }
function isLinkedInProfile() { return /linkedin\.com\/in\/[^/?#]+/.test(window.location.href) }

function cleanLinkedInUrl(url: string): string | null {
  const match = url.match(/linkedin\.com\/in\/([^/?#&]+)/)
  if (!match) return null
  return `https://www.linkedin.com/in/${match[1]}`
}

function injectTrigger(isKnown: boolean) {
  if (document.getElementById(BUTTON_ID)) return

  const btn = document.createElement('button')
  btn.id = BUTTON_ID

  const iconUrl = chrome.runtime.getURL('icons/icon-48.png')

  btn.style.cssText = [
    'position: fixed',
    'bottom: 24px',
    'right: 24px',
    'z-index: 2147483647',
    'width: 44px',
    'height: 44px',
    'border-radius: 50%',
    `background: ${BURNHAM}`,
    'border: none',
    'cursor: pointer',
    'display: flex',
    'align-items: center',
    'justify-content: center',
    'box-shadow: 0 4px 16px rgba(0,0,0,0.3)',
    'transition: transform 0.15s, box-shadow 0.15s',
    'padding: 0',
  ].join('; ')

  btn.innerHTML = `<img src="${iconUrl}" style="width:24px;height:24px;border-radius:4px;" />`

  if (isKnown) {
    const dot = document.createElement('span')
    dot.style.cssText = [
      'position: absolute',
      'top: 0',
      'right: 0',
      'width: 12px',
      'height: 12px',
      'border-radius: 50%',
      `background: ${PASTEL}`,
      'border: 2px solid white',
    ].join('; ')
    btn.appendChild(dot)
  }

  btn.addEventListener('mouseenter', () => {
    btn.style.transform = 'scale(1.08)'
    btn.style.boxShadow = '0 6px 20px rgba(0,0,0,0.4)'
  })
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'scale(1)'
    btn.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)'
  })

  btn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_SIDEBAR' })
  })

  document.body.appendChild(btn)
}

function removeTrigger() {
  document.getElementById(BUTTON_ID)?.remove()
}

// Init for LinkedIn profiles
if (isLinkedInProfile()) {
  const linkedinUrl = cleanLinkedInUrl(window.location.href)
  if (linkedinUrl) {
    chrome.runtime.sendMessage(
      { type: 'CHECK_CONTACT_LINKEDIN', linkedinUrl },
      (response: { exists?: boolean } | undefined) => {
        injectTrigger(response?.exists ?? false)
      }
    )
  } else {
    injectTrigger(false)
  }

  // Watch for SPA navigation
  let lastUrl = window.location.href
  const navObserver = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href
      removeTrigger()
      if (isLinkedInProfile()) {
        setTimeout(() => {
          const url = cleanLinkedInUrl(window.location.href)
          if (url) {
            chrome.runtime.sendMessage(
              { type: 'CHECK_CONTACT_LINKEDIN', linkedinUrl: url },
              (response: { exists?: boolean } | undefined) => {
                injectTrigger(response?.exists ?? false)
              }
            )
          }
        }, 800)
      }
    }
  })
  navObserver.observe(document.body, { childList: true, subtree: true })
}

// Init for WhatsApp
if (isWhatsApp()) {
  setTimeout(() => {
    chrome.runtime.sendMessage(
      { type: 'GET_WHATSAPP_CONTACT_STATUS' },
      (response: { isMapped?: boolean } | undefined) => {
        injectTrigger(response?.isMapped ?? false)
      }
    )
  }, 2000)
}
