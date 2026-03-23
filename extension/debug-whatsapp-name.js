// Debug script to find the ACTUAL contact name in WhatsApp Web
// Paste this in the console while viewing a conversation

console.log('=== DEBUGGING WHATSAPP CONTACT NAME EXTRACTION ===\n')

// Strategy 1: Look at conversation-info-header
const conversationHeader = document.querySelector('header [data-testid="conversation-info-header"]')
console.log('1. Found conversation-info-header:', !!conversationHeader)

if (conversationHeader) {
  console.log('   HTML preview:', conversationHeader.outerHTML.substring(0, 300))

  // Find ALL spans inside it
  const allSpans = conversationHeader.querySelectorAll('span')
  console.log('\n   Total spans inside:', allSpans.length)

  allSpans.forEach((span, i) => {
    const text = span.textContent?.trim()
    const title = span.getAttribute('title')
    const ariaLabel = span.getAttribute('aria-label')
    const role = span.getAttribute('role')
    const dir = span.getAttribute('dir')

    if (text || title || ariaLabel) {
      console.log(`\n   Span ${i + 1}:`)
      if (text) console.log('     textContent:', text)
      if (title) console.log('     title:', title)
      if (ariaLabel) console.log('     aria-label:', ariaLabel)
      if (role) console.log('     role:', role)
      if (dir) console.log('     dir:', dir)
      console.log('     className:', span.className)
    }
  })
}

// Strategy 2: Look for the specific pattern WhatsApp uses
console.log('\n\n2. Looking for spans with dir="auto" and aria-label (WhatsApp pattern):')
const dirAutoSpans = document.querySelectorAll('header span[dir="auto"]')
console.log('   Found', dirAutoSpans.length, 'spans with dir="auto"')

dirAutoSpans.forEach((span, i) => {
  const text = span.textContent?.trim()
  const ariaLabel = span.getAttribute('aria-label')
  if (text && text.length > 0) {
    console.log(`   ${i + 1}. "${text}" (aria-label: ${ariaLabel || 'none'})`)
  }
})

// Strategy 3: Look at the actual header text (visible to user)
console.log('\n\n3. All text visible in header:')
const header = document.querySelector('header')
if (header) {
  const headerText = header.innerText
  console.log('   Full header text:\n   ', headerText.split('\n').join('\n    '))
}

// Strategy 4: Find the largest text node
console.log('\n\n4. Looking for largest text in header spans:')
const headerSpans = document.querySelectorAll('header span')
let candidates = []

headerSpans.forEach(span => {
  const text = span.textContent?.trim()
  if (text && text.length >= 3 && text.length < 100 && !text.includes('\n')) {
    candidates.push({
      text,
      length: text.length,
      hasTitle: !!span.getAttribute('title'),
      hasAriaLabel: !!span.getAttribute('aria-label'),
      dir: span.getAttribute('dir'),
      className: span.className.substring(0, 30)
    })
  }
})

// Sort by length descending
candidates.sort((a, b) => b.length - a.length)

console.log('   Top 10 text candidates by length:')
candidates.slice(0, 10).forEach((c, i) => {
  console.log(`   ${i + 1}. "${c.text}" (len: ${c.length}, title: ${c.hasTitle}, aria: ${c.hasAriaLabel}, dir: ${c.dir})`)
})

console.log('\n\n=== RECOMMENDATION ===')
console.log('The ACTUAL contact name is likely one of the texts shown above.')
console.log('Copy all this output and send it to me so I can fix the extraction logic.')
