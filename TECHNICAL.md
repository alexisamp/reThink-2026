# Technical Reference — reThink 2026
Last updated: 2026-03-23

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19.2.0 + React Router 7.13.1 + TypeScript 5.9.3 (strict) |
| Styling | TailwindCSS 3.4.19 (no CSS modules) |
| Build tool | Vite 7.3.1 |
| Desktop wrapper | Tauri v2 (macOS, aarch64-apple-darwin) |
| Database | Supabase (PostgreSQL + PostgREST + Auth + RLS + Storage) |
| Auth | Supabase Auth — Google OAuth only |
| AI (coaching) | Anthropic Claude (via Supabase Edge Function `ai-coach`) |
| AI (enrichment) | Google Gemini 2.5 Flash with Google Search grounding |
| CRM integration | Attio REST API v2 |
| Icons | Phosphor Icons (@phosphor-icons/react) |
| Drag and drop | dnd-kit (@dnd-kit/core + @dnd-kit/sortable) |
| Chrome extension | Manifest V3 service worker |

**Env vars (VITE_ prefix):**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_GEMINI_API_KEY` (optional, enables F26)
- `VITE_ATTIO_API_KEY` (optional, enables F25)

---

## Tauri Configuration

- **App identifier:** `com.rethink.app`
- **Version:** 0.1.76 (in `src-tauri/tauri.conf.json`)
- **Main window:** 1440×900px, min 1024×700
- **Compact window:** 480×340px fixed, always-on-top, no decorations, route `/compact`
- **CSP:** null (disabled)
- **Auto-update endpoint:** `https://github.com/alexisamp/reThink-2026/releases/latest/download/latest.json`
- **Signing:** Minisign private key (`.tauri-private-key.txt`, gitignored)
- **Plugins:** global-shortcut, updater (tauri-plugin-updater), process (allow-restart), notification, opener

**Release process:**
1. Bump `version` in `src-tauri/tauri.conf.json`
2. Commit + tag `vX.X.X` + push tag → GitHub Actions builds, signs, uploads `latest.json`
3. App auto-detects update via `useUpdater` hook

---

## Project Structure

```
src/
├── App.tsx              — Router (all routes, auth guards)
├── main.tsx             — Tauri entry point
├── screens/             — One file per route
│   ├── Today.tsx        — ~1300 lines, main daily screen
│   ├── Strategy.tsx
│   ├── Monthly.tsx
│   ├── Dashboard.tsx
│   ├── GoalDetail.tsx
│   ├── WeeklyReview.tsx
│   ├── ReflectionLibrary.tsx
│   ├── YearAtAGlance.tsx
│   ├── People.tsx
│   ├── CompactMode.tsx
│   ├── Login.tsx
│   └── Assessment/index.tsx
├── components/          — Shared UI components
│   ├── layout/AppShell.tsx   — nav pill, global shortcuts, updater
│   ├── CommandPalette.tsx
│   ├── ContactDetailDrawer.tsx
│   ├── SettingsModal.tsx
│   ├── HabitEditModal.tsx
│   ├── MilestoneDetailModal.tsx
│   ├── CaptureModal.tsx
│   ├── EndOfDayDrawer.tsx
│   ├── StreakCelebration.tsx
│   ├── OutreachPanel.tsx
│   ├── JournalEditor.tsx
│   ├── AICoach.tsx
│   ├── SystematizeModal.tsx
│   ├── NewsletterPill.tsx
│   └── ...UI primitives
├── hooks/               — Data fetching and business logic
├── lib/                 — Utilities (supabase, attio, momentum, etc.)
└── types/index.ts       — All TypeScript interfaces

chrome-extension/        — Manifest V3 Chrome extension (separate package)
supabase/
└── functions/           — Deno edge functions
    ├── ai-coach/
    └── proxy-image/
src-tauri/               — Tauri Rust config and capabilities
```

---

## Database Schema

### T01 · profiles
User account data (auto-created on first login via Supabase trigger).
Connected features: F01

