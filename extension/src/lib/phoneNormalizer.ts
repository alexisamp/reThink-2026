/**
 * Normalizes phone numbers to a consistent format for matching
 * Examples:
 *   '+52 1 555 1234 5678' → '+5215551234567'
 *   '555 1234 5678'       → '+5255512345678' (assumes Mexico)
 *   '0052 555 1234'       → '+52555234'
 */
export function normalizePhoneNumber(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null

  // Remove all non-digit characters except '+'
  let cleaned = raw.replace(/[^\d+]/g, '')

  if (!cleaned) return null

  // Replace leading '00' with '+'
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2)
  }

  // If no '+', assume Mexico (+52)
  if (!cleaned.startsWith('+')) {
    cleaned = '+52' + cleaned
  }

  // Must have at least country code + some digits (min 5 chars like +521234)
  if (cleaned.length < 5) return null

  return cleaned
}
