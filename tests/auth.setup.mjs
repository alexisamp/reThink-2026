import { chromium } from '@playwright/test'
import fs from 'node:fs'

const authFile = '.context/playwright/auth.json'
const userDataDir = '.context/playwright/user-data'
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173'

function readEnv(name) {
  if (process.env[name]) return process.env[name]
  if (!fs.existsSync('.env')) return undefined
  const line = fs.readFileSync('.env', 'utf8').split('\n').find(item => item.startsWith(`${name}=`))
  return line?.slice(name.length + 1).trim()
}

async function main() {
  fs.mkdirSync('.context/playwright', { recursive: true })

  const accessToken = process.env.SUPABASE_ACCESS_TOKEN
  const refreshToken = process.env.SUPABASE_REFRESH_TOKEN
  if (accessToken && refreshToken) {
    const supabaseUrl = readEnv('VITE_SUPABASE_URL')
    const supabaseAnonKey = readEnv('VITE_SUPABASE_ANON_KEY')
    if (!supabaseUrl || !supabaseAnonKey) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
    const authKey = `sb-${projectRef}-auth-token`
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        authorization: `Bearer ${accessToken}`,
      },
    })
    if (!userRes.ok) throw new Error(`Could not validate SUPABASE_ACCESS_TOKEN: ${userRes.status}`)
    const user = await userRes.json()
    const browser = await chromium.launch()
    const page = await browser.newPage()
    await page.goto(baseURL)
    await page.evaluate(({ accessToken, refreshToken, authKey, user }) => {
      localStorage.setItem(authKey, JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user,
      }))
    }, { accessToken, refreshToken, authKey, user })
    await page.reload()
    await page.context().storageState({ path: authFile })
    await browser.close()
    console.log(`Saved auth state to ${authFile}`)
    return
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
    viewport: { width: 1440, height: 960 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
  })
  const page = context.pages()[0] ?? await context.newPage()
  await page.goto(baseURL)
  console.log('Log in in the opened browser window, then return here and press Enter.')
  console.log('If Google shows "This browser or app may not be secure", use a normal browser and provide SUPABASE_ACCESS_TOKEN/SUPABASE_REFRESH_TOKEN as env vars for this script.')
  await new Promise(resolve => process.stdin.once('data', () => resolve()))
  await page.context().storageState({ path: authFile })
  await context.close()
  console.log(`Saved auth state to ${authFile}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
