# reThink Auto-Capture Chrome Extension — Technical Documentation

> Last updated: 2026-03-23
> Purpose: AI agent handoff document. Contains everything needed to understand, debug, and continue development.

---

## 1. What This Extension Does

A Chrome Extension (Manifest V3) that:
1. **Auto-captures** WhatsApp Web messages (sent + received) and logs them as `interactions` in Supabase
2. **Shows a sidebar** (Side Panel API) when user clicks the extension icon, displaying the current WhatsApp contact's info and whether they're mapped in reThink
3. **Maps phone numbers to contacts** — if a phone is unknown, shows a UI to search/create a contact in reThink
4. **Auto-updates networking habit** — counts distinct contacts messaged per day and upserts `habit_logs`

---

## 2. File Structure

```
extension/
├── manifest.json                     # Manifest V3 config
├── build.mjs                         # esbuild script (TS → JS)
├── package.json                      # Dependencies (esbuild, supabase-js, react, etc.)
├── tsconfig.json / tsconfig.node.json
├── icons/                            # Extension icons (16, 48, 128 px)
├── dist/                             # Built output (loaded in chrome://extensions)
├── migrations/                       # SQL migrations for Supabase
│   ├── 001_contact_phone_mappings.sql
│   ├── 002_extension_interaction_windows.sql
│   └── 003_performance_indexes.sql
├── src/
│   ├── background/
│   │   └── service-worker.ts         # Main brain — handles messages, Supabase writes, sidebar data
│   ├── content-scripts/
│   │   ├── whatsapp.ts               # Injected into web.whatsapp.com — observes DOM for messages
│   │   └── linkedin.ts               # Injected into linkedin.com/messaging (stub)
│   ├── lib/
│   │   ├── supabase.ts               # Supabase client (uses chrome.storage for auth persistence)
│   │   ├── phoneNormalizer.ts         # Normalizes phone numbers (assumes +52 Mexico default)
│   │   └── linkedinNormalizer.ts      # LinkedIn URL normalizer
│   └── popup/
│       ├── index.html                # Side panel HTML entry point
│       ├── index.css                 # Minimal styles
│       ├── main.tsx                  # React entry point
│       └── App.tsx                   # React UI — login, contact detail, contact mapping screens
└── debug-whatsapp-name.js           # Debug script for console (paste in WhatsApp Web console)
```

---

## 3. Architecture & Data Flow

### 3.1 Auto-Capture Flow (Background, No User Action)

```
WhatsApp Web DOM
    │
    ▼
whatsapp.ts (content script)
    │ Observes div.copyable-area with MutationObserver
    │ Detects new [data-id] elements containing @c.us
    │ Extracts: phone (from data-id), direction (from data-pre-plain-text)
    │ Normalizes phone via phoneNormalizer.ts
    │
    ▼
chrome.runtime.sendMessage({ type: 'whatsapp_message', phone, direction, timestamp })
    │
    ▼
service-worker.ts (background)
    │ handleWhatsAppMessage()
    │   1. getCurrentUserId() — from Supabase session in chrome.storage
    │   2. findContactByPhone() — query contact_phone_mappings JOIN outreach_logs
    │   3. If NOT found → openContactMappingPopup() (opens tab, NOT sidebar)
    │   4. If found → findActiveWindow() — check extension_interaction_windows
    │      a. If active window exists → increment message_count
    │      b. If no window → create interaction + 6-hour window
    │   5. updateNetworkingHabit() — count distinct contacts, upsert habit_logs
    │   6. updateLastProcessedMessage() — update contact_phone_mappings.last_processed_at
    │
    ▼
Supabase tables: interactions, extension_interaction_windows, habit_logs
```

### 3.2 Sidebar Flow (User Clicks Extension Icon)

