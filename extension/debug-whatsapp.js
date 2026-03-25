// Debug script para WhatsApp Web
// Ejecuta esto en la consola de WhatsApp Web (F12 → Console → pega y Enter)

console.log('=== DEBUG WhatsApp Web Structure ===')

// 1. Verificar panel de conversación
const conversationPanel = document.querySelector('div[data-testid="conversation-panel-messages"]')
console.log('Panel de conversación encontrado:', !!conversationPanel)
if (conversationPanel) {
  console.log('Panel:', conversationPanel)
}

// 2. Buscar elementos de mensaje con diferentes estrategias
console.log('\n=== Buscando mensajes ===')

// Estrategia 1: Por data-testid
const messagesByTestId = document.querySelectorAll('[data-testid*="msg"]')
console.log('Mensajes por data-testid:', messagesByTestId.length)
if (messagesByTestId.length > 0) {
  console.log('Primer mensaje (testid):', messagesByTestId[0])
  console.log('Clases:', messagesByTestId[0].className)
  console.log('data-testid:', messagesByTestId[0].getAttribute('data-testid'))
}

// Estrategia 2: Por clases message-*
const messagesByClass = document.querySelectorAll('[class*="message-"]')
console.log('Mensajes por clase message-*:', messagesByClass.length)
if (messagesByClass.length > 0) {
  console.log('Primer mensaje (clase):', messagesByClass[0])
  console.log('Clases:', messagesByClass[0].className)
}

// Estrategia 3: Ver todos los hijos del panel
if (conversationPanel) {
  console.log('\n=== Hijos directos del panel ===')
  const children = conversationPanel.children
  console.log('Total hijos:', children.length)
  if (children.length > 0) {
    console.log('Primer hijo:', children[0])
    console.log('Clases:', children[0].className)
    console.log('Nietos (primeros 3):', Array.from(children[0].children).slice(0, 3))
  }
}

// 3. Verificar header para extraer teléfono
console.log('\n=== Header info ===')
const header = document.querySelector('header span[data-testid="conversation-info-header-chat-title"]')
console.log('Header encontrado:', !!header)
if (header) {
  console.log('Texto del header:', header.textContent)
}

// 4. Buscar mensajes recientes (últimos 5 minutos)
console.log('\n=== INSTRUCCIÓN: Envía un mensaje de prueba ahora ===')
console.log('Después de enviar, copia TODA esta salida y envíamela')
