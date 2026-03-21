// Normalize LinkedIn profile URLs for consistent matching

/**
 * Normalizes LinkedIn profile URLs to a consistent format
 * - Strips query parameters
 * - Ensures trailing slash
 * - Validates that it's a person profile (/in/) not a company (/company/)
 *
 * @param rawUrl - Raw LinkedIn profile URL
 * @returns Normalized URL or null if invalid
 */
export function normalizeLinkedInUrl(rawUrl: string): string | null {
  if (!rawUrl) return null

  try {
    const url = new URL(rawUrl)

    // Must be linkedin.com domain
    if (!url.hostname.includes('linkedin.com')) {
      console.warn('[LinkedIn Normalizer] Invalid domain:', url.hostname)
      return null
    }

    // Must be a person profile (/in/), not company page
    if (url.pathname.includes('/company/')) {
      console.log('[LinkedIn Normalizer] Company profile detected, skipping')
      return null
    }

    if (!url.pathname.includes('/in/')) {
      console.warn('[LinkedIn Normalizer] Not a person profile:', url.pathname)
      return null
    }

    // Extract just the /in/username/ part, strip query params
    const match = url.pathname.match(/\/in\/([^/?]+)/)
    if (!match) {
      console.warn('[LinkedIn Normalizer] Could not extract username from:', url.pathname)
      return null
    }

    const username = match[1]

    // Return normalized URL with trailing slash
    return `https://www.linkedin.com/in/${username}/`
  } catch (error) {
    console.error('[LinkedIn Normalizer] Failed to parse URL:', rawUrl, error)
    return null
  }
}