```
User clicks extension icon
    │
    ▼
chrome.action.onClicked (service-worker.ts)
    │ 1. chrome.sidePanel.open({ tabId })
    │ 2. chrome.scripting.executeScript → extractWhatsAppContactInfo()
    │    Runs IN the WhatsApp Web page context
    │    Extracts: name (from header innerText), phone (from [data-id])
    │ 3. Stores result in chrome.storage.local.currentWhatsAppContact
    │    (only if data changed — prevents UI flashing)
    │
    ▼
App.tsx (side panel React app)
    │ Listens to chrome.storage.onChanged
    │ Reads currentWhatsAppContact
    │ checkIfContactMapped(phone) → queries contact_phone_mappings
    │
    ├── Contact IS mapped → ContactDetailScreen (name, company, health score, stats)
    └── Contact NOT mapped → ContactMappingScreen (search or create contact)
```

### 3.3 Conversation Change Detection

```
User switches WhatsApp conversation
    │
    ▼
chrome.tabs.onUpdated (service-worker.ts)
    │ Fires when URL changes (WhatsApp is SPA, URL changes on conversation switch)
    │ Debounced: only fires if URL is different from lastWhatsAppUrl
    │ Waits 1000ms for WhatsApp to load new conversation header
    │
    ▼
updateWhatsAppContactInfo(tabId) → same as 3.2 step 2-3
```

---

## 4. Key Functions Reference

### service-worker.ts

| Function | Purpose |
|----------|---------|
| `extractWhatsAppContactInfo()` | **Injected into page** via `chrome.scripting.executeScript`. Gets contact name (via `innerText` of conversation header) and phone (from `[data-id]` attributes on messages). Returns `{ name, phone, url }` |
| `updateWhatsAppContactInfo(tabId)` | Calls `extractWhatsAppContactInfo` and stores result in chrome.storage. Compares with existing data to avoid unnecessary writes (anti-flash). |
| `handleWhatsAppMessage(event)` | Core logic: find contact → find/create window → create interaction → update habit |
| `findContactByPhone(userId, phone)` | Queries `contact_phone_mappings` JOIN `outreach_logs` |
| `findActiveWindow(userId, contactId, channel)` | Queries `extension_interaction_windows` WHERE `window_end > now()` |
| `updateNetworkingHabit(userId, date)` | Counts distinct contacts for the day, upserts `habit_logs` |
| `openContactMappingPopup(phone)` | Opens new tab with mapping UI (NOT sidebar — this is for auto-capture, not sidebar) |
| `processPendingEvents()` | Retries failed events from chrome.storage queue (runs every 5 min via alarm) |

### whatsapp.ts (content script)

| Function | Purpose |
|----------|---------|
| `initWhatsAppObserver()` | Waits for `div.copyable-area`, processes historical messages, attaches MutationObserver |
| `startObserving(panel)` | MutationObserver on `childList + subtree`, detects `[data-id]` with `@c.us` |
| `handleNewMessage(element)` | Deduplicates via `processedMessages` Set, extracts phone from `data-id`, detects direction, sends to service worker |

### App.tsx (sidebar UI)

| Component | Purpose |
|-----------|---------|
| `LoginScreen` | Google OAuth via `chrome.identity.launchWebAuthFlow` + Supabase `signInWithIdToken` |
| `DefaultScreen` | Shown when not on WhatsApp — tells user to open a conversation |
| `ContactDetailScreen` | Mapped contact — shows name, company, health score, interaction count, last interaction date |
| `ContactMappingScreen` | Unmapped contact — search existing contacts or create new one. Creates `contact_phone_mappings` entry |

---

## 5. Database Schema (Extension-Specific Tables)

### contact_phone_mappings
Maps phone numbers to contacts in `outreach_logs`.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| user_id | UUID | FK → auth.users |
| contact_id | UUID | FK → outreach_logs |
| phone_number | TEXT | Normalized (e.g., "+5215551234567") |
| label | TEXT | nullable: 'mobile', 'work', etc. |
| last_processed_at | TIMESTAMPTZ | Last message timestamp processed |
| created_at / updated_at | TIMESTAMPTZ | |

**Unique constraint:** `(user_id, phone_number)` — one contact per phone per user.

