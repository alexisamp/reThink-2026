# Jacob-CRM Overhaul — Progress Log

**Last updated:** 2026-04-21
**Current state:** Paused after Sprint 2 (v0.1.124 shipped). Awaiting user validation before Sprint 3.

---

## Executive summary

Multi-sprint overhaul of reThink-2026 + Conversations to implement a **Jacob Warwick-inspired relational CRM**. The goal is to move the product from "CRM that tracks contacts" to "system that tells you what to DO about relationships."

**Progress:** 7 of 13 phases complete across 2 shipped releases.

**Shipped:**
- `v0.1.123` — Relationship architecture foundation (Sprint 1)
- `v0.1.124` — Lists + Key Facts + Candor (Sprint 2)

**Remaining:** Person-detail UI redesign (Fase 8-9), Conversations AI digest (Fase 10-11), KPI filter + daisy chain (Fase 12-13).

---

## Core principles (Jacob Warwick framework)

These filter every design decision:

1. **The relationship IS the product.** UI shows relationship *state*, not CV data.
2. **Conversations per week is THE only KPI.** Not applications, not messages sent.
3. **Airport Test (Tier 1/2/3).** Tier 1 = would pick up at airport. Determines cadence + investment.
4. **Two-Thirds rule.** 22 of 30 min on them. UI must surface ammunition (facts, life phase, interests).
5. **Reciprocity imbalance.** Value given vs received must be visible.
6. **Daisy chain.** Each person is a node (upstream introducer → downstream intros I've made).
7. **Thank-you loop + champions.** Credit introducer even 3 levels deep.
8. **Next step explicit.** Every interaction ends with a concrete commitment.
9. **Bidirectionality.** Outbound monologues don't count as real connection.
10. **Professional ≠ Personal.** Family/friends are a different OS, don't count toward pro KPIs.

---

## Architecture decisions

### Data model split
- **Raw messages** → local SQLite in Conversations (privacy + cost)
- **Interpreted events** → Supabase (`interactions`, `value_logs`, `contact_facts`) — synced, searchable
- Never duplicate raw message text in cloud.

### Relationship axes — three independent dimensions per contact
1. **Domain** (`professional | personal | mixed`) — decides whether Jacob framework applies
2. **Tier** (1/2/3 Airport Test for pro) or **personal_tier** (inner_circle/close/casual)
3. **Connection Strength** (computed) — behavior-based, not classification-based

The magic is the **Tier × Strength matrix**: Tier 1 + Weak = ACT NOW, Tier 3 + Strong = Mis-tiered, etc.

### Status is DEPRECATED
Replaced by **list_memberships** (Attio-style): a contact can be in multiple lists (Fundraising, Hiring, Advisory) with a stage in each. Contextual, not global.

### Candor is a value type
What they SHARED with you (comp disclosure, life phase, career intel) = value they gave you. Lives in `value_logs` with type `'candor'`, NOT in `contact_facts` (which is anonymized/observed data).

### Feature flag infrastructure
`profiles.feature_flags jsonb` — for gradual rollout of UI rebuilds (will be used in Fase 8).

---

## What shipped — Sprint 1 (v0.1.123)

### Fase 0 — Audit
- Reviewed existing schema in both Conversations (SQLite) and reThink (Supabase)
- **Key finding:** many v2 fields (tier, referred_by, company_id, next_step, channel, etc.) already existed
- **Key finding:** `contacts` doesn't exist — real table is `outreach_logs` (aliased in TS)
- **Key finding:** Gemini already integrated in both apps with `gemini-2.0-flash` model
- **Key finding:** reThink has NO migrations versioned (all in Dashboard) — started `supabase/migrations/` from 0001 forward

### Fase 1 — Data model foundation
**Migration `supabase/migrations/0001_relationship_architecture.sql`:**

Added to `outreach_logs`:
- `relationship_domain text NOT NULL DEFAULT 'professional'` (CHECK: professional|personal|mixed)
- `personal_tier text` (CHECK: inner_circle|close|casual)
- `custom_cadence_days int` (positive)
- `connection_strength numeric NOT NULL DEFAULT 0`
- `connection_strength_computed_at timestamptz`
- Indexes: `(user_id, relationship_domain)`, `(user_id, connection_strength DESC)` partial for pro+mixed

Added to `profiles`:
- `tier_cadence_config jsonb` (defaults `{"1":{"days":30,"label":"Monthly"},...}`)
- `feature_flags jsonb` (defaults `{}`)

NEW tables (+ RLS + `handle_updated_at` triggers):
- `lists` — contextual funnels (stages as jsonb array)
- `list_memberships` — contact-in-list-at-stage (UNIQUE list_id+contact_id)
- `contact_facts` — structured key nuggets (11 categories, 1-3 importance, optional expires_at)

NEW view:
- `contact_cadence` — computes `effective_cadence_days` per contact (override > tier default)

Deprecated:
- `outreach_logs.status` (comment only, not dropped)

### Fase 2 — Connection Strength engine
**Migration `supabase/migrations/0002_connection_strength_engine.sql`:**

Formula:
```
strength = Σ (weight(type, direction) × exp(-days_ago / 45))
```

Weights (suppress one-sided monologues):
| Type | Inbound | Outbound |
|---|---|---|
| in_person | 6.0 | 5.0 |
| virtual_coffee | 4.2 | 3.5 |
| call | 4.2 | 3.5 |
| whatsapp | **2.5** | **1.5** |
| linkedin_msg | 2.0 | 1.0 |
| email | 1.5 | 1.0 |
| (fallback) | 1.0 | 0.6 |

Artifacts:
- `compute_connection_strength(uuid) → numeric` — PL/pgSQL STABLE function
- `refresh_all_connection_strengths() → int` — SECURITY DEFINER batch refresh
- Trigger `trg_refresh_strength_on_interaction` — real-time update on interactions INSERT/UPDATE/DELETE
- **pg_cron** scheduled job `daily-connection-strength-refresh` at `0 3 * * *` (3am UTC)
- One-time backfill executed: 13/51 contacts populated. Top: Laura 11.77, Nicolás 6.46, Mariajose 6.41

### Fase 3 — Domain classifier bulk tool
- `/people/classify` route + `PeopleClassify.tsx` screen
- Auto-suggestion: `category='family'` → personal/inner_circle, `category='friend'` → personal/close, rest → professional
- Bulk-apply buttons per category
- Per-row override with domain + personal_tier dropdowns
- Save in 50-row chunks
- Accessed via "Classify" link in People header

### Fase 4 — Cadence settings + override
- **Settings → Relationship Cadence** section (new Section in `SettingsModal.tsx`)
- Edit days per Tier 1/2/3 with save-to-Supabase
- **Per-contact override** input in `ContactDetailDrawer` below tier selector (empty = use tier default)

### Helpers
**`src/lib/connectionStrength.ts`:**
- `strengthBucket(value)` → very_weak | weak | moderate | strong | very_strong
- `strengthLabel(bucket)` → display string
- `strengthNormalized(value)` → 0..1 for progress bars
- `strengthVsTier(contact) → { action, label, severity, suggestion }` — the Jacob matrix
- `effectiveCadenceDays(contact, config)` — resolves override vs tier default
- `cadenceStatus(lastInteraction, cadenceDays)` → on_track | due_soon | overdue | no_history | none

---

## What shipped — Sprint 2 (v0.1.124)

### Fase 5 — Lists + funnel system

**Hooks:** `useLists`, `useListMemberships` in `src/hooks/useLists.ts`

**5 Templates:**
| Template | Stages |
|---|---|
| 💰 Fundraising | Research → Intro → First call → Diligence → Committed → Passed |
| 👥 Hiring Pipeline | Sourced → Screening → Onsite → Offer → Hired → Lost |
| 🤝 Client Pipeline | Discovery → Proposal → Negotiating → Won → Lost |
| 🎓 Advisory Candidates | Approached → Aligned → Signed → Active → Paused |
| ⭐ 2026 Deep Relationships | Re-engage → Active Nurture → Consistent |

**Screens:**
- `/lists` (`Lists.tsx`) — index + template cards + "Add from template" for unused templates
- `/lists/:id` (`ListDetail.tsx`) — **kanban view** with HTML5 drag-and-drop between stages, inline contact search modal for add

**Modal:**
- `ListEditorModal.tsx` — full CRUD for lists with reorderable stages, 8 colors, emoji icon

**Drawer integration:**
- `ContactListMemberships.tsx` — shows lists this person is in + stage dropdown + inline add
- Integrated in `ContactDetailDrawer.tsx` as section "Active in lists"

**Sidebar nav:**
- New "All Lists" entry under the Lists section in `AppShell.tsx`

### Fase 6 — Key Facts

**Data:** `useContactFacts` hook in `src/hooks/useContactFacts.ts`

**11 categories with emojis:**
| Category | Emoji | Use for |
|---|---|---|
| family | 👨‍👩‍👧 | Spouse, kids, parents, siblings |
| career_intel | 💼 | Career goals, frictions, what they want next |
| compensation | 💰 | Comp, equity, package details |
| obsession | 🔥 | What lights them up |
| hot_button | ⚡ | Topics they love to talk about |
| life_phase | 🌊 | Baby coming, moving, sabbatical |
| pet_peeve | 🚫 | Things they hate — avoid! |
| origin_story | 🎬 | Where/how you met |
| health | 🏥 | Relevant health context |
| preference | ✨ | Favorite food, venue, style |
| other | 📝 | Catch-all |

**UI:** `ContactFacts.tsx` in drawer
- Grouped display by category
- 1-3 star importance with yellow star icons
- `expires_at` date with countdown badge (red if <30d)
- Add/edit modal with category chip grid + importance selector
- Inline edit/delete per row on hover

### Fase 7 — Candor value type
- `ValueLogType` extended with `'candor'`
- `PersonDetail.tsx` VALUE_TYPE_LABELS includes "Candor (they shared)"
- VALUE_TYPE_EMOJIS map with 🔓 for candor + emojis for all other types
- Candor entries render with pastel background + emoji badge
- Dropdown auto-picks up via `Object.entries()`

---

## Files inventory

### New files in Sprint 1 (v0.1.123)
- `supabase/migrations/0001_relationship_architecture.sql`
- `supabase/migrations/0002_connection_strength_engine.sql`
- `src/lib/connectionStrength.ts`
- `src/screens/PeopleClassify.tsx`

### New files in Sprint 2 (v0.1.124)
- `src/hooks/useLists.ts`
- `src/hooks/useContactFacts.ts`
- `src/screens/Lists.tsx`
- `src/screens/ListDetail.tsx`
- `src/components/ListEditorModal.tsx`
- `src/components/ContactListMemberships.tsx`
- `src/components/ContactFacts.tsx`

### Modified files
- `src/types/index.ts` — added `RelationshipDomain`, `PersonalTier`, `ConnectionStrengthBucket`, `List`, `ListStage`, `ListMembership`, `ContactFact`, `ContactCadence`, `TierCadenceConfig`; extended `Contact`, `Profile`, `ValueLogType`
- `src/App.tsx` — routes for `/people/classify`, `/lists`, `/lists/:id`
- `src/screens/People.tsx` — "Classify" link in header
- `src/screens/PersonDetail.tsx` — candor in value_log dropdown + highlighting
- `src/components/SettingsModal.tsx` — "Relationship Cadence" section + `CadenceSection` subcomponent
- `src/components/ContactDetailDrawer.tsx` — custom cadence override + `<ContactListMemberships>` + `<ContactFacts>` sections
- `src/components/layout/AppShell.tsx` — "All Lists" nav item
- `src-tauri/tauri.conf.json` — version bumps

---

## Pending work — Sprints 3-4

### Fase 8 — Person-detail UI redesign reThink (BIG — 2-3 days)

Rebuild `ContactDetailDrawer.tsx` with 7 Jacob zones:

1. **Identity strip** — photo, name, pronouns, tier pill (or personal_tier), domain badge, channel icons
2. **Relational Pulse** — days since last conversation (BIG number), cadence bar, Connection Strength bar, **recommended action** from Tier×Strength matrix
3. **Next Step** — single field with owner + date, big empty state if missing
4. **Their World** — Key Facts (structured) + Milestones (time-bound) + "Shared with me (candor)" derived card + personal mnemonics
5. **Value Ledger** — 2 cols: given vs received with reciprocity indicator
6. **Daisy Chain** — upstream introducer (with "Thank X" action), downstream intros I've made, asks for future intros
7. **Cross-channel events** (Timeline) — collapsed by default, non-chat events only

Conditional rendering:
- `domain=professional` → all 7 zones
- `domain=personal` → hide Zone 6 (Daisy Chain), soften Zone 2 (no ACT NOW), Zone 5 becomes "Shared memories"
- `domain=mixed` → all 7 zones

Feature flag toggle: `profiles.feature_flags.new_person_drawer` for side-by-side rollout.

### Fase 9 — Person-detail UI redesign Conversations (2 days)

Same 7 zones in sidebar (~360px wide):
- Zones 1-3 visible without scroll
- Zones 4-7 collapsed below
- Zone 7 = cross-channel events ONLY (WhatsApp chat is visible on the right, don't duplicate)

In-chat affordances (new):
- Button **"Log this conversation"** — reads last N messages from WA DOM, pre-fills interaction + extracts next_step
- Button **"+ Capture fact"** with ⌘F shortcut
- Discreet counter "Last 10 msgs: 8 yours / 2 theirs" — Jacob monologue warning

### Fase 10 — Message persistence validation (0 days, already exists)

Verify from audit:
- `messages` table in Conversations SQLite exists with `id, chat_phone, chat_kind, wa_data_id, direction, sender_phone, sender_lid, sender_name, text, timestamp_ms, session_id`
- `sessions` already groups 6h windows with `summary` from Gemini
- `sync_queue` handles async Supabase writes

No new tables needed. Just validate flow is healthy.

### Fase 11 — Daily digest + AI extraction (1.5-2 days, Gemini)

Pipeline:
1. On Conversations app open → query `messages WHERE captured_at > last_digest_run`
2. Group by chat_id → for each active chat, pack into Gemini context
3. Gemini prompt extracts: summary + candor + facts + commitments + next_step suggestion
4. Output → `pending_extractions` table (local SQLite)
5. UI "Morning digest" panel — approve/reject/edit each extraction
6. Approved → write to Supabase: `interactions`, `value_logs (type=candor)`, `contact_facts`

Cost control:
- Only chats with ≥5 new messages
- Only contacts with `domain IN ('professional','mixed')`
- Dedup by message hash
- Rate-limited edge function

Gemini setup in repos (confirmed by audit):
- Conversations: `/electron/ai/gemini.ts` → `summarizeSession(text) → string`
  - Model: `gemini-2.0-flash`
  - Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`
  - Env: `VITE_GEMINI_API_KEY`
  - 30s timeout via AbortController, 10k char truncate
- reThink: `/src/hooks/useGeminiScorer.ts` — JSON mode, no timeout (**TODO:** add timeout when we touch it)

### Fase 12 — Weekly KPI filter (3-4 hours)

Change: conversations-per-week KPI filters by `domain IN ('professional','mixed')`.

Files:
- `src/components/WeeklyPulse.tsx`
- `src/screens/WeeklyReview.tsx`
- Any `WeeklyKpi` calculations

Plus: optional "Personal connections pulse" section (soft cadence for family/close friends — no alerts).

### Fase 13 — Daisy chain visualization (1 day)

Component `DaisyChainView.tsx`:
- Upstream chain (Laura → Carla → this person) via `referred_by` recursion
- Downstream list (people I've introduced TO this person)
- "Thank upstream" action with pre-filled message
- "Ask for intro" action template
- (Future v2) Mutual connections from LinkedIn scrape

---

## Open questions for user (before Sprint 3)

These came up but weren't decided. User validation will inform Fase 8.

1. **Connection Strength buckets** — current fixed thresholds (0.5 / 2.0 / 5.0 / 10.0). After living with real data a week, should they be percentile-based?
2. **Key Facts categories** — are 11 too many? Too few? Any missing that came up naturally?
3. **List templates** — are the 5 templates right? Missing obvious ones? Any should be removed?
4. **Cadence defaults** — 30/90/365 days for T1/T2/T3. Real-world usage may point to different defaults.
5. **Personal contacts in facts/candor** — should candor work for personal too (family disclosures)? Currently no restriction.
6. **Recommended action matrix edge cases** — any "ACT NOW" fires that feel wrong? Any "Healthy" that should be warnings?
7. **Status field decommission** — when can we actually DROP `outreach_logs.status`? Depends on no code reading it. Audit needed before Fase 8.

---

## How to continue (for future Claude instances)

1. **Read this file first** to understand state
2. **Check current versions:** `grep version src-tauri/tauri.conf.json`
3. **Check what user feedback surfaced** from the validation pause (ask them)
4. **Recent Supabase migrations:** `ls supabase/migrations/` — next should be `0003_*`
5. **Live migrations in DB:** `SELECT * FROM supabase_migrations.schema_migrations` via MCP
6. **Key types:** `src/types/index.ts` v3 section starts at `// ─── v3: Relationship Architecture ───`
7. **Connection Strength helpers:** `src/lib/connectionStrength.ts` — use `strengthVsTier()` everywhere for action-oriented UI
8. **Feature flag pattern:** check `profile.feature_flags[flagName] === true` before rendering new UI
9. **Release ritual:** bump `src-tauri/tauri.conf.json`, commit, tag `v0.1.XXX`, push main + tag → GH Actions builds automatically
10. **Next big work:** Fase 8 is the ContactDetailDrawer rebuild. Start with the Identity + Pulse zones (biggest UX lift, smallest blast radius).

---

## Supabase project

- **Name:** reThink 2026
- **Project ID:** `amvezbymrnvrwcypivkf`
- **URL:** `https://db.amvezbymrnvrwcypivkf.supabase.co`
- **Region:** us-east-1
- **pg version:** 17.6.1.063

---

## Conversations app

- **Path:** `~/Documents/Conversations`
- **Current release:** v0.0.26
- **Stack:** Electron + React + better-sqlite3
- **Schema:** `electron/db/schema.sql` — has `messages`, `sessions` (with Gemini summary), `sync_queue`, `meta`
- **Gemini integration:** `electron/ai/gemini.ts::summarizeSession`
- **Key IPC:** `backfill:scan-with-scroll`, `wa:navigate-to-dm`, `li:navigate`
- **Unchanged in this work** — Sprints 1-2 were reThink-only. Sprint 3 (Fase 9+11) will touch Conversations.