| Column | Type | Notes |
|---|---|---|
| id | uuid | = auth.uid(), primary key |
| email | text | |
| full_name | text | |
| avatar_url | text | |
| contact_funnel_config | jsonb | custom funnel stage definitions |
| created_at | timestamptz | |

---

### T02 · workbooks
One workbook per user per year. Created on first login.
Connected features: F01, F12

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| user_id | uuid | FK → profiles.id |
| year | int | e.g. 2026 |
| created_at | timestamptz | |

---

### T03 · workbook_entries
Individual answers for each of the 11 workbook sections (L1–L10 + misc).
Connected features: F01, F12, F21

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| workbook_id | uuid | FK → workbooks.id |
| section_key | text | e.g. 'L1', 'L2', ... 'L10' |
| answer | text | free-form text |
| list_order | int | for ordered list entries |

---

### T04 · goals
Strategic goals, year-scoped via workbook.
Connected features: F13, F16

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| user_id | uuid | FK → profiles.id |
| workbook_id | uuid | FK → workbooks.id |
| text | text | goal description |
| position | int | display order |
| motivation | text | why this goal matters |
| status | text | NOT_STARTED / ON_TRACK / AT_RISK / BLOCKED / COMPLETE |
| lifecycle | text | ACTIVE / BACKLOG / ARCHIVE / NOT_DOING |
| emoji | text | single emoji |
| alias | text | short display name |
| color | text | Tailwind color class for pill |
| next_30_days | text | current 30-day focus |
| key_support | text | who/what helps |
| created_at | timestamptz | |

Relationships:
- has many T05 · milestones
- has many T06 · habits
- has many T10 · leading_indicators
- has many T14 · strategies

---

### T05 · milestones
Key deliverables for a goal with target dates.
Connected features: F05, F16, F22

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| user_id | uuid | FK → profiles.id |
| goal_id | uuid | FK → goals.id |
| text | text | milestone description |
| target_date | date | |
| status | text | 'PENDING' or 'COMPLETE' (uppercase string) |
| created_at | timestamptz | |

---

### T06 · habits
Daily habits linked to goals.
Connected features: F04, F09, F15

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| user_id | uuid | FK → profiles.id |
| goal_id | uuid | FK → goals.id (optional) |
| text | text | habit description |
| type | text | 'BINARY' or 'QUANTIFIED' |
| frequency | text | daily / weekdays / custom |
| scheduled_days | int[] | [0-6] for custom frequency |
| emoji | text | |
| alias | text | short display name |
| default_time | text | e.g. '07:00' (NOT time_of_day) |
| target_value | int | for QUANTIFIED habits |
| unit | text | e.g. 'minutes', 'pages' |
| reward | text | |
| linked_indicator | uuid | FK → leading_indicators.id (auto-feed KPI) |
| tracks_outreach | bool | if true, counts as outreach habit |
| calendar_sync | bool | |
| active | bool | |
| created_at | timestamptz | |

---

### T07 · habit_logs
One record per habit per day.
Connected features: F04, F09, F15, F16, F22

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| user_id | uuid | FK → profiles.id |
| habit_id | uuid | FK → habits.id |
| log_date | date | (NOT logged_date) |
| value | int | 0 or 1 for BINARY; count for QUANTIFIED |
| created_at | timestamptz | |

Unique constraint: `(user_id, habit_id, log_date)`

---

### T08 · todos
Daily tasks.
Connected features: F03

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| user_id | uuid | FK → profiles.id |
| text | text | (NOT title) |
| date | date | (NOT due_date) |
| completed | bool | |
| effort | text | LOW / MED / HIGH / BLOCKING |
| block | text | AM / PM / null |
| goal_id | uuid | FK → goals.id (optional) |
| milestone_id | uuid | FK → milestones.id (optional) |
| url | text | linked resource |
| outreach_log_id | uuid | FK → outreach_logs.id (optional) |
| attio_task_id | text | Attio task ID if synced |
| position | int | drag-to-reorder |
| created_at | timestamptz | |

