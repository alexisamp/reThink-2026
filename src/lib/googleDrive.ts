import { supabase } from '@/lib/supabase'

export const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar',
  GOOGLE_DRIVE_FILE_SCOPE,
]
export const GOOGLE_OAUTH_SCOPES_STRING = GOOGLE_OAUTH_SCOPES.join(' ')
const DRIVE_SCOPE_REQUESTED_KEY = 'rethink_google_drive_scope_requested'

export function hasGoogleDriveScope(scopes: string | null | undefined) {
  return (scopes ?? '').split(/\s+/).includes(GOOGLE_DRIVE_FILE_SCOPE)
}

export function markGoogleDriveScopeRequested() {
  localStorage.setItem(DRIVE_SCOPE_REQUESTED_KEY, '1')
}

export function consumeGoogleDriveScopeRequested() {
  const requested = localStorage.getItem(DRIVE_SCOPE_REQUESTED_KEY) === '1'
  if (requested) localStorage.removeItem(DRIVE_SCOPE_REQUESTED_KEY)
  return requested
}

async function googleAccessToken() {
  const { data } = await supabase.auth.getSession()
  const session = data.session
  return session?.provider_token ?? (session?.user?.user_metadata?.google_access_token as string | undefined) ?? null
}

function baseNameWithoutExtension(name: string) {
  return name.replace(/\.[^.]+$/, '')
}

export async function importSpreadsheetToSheets(file: Blob, fileName: string) {
  const token = await googleAccessToken()
  if (!token) {
    throw new Error('Reconnect Google in Settings to import spreadsheets to Sheets.')
  }

  const boundary = `rethink_${crypto.randomUUID()}`
  const metadata = {
    name: baseNameWithoutExtension(fileName),
    mimeType: 'application/vnd.google-apps.spreadsheet',
  }
  const body = new Blob([
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    '\r\n',
    `--${boundary}\r\n`,
    `Content-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`,
    file,
    '\r\n',
    `--${boundary}--`,
  ], { type: `multipart/related; boundary=${boundary}` })

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body,
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(res.status === 401 || res.status === 403
      ? 'Reconnect Google in Settings to import spreadsheets to Sheets.'
      : `Could not import spreadsheet to Sheets. ${detail}`)
  }

  const json = await res.json() as { id: string; webViewLink?: string }
  return {
    id: json.id,
    url: json.webViewLink ?? `https://docs.google.com/spreadsheets/d/${json.id}`,
  }
}
