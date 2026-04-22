# reThink + Conversations — Living PRD

> **Single source of truth.** This is the ONLY product spec. Everything else is archived in `docs/archive/`.
> Covers both apps (reThink + Conversations) + the Jacob integration as one product.
> Updated continuously — current state, not aspirational.
>
> **Last updated:** 2026-04-21
> **Current releases:** reThink `v0.1.124` · Conversations `v0.0.26`
> **Legend:** ✅ shipped · 🚧 in progress · 📋 planned · 🗑️ sunsetting (will be removed)
>
> **See also:**
> - `docs/TECHNICAL.md` — stack, env vars, build commands (updated when stack changes)
> - `docs/UI-REFERENCE-ATTIO.md` — design patterns referenced for the People CRM
> - `README.md` — dev onboarding
> - `docs/archive/` — historical docs superseded by this spec

---

## Table of contents

1. [Vision & positioning](#1-vision--positioning)
2. [Three goals + KPIs](#2-three-goals--kpis)
3. [Architecture: three apps, one backend](#3-architecture-three-apps-one-backend)
4. [Screens — reThink](#4-screens--rethink)
5. [Relationship architecture (Jacob framework)](#5-relationship-architecture-jacob-framework)
6. [Conversations app (WhatsApp + LinkedIn + ...)](#6-conversations-app)
7. [Database schema + automation](#7-database-schema--automation)
8. [Playbook (positioning toolkit)](#8-playbook-positioning-toolkit)
9. [Integrations (Jacob, Attio, Google, Chrome ext, weekly-habit writers)](#9-integrations)
10. [Implementation status](#10-implementation-status)
11. [Roadmap + future plans](#11-roadmap--future-plans)
12. [Sunset list — features being removed](#12-sunset-list)
13. [Open questions](#13-open-questions)
14. [Appendix — Jacob course → feature map](#14-appendix--jacob-course--feature-map)
15. [Operational notes (for devs + AI agents)](#15-operational-notes)

---

## 1. Vision & positioning

**reThink is Alexis's personal operating system.** Open it every morning. It asks one question: *"What matters today?"* Then it shows three numbers, your tasks, and your habits. That's your day.

The product is built around three uncompromising principles:

- **The relationship IS the product.** UI shows relationship *state*, not CV-like data.
- **Conversations per week is THE only KPI.** Not applications, not messages sent, not likes.
- **Know your people. Know your stories. Do the work.**

Three apps share one Supabase backend:
- **reThink** (Tauri, macOS) — daily cockpit, CRM, Playbook, plan
- **Conversations** (Electron, macOS; legacy doc name: NetworkHub) — networking workspace with WhatsApp + LinkedIn webviews, contact capture, auto-logging
- **Jacob** (web, separate codebase) — English practice app that writes English session data directly to Supabase

Eventually a single-window unified app may collapse reThink + Conversations into one surface, but for now they ship separately.

---

## 2. Three goals + KPIs

Everything serves exactly three life goals:

| Goal | KPI | Feed |
|---|---|---|
| **Learn English** | Hours of practice per week | Manual log + auto-feed from Jacob app |
| **Revenue & Network** | Conversations per week | Manual log from Today + auto-log from Conversations interactions |
| **Be the best father for Domingo** | Habits adherence | Daily habit checkboxes (no single KPI — presence, not metrics) |

**Hard rule:** The conversations KPI counts **professional or mixed** domain contacts only. Family/close friends don't count (they're a separate OS — see Section 5).

---

## 3. Architecture: three apps, one backend

### reThink — global sidebar nav (Attio-style, ~200px, collapsible to ~48px)

```
[reThink] reThink 2026
─────────────────────────────
⌘K  Quick actions          🔍
─────────────────────────────
◎  Today                    ← daily cockpit
📋  Playbook                 ← positioning + stories

▽  CRM                    ⚙
     👤  People              (green)
     🏢  Companies           (blue)
     🎯  Opportunities       (orange)

▽  Lists
     📋  All Lists           ← canonical lists index
     ⭐  Board of Directors  (filter preset)
     🔥  Active Pipeline     (filter preset)

📊  Plan                     ← weekly/monthly strategy
─────────────────────────────
⚙  Settings
```

- Sidebar always visible; collapsible via ⌘\. Collapsed = icon-only with hover tooltips.
- CRM + Lists sections are themselves collapsible.
- Active item highlighted.
- Collapsed state persists (user preferences).

### Conversations — 4 webview panels

WhatsApp · LinkedIn · Exit5 · X(Twitter). Keyboard switch ⌘1/⌘2/⌘3/⌘4. No browser chrome. Built-in capture sidebar.

**Both apps share one Supabase.** Conversations writes to `outreach_logs`, `contact_channels`, `interactions`, `weekly_kpis`, `contact_facts`, `value_logs`. reThink reads and displays.

---

## 4. Screens — reThink

### 4.1 TODAY — daily cockpit

**Layout:** 70% left panel / 30% collapsible right sidebar.

**Left panel:**
- **A. Daily prompt:** "What's your One Thing today?" — single text field.
- **B. My Three Goals This Week** — three cards:
  - 🗣 Revenue & Network — `N / target conversations` + progress bar. Clickable → log (person auto-suggest + note + optional opportunity link → creates `interactions` row).
  - 🇬🇧 English — `h:mm / target hours`. Clickable → type + minutes. Auto-fed by Jacob.
  - 👶 Domingo — habit adherence %. Not clickable; aggregates Domingo-tagged habits.
- **C. Today's todos** — simple checklist. Each todo: text, checkbox, optional goal link, optional milestone parent. Milestones are expandable todo groups (children via `parent_todo_id`).
- **D. Habits** — daily checkboxes, tagged to goal. Streak count visible. No grades.

**Right sidebar (collapsible):**
- **Pulse:** energy slider 1-10 + summary (habits done, todos completed, conversations logged).
- **Journal:** free-form notes.
- **Next Steps:** pending from recent `interactions WHERE next_step_owner='me' AND next_step_date <= today`. Shows person + text + days since conversation. Actions: mark done / snooze.
- **Wrap Up:** end-of-day energy + "Tomorrow's focus" + Complete Day button.

### 4.2 PEOPLE — CRM (Attio-inspired)

**Design:** compact table, small text, dense info, drag-and-drop for funnels.

**Three objects:**
- **People** (`outreach_logs`) — name, photo, job title, company (linked), last interaction, health score, **tier (Airport Test)**, **relationship_domain**, **personal_tier**, **connection_strength**, interests, looking_for, referred_by (daisy chain), advisory_role.
- **Companies** — name, domain, sector, size, notes, logo_url, headline, description, website_url, linkedin_url, employees_count, followers_count, founded_year, hq_location, last_enriched_at. Linked people count visible ("3 at Airbnb").
- **Opportunities** — title, type (job/consulting/business/partnership/other), stage (exploring→active→negotiating→won/lost), company, people involved, estimated_value, target_date, decision_filter_pass (does it pass non-negotiables?). Stage-specific sections:
  - `active` → **Interview Prep**: CLOSER framework, Interview Map (Running the Gauntlet), Research Brief.
  - `negotiating` → **Negotiation Prep**: GAINS, Three Pillars, Alternatives Mapping, Comp Levers, Severance.

**Views:**
- **Table** (default) — compact rows.
- **Funnel** (kanban) — columns by stage, drag-and-drop.
- **Company view** — grouped by company, shows "allies count."
- **Opportunities pipeline** — by deal stage.

**Value Tracking (Jacob Session 4):**
Every person has a Value Log — list of value given:
- types: `introduction | content | referral | advice | endorsement | opportunity | candor | other`
- Detail drawer shows balance: "given 4, received 1."

**AI value suggestions:** weekly or on-demand. Uses contact's interests + looking_for + your Playbook (skills, network, value bank) → suggests introductions/intros/content to share.

**Proactive reminders (surface on Today):**
- Contacts with health drop / connection_strength weakening
- Birthdays this week (from `contact_milestones`)
- Cadence overdue per tier + domain
- Opportunities with upcoming deadlines

### 4.3 PLAN — weekly/monthly strategy

**Weekly view (default, Sundays):**
- Three goals with status + one-line description
- KPI trends — last 8 weeks, simple bar charts for Conversations + English hours
- Active milestones — upcoming deadlines, progress, linked goal
- This week's todos — pre-populated from milestone todos
- Opportunities pipeline

**Monthly view:**
- Habit streaks overview
- Monthly KPI summary
- Reflection: "What went well? What needs to change?" — one textarea

No grades, no friction logs, no 5-step wizards.

### 4.4 PLAYBOOK — positioning toolkit

See Section 8 for full content. Summary: markdown-first, quarterly-update discipline, exportable as `.md` to feed any LLM.

---

## 5. Relationship architecture (Jacob framework)

The **core relational system**. Implemented across two sprints. Multi-axial: one contact has up to 3 independent dimensions, each a different decision.

### 5.1 Axes

| Axis | Values | Determines |
|---|---|---|
| **relationship_domain** | `professional \| personal \| mixed` | Whether Jacob framework applies, whether KPI counts |
| **tier** (professional) | 1 / 2 / 3 | Strategic investment level (Airport Test) |
| **personal_tier** (personal) | `inner_circle \| close \| casual` | Personal cadence/importance |
| **connection_strength** (computed) | numeric 0..∞, bucketed into 5 levels | Behavior-based (who actually talks to whom) |
| **list_memberships** (contextual) | array of {list, stage} | Active contexts (Fundraising · first call, Hiring · screening, etc.) |

> **Key decision:** `outreach_logs.status` (PROSPECT/CONNECTED/...) is **deprecated** in favor of list_memberships. A person isn't globally "ENGAGED" — they're at stage X in list Y and stage Z in list W.

### 5.2 Tier (Airport Test, Jacob Session 4)

- **Tier 1** — would pick up at airport. Close trust, genuine care. Launch pad of daisy chain.
- **Tier 2** — shared identity (ex-colleagues, same school/company/industry). Foundation, not deep.
- **Tier 3** — loose (friends of friends, met once). Come last.

### 5.3 Connection Strength

Formula: `strength = Σ (weight(type, direction) × exp(-days_ago / 45))`

Half-life 45d. Only interactions in the last 2 years.

**Direction matters — inbound weighted ~60% higher than outbound** (suppresses one-sided monologues, per Jacob's bidirectionality principle):

| Type | Inbound | Outbound |
|---|---|---|
| in_person | 6.0 | 5.0 |
| virtual_coffee | 4.2 | 3.5 |
| call | 4.2 | 3.5 |
| whatsapp | 2.5 | 1.5 |
| linkedin_msg | 2.0 | 1.0 |
| email | 1.5 | 1.0 |

Buckets (fixed thresholds, may go percentile-based later):
`< 0.5` very_weak · `0.5-2` weak · `2-5` moderate · `5-10` strong · `≥ 10` very_strong.

### 5.4 Tier × Strength matrix — the action engine

| | very_weak | weak | moderate | strong | very_strong |
|---|---|---|---|---|---|
| **T1** | 🚨 ACT NOW | ⚠ Due | ✓ Good | ✓ Healthy | ✓ Healthy |
| **T2** | ⚠ Check | ⚠ Due | ✓ Good | ✓ Healthy | ⚠ Over-investing? |
| **T3** | ✓ OK | ✓ OK | ⚠ Why? | ⚠ Re-evaluate | 🚨 Mis-tiered |

Exposed via `strengthVsTier(contact)` in `src/lib/connectionStrength.ts`.

### 5.5 Cadence

- **Global defaults per tier** live in `profiles.tier_cadence_config jsonb` (default `{"1":{"days":30},"2":{"days":90},"3":{"days":365}}`). Edited in **Settings → Relationship Cadence**.
- **Per-contact override** in `outreach_logs.custom_cadence_days` (nullable).
- **Resolver:** `custom_cadence_days ?? tier_config[tier].days`. Only applies to `domain IN ('professional','mixed')`.
- **View** `contact_cadence` computes effective days + days_since_last_interaction.

### 5.6 Lists (Attio-style contextual funnels)

A list has: name, purpose, icon, color, **stages** (jsonb array of `{key, label, description}`).

A contact-in-a-list is a `list_memberships` row with `current_stage`, `entered_at`, `stage_changed_at`, `notes`.

**Templates (seeded at creation):**
- 💰 **Fundraising** — Research → Intro → First call → Diligence → Committed → Passed
- 👥 **Hiring Pipeline** — Sourced → Screening → Onsite → Offer → Hired → Lost
- 🤝 **Client Pipeline** — Discovery → Proposal → Negotiating → Won → Lost
- 🎓 **Advisory Candidates** — Approached → Aligned → Signed → Active → Paused
- ⭐ **2026 Deep Relationships** — Re-engage → Active Nurture → Consistent

**UX:**
- `/lists` — index with templates for first-time, cards + member count for existing.
- `/lists/:id` — kanban with HTML5 drag-and-drop between stages.
- `ContactDetailDrawer` shows "Active in lists" section with inline stage picker + quick add.

### 5.7 Key Facts (Two-Thirds Rule ammunition)

Structured data for "what to talk to them about." Table `contact_facts` with 11 categories, 1-3 star importance, optional `expires_at`.

| Category | Emoji | Examples |
|---|---|---|
| family | 👨‍👩‍👧 | "Wife Camila", "Son Mateo (3)" |
| career_intel | 💼 | "Wants out of current job, seeks international" |
| compensation | 💰 | "6M base + 20% bonus" |
| obsession | 🔥 | "Crossfit Saturdays" |
| hot_button | ⚡ | "Talks for hours about Los Bulls" |
| life_phase | 🌊 | "Baby due November 2026", "Sabbatical 2027" |
| pet_peeve | 🚫 | "Hates corporate-speak" |
| origin_story | 🎬 | "Met at EO retreat 2024" |
| health | 🏥 | Relevant context |
| preference | ✨ | "Favorite café: Coppelia" |
| other | 📝 | Catch-all |

**UX:** Inline grouped display in drawer. Add modal with chip grid + importance. `expires_at` drives countdown badges (red if <30d) — e.g., "Baby in 12d."

### 5.8 Candor (value they gave you)

When someone SHARES something sensitive (comp, life phase, frictions with their CEO), that disclosure IS a form of value. Captured as a `value_logs` entry with `type = 'candor'`:

```
2026-03-12 · 🔓 Candor · "Comp 6M + bonos, seeks upside"
```

Rendered in `PersonDetail` with pastel bg + 🔓 emoji. Distinct from `contact_facts` (where YOU observed/deduced the information).

### 5.9 Daisy Chain (Jacob's signature move) — Fase 13 pending

- `outreach_logs.referred_by` (FK to another contact) = upstream introducer
- Recursive query → full chain (María → Carla → this person)
- "Thank X" action with pre-filled message
- Downstream view: people I've introduced TO this person
- (Future) Mutual connections from LinkedIn scrape

### 5.10 Personal domain — a different OS

Family/close friends do **not** participate in:
- Tier (Airport Test) — use `personal_tier` instead
- Lists / funnels — not applicable
- Value Ledger / reciprocity tracking — not applicable (optional "shared memories")
- Daisy chain — not applicable
- Conversations KPI — **excluded**

They DO participate in:
- Connection Strength (informative, no alerts)
- Key Facts (more important here — birthdays, kids, interests)
- Milestones / birthdays / anniversaries (more prominent)

`personal_tier` values: `inner_circle` (spouse, parents, kids), `close` (siblings, best friends), `casual` (friends of friends, school classmates).

### 5.11 Person-detail UI — 7 zones (Fase 8-9 pending)

Rebuild target for both `ContactDetailDrawer` (reThink) and Conversations sidebar:

1. **Identity strip** — photo, name, pronouns, tier pill (or personal_tier), domain badge, channel icons
2. **Relational Pulse** — BIG days-since-last number, cadence bar, Connection Strength bar, recommended action from Tier×Strength matrix
3. **Next Step** — owner + date + text; loud empty state if missing ("Jacob wouldn't approve")
4. **Their World** — Key Facts grouped + Milestones near + "Shared with me" (candor derived)
5. **Value Ledger** — 2 cols: given vs received with reciprocity indicator
6. **Daisy Chain** — upstream + downstream + asks
7. **Cross-channel events** (collapsed) — non-chat events only (Conversations: WhatsApp chat visible to the right, don't duplicate)

Conditional rendering by domain; see 5.10.

---

## 6. Conversations app

Legacy name "NetworkHub" in docs; actual app is called **Conversations**. Currently: Electron with WhatsApp + LinkedIn webviews. LinkedIn + deep-scrape of companies already shipped (v0.0.26).

### 6.1 Capture + auto-log (shipped)

- **WhatsApp webview:** captures chat identity, detects groups, reads messages when chat is active.
- **LinkedIn webview:** scrapes profile on navigation (location, job_title, company, about, photo, connections, followers). Company deep-scrape auto-navigates to `/company/<slug>/about/` and extracts headline, description, domain, industry, members count (real, not bucket), founded year, HQ, followers, logo, then returns.
- **On enrich:** creates/links `companies` row via `upsert_company_and_link` RPC. Relinks all contacts matching company name.
- **Merge contacts** via `merge_contacts(survivor_id, duplicate_id)` RPC — 11 FK table reassignment, split-policy (refresh-ables prefer duplicate, sensitive fields preserve survivor).

### 6.2 Local SQLite schema (Conversations)

- `messages` — id, chat_phone, chat_kind, wa_data_id, direction, sender_phone/lid/name, text, timestamp_ms, session_id
- `sessions` — 6h sliding windows with `summary` (Gemini-generated) + `supabase_interaction_id` link
- `sync_queue` — async fallback for Supabase writes
- `meta` — k/v store

### 6.3 Multi-channel identity resolution (shipped: phase 1)

`contact_channels` table in Supabase. One `outreach_logs` record = one person; multiple `contact_channels` rows link channels (WA phone, LI URL, X handle, Exit5 profile).

Matching order on capture:
1. **Exact match** — channel + identifier found → link to existing contact
2. **Fuzzy match** — same name + same company → suggest merge (one-tap confirm)
3. **Manual link** — "Link channel" in detail drawer (paste identifier)
4. **Bulk reconciliation** — periodic scan finds likely duplicates, presents for review

### 6.4 Daily digest + AI extraction (Fase 11 pending)

On Conversations app open:
1. Query `messages WHERE captured_at > last_digest_run`
2. Group by chat_id → for each active chat, pack last N new messages into Gemini context
3. Gemini `gemini-2.0-flash` extracts: summary + candor candidates + fact candidates + commitments + next_step suggestion
4. Write to local `pending_extractions` table
5. "Morning digest" panel — approve/reject/edit
6. Approved → write to Supabase (`interactions`, `value_logs`, `contact_facts`)

Cost control: only chats with ≥5 new messages, only contacts with `domain IN ('professional','mixed')`, dedup by message hash, rate-limited edge function.

### 6.5 Keyboard-first

- ⌘1/⌘2/⌘3/⌘4 — switch panels
- ⌘N — new contact (capture modal)
- ⌘L — log conversation (quick-log modal)
- ⌘M — merge/link contact
- ⌘P — open reThink People in side panel
- ⌘K — command palette
- ⌘F — quick capture fact (pending Fase 6 port to Conversations)

### 6.6 Future: Kapso.ai

Optional automation layer if Alexis adopts WhatsApp Business number. Auto follow-ups, batch gratitude from daisy chain, AI-suggested responses from Playbook data. NOT a dependency.

---

## 7. Database schema + automation

### 7.1 Current tables (Supabase `public`)

**Core:** profiles, workbooks, workbook_entries, goals, milestones, leading_indicators, indicator_daily_logs, habits, habit_logs, todos, reviews, focus_sessions, friction_logs, captures, strategies, monthly_plans, monthly_kpi_entries

**CRM:** outreach_logs, interactions, companies, opportunities, opportunity_contacts, contact_channels, contact_milestones, contact_phone_mappings, contact_reminders, value_logs, playbook_entries

**NEW (Jacob CRM):** lists, list_memberships, contact_facts

**Weekly system:** weekly_kpis, weekly_habits, weekly_habit_logs

**Extras:** milestone_contacts, milestone_todos, english_sessions, newsletter_items, extension_interaction_windows, app_signals

### 7.2 Key extensions (Jacob sprint additions)

**`outreach_logs`** — v3 columns added:
- `relationship_domain text NOT NULL DEFAULT 'professional'` (CHECK: professional|personal|mixed)
- `personal_tier text` (CHECK: inner_circle|close|casual)
- `custom_cadence_days int` (>0)
- `connection_strength numeric NOT NULL DEFAULT 0`
- `connection_strength_computed_at timestamptz`

**`profiles`** — additions:
- `tier_cadence_config jsonb` (e.g., `{"1":{"days":30,"label":"Monthly"},...}`)
- `feature_flags jsonb` (for progressive rollout)

**`value_logs.type`** — accepts `'candor'` (no CHECK constraint)

### 7.3 Automation

- **Trigger** `trg_refresh_strength_on_interaction` → recomputes `connection_strength` on any INSERT/UPDATE/DELETE in `interactions`
- **Function** `compute_connection_strength(uuid) → numeric` (STABLE, SECURITY INVOKER)
- **Function** `refresh_all_connection_strengths() → int` (SECURITY DEFINER)
- **pg_cron job** `daily-connection-strength-refresh` @ `0 3 * * *` UTC
- **View** `contact_cadence` — computed effective_cadence_days + days_since_last_interaction per contact
- **RPC** `merge_contacts(survivor_id, duplicate_id)` — atomic 11-table FK reassignment
- **RPC** `upsert_company_and_link(company_name, linkedin_url, logo_url, domain)` — partial unique on normalized name
- **Helper** `normalize_company_name(raw)` — immutable SQL function for dedupe matching
- **Trigger function** `handle_updated_at()` — generic `NEW.updated_at = now()`

### 7.4 Deprecated (kept for backward compat)

- `outreach_logs.status` — replaced by `list_memberships.current_stage`. Comment says "DEPRECATED (2026-04-21): do not use in new code."
- `workbooks`, `workbook_entries` — data migrated to `playbook_entries`
- `milestones` (standalone) — replaced by todos with `is_milestone`
- `leading_indicators`, `indicator_daily_logs`, `monthly_kpi_entries` — replaced by `weekly_kpis`
- `monthly_plans`, `strategies`, `friction_logs`, `focus_sessions`, `captures`

### 7.5 RLS

All user-scoped tables use `auth.uid() = user_id` pattern. New tables (`lists`, `list_memberships`, `contact_facts`) have 4 policies each (select/insert/update/delete).

### 7.6 Migrations

Versioned from `0001_*` forward under `supabase/migrations/`. Pre-2026-04-21 schema lives only in Supabase Dashboard — no baseline migration (intentional; no rollback needed that far back).

Applied migrations:
- `0001_relationship_architecture.sql` — v3 columns + new tables + view + RLS + `handle_updated_at`
- `0002_connection_strength_engine.sql` — compute function + trigger + pg_cron + backfill

---

## 8. Playbook (positioning toolkit)

Markdown-first reference doc. Update quarterly. Feeds the AI value suggestion engine in People.

**Sections:**

- **My Story** — 90-second pitch (Session 5), 3 versions (CEO/hiring mgr, recruiter, networking contact). Outbound variant: "Others want to talk to me for X. I suspect I can help with Y."
- **Story Bank** — organized by framework:
  - CAR (Context → Action → Result) — resume bullets, quick stories
  - ICARQ (Impression → Context → Action → Result → Question) — interviews
  - Disney (Context → Conflict → Turning Point → Transformation) — narrative
  - CLEAR (Context → Leadership → Execution → Achievement → Reflection) — executive
  - Categories: leadership, growth, relationship, failure overcome, innovation, revenue
- **Objection Bank** (Session 2, Assignment 3) — 3-5 concerns + proactive narratives
- **Value Proposition** — Executive Value Pyramid: Table Stakes / Operational Excellence / Strategic Impact / X Factors
- **Key Positioning** — mission, core values, brand promise, Critical Three strengths
- **Skills & Expertise** — structured list (feeds AI suggestions)
- **Value Bank** (Session 4, Assignment 3) — intros I can make · content/resources · insights · expertise offers
- **Conversation Starters** (Session 4, Assignment 5) — 4 opener types
- **Audience Personas** (Session 2, Assignment 4) — decision-maker profiles with pressures + priorities
- **Negotiation Scripts** (Sessions 5, 7, 8) — comp deflection, EQ scenarios, objection reframing, bidding war, seed planting
- **My Boundaries** (Session 2 + Session 8) — Decision Filter (3-5 non-negotiables), Integrity Boundaries, Career integrity statement

**Export:** one click → `.md` file. Universal LLM prompt format. Feed to ChatGPT/Claude/Gemini for cover letters, interview prep, pitch decks, LinkedIn, email drafting.

---

## 9. Integrations

External apps write to our Supabase; we aggregate on read. The backend is the contract — apps can come and go as long as they follow the write patterns documented here.

### 9.1 Gemini (AI) ✅

Model: `gemini-2.0-flash`. Env: `VITE_GEMINI_API_KEY`.

- **Conversations** `/electron/ai/gemini.ts` — `summarizeSession(text)` → 2-line Spanish summary. 30s timeout, 10k char truncate. Called from `closeAndSummarize()` in session-manager when a 6h window expires. Output goes into `sessions.summary` and `interactions.notes`.
- **reThink** `/src/hooks/useGeminiScorer.ts` — English writing scorer, JSON mode. **TODO:** add 30s timeout to match Conversations.
- **Planned (Fase 11):** daily morning digest in Conversations → extract candor/facts/next_steps from new messages → review-queue UI → write to `interactions`, `value_logs`, `contact_facts`.

### 9.2 Jacob (English practice app) ✅

Separate codebase. Writes English session activity to reThink's Supabase so the English KPI feeds itself.

**Contract:**
- **Table:** `english_sessions`
- **Write pattern:** direct Supabase client with scoped API key OR webhook to Supabase Edge Function
- **Row shape:**
  ```
  {
    user_id: uuid,
    type: 'reading' | 'ai_conversation' | 'podcast' | 'real_conversation' | 'other',
    minutes: int,
    source: 'jacob_app',     // distinguishes from 'manual'
    date: 'YYYY-MM-DD',
    created_at: timestamptz
  }
  ```
- **reThink read:** Today screen sums `english_sessions WHERE user_id=me AND date >= week_start` → English KPI tile. Manual entries (`source='manual'`) and Jacob entries both count.

### 9.3 Attio (silent CRM sync) ✅

- **Not** a daily tool. Insurance + future team readiness.
- **One-way sync, reThink is source of truth.**
- Syncs: People → Attio People · Companies → Attio Companies · Interactions → activity timeline · Opportunity stage changes → deal updates.
- Triggers: "Sync to Attio" button in Settings, or optional scheduled background. Never real-time.
- Attio wins on contact data (enrichment pulled silently), reThink wins on relationships (value logs, tier, facts — these never sync to Attio).
- `attio_record_id`, `attio_synced_at`, `attio_company_id` columns track sync state on `outreach_logs`.

### 9.4 Chrome extension 🗑️ (being displaced)

Legacy browser extension that predates Conversations app. Still functional for auto-logging LinkedIn profile visits + WhatsApp Web. Writes directly to Supabase via code-generated extension token (Settings → Integrations → "Generate connect code").

**Current status:** functional but being displaced by Conversations app which covers the same flows natively. Will be archived/removed once Conversations reaches parity.

### 9.5 Google / Gmail sync ✅

OAuth in Settings → Integrations. `src/lib/gmail.ts`. Pulls email thread metadata for existing `outreach_logs` contacts → creates `interactions` with `channel='email'`. Respects user's Google session.

### 9.6 External writers for weekly habits 📋

**Pattern:** any external app can feed a `weekly_habits` row by writing to `weekly_habit_logs`. The `weekly_habits.integration_source` field declares which writer owns that habit.

**Current recognized sources** (values of `weekly_habits.integration_source`):
| Source | Who writes | What it counts |
|---|---|---|
| `manual` | User via reThink UI | Direct log |
| `interactions` | reThink + Conversations | Counts rows in `interactions` for the week |
| `english_sessions` | Jacob app | Sums `minutes` from `english_sessions` |
| `cowork` | (future) coworking app | Hours tracked externally |
| `networkhub_tier_touches` | Conversations | Counts unique tiered contacts touched this week |
| `networkhub_expansion` | Conversations | Counts new contacts added this week |

**How it works:**
1. User creates a weekly habit in reThink (e.g., "English hours/week", target 5h, source `english_sessions`).
2. reThink computes current-week value on-the-fly by querying the integration source table, filtered by `user_id` + current-week range.
3. External apps just write raw events; they don't need to know about `weekly_habits`.

**Adding a new external writer:**
1. Pick a new `integration_source` enum value
2. Ensure the raw events land in a user-scoped table with a date column
3. reThink `WeeklyPulse.tsx` gets a new branch in the sum function that maps source → query

### 9.7 LinkedIn scraping (inside Conversations) ✅

Not a 3rd-party API — we use the user's own LinkedIn session via Electron `WebContentsView` with shared `persist:linkedin` partition.

**Profile enrich:** `scrapeLocation`, `scrapeJobTitle`, `scrapeCompany`, `scrapeAbout`, `scrapeCompanyInfo` in `/electron/preload-linkedin.ts`.

**Company deep-scrape:** `scrapeLinkedInCompanyInView` auto-navigates LinkedIn view to `/company/<slug>/about/`, extracts headline/description/domain/industry/members/founded/HQ/followers/logo, returns to original URL. Feeds the `companies` table via `upsert_company_and_link` RPC.

No API keys. Runs inside the user's authenticated LinkedIn session.

### 9.8 WhatsApp Web (inside Conversations) ✅

Same approach — embedded webview, shared session, DOM-scraping via preload scripts.

**Key capabilities:**
- `getActiveChatIdentity` — detects current chat (1:1 vs group) and participants
- Center-pane message reading when a chat is active
- Two-stage group probe (`probeGroupIdFromMessages` + `headerHasGroupSubtitle`)
- Raw message text persistence to local SQLite (NOT Supabase)

**Planned (Fase 11):** background polling of active chat every 5-10s to capture new messages without manual intervention.

---

## 10. Implementation status

### 10.1 Shipped releases

- **reThink v0.1.120** — base v2 features
- **reThink v0.1.121** — merge contacts + tier tagging
- **reThink v0.1.122** — companies UI exposes all LI-enriched fields
- **reThink v0.1.123** — Jacob CRM foundation (data model + strength engine + classifier + cadence)
- **reThink v0.1.124** — Lists + Key Facts + Candor

- **Conversations v0.0.24-26** — LinkedIn deep-scrape, company auto-upsert + link, merge contacts UI

### 10.2 Jacob CRM phases

| Phase | What | Status |
|---|---|---|
| 0 | Audit existing schemas + Gemini | ✅ |
| 1 | Data model foundation (schema + types) | ✅ |
| 2 | Connection Strength engine (PG function + pg_cron) | ✅ |
| 3 | Domain classifier bulk tool (`/people/classify`) | ✅ |
| 4 | Cadence settings + per-contact override | ✅ |
| 5 | Lists + funnel system (index + kanban + templates + drawer) | ✅ |
| 6 | Contact Facts UI (11 categories, star importance, expires_at) | ✅ |
| 7 | Candor value type (UI highlighting, dropdown) | ✅ |
| **8** | **Person-detail UI redesign reThink (7 zones)** | ⏳ next |
| 9 | Person-detail UI redesign Conversations | ⏳ |
| 10 | Message persistence validation (already works, just verify) | ⏳ |
| 11 | Daily digest + AI extraction (Gemini → candor/facts/next_steps) | ⏳ |
| 12 | Weekly KPI filter by domain (`professional`/`mixed` only) | ⏳ |
| 13 | Daisy Chain visualization | ⏳ |

**Currently paused** after Sprint 2. Awaiting user validation of:
- `/people/classify` (all contacts tagged correctly?)
- `/lists` (templates useful, flow intuitive?)
- Key Facts (categories right, modal easy?)
- Connection Strength values (rankings sensible?)

### 10.3 File inventory (post-Sprint 2)

**New in Sprints 1-2:**
- `supabase/migrations/0001_relationship_architecture.sql`
- `supabase/migrations/0002_connection_strength_engine.sql`
- `src/lib/connectionStrength.ts`
- `src/screens/PeopleClassify.tsx`
- `src/screens/Lists.tsx`
- `src/screens/ListDetail.tsx`
- `src/components/ListEditorModal.tsx`
- `src/components/ContactListMemberships.tsx`
- `src/components/ContactFacts.tsx`
- `src/hooks/useLists.ts`
- `src/hooks/useContactFacts.ts`

**Modified:**
- `src/types/index.ts` — v3 Relationship Architecture section
- `src/App.tsx` — new routes
- `src/screens/People.tsx` — Classify link
- `src/screens/PersonDetail.tsx` — candor rendering
- `src/components/SettingsModal.tsx` — Cadence section
- `src/components/ContactDetailDrawer.tsx` — cadence override + lists + facts sections
- `src/components/layout/AppShell.tsx` — All Lists nav
- `src-tauri/tauri.conf.json` — version bumps

---

## 11. Roadmap + future plans

### 11.1 Near-term (active Jacob CRM sprints)

**Sprint 3 — Person-detail UI redesign (Fases 8-9)** 🚧 next
Rebuild of `ContactDetailDrawer` (reThink) and Conversations sidebar with the 7-zone Jacob layout. Feature-flagged via `profiles.feature_flags.new_person_drawer`. Key deliverable: identity + pulse + next_step zones are the 80% value.

**Sprint 4 — AI digest + daisy chain + KPI polish (Fases 10-13)** 📋
- Conversations: message-persistence validation + Gemini daily digest with candor/fact extraction queue
- reThink: weekly KPI filter by domain (exclude personal contacts from pro KPI)
- Both: Daisy Chain visualization (upstream/downstream intros, "Thank upstream" action)

### 11.2 Mid-term

- **Fase 8 Network Map view** — force-directed graph (react-force-graph) showing daisy chain lines, tier-sized nodes, health-colored dots. Click a chain to "Thank the Chain" (batch gratitude messages). Value Pulse ring around each node.
- **Chain Actions** — "Nurture the Dormant" + "Value Sweep" (AI-suggested outreach from Playbook × contact needs).
- **Exit5 + X panels in Conversations** — currently only WhatsApp + LinkedIn are wired. Add Exit5 and X(Twitter) as 3rd/4th webview with capture flows.
- **`status` column drop** — full audit of readers, then drop from `outreach_logs`.
- **Percentile-based connection strength thresholds** — replace fixed (0.5/2/5/10) with per-user percentiles computed daily.
- **Single unified window** — collapse reThink + Conversations into one Tauri app with toggleable left panels. Removes app-switching friction.

### 11.3 Long-term / exploratory

- **Kapso.ai integration** for WhatsApp Business number (auto follow-ups, batch gratitude, AI-suggested responses from Playbook). Blocked on WhatsApp Business API (personal numbers not supported).
- **Voice memo capture** — record a voice note after a conversation, AI transcribes + extracts candor/facts/next_step → goes directly into review queue.
- **Calendar intelligence** — auto-create `interactions` rows from Google Calendar events with known attendees.
- **Email templates per persona** — Playbook audience-persona cross-referenced with actual contact → AI drafts outreach in the user's voice using Playbook Story Bank + Value Bank.
- **Mobile companion** (iOS PWA or native) — NOT to replace the desktop cockpit, but for quick interaction logging on the go + push notifications for overdue Tier 1s.

---

## 12. Sunset list

Features being removed or already deprecated. Each entry gets removed from this spec AND from the codebase once truly gone.

### 12.1 Confirmed sunset (code may still exist but no new development)

| Item | Replacement | Removal trigger |
|---|---|---|
| `outreach_logs.status` (PROSPECT/CONNECTED/...) | `list_memberships.current_stage` | When no UI reads it anymore |
| `profiles.contact_funnel_config` jsonb | Per-list stages in `lists.stages` | When no UI reads it anymore |
| Chrome extension (standalone) | Conversations native app | When Conversations reaches parity on capture flows |
| `workbooks` + `workbook_entries` | `playbook_entries` | Already no active UI |
| Standalone `milestones` table | `todos WHERE is_milestone=true` | Already no active UI |
| `leading_indicators`, `indicator_daily_logs`, `monthly_kpi_entries` | `weekly_kpis` | Already no active UI |
| `monthly_plans`, `strategies`, `friction_logs` | Plan screen (weekly/monthly reflection) | Already no active UI |
| `focus_sessions` + Pomodoro UI | Removed (habit-based, not timer-based) | Already no active UI |
| `captures` (ideas/learning inbox) | None — cut from scope | Already no active UI |
| Momentum score, monthly grades | Removed (were hostile to the simplified vision) | Already no active UI |
| Assessment wizard | Removed | Already no active UI |

### 12.2 Under review (user may remove)

These features exist in current code but user has flagged as "maybe remove later":

- *Add as they come up. User to list here during reviews.*

### 12.3 Sunset protocol

When removing a feature:
1. Mark row in this section's table with 🗑️
2. Remove UI entry points first (screen routes, sidebar nav, buttons)
3. Leave DB columns/tables for 1+ release cycle for safety
4. After observing no regressions, drop DB objects in a migration
5. Delete this row from the spec (replaced with a commit message reference in git history)

---

## 13. Open questions

1. **Connection Strength buckets** — current fixed thresholds (0.5 / 2.0 / 5.0 / 10.0). After a week of real-data use, should they be percentile-based to match user's actual distribution?
2. **Key Facts categories** — 11 too many / few? Any missing after real use? Should "compensation" merge into "career_intel"?
3. **List templates** — 5 feel right? Missing "Board of Directors active" or something domain-specific?
4. **Cadence defaults** — 30/90/365 days for T1/T2/T3. Real-world usage may shift defaults.
5. **Personal domain in facts/candor** — should candor work for personal too (family disclosures)? Currently no restriction but semantically for pro.
6. **Recommended action edge cases** — any "ACT NOW" firing wrong, or "Healthy" that should warn?
7. **Status field decommission** — when to actually DROP `outreach_logs.status`? Need to audit all readers first.
8. **Gemini in reThink no-timeout** — add 30s timeout when we touch `useGeminiScorer.ts` next.
9. **Percentile thresholds computation** — if we go percentile-based, compute on the fly or daily cache per user?
10. **Fase 8 feature flag rollout** — toggle in Settings → Profile → "New person-detail UI" (uses `profiles.feature_flags.new_person_drawer`)?

---

## 14. Appendix — Jacob course → feature map

80+ course elements mapped. See full audit in `docs/archive/RETHINK-V2-SPEC.md` Section "Appendix: Full Course-to-Feature Audit." Key highlights:

| Session | Key teachings in product |
|---|---|
| 1 — Understanding the Market | ICARQ framework · Conversations KPI · 5 micro-habits |
| 2 — Master Your Mind | Value Prop · 90s Pitch (3 versions) · Objection Bank · Target Personas · Decision Filter · Board of Directors |
| 3 — LinkedIn & Résumés | CAR framework · Playbook export → LLM |
| 4 — Networking | Airport Test (tiers) · Value Bank · Daisy Chain · Conversation Starters · Reciprocity |
| 5 — Big 4 Interview Q's | My Story · CLEAR framework · Comp deflection scripts |
| 6 — Executive Interviews | CLOSER framework · Running the Gauntlet · Research Brief |
| 7 — Negotiation Strategy | GAINS · Three Pillars · EQ scenarios |
| 8 — Negotiation Techniques | Alternatives Mapping · Comp Levers · Severance Prep · Integrity Boundaries · Seed Planting |
| Bonus | Cadence ("every 4 months") · "Always be looking for work" |

**Not mapped (reference/behavioral concepts):** silence as tactic, identity fusion, vulnerability spectrum, echo chamber warning. These inform usage, aren't features.

---

## 15. Operational notes

### 13.1 Supabase project

- **Name:** reThink 2026 · **ID:** `amvezbymrnvrwcypivkf` · **Region:** us-east-1 · **PG:** 17
- **Dashboard:** Only v2 initial schema + live edits; from 2026-04-21 forward use `supabase/migrations/`

### 13.2 Release ritual (reThink)

1. Work on `main` branch
2. `npx tsc --noEmit` must pass
3. Bump `src-tauri/tauri.conf.json` version
4. `git add -A && git commit -m "..." && git tag v0.1.XXX && git push origin main && git push origin v0.1.XXX`
5. GH Actions builds DMG + creates release automatically (~4-5 min)
6. Tauri auto-updater pulls from `https://github.com/alexisamp/reThink-2026/releases/latest/download/latest.json`

### 13.3 Release ritual (Conversations)

Similar but via `electron-builder`. See `.github/workflows/release.yml`.

### 13.4 For future AI agents / Claude instances

**Read this file first.** Then:

- **Check current versions:** `grep version src-tauri/tauri.conf.json`
- **Check recent migrations:** `ls supabase/migrations/` (next should be next sequential number)
- **Current schema truth:** Supabase MCP `list_tables`, `execute_sql` — the DB is the source of truth for schema questions
- **Types:** `src/types/index.ts` — v3 section starts `// ─── v3: Relationship Architecture ───`
- **Connection Strength:** use `strengthVsTier()` helper everywhere for action-oriented UI
- **Feature flag pattern:** `profile.feature_flags[flagName] === true`
- **Do not invent** tables/RPCs — always audit existing schema first
- **Never duplicate raw messages** in Supabase (they live only in Conversations SQLite)
- **RLS everywhere** — new tables get 4 policies (select/insert/update/delete)

### 13.5 Design system

- **Font:** system default · **Colors:** burnham (primary dark), gossip (accent bg), pastel (secondary), mercury (border), shuttle (muted text), midnight (text)
- **Icons:** `@phosphor-icons/react` — use `size={13}` default, `weight="fill"` sparingly
- **Spacing:** tight. `px-3 py-1.5` for buttons, `px-4 py-3` for cards, `gap-2` default
- **Text sizes:** `text-xs` for body, `text-[10px]` and `text-[11px]` for meta, `text-sm` for emphasis, `text-lg` for page titles
- **Hover:** `opacity-0 group-hover:opacity-100` reveals secondary actions
- **No emojis in UI copy** unless semantically meaningful (category icons OK)

### 13.6 Code conventions

- TypeScript strict mode. `any` is banned; use `unknown` + narrowing or proper types.
- Functional React only. Hooks over class components.
- Supabase queries: always filter by `user_id` explicitly (defense in depth, even with RLS).
- Batch updates in chunks of 50 for large migrations.
- Prefer editing existing components over duplicating.
- Never create docs (`.md`) without explicit user request — **this SPEC.md is the exception as the canonical doc.**