---

### T09 · reviews
One record per day per user. Central daily journal.
Connected features: F02, F06, F11, F19, F22

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| user_id | uuid | FK → profiles.id |
| date | date | (NOT review_date) |
| energy_level | int | 1–10 |
| one_thing | text | daily focus |
| tomorrow_focus | text | |
| notes | text | daily journal |
| weekly_one_thing | text | set during weekly review |
| ai_coach_notes | text | generated by F27 |
| inbox_zero | bool | protocol checkbox |
| time_logs_updated | bool | protocol checkbox |
| tomorrow_reviewed | bool | protocol checkbox |
| created_at | timestamptz | |

---

### T10 · leading_indicators
KPIs per goal (what to measure).
Connected features: F18, F16

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| user_id | uuid | FK → profiles.id |
| goal_id | uuid | FK → goals.id |
| text | text | KPI name/description |
| target | int | (NOT annual_target) |
| unit | text | e.g. 'calls', 'revenue', 'kg' |
| frequency | text | daily / weekly / monthly |
| habit_id | uuid | FK → habits.id (auto-feed, optional) |

Relationships:
- has many T11 · indicator_daily_logs
- has many T12 · monthly_kpi_entries

---

### T11 · indicator_daily_logs
Daily log of KPI values (optional granularity).
Connected features: F18

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| user_id | uuid | |
| indicator_id | uuid | FK → leading_indicators.id |
| log_date | date | |
| value | numeric | |

---

### T12 · monthly_kpi_entries
Primary KPI tracking unit — one per indicator per month.
Connected features: F18, F16

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| user_id | uuid | |
| indicator_id | uuid | FK → leading_indicators.id |
| month | int | 1–12 |
| year | int | |
| actual_value | numeric | (NOT value) |
| notes | text | |

---

### T13 · monthly_plans
Monthly planning and reflection per goal.
Connected features: F14, F21

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| user_id | uuid | |
| goal_id | uuid | FK → goals.id |
| month | int | 1–12 |
| year | int | |
| focus | text | monthly focus text |
| reflection | text | end-of-month reflection |
| highlights | text | key wins/moments |
| rating | int | 1–5 stars |

---

### T14 · strategies
Goal-level strategy records.
Connected features: F12

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| user_id | uuid | |
| goal_id | uuid | FK → goals.id |
| type | text | strategy type |
| title | text | |
| tactic | text | |

---

### T15 · friction_logs
Why habits were skipped.
Connected features: F20

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| user_id | uuid | |
| habit_id | uuid | FK → habits.id |
| week_start | date | ISO week start (Monday) |
| reason | text | Travel / Forgot / Too tired / External blocker / Other |

---

### T16 · focus_sessions
Pomodoro and deep work sessions.
Connected features: F07

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| user_id | uuid | |
| started_at | timestamptz | |
| ended_at | timestamptz | |
| duration_minutes | int | 25 / 52 / 90 |
| session_type | text | pomodoro / deep_work / flow |
| goal_id | uuid | FK → goals.id (optional) |
| habit_id | uuid | FK → habits.id (optional) |
| intention | text | what user planned to do |
| completion_status | text | COMPLETE / CARRIED_OVER / INCOMPLETE |

---

### T17 · captures
Structured ideas and learnings from the journal parser.
Connected features: F33, F06

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| user_id | uuid | |
| type | text | idea / learning / reflection / decision / win / question |
| body | text | |
| goal_id | uuid | FK → goals.id (optional) |
| milestone_id | uuid | FK → milestones.id (optional) |
| todo_id | uuid | FK → todos.id (optional) |
| created_at | timestamptz | |

---