### extension_interaction_windows
Tracks 6-hour grouping windows to avoid creating duplicate interactions.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| user_id | UUID | FK → auth.users |
| contact_id | UUID | FK → outreach_logs |
| interaction_id | UUID | FK → interactions |
| channel | TEXT | 'whatsapp' or 'linkedin_msg' |
| window_start | TIMESTAMPTZ | First message timestamp |
| window_end | TIMESTAMPTZ | window_start + 6 hours |
| direction | TEXT | 'inbound' or 'outbound' |
| message_count | INTEGER | Incremented for each message in window |

**Key query pattern:** `WHERE user_id = X AND contact_id = Y AND channel = Z AND window_end > now()`

### Pre-existing tables used
- `outreach_logs` — contacts (id, name, company, health_score, status, phone, linkedin_url)
- `interactions` — interaction records (id, user_id, contact_id, type, direction, interaction_date)
- `habits` — user habits (id, tracks_outreach = 'networking')
- `habit_logs` — daily habit values (habit_id, log_date, value)

---

## 6. Authentication

- Google OAuth via `chrome.identity.launchWebAuthFlow`
- Uses **nonce hashing**: plain nonce → SHA-256 hash sent to Google → plain nonce sent to Supabase
- Supabase client uses `chrome.storage.local` instead of `localStorage` (required for extensions)
- Google OAuth Client ID: `652244567794-rjti1jj53ljnubdq0m6v0rmuji7521nq`
- Supabase project: `amvezbymrnvrwcypivkf`

---

## 7. Build & Development

```bash
cd /Users/alexi/Documents/reThink-2026/extension

# Build
node build.mjs    # esbuild → dist/

# Load in Chrome
# 1. Go to chrome://extensions
# 2. Enable Developer Mode
# 3. "Load unpacked" → select extension/dist/
# 4. After code changes: node build.mjs → click ↻ reload on extension card
```

**Dependencies:** esbuild (build), @supabase/supabase-js, react, react-dom

---

## 8. Current Status (2026-03-23)

### What WORKS
- Google OAuth login in sidebar
- Content script loads on WhatsApp Web (`whatsapp.ts`)
- Content script detects messages (MutationObserver on `div.copyable-area`)
- Phone extraction from `data-id` attributes (confirmed working — phone numbers appear correctly in sidebar)
- Side panel opens when clicking extension icon
- Contact mapping UI (search + create)
- Storage change listener (sidebar updates without polling)
- URL change detection for conversation switches
- Anti-flash: storage only updates when data actually changed

### What's BROKEN / UNTESTED

#### BUG: Contact Name Extraction (CRITICAL)
**Status:** Fix deployed but UNTESTED as of this writing.

**Problem:** The `extractWhatsAppContactInfo()` function (injected into WhatsApp Web page via `chrome.scripting.executeScript`) was returning icon/UI element names instead of the actual contact name. Examples of wrong names returned:
- `"chat-filled-refreshed1"` (icon data-testid)
- `"ic-arrow-drop-down"` (icon name)
- `"click here for contact info"` (button tooltip)

**Root cause:** Previous implementations used `span.textContent` and `span.getAttribute('title')` which picks up text from icon elements, SVGs, and accessibility attributes — not just visible text.

**Current fix (untested):** Switched to using `(header as HTMLElement).innerText` which ONLY returns text visible on screen. Icon names are never visible text, so this should work. The code is at `service-worker.ts:67-84`:
```typescript
const conversationHeader = document.querySelector(
  'header [data-testid="conversation-info-header"]'
) as HTMLElement | null

if (conversationHeader) {
  const visibleText = conversationHeader.innerText?.trim()
  if (visibleText) {
    const firstLine = visibleText.split('\n')[0]?.trim()
    if (firstLine && firstLine.length >= 2 && firstLine.length < 100) {
      contactName = firstLine
    }
  }
}
```

**If this still doesn't work:** The next debugging step is to run `extension/debug-whatsapp-name.js` in the WhatsApp Web console (F12 → Console → paste script). This outputs the actual DOM structure of the header and all candidate text elements. The output will reveal:
1. Whether `data-testid="conversation-info-header"` exists at all in the current WhatsApp Web version
2. What `innerText` actually returns for that element
3. All spans with their attributes, so the correct selector can be identified

