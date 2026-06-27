import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')

  if (!googleClientId || !googleClientSecret) {
    return new Response(JSON.stringify({ error: 'Google OAuth credentials are not configured.' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const refreshToken = user.user_metadata?.google_refresh_token
  if (!refreshToken || typeof refreshToken !== 'string') {
    return new Response(JSON.stringify({ error: 'Reconnect Google in Settings to enable Gmail sync.' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: googleClientId,
      client_secret: googleClientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!tokenRes.ok) {
    const detail = await tokenRes.text().catch(() => '')
    console.error('Google refresh failed:', tokenRes.status, detail)
    return new Response(JSON.stringify({ error: 'Google access expired. Reconnect Google in Settings.' }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const tokenData = await tokenRes.json() as { access_token?: string; expires_in?: number; scope?: string }
  if (!tokenData.access_token) {
    return new Response(JSON.stringify({ error: 'Google did not return an access token.' }), {
      status: 502,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  await supabase.auth.updateUser({
    data: {
      google_access_token: tokenData.access_token,
      google_scopes: tokenData.scope ?? user.user_metadata?.google_scopes ?? null,
      google_token_expires_at: new Date(Date.now() + ((tokenData.expires_in ?? 3600) * 1000)).toISOString(),
    },
  })

  return new Response(JSON.stringify({
    access_token: tokenData.access_token,
    expires_in: tokenData.expires_in ?? 3600,
  }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})