### T18 · outreach_logs
Contact / CRM records. Primary table for People screen.
Connected features: F23, F24, F25, F26, F31

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| user_id | uuid | FK → profiles.id |
| name | text | |
| linkedin_url | text | cleaned to `/in/{slug}` |
| category | text | business_dev / partner / client / mentor / investor / advisor / peer / other |
| status | text | PROSPECT / INTRO / CONNECTED / RECONNECT / ENGAGED / NURTURING / DORMANT |
| health_score | int | 1–10, decay-calculated |
| last_interaction_at | timestamptz | |
| job_title | text | |
| company | text | |
| location | text | |
| email | text | |
| phone | text | |
| website | text | |
| about | text | bio / LinkedIn about |
| notes | text | user notes |
| personal_context | text | relationship context (user-edited, never overwritten by AI) |
| skills | text[] | array of skill strings |
| followers_count | int | LinkedIn followers |
| connections_count | int | LinkedIn connections |
| company_domain | text | e.g. 'stripe.com' |
| company_linkedin_url | text | LinkedIn company page URL |
| profile_photo_url | text | Supabase Storage URL (preferred) or LinkedIn CDN URL |
| ai_enriched_at | timestamptz | when Gemini enrichment last ran |
| attio_record_id | text | Attio person record ID |
| attio_company_id | text | Attio company record ID |
| log_date | date | when contact was added |

Unique index: `(user_id, linkedin_url) WHERE linkedin_url IS NOT NULL`

Relationships:
- has many T19 · interactions

---

### T19 · interactions
Individual contact interaction logs.
Connected features: F23, F24

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| user_id | uuid | |
| outreach_log_id | uuid | FK → outreach_logs.id |
| type | text | whatsapp / linkedin_msg / email / call / virtual_coffee / in_person / note |
| direction | text | outbound / inbound |
| notes | text | |
| created_at | timestamptz | |

---

## Supabase Storage

### contact-photos bucket
- **Public:** yes
- **File size limit:** 512KB
- **Allowed MIME types:** image/jpeg, image/png, image/webp, image/gif
- **Path structure:** `{user_id}/{linkedin_slug}.{ext}`
- **RLS policies:**
  - SELECT: public (anyone can read)
  - INSERT: authenticated, path must start with `auth.uid()`
  - UPDATE: authenticated, path must start with `auth.uid()`

---

## API Routes / Edge Functions

### R01 · POST /functions/v1/ai-coach
AI coaching feedback via Anthropic Claude.
Connected features: F27

- **Auth:** Requires valid Supabase JWT
- **Input:** `{ prompt: string }`
- **Output:** `{ message: { content: [{ text: string }] } }`
- **Model:** claude-haiku-4-5
- **Secrets:** `ANTHROPIC_API_KEY` (Supabase secret)
- **Error codes:** 401 unauthorized, 500 missing API key, 502 Anthropic failure

### R02 · GET /functions/v1/proxy-image?url=...
Server-side image proxy for LinkedIn CDN photos (bypasses WKWebView CORS/header restrictions).
Connected features: F24, F31

- **Auth:** Not required
- **Input:** `url` query param — must be a `media.licdn.com` URL (whitelist enforced)
- **Output:** Image bytes with `Cache-Control: public, max-age=604800` (7 days)
- **User-Agent:** Mozilla/Chrome UA sent to LinkedIn CDN
- **Use case:** ContactDetailDrawer routes `media.licdn.com` URLs through this proxy before displaying

---

## Integrations

### Attio REST API v2
Connected features: F25

