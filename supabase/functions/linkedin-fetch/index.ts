import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface LinkedInProfile {
  name?: string
  job_title?: string
  company?: string
  about?: string
  location?: string
  followers?: string
  connections?: string
  profile_url?: string
}

/** Try to extract structured data from LinkedIn HTML (JSON-LD + meta tags) */
function parseLinkedInHTML(html: string, url: string): LinkedInProfile {
  const profile: LinkedInProfile = { profile_url: url }

  // JSON-LD schema
  const jsonLdMatches = html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)
  for (const m of jsonLdMatches) {
    try {
      const data = JSON.parse(m[1]) as Record<string, unknown>
      if (data['@type'] === 'Person' || data['name']) {
        if (typeof data['name'] === 'string') profile.name = data['name']
        if (typeof data['jobTitle'] === 'string') profile.job_title = data['jobTitle']
        if (data['worksFor'] && typeof (data['worksFor'] as Record<string, unknown>)['name'] === 'string') {
          profile.company = (data['worksFor'] as Record<string, string>)['name']
        }
        if (typeof data['description'] === 'string') profile.about = data['description']
        if (data['address'] && typeof (data['address'] as Record<string, unknown>)['addressLocality'] === 'string') {
          profile.location = (data['address'] as Record<string, string>)['addressLocality']
        }
        // Follower count from interactionStatistic
        if (Array.isArray(data['interactionStatistic'])) {
          const followStat = (data['interactionStatistic'] as Array<Record<string, unknown>>)
            .find(s => String(s['interactionType']).includes('Follow'))
          if (followStat && typeof followStat['userInteractionCount'] === 'number') {
            profile.followers = String(followStat['userInteractionCount'])
          }
        }
      }
    } catch { /* ignore parse errors */ }
  }

  // Open Graph meta fallbacks
  const ogTitle = html.match(/<meta property="og:title" content="([^"]*)"/)
  const ogDesc = html.match(/<meta property="og:description" content="([^"]*)"/)

  if (!profile.name && ogTitle?.[1]) {
    // "Name | LinkedIn" or "Name - Job Title | LinkedIn"
    const title = ogTitle[1].replace(' | LinkedIn', '').trim()
    const dashIdx = title.lastIndexOf(' - ')
    if (dashIdx > 0) {
      profile.name = title.slice(0, dashIdx).trim()
      if (!profile.job_title) profile.job_title = title.slice(dashIdx + 3).trim()
    } else {
      profile.name = title
    }
  }

  if (!profile.about && ogDesc?.[1]) {
    profile.about = ogDesc[1].trim()
  }

  // Follower/connection count from page text patterns
  const followerMatch = html.match(/(\d[\d,.]+)\s*followers?/i)
  if (!profile.followers && followerMatch) {
    profile.followers = followerMatch[1].replace(/,/g, '')
  }
  const connectionMatch = html.match(/(\d[\d,.]+)\s*connections?/i)
  if (!profile.connections && connectionMatch) {
    profile.connections = connectionMatch[1].replace(/,/g, '')
  }

  return profile
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const { url } = await req.json() as { url: string }

    if (!url || !url.includes('linkedin.com')) {
      return new Response(
        JSON.stringify({ error: 'Invalid LinkedIn URL' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Try Firecrawl first if API key is available
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY')
    if (firecrawlKey) {
      try {
        const fcRes = await fetch('https://api.firecrawl.dev/v1/extract', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            urls: [url],
            prompt: 'Extract the LinkedIn profile data: full name, current job title, current company/employer, about/bio section, follower count, connection count, and location.',
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Full name of the person' },
                job_title: { type: 'string', description: 'Current job title / role' },
                company: { type: 'string', description: 'Current employer or company name' },
                about: { type: 'string', description: 'About / bio section text' },
                followers: { type: 'string', description: 'Follower count (e.g. "2.4k")' },
                connections: { type: 'string', description: 'Connection count (e.g. "500+")' },
                location: { type: 'string', description: 'Location / city' },
              },
              required: ['name'],
            },
          }),
        })

        if (fcRes.ok) {
          const fcData = await fcRes.json() as { data?: { extract?: LinkedInProfile }[] }
          const extracted = fcData?.data?.[0]?.extract
          if (extracted?.name) {
            return new Response(
              JSON.stringify({ ...extracted, profile_url: url, source: 'firecrawl' }),
              { headers: { ...CORS, 'Content-Type': 'application/json' } }
            )
          }
        }
      } catch { /* fall through to direct fetch */ }
    }

    // Direct fetch fallback — works for some public profiles
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
    })

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `LinkedIn returned ${res.status}. Profile may require login.`, partial: true }),
        { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const html = await res.text()
    const profile = parseLinkedInHTML(html, url)

    return new Response(
      JSON.stringify({ ...profile, source: 'direct' }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
