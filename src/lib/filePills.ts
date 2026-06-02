import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import type { TodoFileSegment } from '@/lib/todoContent'
import { importSpreadsheetToSheets } from '@/lib/googleDrive'
import { openLink } from '@/lib/openLink'

const SPREADSHEET_EXTENSIONS = new Set(['xlsx', 'xls', 'csv'])
const MIME_BY_EXTENSION: Record<string, string> = {
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  html: 'text/html',
  md: 'text/markdown',
  pdf: 'application/pdf',
  txt: 'text/plain',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

function randomId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
}

function extensionFromName(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

function labelFromPath(path: string) {
  return decodeURIComponent(path.split(/[\\/]/).pop() || path)
}

function labelFromUrl(url: string) {
  try {
    const parsed = new URL(url)
    const fileName = parsed.pathname.split('/').filter(Boolean).pop()
    if (parsed.hostname.includes('docs.google.com')) {
      if (parsed.pathname.includes('/spreadsheets/')) return 'Google Sheet'
      if (parsed.pathname.includes('/document/')) return 'Google Doc'
      if (parsed.pathname.includes('/presentation/')) return 'Google Slides'
    }
    return decodeURIComponent(fileName || parsed.hostname)
  } catch {
    return url
  }
}

function fileUrl(path: string) {
  if (path.startsWith('file://')) return path
  return `file://${path.split('/').map(part => encodeURIComponent(part)).join('/')}`
}

function blobFromBase64(base64: string, mimeType: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes.buffer.slice(0)], { type: mimeType || 'application/octet-stream' })
}

export function fileSegmentFromUrl(url: string): TodoFileSegment | null {
  const trimmed = url.trim()
  if (!/^https?:\/\//i.test(trimmed)) return null
  return {
    type: 'file',
    id: randomId(),
    label: labelFromUrl(trimmed),
    source: trimmed.includes('docs.google.com') || trimmed.includes('drive.google.com') ? 'google_drive' : 'url',
    mimeType: null,
    url: trimmed,
    openMode: trimmed.includes('/spreadsheets/') ? 'sheets' : 'browser',
  }
}

export async function fileSegmentFromLocalPath(path: string): Promise<TodoFileSegment> {
  const label = labelFromPath(path)
  const ext = extensionFromName(label)
  const mimeType = MIME_BY_EXTENSION[ext] ?? 'application/octet-stream'

  if (SPREADSHEET_EXTENSIONS.has(ext)) {
    const base64 = await invoke<string>('read_local_file_base64', { path })
    const sheet = await importSpreadsheetToSheets(blobFromBase64(base64, mimeType), label)
    return {
      type: 'file',
      id: randomId(),
      label: label.replace(/\.[^.]+$/, ''),
      source: 'google_drive',
      mimeType: 'application/vnd.google-apps.spreadsheet',
      url: sheet.url,
      googleFileId: sheet.id,
      openMode: 'sheets',
    }
  }

  return {
    type: 'file',
    id: randomId(),
    label,
    source: 'local',
    mimeType,
    path,
    url: fileUrl(path),
    openMode: 'browser',
  }
}

export async function chooseTodoFile(): Promise<TodoFileSegment | null> {
  const selected = await openDialog({
    multiple: false,
    directory: false,
    title: 'Attach file',
  })
  const path = Array.isArray(selected) ? selected[0] : selected
  if (!path) return null
  return fileSegmentFromLocalPath(path)
}

export async function spreadsheetFileToSegment(file: File): Promise<TodoFileSegment> {
  const sheet = await importSpreadsheetToSheets(file, file.name)
  return {
    type: 'file',
    id: randomId(),
    label: file.name.replace(/\.[^.]+$/, ''),
    source: 'google_drive',
    mimeType: 'application/vnd.google-apps.spreadsheet',
    url: sheet.url,
    googleFileId: sheet.id,
    openMode: 'sheets',
  }
}

export function isSpreadsheetFileName(name: string) {
  return SPREADSHEET_EXTENSIONS.has(extensionFromName(name))
}

export function openTodoFile(file: TodoFileSegment) {
  if (file.url) {
    openLink(file.url)
    return
  }
  if (file.path) openLink(fileUrl(file.path))
}