- **Base URL:** `https://api.attio.com/v2`
- **Auth:** Bearer token (user's Attio API key from Settings)
- **Lib file:** `src/lib/attio.ts`
- **People object slugs used:** `name`, `email_addresses`, `phone_numbers`, `linkedin` (URL slug), `job_title`, `company`, `about`, `skills`, `category`, `relationship_status`, `health_score`, `linkedin_followers`, `linkedin_contacts`
- **Custom attributes (must exist in user's Attio):** `category` (select), `skills` (multi-select), `relationship_status` (select), `health_score` (number), `linkedin_followers` (number), `linkedin_contacts` (number)
- **NOT synced:** `avatar_url` (Attio protected field), `primary_location` (requires structured address object)
- **Company sync:** creates/updates a Companies record, links to People via `companies` attribute

### Google Gemini 2.5 Flash
Connected features: F26

- **SDK:** Google Generative AI JavaScript SDK
- **Grounding:** Google Search enabled (for real-time web lookup)
- **Hook:** `src/hooks/useContactEnricher.ts`
- **Timeout:** 30s (grounding calls are slower)
- **Output fields:** `company_domain`, `skills`, `about`, `relationship_context`, `approach_angles`, `enrichment_notes`

### Chrome Extension ↔ Supabase
Connected features: F31, F23

- **Auth:** Supabase access_token stored in `chrome.storage.local`, auto-refreshed
- **Photo upload:** Supabase Storage REST API (`/storage/v1/object/contact-photos/...`)
- **Contact upsert:** PostgREST REST API (`/rest/v1/outreach_logs`)
- **Duplicate detection:** INSERT → catch 23505 → PATCH (slug-based lookup: `linkedin_url like *slug*`)

---

## Key Business Logic

### Momentum Score — implements F16
Source: `src/lib/momentum.ts`

Composite score 0–100 for a goal's current momentum:
- **Habits (40%):** % of linked habit logs in last 30 days with value > 0
- **Milestones (30%):** % of milestones marked COMPLETE vs total
- **KPIs (30%):** average of (actual_value / target) for latest monthly entries, capped at 100%

Score ranges: ≥80 = green, ≥60 = yellow, <60 = red. Used in S06 and S04.

### Health Score Decay — implements F23
Source: `src/lib/funnelDefaults.ts`

Health score (1–10) = max(1, 10 - decay_points), where decay_points accumulates based on days since last interaction. Different interaction types have different decay rates. ENGAGED contacts decay slower than PROSPECT.

### Contact Upsert (INSERT → PATCH) — implements F31
Source: `chrome-extension/background.js`

1. Try INSERT to `outreach_logs`
2. If response contains `23505` (unique violation on `user_id + linkedin_url` index) → fetch existing record by slug using `linkedin_url like *{slug}*`
3. PATCH only safe fields: `profile_photo_url`, `location`, `about`, `job_title`, `followers_count`, `connections_count`, `company_domain`, `company_linkedin_url`
4. Never patches: `status`, `category`, `notes`, `personal_context` (user-edited fields)

### LinkedIn Photo Storage — implements F31, F24
Source: `chrome-extension/background.js`, `src/components/ContactDetailDrawer.tsx`

1. Extension fetches `og:image` URL (LinkedIn CDN) and uploads blob to Supabase Storage `contact-photos/{userId}/{slug}.ext`
2. Stored URL is the permanent Supabase Storage URL (no authentication required)
3. If upload fails: LinkedIn CDN URL stored directly
4. In the app: if URL is `media.licdn.com` → routed through `proxy-image` Edge Function (R02) to bypass WKWebView CORS restrictions

### Morning Ritual Trigger — implements F08
Source: `src/screens/Today.tsx`

Triggers overlay if ALL of: (a) current time is between 05:00–10:00 local, (b) `reviews.one_thing` for today is null, (c) `todos` for today is empty. Dismissed with Skip or by completing all 3 steps.

### Habit Grade Thresholds — implements F15
Source: `src/lib/userSettings.ts` (configurable in Settings)

Default: A ≥ 90%, B ≥ 75%, C ≥ 50%, D < 50%. Based on `habit_logs` for the full calendar month.

### Streak Celebration Milestones — implements F10
Fires once per milestone: 7, 30, 100, 365 consecutive days. Checked when a habit log value > 0 is saved.

### Navigation Guard
Source: `src/App.tsx`

Three guard layers:
1. Not authenticated → `/login`
2. Authenticated but no workbook entries → `/assessment`
3. Authenticated + workbook complete → main app routes
