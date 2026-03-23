# SPEC — reThink People: Unified Chrome Extension
**Date:** 2026-03-23
**Status:** ready-to-plan
**Reviewed codebase:** yes
**Scope:** Merge `chrome-extension/` + `extension/` into a single "reThink People" Chrome extension with Side Panel sidebar that auto-appears on LinkedIn and WhatsApp, captures profiles/interactions with direction detection, links phone ↔ LinkedIn identity at capture time, creates person-scoped todos, and closes the habit loop in real-time in the reThink app.

---

## Context

reThink has two daily people goals: map 10 contacts/day and talk to 5 people/day. Two separate Chrome extensions exist to support these, but they are siloed:

- `chrome-extension/` (reThink Outreach v1.2.0): LinkedIn profile scraper. Popup-based, plain JS. Saves contacts to `outreach_logs`. Has working photo upload, company domain extraction, smart upsert. Does NOT have a sidebar.
- `extension/` (reThink Auto-Capture v0.1.0): WhatsApp Web auto-capture. Side Panel API, TypeScript/React/esbuild. Has broken habit loop (3 silent bugs), stubs for LinkedIn. Does NOT capture profiles.

The habit loop is broken in three ways:
1. `service-worker.ts` inserts to `interactions` using column name `contact_id` — but the actual Supabase column is `outreach_log_id` (per TECHNICAL.md). Every interaction insert fails silently.
2. `updateNetworkingHabit()` queries `habits` with `.eq('tracks_outreach', 'networking')` but `tracks_outreach` is currently `bool` in the DB, not `text`.
3. `updateNetworkingHabit()` queries `.eq('is_active', true)` but the column is `active`.

After this spec is implemented, the experience is: user browses LinkedIn → floating reThink button appears → click opens sidebar → sidebar shows if person is known or new → capture with photo + category + optional phone link. User opens WhatsApp → same floating button → sidebar shows relationship health + auto-logs interaction (with direction: inbound/outbound) → habit count updates in real-time in reThink Today screen.

---

## Business rationale

Both habits ("map contacts" and "talk to people") are invisible to reThink today because the extension can't write to the DB. Fixing the loop is the single highest-leverage action in the codebase. Everything else in this spec builds on top of a working loop.

The floating button + sidebar pattern replaces the old "direct save on click" model. The sidebar is the UI. Actions happen there, not in a popup. This is more discoverable, context-richer, and extensible.

**Descoped from this spec:**
- Gmail email association (nice to have — phase 2)
- Sidebar on non-LinkedIn/WhatsApp sites
- Sentiment analysis, auto-categorization
- iMessage/SMS
- Multi-user support

---

## Technical notes

**Base codebase:** `extension/` (TypeScript + React + esbuild). `chrome-extension/` is stripped for parts (photo logic at `content.js:134-347`, company domain at `content.js:10-47`, contact info overlay at `content.js:351-413`) then retired.

**Build system:** `node build.mjs` → `dist/`. Load unpacked from `dist/` in Chrome.

**Auth pattern — HARD CONSTRAINT:** The unified extension MUST use the auth code from `extension/src/popup/App.tsx:handleGoogleSignIn` — `chrome.identity.launchWebAuthFlow` + SHA-256 nonce hashing (plain nonce → `supabase.auth.signInWithIdToken`, hashed nonce → Google OAuth URL). Session is stored in `chrome.storage.local` and persists across extension reloads. Once logged in, the user is **never asked again** — no code entry, no re-auth prompt. Do NOT use anything from `chrome-extension/` auth: that extension uses a manual code-entry flow that is incompatible with the sidebar. Keep `src/lib/supabase.ts` (chrome.storage adapter) and `handleGoogleSignIn` exactly as they exist today in `extension/`.

**Side Panel constraint:** `chrome.sidePanel.open()` requires a user gesture. Cannot be called from `chrome.tabs.onActivated`. Solution: floating trigger button injected by content script — user click in content script propagates as user gesture, message sent to service worker, `chrome.sidePanel.open({ tabId })` called in `chrome.runtime.onMessage` handler (this works).

**`default_popup` conflict:** Current `manifest.json` sets `action.default_popup` which prevents `chrome.action.onClicked` from firing. Must be removed. Sidebar replaces popup entirely.

**Photo storage pattern:** Content script reads `og:image` from LinkedIn page (or fallback selectors from `chrome-extension/content.js:259-323`). `fetch(cdnUrl, { credentials: 'include' })` works in content script context (browser sends LinkedIn cookies). Upload blob to Supabase Storage `contact-photos/{userId}/{slug}.ext` via REST API. Store permanent Supabase Storage URL. If upload fails: store LinkedIn CDN URL directly (proxied via `proxy-image` Edge Function in the app).

**`interactions` FK column:** TECHNICAL.md says `outreach_log_id`. SPEC-CRM says `contact_id`. **Before starting Phase 1, run:** `SELECT column_name FROM information_schema.columns WHERE table_name = 'interactions' AND table_schema = 'public';` — use whichever name exists. This spec uses `outreach_log_id` throughout — rename if DB uses `contact_id`.

**Phone normalization:** `src/lib/phoneNormalizer.ts` defaults to `+52` (Mexico) for numbers without country code. Make configurable via a `DEFAULT_COUNTRY_CODE` constant at top of file — default `'+52'`, user can change to `'+54'` (Argentina) etc. by editing that line.

**Design system (inline styles only — no Tailwind in extension):**
- burnham: `#003720`
- shuttle: `#536471`
- mercury: `#E3E3E3`
- pastel: `#79D65E`
- gossip: `#E5F9BD`
- white: `#FFFFFF`
- Fonts: `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- Sidebar width: 360px (fixed, set by Chrome Side Panel default)

---

## Database migrations required

### Migration 004 — tracks_outreach: bool → text
**File:** `extension/migrations/004_tracks_outreach_migration.sql`

```sql
-- Step 1: Change column type from bool to text
-- Existing 'true' values → 'networking' (the only outreach habit that existed before)
-- Existing 'false'/null values → null
ALTER TABLE habits
  ALTER COLUMN tracks_outreach TYPE text
  USING CASE
    WHEN tracks_outreach = true THEN 'networking'
    ELSE NULL
  END;

-- Step 2: Add check constraint for valid values
ALTER TABLE habits
  ADD CONSTRAINT habits_tracks_outreach_check
  CHECK (tracks_outreach IN ('networking', 'prospecting') OR tracks_outreach IS NULL);
