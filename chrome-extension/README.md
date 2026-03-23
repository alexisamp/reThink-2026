# reThink Outreach — Chrome Extension

Captures LinkedIn profile data (name, job, company, photo, bio, connections) directly from LinkedIn pages and saves contacts to the reThink People database with one click — no copy-pasting.

---

## What it does

### Floating button on profile pages
When you visit any LinkedIn profile (`linkedin.com/in/*`), a green **"Add to Outreach"** button appears fixed in the top-right corner of the page.

- If the contact **already exists** in reThink → button turns gray and shows **"✓ In reThink"**
- If not → button shows **"Add to Outreach"** (green)

Clicking the button:
1. Reads all visible profile data from the DOM
2. Opens the LinkedIn "Contact Info" overlay to capture email / phone / website
3. Saves the contact to Supabase (`outreach_logs` table)
4. Uploads the profile photo to Supabase Storage (so it displays reliably in the app)
5. Shows "Saved ✓" or "Contact updated!" (if the contact already existed)

**Smart upsert logic**: If the contact already exists (detected via unique `user_id + linkedin_url` index), the extension only updates non-user-edited fields: `profile_photo_url`, `location`, `about`, `job_title`, `followers_count`, `connections_count`, `company_domain`, `company_linkedin_url`. It **never overwrites** `status`, `category`, `notes`, or `personal_context`.

### Popup (extension icon)
Click the extension icon in the Chrome toolbar to:
- Connect / disconnect to your reThink account
- Save the current profile with a specific **category** (peer, investor, advisor, mentor, client, prospect, partner, or other)

The popup also works as a fallback when the floating button isn't visible.

### Context menu
Right-click any LinkedIn profile link → **"Add to reThink Outreach"** — quick capture without visiting the profile. Note: context menu capture has less data than visiting the profile directly (no photo, no bio).

### Company domain caching
When you visit a LinkedIn company page (`linkedin.com/company/*`), the extension automatically extracts and caches the company's website domain in `chrome.storage.local`. This domain is then used when saving a profile from that company.

---

## Data captured per contact

| Field | Source |
|---|---|
| `name` | `.text-heading-xlarge`, `.top-card__title`, or slug fallback |
| `linkedin_url` | `window.location.href` (cleaned to `/in/{slug}`) |
| `job_title` | Headline parsed with "at/en/@" separator |
| `company` | Headline parsed, or `.top-card__company-url` |
| `location` | `.text-body-small.inline.t-black--light` (skips if contains "connection" or parens) |
| `about` | `#about` section text |
| `followers_count` | Text containing "follower" — integer extracted |
| `connections_count` | Text containing "connection" — integer extracted |
| `profile_photo_url` | `og:image` meta tag first, then CSS selectors, then DOM scan |
| `company_linkedin_url` | `.top-card__company-url` href |
| `company_domain` | Top-card external links (≤400px from top), or cached from company page visit |
| `email` / `phone` / `website` | LinkedIn "Contact Info" overlay (opened and closed automatically) |

---

## Architecture

### Files

```
chrome-extension/
├── manifest.json    — MV3 config, permissions, host_permissions
├── background.js    — Service worker: auth, API calls, photo upload
├── content.js       — Injected into LinkedIn: DOM extraction, floating button
├── popup.html       — Extension popup UI
├── popup.js         — Popup logic: connect/disconnect, category picker
└── icons            — icon16/48/96/128.png
```

### manifest.json (v1.2.0, Manifest V3)
- **Permissions**: `contextMenus`, `storage`, `notifications`, `tabs`
- **Host permissions**: `www.linkedin.com`, `media.licdn.com`, `amvezbymrnvrwcypivkf.supabase.co`
- **Background**: service worker (`background.js`)
- **Content scripts**: injected on all `linkedin.com/*` pages

### background.js — Service Worker
Handles all API calls (Supabase REST + Storage). Key responsibilities:

1. **`getValidToken()`** — reads `authData` from `chrome.storage.local`, refreshes access token via Supabase `/auth/v1/token` if expired (60s margin)
2. **`CHECK_CONTACT` message** — slug-based lookup (`linkedin_url like *slug*`) to check if a contact exists
3. **`SAVE_CONTACT` message** — full save flow:
   - Build body from `data` payload
   - Try to extract company domain from the LinkedIn company page (4s timeout)
   - Fetch profile photo from LinkedIn CDN → upload blob to Supabase Storage `contact-photos/{userId}/{slug}.ext` with `x-upsert: true`
   - Try `INSERT` → if `23505` unique violation → fetch existing record → `PATCH` only safe fields
4. **Context menu handler** — lighter save (no photo, no contact info overlay)

### content.js — Content Script
Injected on all LinkedIn pages. Key responsibilities:

