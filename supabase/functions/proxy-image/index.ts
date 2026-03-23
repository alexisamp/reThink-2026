// proxy-image: fetches LinkedIn CDN profile photos server-side (no CORS issues)
// Used by reThink app to display photos that 403 in WKWebView due to browser headers

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const ALLOWED_HOSTS = ['media.licdn.com']

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'authorization, apikey',
      },
    })
  }

  const { searchParams } = new URL(req.url)
  const imageUrl = searchParams.get('url')

  if (!imageUrl) {
    return new Response('Missing url param', { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(imageUrl)
  } catch {
    return new Response('Invalid URL', { status: 400 })
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return new Response('Host not allowed', { status: 403 })
  }

  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
      },
    })

    if (!response.ok) {
      return new Response(`Upstream error: ${response.status}`, { status: response.status })
    }

    const contentType = response.headers.get('Content-Type') || 'image/jpeg'
    const blob = await response.arrayBuffer()

    return new Response(blob, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=604800', // 7 days
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (err) {
    return new Response(`Fetch failed: ${(err as Error).message}`, { status: 502 })
  }
})