```

**Note:** After this migration, user must manually verify their habits in reThink Settings. The prospecting habit (for LinkedIn adds) must have `tracks_outreach = 'prospecting'` — set this manually via Supabase dashboard if not already done.

### Migration 005 — Health score DB trigger
**File:** `extension/migrations/005_health_score_trigger.sql`

```sql
-- Function: compute health score for a contact from their interactions
CREATE OR REPLACE FUNCTION compute_contact_health_score(p_contact_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_score FLOAT := 0;
  v_type TEXT;
  v_date DATE;
  v_days_ago INTEGER;
  v_decay FLOAT;
  v_points INTEGER;
BEGIN
  FOR v_type, v_date IN
    SELECT type, interaction_date
    FROM interactions
    WHERE outreach_log_id = p_contact_id
  LOOP
    v_days_ago := CURRENT_DATE - v_date;

    IF v_days_ago <= 7 THEN v_decay := 1.0;
    ELSIF v_days_ago <= 30 THEN v_decay := 0.7;
    ELSIF v_days_ago <= 90 THEN v_decay := 0.4;
    ELSIF v_days_ago <= 365 THEN v_decay := 0.1;
    ELSE v_decay := 0;
    END IF;

    CASE v_type
      WHEN 'in_person'       THEN v_points := 5;
      WHEN 'virtual_coffee'  THEN v_points := 4;
      WHEN 'call'            THEN v_points := 3;
      WHEN 'email'           THEN v_points := 2;
      WHEN 'linkedin_msg'    THEN v_points := 1;
      WHEN 'whatsapp'        THEN v_points := 1;
      ELSE v_points := 1;
    END CASE;

    v_score := v_score + (v_points * v_decay);
  END LOOP;

  RETURN GREATEST(1, LEAST(10, ROUND(v_score)));
END;
$$ LANGUAGE plpgsql;

-- Trigger function: fires after any interaction insert/update/delete
CREATE OR REPLACE FUNCTION trigger_update_contact_health()
RETURNS TRIGGER AS $$
DECLARE
  v_contact_id UUID;
  v_new_score INTEGER;
  v_last_interaction DATE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_contact_id := OLD.outreach_log_id;
  ELSE
    v_contact_id := NEW.outreach_log_id;
  END IF;

  v_new_score := compute_contact_health_score(v_contact_id);

  SELECT MAX(interaction_date) INTO v_last_interaction
  FROM interactions WHERE outreach_log_id = v_contact_id;

  UPDATE outreach_logs
  SET
    health_score = v_new_score,
    last_interaction_at = v_last_interaction::TIMESTAMPTZ
  WHERE id = v_contact_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Drop if exists (idempotent)
DROP TRIGGER IF EXISTS trg_update_contact_health ON interactions;

CREATE TRIGGER trg_update_contact_health
AFTER INSERT OR UPDATE OR DELETE ON interactions
FOR EACH ROW EXECUTE FUNCTION trigger_update_contact_health();
```

**Note:** If `interactions` FK column is `contact_id` (not `outreach_log_id`), replace `outreach_log_id` with `contact_id` in this migration.

---

## Phase 1 — DB Migrations + Bug Fixes
*Why first: nothing else works until the DB is correct and the bugs are fixed. Zero UI changes in this phase.*

### F01 · Apply migration 004 (tracks_outreach)
**What it does:** Changes `habits.tracks_outreach` from `bool` to `text` so the extension can query by value (`'networking'` or `'prospecting'`).
**File modified:** Supabase dashboard → SQL editor. File saved at `extension/migrations/004_tracks_outreach_migration.sql`.
**On success:** No app breakage (the main app doesn't query `tracks_outreach` — only the extension does). Verify by running `SELECT tracks_outreach FROM habits WHERE user_id = '<your-uid>'` — should return `'networking'` or null.
**On error:** If column is already `text` → migration may fail on `ALTER COLUMN TYPE`. Guard with `IF data_type = 'boolean' THEN` check or run manually checking first.

### F02 · Apply migration 005 (health score trigger)
**What it does:** Creates a DB trigger that auto-updates `outreach_logs.health_score` and `last_interaction_at` whenever an interaction is inserted, updated, or deleted.
**File modified:** Supabase dashboard → SQL editor. File saved at `extension/migrations/005_health_score_trigger.sql`.
**On success:** After adding any interaction in the app, check `outreach_logs.health_score` — should update within milliseconds.
**On error:** If trigger already exists, `DROP TRIGGER IF EXISTS` at the top handles it. If `compute_contact_health_score` function conflicts, `CREATE OR REPLACE` handles it.
**Side effect:** The JS health score computation in `src/lib/funnelDefaults.ts` still runs in the app — that's fine. DB trigger is additive, not replacing. Over time they may drift slightly due to floating point rounding, which is acceptable.

### F03 · Fix 3 bugs in service-worker.ts
**File modified:** `extension/src/background/service-worker.ts`

**Bug 1 fix — `contact_id` → `outreach_log_id` in interactions:**
In `handleWhatsAppMessage()` (line ~293) and `handleLinkedInMessage()` (line ~418):
```typescript
// BEFORE (wrong):
.insert({
  user_id: userId,
  contact_id: contact.id,
  type: 'whatsapp',
  direction: event.direction,
  notes: null,
  interaction_date: interactionDate,
})

// AFTER (correct):
.insert({
  user_id: userId,
  outreach_log_id: contact.id,
  type: 'whatsapp',
  direction: event.direction,
  notes: null,
  interaction_date: interactionDate,
})
```

Also fix the existing interaction check in `handleWhatsAppMessage()` (line ~275):
```typescript
// BEFORE:
.eq('contact_id', contact.id)

// AFTER:
.eq('outreach_log_id', contact.id)
```

**Bug 2 fix — `is_active` → `active`:**
In `updateNetworkingHabit()` (line ~619):
```typescript
// BEFORE:
.eq('is_active', true)

// AFTER:
.eq('active', true)
```

**Bug 3 fix — `tracks_outreach` query + distinct contact select:**
In `updateNetworkingHabit()` (line ~614):
```typescript
// BEFORE:
.eq('tracks_outreach', 'networking')

// AFTER: same — correct after migration 004
.eq('tracks_outreach', 'networking')
```

Also fix the distinct contacts count (line ~638):
```typescript
// BEFORE (selects wrong column):
.select('contact_id')
// ...
.map((i: any) => i.contact_id)

// AFTER:
.select('outreach_log_id')
// ...
.map((i: any) => i.outreach_log_id)
```

**Edge cases:**
- If migration 004 hasn't been applied yet: query returns 0 habits, function returns early with log "User does not have a networking habit configured". Not an error.
- If `interactions` uses `contact_id` instead of `outreach_log_id`: swap as noted above.

---

## Phase 2 — Extension Architecture Overhaul
*Depends on: Phase 1. Why second: sets up the structure all subsequent phases build into.*

### F04 · Update manifest.json
**File modified:** `extension/manifest.json`

**Full replacement content:**
```json
{
  "manifest_version": 3,
  "name": "reThink People",
  "version": "1.0.0",
  "description": "Your relationship layer — auto-captures WhatsApp and LinkedIn interactions and builds your network in reThink.",
  "permissions": [
    "storage",
    "tabs",
    "activeTab",
    "notifications",
    "alarms",
    "identity",
    "scripting",
    "sidePanel"
  ],
  "host_permissions": [
    "https://web.whatsapp.com/*",
    "https://www.linkedin.com/*"
  ],
  "background": {
    "service_worker": "src/background/service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["https://web.whatsapp.com/*"],
      "js": ["src/content-scripts/whatsapp.js", "src/content-scripts/floating-trigger.js"],
      "run_at": "document_idle"
    },
    {
      "matches": ["https://www.linkedin.com/in/*"],
      "js": ["src/content-scripts/linkedin-profile.js", "src/content-scripts/floating-trigger.js"],
      "run_at": "document_idle"
    },
    {
      "matches": ["https://www.linkedin.com/messaging/*"],
      "js": ["src/content-scripts/linkedin-dm.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_title": "reThink People",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "side_panel": {
    "default_path": "src/sidebar/index.html"
  },
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "oauth2": {
    "client_id": "652244567794-rjti1jj53ljnubdq0m6v0rmuji7521nq.apps.googleusercontent.com",
    "scopes": ["openid", "email", "profile"]
  }
}
```

**Key changes from current:** Removed `action.default_popup`. Added `"sidePanel"` to permissions. Added `side_panel.default_path`. Added `linkedin-profile.js` + `floating-trigger.js` content scripts. Added `linkedin-dm.js` for messaging. Added `scripting` permission.

### F05 · Rename popup/ → sidebar/ and update build
**Files modified:** `extension/build.mjs`, `extension/src/popup/` → `extension/src/sidebar/`

**Rename directory:** `extension/src/popup/` → `extension/src/sidebar/`
- `index.html` → `src/sidebar/index.html`
- `index.css` → `src/sidebar/index.css`
- `main.tsx` → `src/sidebar/main.tsx`
- `App.tsx` → `src/sidebar/App.tsx`

**Update `index.html`:** Change script src from `./main.tsx` to `./main.tsx` (relative path stays same). Update `<title>` to `reThink People`.

**Update `build.mjs`:** Change the entryPoint for the popup/sidebar bundle:
```javascript
// BEFORE:
entryPoints: ['src/popup/main.tsx']
// AFTER:
entryPoints: ['src/sidebar/main.tsx']
```
Also add entryPoints for new content scripts:
```javascript
{ in: 'src/content-scripts/floating-trigger.ts', out: 'src/content-scripts/floating-trigger' },
{ in: 'src/content-scripts/linkedin-profile.ts', out: 'src/content-scripts/linkedin-profile' },
{ in: 'src/content-scripts/linkedin-dm.ts', out: 'src/content-scripts/linkedin-dm' },
```

### F06 · Sidebar App.tsx — 6-state routing
**File modified:** `extension/src/sidebar/App.tsx`

**State type:**
```typescript
type SidebarState =
  | 'loading'
  | 'unauthenticated'
  | 'default'              // Not on LinkedIn or WhatsApp
  | 'whatsapp_mapped'      // WhatsApp + contact found in reThink
  | 'whatsapp_unmapped'    // WhatsApp + contact NOT in reThink
  | 'linkedin_known'       // LinkedIn profile + person IS in reThink
  | 'linkedin_new'         // LinkedIn profile + person NOT in reThink
```

**State variables:**
```typescript
const [sidebarState, setSidebarState] = useState<SidebarState>('loading')
const [user, setUser] = useState<User | null>(null)
const [currentContact, setCurrentContact] = useState<CurrentContact | null>(null)
const [pageContext, setPageContext] = useState<PageContext | null>(null)
```

**Types:**
```typescript
interface CurrentContact {
  // WhatsApp context
  phone?: string
  // LinkedIn context
  linkedinUrl?: string
  linkedinName?: string
  // Resolved reThink data (if mapped)
  reThinkId?: string
  name?: string
  company?: string | null
  jobTitle?: string | null
  healthScore?: number
  status?: string
  lastInteractionAt?: string | null
  profilePhotoUrl?: string | null
  pendingTodosCount?: number
}

interface PageContext {
  type: 'whatsapp' | 'linkedin' | 'other'
  url: string
}
```

**State determination logic (in `useEffect` on mount + `chrome.storage.onChanged` listener):**
```typescript
async function determineState() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) { setSidebarState('unauthenticated'); return }
  setUser(session.user)

  const stored = await chrome.storage.local.get(['currentWhatsAppContact', 'currentLinkedInProfile'])

  if (stored.currentWhatsAppContact?.phone) {
    const contact = await findContactByPhone(session.user.id, stored.currentWhatsAppContact.phone)
    if (contact) {
      setCurrentContact({ phone: stored.currentWhatsAppContact.phone, ...contact })
      setSidebarState('whatsapp_mapped')
    } else {
      setCurrentContact({ phone: stored.currentWhatsAppContact.phone, linkedinName: stored.currentWhatsAppContact.name })
      setSidebarState('whatsapp_unmapped')
    }
  } else if (stored.currentLinkedInProfile?.linkedinUrl) {
    const contact = await findContactByLinkedInUrl(session.user.id, stored.currentLinkedInProfile.linkedinUrl)
    if (contact) {
      setCurrentContact({ linkedinUrl: stored.currentLinkedInProfile.linkedinUrl, ...contact })
      setSidebarState('linkedin_known')
    } else {
      setCurrentContact({ linkedinUrl: stored.currentLinkedInProfile.linkedinUrl, linkedinName: stored.currentLinkedInProfile.name })
      setSidebarState('linkedin_new')
    }
  } else {
    setSidebarState('default')
  }
}
```

**Render logic:**
```typescript
switch (sidebarState) {
  case 'loading':       return <LoadingSpinner />
  case 'unauthenticated': return <LoginScreen onSignIn={handleGoogleSignIn} />
  case 'default':       return <DefaultScreen user={user} onSignOut={handleSignOut} />
  case 'whatsapp_mapped':   return <WhatsAppMappedScreen contact={currentContact} user={user} onSignOut={handleSignOut} />
  case 'whatsapp_unmapped': return <WhatsAppUnmappedScreen phone={currentContact?.phone} suggestedName={currentContact?.linkedinName} user={user} onMapped={() => determineState()} />
  case 'linkedin_known':    return <LinkedInKnownScreen contact={currentContact} user={user} onSignOut={handleSignOut} />
  case 'linkedin_new':      return <LinkedInNewScreen profile={currentContact} user={user} onSaved={() => determineState()} />
}
```

### F07 · DailyProgress component
**File created:** `extension/src/sidebar/components/DailyProgress.tsx`

**What it does:** Shows today's progress on both daily people goals. Fetched from `habit_logs` table.

**Props:**
```typescript
interface DailyProgressProps {
  userId: string
}
```

**State variables:**
```typescript
const [networkingValue, setNetworkingValue] = useState(0)    // people talked today
const [networkingTarget, setNetworkingTarget] = useState(5)  // from habits.target_value
const [prospectingValue, setProspectingValue] = useState(0)  // contacts mapped today
const [prospectingTarget, setProspectingTarget] = useState(10)
```

**Data fetching:** On mount, query `habits` for `tracks_outreach = 'networking'` and `tracks_outreach = 'prospecting'` for the user. Then query `habit_logs` for today's date for those two habit IDs. Sets values.

**Supabase query:**
```typescript
// Fetch both habit IDs
const { data: habits } = await supabase
  .from('habits')
  .select('id, tracks_outreach, target_value')
  .eq('user_id', userId)
  .eq('active', true)
  .in('tracks_outreach', ['networking', 'prospecting'])

// Fetch today's logs for those habits
const today = new Date().toISOString().split('T')[0]
const { data: logs } = await supabase
  .from('habit_logs')
  .select('habit_id, value')
  .eq('user_id', userId)
  .eq('log_date', today)
  .in('habit_id', habits.map(h => h.id))
```

**UI (inline styles):**
```
┌─────────────────────────────────────────┐
│  Today                                   │
│  👥 4/5 people      ●●●●○               │  ← networking
│  ➕ 7/10 mapped     ●●●●●●●○○○          │  ← prospecting
└─────────────────────────────────────────┘
```
- Label `text-12px color:#536471`
- Progress dots: filled = `#79D65E`, empty = `#E3E3E3`, dot size 8px, gap 4px
- If goal met: dots all `#79D65E`, value text `color: #79D65E font-weight: 600`
- Container: `background: #F8FAF8 border-radius: 8px padding: 12px margin-bottom: 12px`

**Edge cases:**
- No habits configured with `tracks_outreach`: render nothing (return null)
- Error fetching: render nothing silently

---

## Phase 3 — WhatsApp Fix & Verification
*Depends on: Phase 1, Phase 2. Why third: WhatsApp is the simpler of the two channels — verify the core loop here before building LinkedIn.*

### F08 · Fix whatsapp.ts content script
**File modified:** `extension/src/content-scripts/whatsapp.ts`

**Problem 1 — Wrong phone extraction in `handleNewMessage`:** Current code tries to get phone from `header span[data-testid="conversation-info-header-chat-title"]` which shows the contact NAME, not phone. Phone should be extracted from `[data-id]` attribute of the message element itself.

**Fix:** Replace phone extraction in `handleNewMessage`:
```typescript
function handleNewMessage(messageElement: HTMLElement) {
  const dataId = messageElement.getAttribute('data-id')
  if (!dataId || !dataId.includes('@c.us')) return

  // Deduplicate
  if (processedMessages.has(dataId)) return
  processedMessages.add(dataId)

  // Extract phone from data-id (format: "true_PHONE@c.us_MSGID" or "false_PHONE@c.us_MSGID")
  const phoneMatch = dataId.match(/(?:true|false)_(.+?)@c\.us/)
  if (!phoneMatch?.[1]) return

  const rawPhone = phoneMatch[1]

  // Skip group chats — group JIDs contain @g.us, not @c.us
  // But also check: phone should be numeric-ish (groups sometimes use @c.us too)
  // Additional group check: presence of multiple participant indicators in DOM
  const participantEl = document.querySelector('header [data-testid="conversation-info-header"] span[title]')
  if (participantEl?.textContent?.includes(',')) return  // multiple participants = group

  const normalizedPhone = normalizePhoneNumber(rawPhone)
  if (!normalizedPhone) return

  // Detect direction
  const isOutbound = messageElement.classList.contains('message-out')
  const direction: 'outbound' | 'inbound' = isOutbound ? 'outbound' : 'inbound'

  chrome.runtime.sendMessage({
    type: 'whatsapp_message',
    phone: normalizedPhone,
    direction,
    timestamp: Date.now(),
  }).catch(err => console.error('reThink: Failed to send message:', err))
}
```

**Problem 2 — Observer attached to wrong element:** Current code waits for `div[data-testid="conversation-panel-messages"]`. WhatsApp Web also shows messages in `div.copyable-area`. Use the more stable `[data-testid="conversation-panel-messages"]` but add a fallback.

**Fix in `initWhatsAppObserver`:**
```typescript
function initWhatsAppObserver() {
  const checkReady = setInterval(() => {
    const panel = document.querySelector('[data-testid="conversation-panel-messages"]')
      ?? document.querySelector('div.copyable-area')
    if (panel) {
      clearInterval(checkReady)
      startObserving(panel)
    }
  }, 1000)
  setTimeout(() => clearInterval(checkReady), 30000)
}
```

**Problem 3 — `message-in` / `message-out` class check:** These class names are stable in WhatsApp Web but may change. Also check for `[data-id*="@c.us"]` as fallback detection.

**Fix in `startObserving`:**
```typescript
function startObserving(panel: Element) {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return
        const el = node as HTMLElement

        // Direct message element
        if (el.hasAttribute('data-id') && el.getAttribute('data-id')?.includes('@c.us')) {
          handleNewMessage(el)
        }

        // Message elements nested inside added container
        el.querySelectorAll('[data-id*="@c.us"]').forEach(msg => {
          handleNewMessage(msg as HTMLElement)
        })
      })
    }
  })
  observer.observe(panel, { childList: true, subtree: true })
}
```

### F09 · WhatsApp sidebar screens
**Files created:**
- `extension/src/sidebar/screens/WhatsAppMappedScreen.tsx`
- `extension/src/sidebar/screens/WhatsAppUnmappedScreen.tsx`

**WhatsAppMappedScreen — props:**
```typescript
interface Props {
  contact: CurrentContact
  user: User
  onSignOut: () => void
}
```

**WhatsAppMappedScreen — layout:**
```
┌─────────────────────────────────────────┐
│  reThink People              [Sign out] │  Header — 14px burnham
│─────────────────────────────────────────│
│  [photo 48px] Name                      │  Contact card
│              Job title · Company        │
│              Status pill  ● 7/10        │  health score dot
│─────────────────────────────────────────│
│  Today  ●●●●○ 4/5  ➕ 7/10             │  DailyProgress component
│─────────────────────────────────────────│
│  Interaction logged ✓                   │  14px #536471 italic
│  Last: 2 days ago                       │
│─────────────────────────────────────────│
│  [+ Add todo for Name]                  │  TodoForm (collapsed by default)
│─────────────────────────────────────────│
│  [Open in reThink ↗]                    │  14px #536471 underline
└─────────────────────────────────────────┘
```

**"Interaction logged" note:** Shown automatically when sidebar opens for a mapped contact on WhatsApp. The interaction was already logged by the content script. This is confirmation feedback. Show "Logged just now" if `lastInteractionAt` is within the last 5 minutes, else "Last: X days/hours ago".

**Health score visual:** `●` filled circle in `#79D65E` (7–10), `#F59E0B` (4–6), `#EF4444` (1–3), followed by `/10`.

**Status pill:** Rounded pill `border-radius: 100px padding: 2px 8px font-size: 11px`. Colors:
- PROSPECT/INTRO: `background: #E5F9BD color: #003720`
- CONNECTED/ENGAGED: `background: #79D65E color: #003720`
- NURTURING: `background: #003720 color: white`
- DORMANT: `background: #E3E3E3 color: #536471`
- RECONNECT: `background: #FEF3C7 color: #92400E`

**"Open in reThink"** — clicking this copies the deep link URL `rethink://people/{contactId}` to clipboard and shows a brief toast "Link copied — open reThink". (Tauri deep links are not in scope for this spec — just copy the URL as a placeholder.)

**WhatsAppUnmappedScreen — layout:**
```
┌─────────────────────────────────────────┐
│  reThink People                         │
│─────────────────────────────────────────│
│  📱 +52 1 555 123 4567                  │  phone number shown
│  Who is this person?                    │  16px burnham font-weight:600
│─────────────────────────────────────────│
│  Search in reThink: [_______________]   │  input — debounce 300ms
│  [Result 1 - Name · Company]            │
│  [Result 2 - Name · Company]            │
│─────────────────────────────────────────│
│  Or create new:                         │
│  Name: [___________________]            │
│  Category: [Peer ▾]                     │  CategoryPicker component
│  Do you have their LinkedIn?            │
│  [________________ (optional)]          │  URL input
│                                         │
│  [Create & Link]  [Skip]                │
└─────────────────────────────────────────┘
```

**On "Create & Link":**
1. INSERT to `outreach_logs`: `{ user_id, name, status: 'RECONNECT', category, linkedin_url: linkedinInput || null, phone, health_score: 1, log_date: today }`
2. INSERT to `contact_phone_mappings`: `{ user_id, contact_id: newContact.id, phone_number: phone }`
3. If linkedin_url provided: UPDATE `outreach_logs` SET `linkedin_url` (idempotent)
4. Call `updateNetworkingHabit(userId, today)` — this person counts as talked-to
5. On success: call `onMapped()` → parent re-determines state → shows WhatsAppMappedScreen

**On search select:**
1. INSERT to `contact_phone_mappings`: `{ user_id, contact_id: selected.id, phone_number: phone }`
2. On success: call `onMapped()`

**Status for WhatsApp unknown:** Use `'RECONNECT'` (you're talking to someone you presumably know, even if not yet in reThink). NOT `'PROSPECT'` — prospects are people you haven't reached out to yet.

**Edge cases:**
- Search returns 0 results: show "No matches. Create new contact below."
- Create & Link fails with 23505 (phone already mapped to different contact): show "This phone is already linked to another contact."
- Skip: does nothing to DB — phone stays unmapped, no interaction logged.

---

## Phase 4 — Floating Trigger Button
*Depends on: Phase 2. Why now: needed before LinkedIn profile sidebar can be opened.*

### F10 · floating-trigger.ts content script
**File created:** `extension/src/content-scripts/floating-trigger.ts`

**What it does:** Injects a small floating button (the reThink icon) into LinkedIn profile pages and WhatsApp Web. Clicking the button opens the sidebar by sending a message to the service worker.

**Constants:**
```typescript
const BUTTON_ID = 'rethink-people-trigger'
const BURNHAM = '#003720'
const PASTEL = '#79D65E'
const MERCURY = '#E3E3E3'
```

**Detection:**
```typescript
function isWhatsApp() { return window.location.hostname === 'web.whatsapp.com' }
function isLinkedInProfile() { return /linkedin\.com\/in\/[^/?#]+/.test(window.location.href) }
```

**Button injection:**
```typescript
function injectTrigger(isKnown: boolean) {
  if (document.getElementById(BUTTON_ID)) return

  const btn = document.createElement('button')
  btn.id = BUTTON_ID

  const iconUrl = chrome.runtime.getURL('icons/icon-48.png')

  btn.style.cssText = [
    'position: fixed',
    'bottom: 24px',
    'right: 24px',
    'z-index: 2147483647',
    'width: 44px',
    'height: 44px',
    'border-radius: 50%',
    `background: ${BURNHAM}`,
    'border: none',
    'cursor: pointer',
    'display: flex',
    'align-items: center',
    'justify-content: center',
    'box-shadow: 0 4px 16px rgba(0,0,0,0.3)',
    'transition: transform 0.15s, box-shadow 0.15s',
    'padding: 0',
  ].join('; ')

  btn.innerHTML = `<img src="${iconUrl}" style="width:24px;height:24px;border-radius:4px;" />`

  // Green dot indicator: shown if contact is known in reThink
  if (isKnown) {
    const dot = document.createElement('span')
    dot.style.cssText = [
      'position: absolute',
      'top: 0',
      'right: 0',
      'width: 12px',
      'height: 12px',
      'border-radius: 50%',
      `background: ${PASTEL}`,
      'border: 2px solid white',
    ].join('; ')
    btn.appendChild(dot)
  }

  btn.addEventListener('mouseenter', () => {
    btn.style.transform = 'scale(1.08)'
    btn.style.boxShadow = '0 6px 20px rgba(0,0,0,0.4)'
  })
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'scale(1)'
    btn.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)'
  })

  btn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_SIDEBAR' })
  })

  document.body.appendChild(btn)
}

function removeTrigger() {
  document.getElementById(BUTTON_ID)?.remove()
}
```

**Init for LinkedIn:**
```typescript
if (isLinkedInProfile()) {
  // Check if contact is already in reThink (for green dot)
  const linkedinUrl = cleanLinkedInUrl(window.location.href)
  if (linkedinUrl) {
    chrome.runtime.sendMessage(
      { type: 'CHECK_CONTACT_LINKEDIN', linkedinUrl },
      (response) => { injectTrigger(response?.exists ?? false) }
    )
  } else {
    injectTrigger(false)
  }
}
```

**Init for WhatsApp:**
```typescript
if (isWhatsApp()) {
  // WhatsApp trigger injected after 2 seconds to let page load
  setTimeout(() => {
    chrome.runtime.sendMessage(
      { type: 'GET_WHATSAPP_CONTACT_STATUS' },
      (response) => { injectTrigger(response?.isMapped ?? false) }
    )
  }, 2000)
}
```

**LinkedIn SPA navigation (URL changes):**
```typescript
let lastUrl = window.location.href
const navObserver = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href
    removeTrigger()
    if (isLinkedInProfile()) {
      setTimeout(() => {
        const linkedinUrl = cleanLinkedInUrl(window.location.href)
        if (linkedinUrl) {
          chrome.runtime.sendMessage(
            { type: 'CHECK_CONTACT_LINKEDIN', linkedinUrl },
            (response) => injectTrigger(response?.exists ?? false)
          )
        }
      }, 800) // Wait for LinkedIn SPA to settle
    }
  }
})
navObserver.observe(document.body, { childList: true, subtree: true })
```

**cleanLinkedInUrl helper** (same as chrome-extension/content.js:52-57):
```typescript
function cleanLinkedInUrl(url: string): string | null {
  const match = url.match(/linkedin\.com\/in\/([^/?#&]+)/)
  if (!match) return null
  return `https://www.linkedin.com/in/${match[1]}`
}
```

### F11 · Service worker: OPEN_SIDEBAR + CHECK_CONTACT_LINKEDIN handlers
**File modified:** `extension/src/background/service-worker.ts`

**Add to `chrome.runtime.onMessage` handler:**
```typescript
case 'OPEN_SIDEBAR': {
  // Get the active tab ID and open the sidebar
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id) {
    await chrome.sidePanel.open({ tabId: tab.id })
  }
  sendResponse({ success: true })
  break
}

