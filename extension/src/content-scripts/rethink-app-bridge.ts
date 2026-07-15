export {}

type BatchRequest = {
  source?: string
  type?: string
  requestId?: string
  urls?: unknown
}

window.addEventListener('message', event => {
  if (event.source !== window) return
  const data = event.data as BatchRequest
  if (data?.source === 'rethink-app' && data.type === 'PING_RETHINK_EXTENSION') {
    window.postMessage({
      source: 'rethink-extension',
      type: 'PONG_RETHINK_EXTENSION',
      requestId: data.requestId,
      success: true,
    }, window.location.origin)
    return
  }
  if (data?.source !== 'rethink-app' || data.type !== 'OPEN_LINKEDIN_BATCH') return

  chrome.runtime.sendMessage({
    type: 'OPEN_LINKEDIN_BATCH',
    requestId: data.requestId,
    urls: Array.isArray(data.urls) ? data.urls : [],
  }).then(result => {
    window.postMessage({
      source: 'rethink-extension',
      type: 'OPEN_LINKEDIN_BATCH_RESULT',
      requestId: data.requestId,
      ...(result ?? {}),
    }, window.location.origin)
  }).catch(error => {
    window.postMessage({
      source: 'rethink-extension',
      type: 'OPEN_LINKEDIN_BATCH_RESULT',
      requestId: data.requestId,
      success: false,
      error: String(error),
    }, window.location.origin)
  })
})