**Alternative strategies to try if `innerText` fails:**
1. Look for `<h1>` inside the header (semantic heading for contact name)
2. Look for `span[dir="auto"]` without `aria-label` (WhatsApp's pattern for user-generated text)
3. Use the URL hash — WhatsApp Web URLs sometimes contain the phone number as `#/chat/PHONE`
4. Get the name from Supabase instead (we already have the phone → look up the mapped contact name)

#### UNTESTED: Contact mapping saving to Supabase
The sidebar's "Create & Link Contact" and search+select flows create `contact_phone_mappings` entries. These have NOT been verified end-to-end because the name extraction bug prevented reaching this flow properly.

#### UNTESTED: Auto-capture writing to Supabase
The content script → service worker → Supabase flow for auto-logging interactions has NOT been verified. The content script logs suggest it's working (messages are detected), but we haven't confirmed that `interactions` rows are actually being created.

#### UI Flashing
**Status:** Fix deployed but untested. Two fixes were applied:
1. `updateWhatsAppContactInfo()` now compares new data with existing chrome.storage data before writing (service-worker.ts:55-59)
2. Sidebar's `App.tsx` only re-renders when phone or URL actually changes (App.tsx:49-61)

---

## 9. Next Steps (Priority Order)

1. **Verify name extraction** — Reload extension, open WhatsApp Web conversation, click extension icon. Does the sidebar show the correct contact name? If not, run `debug-whatsapp-name.js` and use output to fix selector.

2. **Verify no flashing** — Switch between 3-4 conversations. Does the sidebar update smoothly without flickering?

3. **Verify contact mapping** — Open sidebar on an unmapped contact. Search for existing contact OR create new. Check Supabase `contact_phone_mappings` table to confirm row was created.

4. **Verify auto-capture** — Send a message on WhatsApp Web. Check Supabase:
   - `interactions` table: new row with correct `contact_id`, `type='whatsapp'`, `direction`, `interaction_date`
   - `extension_interaction_windows` table: new window with `message_count=1`, `window_end` = 6 hours later
   - `habit_logs` table: networking habit value updated

5. **Edge cases to test:**
   - Group chats (should be skipped)
   - Contacts with no messages visible (phone extraction might fail)
   - Multiple messages in same window (should increment `message_count`, NOT create new interaction)
   - Offline/network errors (should queue to `pendingEvents` and retry)

---

## 10. Design System

Colors (must match reThink app):
- burnham: `#003720` (primary dark green)
- shuttle: `#536471` (secondary gray)
- mercury: `#E3E3E3` (borders/dividers)
- pastel: `#79D65E` (positive/accent green)
- gossip: `#E5F9BD` (light green backgrounds)

All sidebar UI uses inline styles (no Tailwind in the extension — it's a separate build from the main app).

---

## 11. Common Gotchas

1. **`chrome.scripting.executeScript` runs in page context** — the `extractWhatsAppContactInfo` function is serialized and injected. It CANNOT access service worker variables, imports, or closures. It must be fully self-contained.

2. **Supabase auth in extensions** — Must use `chrome.storage.local` as storage adapter (not `localStorage`). See `src/lib/supabase.ts`.

3. **WhatsApp Web is a SPA** — URL changes don't reload the page. Content scripts load once, `MutationObserver` handles the rest.

4. **WhatsApp Web DOM is unstable** — Class names and structure change frequently. Prefer `data-testid` attributes and `[data-id]` patterns which are more stable.

5. **Side Panel vs Popup** — This extension uses Side Panel API (`chrome.sidePanel.open`), NOT `chrome.action.setPopup`. The side panel stays open while the user interacts with WhatsApp Web.

6. **Phone normalization** — `phoneNormalizer.ts` defaults to Mexico (+52). If user is in another country, numbers without country code will be normalized incorrectly.

7. **Build after every change** — Run `node build.mjs` then reload extension in Chrome. The extension loads from `dist/`, not `src/`.