case 'CHECK_CONTACT_LINKEDIN': {
  const userId = await getCurrentUserId()
  if (!userId) { sendResponse({ exists: false }); break }
  const { data } = await supabase
    .from('outreach_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('linkedin_url', message.linkedinUrl)
    .maybeSingle()
  sendResponse({ exists: !!data })
  break
}

case 'GET_WHATSAPP_CONTACT_STATUS': {
  const stored = await chrome.storage.local.get('currentWhatsAppContact')
  if (!stored.currentWhatsAppContact?.phone) { sendResponse({ isMapped: false }); break }
  const userId = await getCurrentUserId()
  if (!userId) { sendResponse({ isMapped: false }); break }
  const contact = await findContactByPhone(userId, stored.currentWhatsAppContact.phone)
  sendResponse({ isMapped: !!contact })
  break
}
```

**Add to `chrome.runtime.onInstalled`:**
```typescript
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
```

**Add tab navigation handler** to enable/disable sidebar per tab:
```typescript
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId)
  const isReThinkSite = tab.url?.includes('web.whatsapp.com') || tab.url?.includes('linkedin.com')
  await chrome.sidePanel.setOptions({
    tabId,
    enabled: isReThinkSite ?? false,
  })
})

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url) return
  const isReThinkSite = changeInfo.url.includes('web.whatsapp.com') || changeInfo.url.includes('linkedin.com')
  await chrome.sidePanel.setOptions({
    tabId,
    enabled: isReThinkSite,
  })

  // Update sidebar context on LinkedIn navigation
  if (changeInfo.url.includes('linkedin.com/in/')) {
    setTimeout(async () => {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: extractLinkedInProfileBasicInfo,
      })
      if (results?.[0]?.result) {
        await chrome.storage.local.set({
          currentLinkedInProfile: results[0].result,
          currentWhatsAppContact: null,
        })
      }
    }, 1200)
  }
})
```

**`extractLinkedInProfileBasicInfo` (injected function — must be self-contained):**
```typescript
function extractLinkedInProfileBasicInfo() {
  const urlMatch = window.location.href.match(/linkedin\.com\/in\/([^/?#&]+)/)
  if (!urlMatch) return null
  const slug = urlMatch[1]
  const linkedinUrl = `https://www.linkedin.com/in/${slug}`

  // Get name from h1 (same pattern as chrome-extension/content.js)
  const col = document.querySelector('[data-testid="lazy-column"]')
  const SECTION_TITLES = ['Highlights','About','Activity','Experience','Education','Skills','Followers','Recommendations','Courses','Languages','Certifications']
  let name: string | null = null
  if (col) {
    const nameEl = Array.from(col.querySelectorAll('h1, h2')).find((e: Element) => {
      const t = (e as HTMLElement).textContent?.trim() ?? ''
      return t.length > 2 && t.length < 80 && !SECTION_TITLES.includes(t)
    }) as HTMLElement | undefined
    if (nameEl) name = nameEl.textContent?.trim().split('\n')[0]?.trim() ?? null
  }

  return { linkedinUrl, name, slug }
}
```

---

## Phase 5 — LinkedIn Profile Sidebar
*Depends on: Phase 4. Why now: LinkedIn is the primary contact discovery channel.*

### F12 · linkedin-profile.ts content script
**File created:** `extension/src/content-scripts/linkedin-profile.ts`

**What it does:** Runs on `linkedin.com/in/*` pages. Extracts full profile data (porting logic from `chrome-extension/content.js:134-413`). Sends full profile to service worker on demand (message type `GET_LINKEDIN_PROFILE_DATA`). Also handles photo upload.

**Key function: `extractFullProfileData()`**
Port exactly from `chrome-extension/content.js:134-347`. Key extracted fields:
- `url`: cleaned LinkedIn URL `https://www.linkedin.com/in/{slug}`
- `name`: from h1/h2 in `[data-testid="lazy-column"]`, fallback from slug
- `job_title`: parsed from headline (first `<p>` in col, extracted via `parseHeadline()`)
- `company`: from headline parse or second `<p>` in col
- `location`: first `<p>` with comma in col
- `connections_count`: from `<p>` matching `/\d+ connections?/i`
- `followers_count`: from `<p>` near Activity h2 matching `/\d+ followers?/i`
- `about`: from `[data-testid="expandable-text-box"]` inside About section
- `company_linkedin_url`: from first `a[href*="/company/"]`
- `profile_photo_url`: priority: `og:image` meta → CSS class selectors → `img[data-delayed-url*="media.licdn.com"]` → any `img` with `profile-display` in URL

**Key function: `getContactInfo(callback)`**
Port exactly from `chrome-extension/content.js:351-413`. Clicks "Contact info" link, waits for overlay URL to change to `/overlay/contact-info/`, extracts email/phone/website via text parsing, calls `history.back()`.

**Message listener:**
```typescript
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'GET_LINKEDIN_PROFILE_DATA') return false
  const profileData = extractFullProfileData()
  getContactInfo((contactInfo) => {
    sendResponse({ ...profileData, ...contactInfo })
  })
  return true // async
})
```

### F13 · Photo uploader lib
**File created:** `extension/src/lib/photoUploader.ts`

**What it does:** Given a LinkedIn CDN photo URL + user ID + LinkedIn slug, fetches the photo (with browser cookies) and uploads to Supabase Storage. Returns the permanent Supabase Storage URL.

```typescript
export async function uploadLinkedInPhoto(
  cdnUrl: string,
  userId: string,
  linkedinSlug: string,
  supabaseUrl: string,
  accessToken: string
): Promise<string> {
  // Fetch the photo (browser sends LinkedIn auth cookies)
  const response = await fetch(cdnUrl, { credentials: 'include' })
  if (!response.ok) throw new Error(`Photo fetch failed: ${response.status}`)

  const blob = await response.blob()
  const ext = blob.type === 'image/png' ? 'png' : 'jpg'
  const path = `${userId}/${linkedinSlug}.${ext}`

  // Upload to Supabase Storage via REST API
  const uploadResponse = await fetch(
    `${supabaseUrl}/storage/v1/object/contact-photos/${path}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': blob.type,
        'x-upsert': 'true', // Overwrite if exists
      },
      body: blob,
    }
  )

  if (!uploadResponse.ok) {
    throw new Error(`Upload failed: ${uploadResponse.status}`)
  }

  return `${supabaseUrl}/storage/v1/object/public/contact-photos/${path}`
}
```

**If upload fails:** Return the original CDN URL. The app's `proxy-image` Edge Function will handle serving it.

### F14 · LinkedInKnownScreen
**File created:** `extension/src/sidebar/screens/LinkedInKnownScreen.tsx`

**Props:**
```typescript
interface Props {
  contact: CurrentContact
  user: User
  onSignOut: () => void
}
```

**Layout:**
```
┌─────────────────────────────────────────┐
│  reThink People              [Sign out] │
│─────────────────────────────────────────│
│  [photo 48px]  Name              ✓      │  ← green checkmark = in reThink
│                Job title                │
│                Company                  │
│  [Status pill]  ● 7/10 health           │
│─────────────────────────────────────────│
│  Today  ●●●●○ 4/5   ➕ 7/10            │  DailyProgress
│─────────────────────────────────────────│
│  Last contact: 3 days ago               │  14px #536471
│  [Log interaction ▾]                    │  dropdown: whatsapp/call/email/in_person
│─────────────────────────────────────────│
│  [+ Add todo for Name]                  │  TodoForm
│─────────────────────────────────────────│
│  [Update profile from LinkedIn]         │  14px #536471 — re-scrapes and upserts
└─────────────────────────────────────────┘
```

**"Log interaction" dropdown options:** WhatsApp, LinkedIn message, Call, Email, In person, Virtual coffee. On select:
1. Service worker message: `{ type: 'LOG_INTERACTION', contactId, interactionType, direction: 'outbound', date: today }`
2. Service worker inserts to `interactions` + updates `updateNetworkingHabit`
3. Show inline confirmation: "Logged ✓" for 2 seconds

**"Update profile from LinkedIn":**
1. Send `GET_LINKEDIN_PROFILE_DATA` to content script
2. Send result to service worker as `UPDATE_CONTACT`
3. Service worker UPSERTs safe fields only (same as `chrome-extension/background.js` safe fields): `profile_photo_url`, `location`, `about`, `job_title`, `followers_count`, `connections_count`, `company_domain`, `company_linkedin_url`
4. Show "Updated ✓"

**Photo display:** `img` with `src={profilePhotoUrl}`, `width=48 height=48 border-radius=50% object-fit=cover`. If no photo: show initial letter circle in burnham.

### F15 · LinkedInNewScreen
**File created:** `extension/src/sidebar/screens/LinkedInNewScreen.tsx`

**Props:**
```typescript
interface Props {
  profile: CurrentContact   // has linkedinUrl, linkedinName from storage
  user: User
  onSaved: () => void       // callback to refresh state after save
}
```

**Flow:**
1. On mount: send `GET_LINKEDIN_PROFILE_DATA` to the `linkedin-profile.ts` content script
2. Pre-fill form fields with extracted data
3. Show capture form

**State variables:**
```typescript
const [fullProfile, setFullProfile] = useState<LinkedInProfileData | null>(null)
const [name, setName] = useState('')
const [category, setCategory] = useState<ContactCategory>('peer')
const [phone, setPhone] = useState('')
const [linkWhatsApp, setLinkWhatsApp] = useState(false)
const [saving, setSaving] = useState(false)
const [loadingProfile, setLoadingProfile] = useState(true)
```

**Layout:**
```
┌─────────────────────────────────────────┐
│  reThink People                         │
│─────────────────────────────────────────│
│  [photo 48px]  John Doe                 │  pre-filled from LinkedIn
│                CEO at Stripe            │
│  Not yet in reThink                     │  14px #536471
│─────────────────────────────────────────│
│  Today  ●●●●○ 4/5   ➕ 7/10            │  DailyProgress
│─────────────────────────────────────────│
│  Name: [John Doe            ]           │  pre-filled, editable
│  Category: [Peer      ▾]               │  CategoryPicker
│─────────────────────────────────────────│
│  ☐ I'm already WhatsApping with them    │
│    Phone: [+52 1 555...   ] (optional)  │  shown only if checkbox checked
│─────────────────────────────────────────│
│  [Add to reThink]    [Skip]             │
└─────────────────────────────────────────┘
```

**"Add to reThink" action:**
1. Load `GET_LINKEDIN_PROFILE_DATA` if not already loaded (re-request from content script)
2. Upload photo: call `uploadLinkedInPhoto(cdnUrl, userId, slug, supabaseUrl, accessToken)`
3. INSERT to `outreach_logs`:
```typescript
{
  user_id: userId,
  name,
  linkedin_url: fullProfile.url,
  status: 'PROSPECT',
  category,
  job_title: fullProfile.job_title,
  company: fullProfile.company,
  location: fullProfile.location,
  about: fullProfile.about,
  followers_count: fullProfile.followers_count,
  connections_count: fullProfile.connections_count,
  company_linkedin_url: fullProfile.company_linkedin_url,
  company_domain: fullProfile.company_domain,
  email: fullProfile.email ?? null,
  phone: phone || null,
  website: fullProfile.website ?? null,
  profile_photo_url: uploadedPhotoUrl,
  health_score: 1,
  log_date: today,
}
```
4. If INSERT fails with 23505 (already exists): PATCH safe fields only (same as smart upsert in `chrome-extension/background.js:556-569`)
5. If `linkWhatsApp` checked AND phone provided: INSERT to `contact_phone_mappings`
6. Call `updateProspectingHabit(userId, today)` — counts toward the 10 contacts/day goal
7. On success: call `onSaved()` → parent re-determines state → shows LinkedInKnownScreen

**`updateProspectingHabit(userId, date)` function in service-worker.ts:**
```typescript
async function updateProspectingHabit(userId: string, date: string) {
  const { data: habit } = await supabase
    .from('habits')
    .select('id')
    .eq('user_id', userId)
    .eq('active', true)
    .eq('tracks_outreach', 'prospecting')
    .maybeSingle()

  if (!habit) return

  // Count total contacts added today
  const { count } = await supabase
    .from('outreach_logs')
    .select('id', { count: 'exact' })
    .eq('user_id', userId)
    .eq('log_date', date)

  await supabase
    .from('habit_logs')
    .upsert(
      { user_id: userId, habit_id: habit.id, log_date: date, value: count ?? 1 },
      { onConflict: 'user_id,habit_id,log_date' }
    )
}
```

### F16 · CategoryPicker component
**File created:** `extension/src/sidebar/components/CategoryPicker.tsx`

**Props:**
```typescript
interface Props {
  value: string
  onChange: (value: string) => void
}
```

**Options (same as SPEC-CRM):**
| Value | Label |
|---|---|
| `peer` | Peer |
| `business_dev` | Business Dev |
| `mentor` | Mentor |
| `client` | Client |
| `partner` | Partner |
| `friend` | Friend |
| `family` | Family |
| `job_us` | Job (US) |

**UI:** Native `<select>` element with inline styles. `background: white border: 1px solid #E3E3E3 border-radius: 8px padding: 6px 12px font-size: 14px color: #003720 width: 100%`.

### F17 · TodoForm component
**File created:** `extension/src/sidebar/components/TodoForm.tsx`

**Props:**
```typescript
interface Props {
  contactId: string
  contactName: string
  userId: string
}
```

**State:**
```typescript
const [expanded, setExpanded] = useState(false)
const [todoText, setTodoText] = useState('')
const [saving, setSaving] = useState(false)
const [saved, setSaved] = useState(false)
```

**Layout (collapsed):**
```
[+ Add todo for Name]    ← button, 14px #536471, underline on hover
```

**Layout (expanded):**
```
[What needs to happen with Name?]   ← placeholder in input
[Save todo]  [Cancel]
```

**"Save todo" action:**
Send message to service worker: `{ type: 'CREATE_TODO', userId, contactId, text: todoText, date: today }`

**Service worker `CREATE_TODO` handler:**
```typescript
case 'CREATE_TODO': {
  const { error } = await supabase
    .from('todos')
    .insert({
      user_id: message.userId,
      text: message.text,
      date: message.date,
      completed: false,
      effort: 'MED',
      outreach_log_id: message.contactId,
    })
  sendResponse({ success: !error, error: error?.message })
  break
}
```

**On success:** Show "Todo saved ✓" for 2 seconds, then collapse. Reset `todoText`.
**On error:** Show "Failed to save. Try again." inline in red (`#EF4444`).

---

## Phase 6 — LinkedIn DM Auto-Capture
*Depends on: Phase 5. Captures interactions from LinkedIn messaging.*

### F18 · linkedin-dm.ts content script
**File created:** `extension/src/content-scripts/linkedin-dm.ts`

**What it does:** Runs on `linkedin.com/messaging/*`. Uses MutationObserver to detect new messages, extracts the other person's LinkedIn URL and message direction (inbound/outbound), sends events to service worker.

**Direction detection in LinkedIn messaging:**
LinkedIn messaging DOM: sent messages have a class or attribute indicating they're "self-authored". Key pattern:
```typescript
// Outbound: messages sent by the user
// LinkedIn marks outbound messages with aria-label containing "You" or with a specific alignment class
// Use: check if the message container has `data-msg-sender` attribute or is right-aligned

function detectDirection(msgElement: HTMLElement): 'outbound' | 'inbound' {
  // Strategy 1: Check for "sent by you" marker
  const isSelf = msgElement.closest('[data-test-app-aware-badge-count]') !== null
  // Strategy 2: Check alignment (outbound messages are right-aligned in LinkedIn)
  const computedStyle = window.getComputedStyle(msgElement)
  if (computedStyle.alignSelf === 'flex-end' || computedStyle.marginLeft === 'auto') {
    return 'outbound'
  }
  // Strategy 3: Parent container with specific class
  if (msgElement.classList.contains('msg-s-message-list__event--outbound')) {
    return 'outbound'
  }
  return 'inbound'
}
```

**LinkedIn URL extraction from messaging thread:**
```typescript
function extractOtherPersonLinkedInUrl(): string | null {
  // LinkedIn messaging URLs contain the member URN or a conversation ID
  // The other person's profile is linked in the messaging header
  const profileLinks = document.querySelectorAll('a[href*="/in/"]')
  for (const link of Array.from(profileLinks)) {
    const href = (link as HTMLAnchorElement).href
    const match = href.match(/linkedin\.com\/in\/([^/?#&]+)/)
    if (match) {
      return `https://www.linkedin.com/in/${match[1]}`
    }
  }
  return null
}
```

**MutationObserver:** Watch `[data-test-messaging-conversation]` or the messages list container. On new message node added:
1. Check if already processed (deduplicate by element reference or text+timestamp)
2. Extract LinkedIn URL of other person
3. Detect direction
4. Send `{ type: 'linkedin_message', linkedinUrl, direction, timestamp: Date.now() }`

**Group conversation detection:** If more than one person's LinkedIn URL appears in the header/participant list → skip. Send nothing.

**Edge cases:**
- If LinkedIn URL cannot be extracted: skip (don't log unknown interaction)
- If on a new conversation (no messages yet): observer waits for first message
- LinkedIn SPA navigation: re-initialize observer on URL change

---

## Phase 7 — Person-Scoped Todos (already covered in F17)
*Phase 7 is complete via F17 (TodoForm + CREATE_TODO service worker handler). No additional work needed.*

---

## Phase 8 — Realtime Habit Loop in reThink App
*Depends on: Phase 1 (migrations). Why last: requires changes to the main app, separate from extension work.*

### F19 · Supabase Realtime subscription for habit_logs in reThink
**File modified:** Wherever habit data is loaded in the main app. Most likely `src/hooks/useHabits.ts` or `src/screens/Today.tsx`.

**Locate:** Search for `from('habit_logs')` in `src/` — find the hook that fetches today's habit logs. Add a Supabase Realtime subscription alongside the existing fetch.

**Pattern to add:**
```typescript
useEffect(() => {
  if (!userId) return

  const channel = supabase
    .channel(`habit_logs_${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'habit_logs',
        filter: `user_id=eq.${userId}`,
      },
      (_payload) => {
        // Re-fetch habit logs for today when any habit_log changes
        fetchTodayHabitLogs()  // call the existing fetch function
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [userId])
```

**What this enables:** When the extension updates `habit_logs` (via WhatsApp auto-capture or LinkedIn profile add), the Today screen in reThink reflects the updated count within ~1 second without any manual refresh.

**Enable Realtime on the table:** Supabase Realtime must be enabled for the `habit_logs` table. Go to Supabase dashboard → Database → Replication → enable `habit_logs`. (One-time setup, not a migration.)

**Edge cases:**
- If the subscription fails: the app falls back to the existing fetch-on-mount behavior. No data loss.
- Multiple tabs: each subscribes independently. Consistent because all read the same DB rows.
- Channel cleanup on unmount: handled by the `return () => supabase.removeChannel(channel)` cleanup.

---

## Descoped

| Idea | Reason |
|---|---|
| Gmail email association | Nice to have, breaks the "two surfaces" focus. Phase 2. |
| Sidebar on non-LinkedIn/WhatsApp sites | No clear value. Would dilute the sidebar's identity. |
| Sidebar auto-opens without user gesture | Chrome Side Panel API technical constraint. Floating trigger button is the correct solution within the API. |
| iMessage/SMS auto-capture | Requires macOS native permissions. Out of scope for Chrome extension. |
| Sentiment analysis | Nice-to-have future feature. No business case today. |
| Multi-user distribution | Out of scope for personal tool phase. |

---

## Open questions

None — spec is complete. All blocking questions answered.

---

## Implementation notes for the engineer

1. **Start with migrations first** (Phase 1 F01, F02) — run them in Supabase dashboard before writing any extension code.
2. **Verify `interactions` column name** before Phase 1 F03 — run the SQL check noted in Technical Notes.
3. **Build command:** `cd /Users/alexi/Documents/reThink-2026/extension && node build.mjs` — run after every change.
4. **Load extension:** `chrome://extensions` → Developer mode → Load unpacked → select `extension/dist/`
5. **After each phase:** Reload extension in Chrome (click ↻ on extension card), test the specific behavior, verify in Supabase dashboard.
6. **Phone normalization country code:** Change `DEFAULT_COUNTRY_CODE` in `src/lib/phoneNormalizer.ts` to match your country if not Mexico (`+52`).
7. **Retire `chrome-extension/`:** After Phase 5 is verified, the `chrome-extension/` directory can be archived. Don't delete until LinkedIn add + photo are confirmed working in the new extension.