1. **`extractProfilePageData()`** — scrapes the profile DOM for all fields
2. **`getContactInfo(callback)`** — programmatically clicks the "Contact Info" button, waits for the overlay, extracts data, then navigates back
3. **`injectButton()`** — adds the floating green button; checks existing status async on load
4. **Company domain caching** — on company pages, extracts and caches domain to `chrome.storage.local`
5. **SPA navigation observer** — `MutationObserver` on `document.body` re-injects the button when LinkedIn navigates client-side (no page reload)
6. **`GET_PROFILE_DATA` message handler** — used by the popup to read current profile data

### popup.js — Popup
- Reads `authData` from `chrome.storage.local` on open
- **Connect**: parses base64-encoded JSON connect code from reThink Settings → stores `{ access_token, refresh_token, user_id, expires_at }`
- **Save Contact**: queries the active tab, sends `GET_PROFILE_DATA` to content script, then `SAVE_CONTACT` to background with selected category

---

## Authentication flow

```
reThink app → Settings → "Copy connect code"
  → btoa(JSON.stringify({ access_token, refresh_token, user_id, expires_at }))

User pastes code → popup.js decodes + stores in chrome.storage.local

background.js → getValidToken() reads from storage → auto-refreshes if expired
```

The access token is the same Supabase JWT used by the app. All Supabase calls use `apikey: ANON_KEY` + `Authorization: Bearer {token}`.

---

## Photo upload flow

```
content.js captures og:image URL from <meta property="og:image">
  → sends in SAVE_CONTACT payload as profile_photo_url

background.js:
  1. fetch(linkedinCdnUrl)  — no credentials needed, CDN is public
  2. upload blob → Supabase Storage /contact-photos/{userId}/{slug}.jpg
     (with x-upsert: true — overwrites on update)
  3. replace profile_photo_url with permanent Supabase Storage URL
  4. if upload fails → profile_photo_url = null (not stored)

reThink app (ContactDetailDrawer):
  - If URL is Supabase Storage → display directly
  - If URL is media.licdn.com → route through proxy-image Edge Function
    (https://...supabase.co/functions/v1/proxy-image?url=...)
    to bypass WKWebView CORS/header restrictions on LinkedIn CDN
```

**Supabase Storage bucket**: `contact-photos` — public, 512KB limit, accepts jpeg/png/webp/gif
**RLS**: Users can only upload/update files in their own `{userId}/` folder

---

## Current status (v1.2.0 / app v0.1.76)

### Working
- Floating button on profile pages
- Smart upsert (never overwrites user edits)
- "✓ In reThink" detection on page load
- All data fields captured (name, job, company, location, bio, connections, followers)
- Company domain: captured from profile top card and from company page cache
- Contact info overlay extraction (email, phone, website)
- Token auto-refresh
- Category picker in popup
- Context menu fallback
- Photo proxy in app (all existing contacts with LinkedIn CDN URLs display correctly)

### Known limitations / in progress
- **Photo upload to Storage**: upload from service worker occasionally silently fails (debugging in progress — logs added). When it fails, the LinkedIn CDN URL is stored but the app falls back to the `proxy-image` Edge Function to display it
- **Company domain via company page fetch**: sometimes fails if LinkedIn blocks the background fetch — the profile top-card extraction is more reliable
- **Contact info overlay**: depends on LinkedIn DOM structure; may break if LinkedIn updates their UI
- **SPA navigation**: button re-injection has an 800ms delay (necessary to let the new page render)

---

## Next steps

### High priority
1. **Confirm photo upload is working** (check service worker console: `chrome://extensions` → Service Worker → visit a profile → look for `[reThink]` logs). The v0.1.76 fix removed `credentials: include` — need to verify this unblocked the upload
2. **Attio sync from app** — when a contact is saved via extension, it's not automatically synced to Attio. Currently manual via "Sync to Attio" button in the drawer. Could add auto-sync on insert

### Medium priority
3. **Batch photo migration** — existing contacts with LinkedIn CDN URLs could have their photos uploaded to Storage in bulk (small script or manual re-visit of their profiles)
4. **WhatsApp name extraction** — recent commit added `innerText` extraction for WhatsApp contacts (different DOM). Needs testing

### Low priority / ideas
5. **Firefox port** — Manifest V3 is largely compatible with Firefox's MV3 support
6. **Multiple accounts** — currently one reThink account per browser profile
7. **Popup shows existing contact info** — when "✓ In reThink", show the stored category/status in the popup
8. **Auto-sync to Attio on save** — call Attio API directly from background.js after saving to Supabase

---

## Installation (Developer Mode)

1. `chrome://extensions` → Enable **Developer mode**
2. Click **"Load unpacked"** → select the `chrome-extension/` folder
3. After any code change: click the **↺ reload** icon next to the extension
4. Open the extension popup → paste your connect code from **reThink Settings → Integrations**

> Connect code expires with your session. If the extension stops working, re-paste it from Settings.
