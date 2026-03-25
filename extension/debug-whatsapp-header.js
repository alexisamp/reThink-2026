// Debug script to find WhatsApp conversation header
// Ejecuta esto en la consola de WhatsApp Web después de abrir una conversación

console.log('=== BUSCANDO HEADER DE CONVERSACIÓN ===\n')

// Estrategia 1: Buscar todos los elementos <header>
const allHeaders = document.querySelectorAll('header')
console.log('Total headers:', allHeaders.length)
allHeaders.forEach((header, i) => {
  console.log(`\nHeader ${i + 1}:`)
  console.log('HTML:', header.outerHTML.substring(0, 300))
  console.log('Text content:', header.textContent?.substring(0, 100))
})

// Estrategia 2: Buscar por texto que contenga número o nombre
console.log('\n=== BUSCANDO ELEMENTOS CON TEXTO (posible nombre/teléfono) ===')

// Buscar spans con texto
const spans = Array.from(document.querySelectorAll('span')).filter(span => {
  const text = span.textContent?.trim()
  return text && text.length > 0 && text.length < 50 && !text.includes('\n')
})

console.log('Spans con texto corto (primeros 10):')
spans.slice(0, 10).forEach((span, i) => {
  console.log(`${i + 1}. "${span.textContent}" - class: ${span.className}`)
  if (span.getAttribute('data-testid')) {
    console.log('   data-testid:', span.getAttribute('data-testid'))
  }
  if (span.title) {
    console.log('   title:', span.title)
  }
})

// Estrategia 3: Buscar el área superior de la conversación (probablemente position: fixed o sticky)
console.log('\n=== ELEMENTOS EN LA PARTE SUPERIOR ===')
const topElements = Array.from(document.querySelectorAll('div, header')).filter(el => {
  const rect = el.getBoundingClientRect()
  return rect.top < 100 && rect.width > 300 // Elementos en los primeros 100px
})

console.log('Elementos en top 100px:', topElements.length)
topElements.slice(0, 5).forEach((el, i) => {
  console.log(`\n${i + 1}. Tag: ${el.tagName}, Class: ${el.className.substring(0, 50)}`)
  const text = el.textContent?.trim().substring(0, 100)
  console.log('   Text:', text)
})

// Estrategia 4: Buscar por atributos data-testid que contengan "header" o "conversation"
console.log('\n=== ELEMENTOS CON data-testid relacionados ===')
const testIdElements = document.querySelectorAll('[data-testid*="header"], [data-testid*="conversation"], [data-testid*="chat"]')
console.log('Total elementos con data-testid relevante:', testIdElements.length)
testIdElements.forEach((el, i) => {
  console.log(`${i + 1}. data-testid="${el.getAttribute('data-testid')}"`)
  console.log('   Tag:', el.tagName, 'Text:', el.textContent?.substring(0, 50))
})

// Estrategia 5: Buscar hermanos del div.copyable-area
console.log('\n=== HERMANOS DE div.copyable-area ===')
const copyableArea = document.querySelector('div.copyable-area')
if (copyableArea && copyableArea.parentElement) {
  const siblings = Array.from(copyableArea.parentElement.children)
  console.log('Total hermanos:', siblings.length)
  siblings.forEach((sibling, i) => {
    console.log(`${i + 1}. Tag: ${sibling.tagName}, Class: ${sibling.className.substring(0, 50)}`)
    if (sibling !== copyableArea) {
      console.log('   Text:', sibling.textContent?.substring(0, 100))
    }
  })
}

console.log('\n=== INSTRUCCIÓN ===')
console.log('Copia TODA esta salida y envíamela')
