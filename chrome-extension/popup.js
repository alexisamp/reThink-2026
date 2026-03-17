// popup.js — handles the extension popup UI

const connectedState = document.getElementById('connectedState')
const disconnectedState = document.getElementById('disconnectedState')
const userIdDisplay = document.getElementById('userIdDisplay')
const connectBtn = document.getElementById('connectBtn')
const disconnectBtn = document.getElementById('disconnectBtn')
const codeInput = document.getElementById('codeInput')
const statusMsg = document.getElementById('statusMsg')

/**
 * Shows the connected UI with a masked user ID.
 * @param {string} userId
 */
function showConnected(userId) {
  connectedState.style.display = 'block'
  disconnectedState.style.display = 'none'
  userIdDisplay.textContent = `User: …${userId.slice(-8)}`
  statusMsg.textContent = ''
  statusMsg.className = 'status'
}

/**
 * Shows the disconnected UI.
 */
function showDisconnected() {
  connectedState.style.display = 'none'
  disconnectedState.style.display = 'block'
  userIdDisplay.textContent = ''
  statusMsg.textContent = ''
  statusMsg.className = 'status'
}

/**
 * Sets the status message.
 * @param {string} msg
 * @param {'success'|'error'|''} type
 */
function setStatus(msg, type = '') {
  statusMsg.textContent = msg
  statusMsg.className = `status ${type}`
}

// On load: check if already connected
chrome.storage.local.get('authData', (result) => {
  if (result.authData && result.authData.user_id && result.authData.access_token) {
    showConnected(result.authData.user_id)
  } else {
    showDisconnected()
  }
})

// Connect button
connectBtn.addEventListener('click', () => {
  const raw = codeInput.value.trim()
  if (!raw) {
    setStatus('Please paste a connect code.', 'error')
    return
  }

  let parsed
  try {
    parsed = JSON.parse(atob(raw))
  } catch (_e) {
    setStatus('Invalid code. Please copy again from reThink Settings.', 'error')
    return
  }

  if (!parsed.access_token || !parsed.refresh_token || !parsed.user_id) {
    setStatus('Incomplete code. Please copy again from reThink Settings.', 'error')
    return
  }

  const authData = {
    access_token: parsed.access_token,
    refresh_token: parsed.refresh_token,
    user_id: parsed.user_id,
    expires_at: parsed.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
  }

  chrome.storage.local.set({ authData }, () => {
    showConnected(authData.user_id)
    setStatus('Connected successfully!', 'success')
  })
})

// Disconnect button
disconnectBtn.addEventListener('click', () => {
  chrome.storage.local.remove('authData', () => {
    showDisconnected()
    setStatus('Disconnected.', '')
  })
})
