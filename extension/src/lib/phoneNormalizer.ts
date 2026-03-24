/**
 * Normalizes phone numbers to a consistent format for matching.
 * WhatsApp data-id already contains full international numbers (no +).
 * e.g. data-id: "true_18573900458@c.us" → phone "18573900458" → "+18573900458"
 *
 * Rules:
 *  - Strip all non-digits (except leading +)
 *  - Replace leading '00' with '+'
 *  - If number has 10+ digits and no '+' → just add '+' (already has country code)
 *  - If number has < 10 digits and no '+' → assume Mexico (+52)
 */
export function normalizePhoneNumber(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null

  let cleaned = raw.replace(/[^\d+]/g, '')
  if (!cleaned) return null

  // Replace leading '00' with '+'
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2)
  }

  if (!cleaned.startsWith('+')) {
    // WhatsApp data-id numbers already have country code (10+ digits)
    // Short numbers (<10 digits) → assume Mexico
    if (cleaned.length >= 10) {
      cleaned = '+' + cleaned
    } else {
      cleaned = '+52' + cleaned
    }
  }

  if (cleaned.length < 5) return null
  return cleaned
}

/**
 * Returns all plausible variants of a phone number for flexible DB lookup.
 * Handles legacy stored formats (with/without +, with/without country code).
 */
export function phoneVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, '')
  const variants = new Set<string>()
  variants.add(phone)               // as-is
  variants.add(digits)              // digits only
  variants.add('+' + digits)        // + prefix
  // If starts with country code 52 (Mexico), also try without the 52
  if (digits.startsWith('52') && digits.length > 10) {
    variants.add('+' + digits.slice(2))
  }
  // If starts with country code 1 (US/CA), also try without the 1
  if (digits.startsWith('1') && digits.length === 11) {
    variants.add(digits.slice(1))
    variants.add('+' + digits.slice(1))
  }
  return Array.from(variants).filter(Boolean)
}
