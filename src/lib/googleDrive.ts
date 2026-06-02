import { supabase } from '@/lib/supabase'
import type { TodoFileSegment } from '@/lib/todoContent'

export const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const GOOGLE_DRIVE_METADATA_SCOPE = 'https://www.googleapis.com/auth/drive.metadata.readonly'
export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar',
  GOOGLE_DRIVE_FILE_SCOPE,
  GOOGLE_DRIVE_METADATA_SCOPE,
]
export const GOOGLE_OAUTH_SCOPES_STRING = GOOGLE_OAUTH_SCOPES.join(' ')
const DRIVE_SCOPE_REQUESTED_KEY = 'rethink_google_drive_scope_requested'

export function hasGoogleDriveScope(scopes: string | null | undefined) {
  const granted = new Set((scopes ?? '').split(/\s+/).filter(Boolean))
  return granted.has(GOOGLE_DRIVE_FILE_SCOPE) && granted.has(GOOGLE_DRIVE_METADATA_SCOPE)
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

export interface DriveFileResult {
  id: string
  name: string
  mimeType: string
  webViewLink?: string
  iconLink?: string
  modifiedTime?: string
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

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function isSheetsMime(mimeType: string) {
  return mimeType === 'application/vnd.google-apps.spreadsheet'
    || mimeType === 'application/vnd.ms-excel'
    || mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || mimeType === 'text/csv'
}

function driveUrl(file: DriveFileResult) {
  if (file.webViewLink) return file.webViewLink
  if (file.mimeType === 'application/vnd.google-apps.spreadsheet') return `https://docs.google.com/spreadsheets/d/${file.id}`
  if (file.mimeType === 'application/vnd.google-apps.document') return `https://docs.google.com/document/d/${file.id}`
  if (file.mimeType === 'application/vnd.google-apps.presentation') return `https://docs.google.com/presentation/d/${file.id}`
  return `https://drive.google.com/file/d/${file.id}/view`
}

export function driveFileToSegment(file: DriveFileResult): TodoFileSegment {
  return {
    type: 'file',
    id: crypto.randomUUID(),
    label: file.name,
    source: 'google_drive',
    mimeType: file.mimeType,
    url: driveUrl(file),
    googleFileId: file.id,
    openMode: isSheetsMime(file.mimeType) ? 'sheets' : 'browser',
  }
}

export async function searchDriveFiles(query: string, pageSize = 8): Promise<DriveFileResult[]> {
  const token = await googleAccessToken()
  if (!token) throw new Error('Reconnect Google in Settings to search Drive.')

  const trimmed = query.trim()
  const allowedTypes = [
    "mimeType = 'application/vnd.google-apps.document'",
    "mimeType = 'application/vnd.google-apps.spreadsheet'",
    "mimeType = 'application/vnd.google-apps.presentation'",
    "mimeType = 'application/pdf'",
    "mimeType = 'text/plain'",
    "mimeType = 'text/markdown'",
    "mimeType = 'text/csv'",
    "mimeType = 'application/msword'",
    "mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'",
    "mimeType = 'application/vnd.ms-excel'",
    "mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'",
  ].join(' or ')
  const parts = ['trashed = false', `(${allowedTypes})`]
  if (trimmed) parts.push(`name contains '${escapeDriveQuery(trimmed)}'`)

  const params = new URLSearchParams({
    q: parts.join(' and '),
    pageSize: String(pageSize),
    fields: 'files(id,name,mimeType,webViewLink,iconLink,modifiedTime)',
    orderBy: trimmed ? 'name_natural' : 'modifiedTime desc',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  })
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(res.status === 401 || res.status === 403
      ? 'Reconnect Google in Settings to search Drive.'
      : `Could not search Drive. ${detail}`)
  }
  const json = await res.json() as { files?: DriveFileResult[] }
  return json.files ?? []
}
