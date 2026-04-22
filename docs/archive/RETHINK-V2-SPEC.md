# reThink v2 — Complete Product Spec

**Date:** April 6, 2026
**Status:** Strategic design — pre-implementation

---

## Vision

reThink is Alexis's personal operating system. You open it every morning. It asks you one question: "What matters today?" Then it shows you three numbers, your tasks, and your habits. That's your day.

When you want to network, you open NetworkHub — a dedicated workspace for WhatsApp, LinkedIn, and Exit5. Everything you do there flows back to reThink automatically.

When you need to prepare for a meeting, pitch, or interview, you open your Playbook — your stories, your positioning, your value proposition. Always current. Always exportable.

---

## The Three Goals

Everything in reThink serves exactly three life goals:

| Goal | KPI | How It's Fed |
|---|---|---|
| Learn English | Hours of English practice per week | Manual log + auto-feed from "Jacob" app |
| Revenue & Network | Conversations per week | Manual log from Today + auto-log from NetworkHub interactions |
| Be the best father for Domingo | Habits | Simple daily habit checkboxes (no KPI — this is about presence, not metrics) |

---

## Architecture: Two Apps + One API Integration

### App 1: reThink (daily cockpit)

**Global Navigation: Left Sidebar (Attio-style)**
All screens share a persistent left sidebar (~200px) as the single navigation system. No top-level tabs or nav bars — the sidebar IS the navigation for the entire app.

```
[reThink Logo]  reThink 2026
─────────────────────────────
⌘K  Quick actions       🔍
─────────────────────────────
◎  Today                    ← daily cockpit
📋  Playbook                 ← personal branding

▽  CRM                    ⚙
     👤  People              (green icon)
     🏢  Companies           (blue icon)
     🎯  Opportunities       (orange icon)

▽  Lists
     ⭐  Board of Directors
     🔥  Active Pipeline
     [+ Create list]

📊  Plan                     ← weekly/monthly strategy
─────────────────────────────
⚙  Settings
```

Rules:
- Sidebar is always visible on desktop but **collapsible to icon-only mode** (~48px) via a toggle button or keyboard shortcut (⌘\). Collapsed mode shows only the icons — hover to reveal tooltips with label names. Click the toggle again (or ⌘\) to expand back to full ~200px with labels.
- Clicking any item loads its content in the main area to the right
- CRM section is collapsible (mirrors Attio's "Records" pattern)
- Lists section is collapsible (mirrors Attio's "Lists" pattern)
- Active item gets highlighted background
- Each CRM object has a colored square icon (People=green, Companies=blue, Opportunities=orange)
- Collapsed state persists across sessions (saved in user preferences)
- See `UI-REFERENCE-ATTIO.md` for full design specs

**Screens:**
- **Today** — daily execution
- **People** — CRM with companies, opportunities, and value tracking
- **Plan** — weekly/monthly strategy view
- **Playbook** — personal stories, positioning, and exportable profile

### App 2: NetworkHub (networking workspace)
- WhatsApp Web (webview)
- LinkedIn (webview)
- Exit5 community (webview)
- Built-in contact capture (replaces Chrome extension)
- Keyboard navigation between the three tabs

### API Integration: Jacob English App
- Jacob app sends session data (minutes practiced, date) to reThink via Supabase
- Auto-feeds the English KPI without manual logging

Both apps share the same Supabase backend. NetworkHub writes to `outreach_logs`, `interactions`, and `weekly_kpis`. reThink reads and displays everything.

---

## Screen 1: TODAY

The daily cockpit. Opens every morning. 70% left panel, 30% collapsible right sidebar.

### Left Panel

**A. Daily Prompt**
"What's your One Thing today?" — a single text field at the top. Same as current F02.

**B. My Three Goals This Week**
Always visible, always at the top. Three cards, one per goal:

```
🗣 Revenue & Network          🇬🇧 English               👶 Domingo
   4 / 6 conversations           3h 20m / 5h              ████████░░ 80%
   ████████░░░░                   ██████░░░░               (habits adherence)
   this week                      this week                 this week
```

The first two are clickable to log entries:
- **Conversations:** "Who did you talk to?" → name (auto-suggests from People) + quick note + optional opportunity link. Creates an interaction in People automatically.
- **English:** "What did you practice?" → type (reading / AI conversation / podcast / real conversation / other) + minutes. Also auto-fed by Jacob app.
- **Domingo:** Not clickable. Shows aggregate of Domingo-tagged habits for the week.

**C. Today's Todos**
Simple task list. Each todo has: text, checkbox, optional goal link, optional milestone parent.

Milestones appear as expandable todo groups:
```
▸ Get Domingo's Chilean citizenship (3/7 done)    — Goal: Best Dad
    ☑ Get birth certificate apostilled
    ☑ Schedule consulate appointment
    ☐ Gather required documents
    ☐ Submit application
    ...
```

Milestones are just todos with children. No separate PENDING/COMPLETE system. When all children are done, the milestone is done.

**D. Habits**
Daily checkboxes. Each habit is tagged to a goal (English, Revenue, Domingo, or General).
Binary: did it / didn't. Streak count visible. No grades, no momentum scores.

Examples:
- 🇬🇧 Read 10 pages in English (streak: 23 days)
- 👶 Quality time with Domingo (streak: 45 days)
- 🏋️ Exercise (streak: 12 days)
- 📓 Journal (streak: 8 days)

**Suggested default habits** (from Session 1 Further Reading — Five Micro-Habits of Career Masters):
- 🗣 Nurture 1 high-value relationship today (maps to Conversations KPI)
- 🔍 20 min opportunity mapping (leadership changes, funding rounds, pivots)
- 📝 Log today's wins with metrics (weekly wins journal)
- 🇬🇧 Read 10 pages in English
- 👶 Quality time with Domingo
- 🏋️ Exercise
These are suggestions during onboarding — user can customize freely.

### Right Sidebar (collapsible, 30%)

**PULSE section:**
- Energy slider (1-10)
- Quick summary: habits done today, todos completed, conversations logged

**JOURNAL section:**
- Free-form daily notes (simplified F06)

**NEXT STEPS section:**
- Pending next steps from recent interactions where `next_step_owner = 'me'` and `next_step_date` is today or overdue
- Shows: person name + next step text + how many days ago the conversation was
- Quick action: mark done (creates a new interaction) or snooze

**WRAP UP section (end of day):**
- "How was today?" — energy + reflection
- "Tomorrow's focus" — text field
- "Complete Day" button — saves review, triggers end-of-day summary

---

## Screen 2: PEOPLE

Your relationship engine. This is where Jacob Warwick's networking philosophy lives in software.

### Design Philosophy
Attio-inspired: compact table view, small text, dense information, drag-and-drop funnel columns. Not a card-heavy dashboard — a working CRM table.

**UI Reference:** See `UI-REFERENCE-ATTIO.md` for detailed screenshots and design specifications captured from Attio's actual interface. The People CRM should closely replicate Attio's UI/UX patterns — including **left sidebar navigation** (collapsible Records + Lists sections), **table view** (compact rows, sortable columns, filter pills, calculations footer), **detail view** (Highlights cards grid + Activity feed + right sidebar with Record Details/Lists/Contract sections), and **kanban/board view** (pipeline columns with draggable cards) — all adapted to reThink's existing fonts, colors, and terminology.

### Three Objects

**People** (existing `outreach_logs` table, extended)
- Name, photo, job title, company (linked)
- Last interaction date + type
- Health score (decays over time)
- **Tier** (Airport Test, Session 4): 1 = "would pick me up at the airport" / 2 = shared identity (former colleagues, same school/company) / 3 = loose connections. Determines outreach priority and daisy chain starting points.
- **Referred by** — who introduced this contact (links to another person). Tracks the daisy chain so you can thank every person in the referral chain.
- What they're interested in / what they're looking for (text field)
- What value I've given them (structured log — see Value Tracking below)
- Personal context (never overwritten by AI)
- Tags: champion, mentor, peer, client, prospect, **board_of_directors**, etc.
- **Advisory role** (if board_of_directors tag): industry insider / negotiation expert / brand advisor / emotional support / accountability partner / peer perspective. From Session 2 Further Reading — your Career Board of Directors.
- Birthday (for proactive reminders)

**Companies** (new table)
- Name, domain, sector, size, notes
- Linked people (count visible: "3 contacts at Airbnb")
- Linked opportunities
- Key insight: what problem does this company have that I could solve?

**Opportunities** (new table)
- Title: "VP Marketing at Airbnb" or "Consulting project: Rappi growth"
- Type: job / consulting / business / partnership / other
- Stage: exploring → active → negotiating → won → lost
- Company (linked)
- People involved (linked — these are your "champions" per Jacob Session 6)
- Estimated value
- Target date
- Notes / next steps
- **Decision Filter check** — does this opportunity pass your non-negotiables? (see Playbook > My Boundaries)

**Stage-Specific Sections (expand when relevant):**

When stage = **active** → show **Interview Prep**:
- CLOSER Framework prep: Clarify questions, Label statement, Overview questions, "Sell the Vacation" scenarios, Explain objections, Reinforce messages (Session 6)
- Interview Map (Running the Gauntlet, Session 6): all interviewers mapped with name, role, likely priorities, what they want to hear, who to ask for coaching, continuity references between conversations
- Research Brief: one-page prep with earnings call insights, LinkedIn profiles of interviewers, industry trends, recent news → 3-5 specific things to reference (Session 6, Assignment 8)

When stage = **negotiating** → show **Negotiation Prep**:
- GAINS Framework (Session 7 + Lenny Newsletter): Goals (primary/secondary/non-negotiables), Alternatives (your BATNA), Interests (what the company needs), Numbers (target range/floor/flexibility), Strategy (positioning/timing/response scripts)
- Three Pillars Map (Session 7): Information (what to discover vs. hold/release), Timing (milestones, pace control), Power (differentiation, scarcity signals, momentum)
- Alternatives Mapping (Session 8): list the employer's alternatives to hiring you + why they rejected each → your positioning statement
- Compensation Levers checklist: base, signing bonus, retention bonus, equity, performance milestones, title/reporting, flexibility, dev budget, accelerated review, severance (Session 8)
- Severance Prep: research norms, preferred structure, opening line, alternative framing (Session 8, Exercise 8)

### Views

**Default: Table View**
Compact rows with columns: Name | Company | Role | Last Contact | Health | Tags | Value Given
Sortable, filterable. Click a row to open the detail drawer.

**Funnel View**
Kanban-style columns by relationship stage: Prospect → Intro → Connected → Engaged → Nurturing → Dormant
Drag-and-drop between columns. Shows photo + name + company + days since last contact.

**Company View**
Group by company. Expand to see all contacts + opportunities at that company. Shows "allies count" per company — exactly what Jacob describes when talking about Running the Gauntlet.

**Opportunities View**
Pipeline by stage. Shows deal value, people involved, company, next step. This is your career/business pipeline.

### Value Tracking (core feature — Jacob Session 4)

Jacob's principle: "Always generate value before asking for anything. Give more than you expect to receive."

Every person has a "Value Log" — a simple list of value you've provided:
```
Mar 15 — Introduced to María (Airbnb PM) [introduction]
Mar 20 — Shared article on LATAM growth strategy [content]
Apr 1  — Referred their company for a speaking opportunity [referral]
Apr 5  — Gave feedback on their pitch deck [advice]
```

Value types: introduction, content, referral, advice, endorsement, opportunity, other.

The detail drawer shows this prominently — you can always see at a glance: "I've given this person 4 things. They've given me 1. The balance is healthy per Jacob's reciprocity principle."

### AI-Powered Value Suggestions

Using the person's profile (interests, what they're looking for) + your profile (skills, network, knowledge) + your other contacts, AI suggests:

"María is looking for LATAM market insights. You know Carlos at MercadoLibre who published a report on this last month. Consider making an introduction."

"Juan mentioned he's hiring a designer. You know 3 designers in your network. Consider referring them."

This is the "connect the dots" feature. It runs periodically (weekly?) or on-demand when you open a contact. Uses the AI enrichment infrastructure you already have (Gemini/Claude).

### Proactive Reminders (surfaces on Today screen)

"People to reconnect this week" widget — shows on Today sidebar or as a notification:
- Contacts whose health score dropped below threshold
- Birthdays this week
- Contacts you tagged "follow up in X weeks" and the time is up
- Opportunities with upcoming deadlines

This directly implements Jacob's closing advice: "Set a cadence. Every four months check in. Stay top of mind always."

---

## Screen 3: PLAN

Your weekly/monthly strategy view. Visited on Sunday to plan the week, and monthly to review progress.

### Weekly View (default)

**Goals** — your three goals with status emoji and one-line description

**KPI Trends** — last 8 weeks, simple bar charts for Conversations and English hours. Visual: are you trending up or down?

**Active Milestones** — milestones with upcoming deadlines, progress (3/7 todos done), linked goal

**This Week's Todos** — pre-populated from milestone todos + anything you add. This is where you set your week.

**Opportunities Pipeline** — active opportunities with next steps and deadlines

### Monthly View

Habit streaks overview — which habits have the longest streaks, any that need attention.

Monthly KPI summary — conversations total, English hours total, habits adherence percentage per goal.

Simple reflection: "What went well? What needs to change?" — one text area, saved to history.

No grades. No friction logs. No 5-step wizards. Just: look at the numbers, write a thought, plan the next month.

---

## Screen 4: PLAYBOOK

Your personal positioning toolkit. Jacob's course Sessions 1-3 and 5-6 live here.

### What It Contains

**My Story** — your 90-second pitch (Session 5), updated periodically:
"I am [role], best known for [achievement]. You're likely interested in me because [connection to needs]."
Includes 3 versions: for CEO/hiring manager, for recruiter, for networking contact (Session 2, Assignment 2).
Also includes outbound variant: "Other people typically want to talk to me for [X, Y, Z]. I suspect I can help you with [specific outcome]."

**Story Bank** — organized collection of your stories using:
- **CAR framework** (Context → Action → Result) — for resume bullets and quick stories
- **ICARQ framework** (Impression → Context → Action → Result → Question) — for interviews where the Q shifts conversation forward (Session 1 Further Reading)
- **Disney framework** (Context → Conflict → Turning Point → Transformation) — for deep narrative stories
- **CLEAR framework** (Context → Leadership → Execution → Achievement → Reflection) — for executive-level stories (Session 6)

Story categories:
- Leadership transformation stories
- Growth/scaling achievement stories
- Relationship/influence stories
- Overcoming failure/conflict stories
- Innovation/strategic thinking stories
- Revenue/impact stories

Each story tagged by situation type: job interview, sales pitch, networking intro, keynote, investor meeting.

**Objection Bank** (Session 2, Assignment 3) — proactive narratives for background concerns:
- 3-5 concerns a hiring manager might have about your background (industry change, company size transition, gaps, etc.)
- For each: a proactive narrative that addresses it before they ask
- Example: "Can they handle enterprise bureaucracy?" → "I've built scrappy operations at scale..."

**Value Proposition** — from Session 3's Executive Value Pyramid:
- Table Stakes (what's expected)
- Operational Excellence (what you do well)
- Strategic Impact (what makes you valuable)
- X Factors (what makes you unique)

**Key Positioning** — from the Farnam Street workbook (already in your database as workbook_entries):
- Mission statement
- Core values
- Brand promise
- Critical Three strengths

**Skills & Expertise** — structured list of what you know, what you can offer, what problems you solve. This feeds the AI value suggestion engine in People.

**Value Bank** (Session 4, Assignment 3) — pre-prepared assets for networking:
- **Introductions I can make** — 10+ people you could introduce to others
- **Content/Resources** — bookmarked articles, podcasts, reports, tools relevant to your space
- **Insights** — 3-5 industry observations you have informed opinions about
- **Expertise offers** — specific things you can walk someone through ("I can show you how we scaled X at [company]")
The goal: never enter a conversation empty-handed. This feeds the AI value suggestion engine.

**Conversation Starters** (Session 4, Assignment 5) — ready-to-use outreach templates:
- Industry Trend Opener (for peers): "I've been following [trend] and suspect you have a hot take..."
- Career Journey Opener (for people who've made transitions you admire): "I'm about to follow your footsteps..."
- Value-Add Opener (universal): "I just came across [resource] that I know you'd find interesting..."
- Panel/Publication Opener (for thought leaders): "I'm putting together a piece on [topic]..."

**Audience Personas** (Session 2, Assignment 4) — profiles of decision-maker types you'll encounter:
- Title and role
- Top 3 business pressures
- What keeps them up at night
- What would make them look good to their boss/board
- What they worry about when hiring for your role
- How your value proposition addresses their concerns

**Negotiation Scripts** (Sessions 5, 7, 8):
- Compensation deflection scripts: The Deferral, The Confidence Play, The Redirect (Session 5, Assignment 5)
- EQ scenario responses: lowball, time pressure, guilt trip, emotion triggers, conflicting advice (Session 7, Exercise 6)
- Objection reframing scripts: "Can you help me understand why that's a hard constraint?" (Session 8, Exercise 5)
- Bidding war transparency script (Session 8, Exercise 6)
- Seed-planting for future renegotiation (Session 8, Exercise 12)

**My Boundaries** (Session 2 Further Reading + Session 8, Exercise 10):
- **Decision Filter** — 3-5 non-negotiable criteria defined BEFORE the search (e.g., "I need P&L ownership," "I need a CEO who keeps teams 3+ years"). Applied when evaluating any opportunity.
- **Integrity Boundaries** — companies/roles you will NOT accept and why, red flags that trigger walk-away regardless of compensation.
- **Career integrity statement** — 1-2 sentences on what your career represents.

### How It Works

You write this once. You update it every quarter (or when something meaningful changes). It's not a daily-use screen — it's a reference document that powers other features.

**Onboarding:** When the Playbook is first opened, suggest filling sections in order: My Story → Story Bank (at least 5 stories) → Value Proposition → Objection Bank → Value Bank → Conversation Starters. This mirrors the course progression (Sessions 2 → 3 → 4 → 5 → 6).

The key insight: this data makes the AI suggestions in People smarter. When the AI knows your skills, your stories, and your value proposition, it can better suggest "connect the dots" opportunities between your capabilities and your contacts' needs.

### Export

Everything in Playbook exports as structured Markdown. One click: generates a clean `.md` file with your complete profile — stories, positioning, skills, values. You can feed this to any LLM (ChatGPT, Claude, Gemini) as context for:
- Cover letter generation
- Interview prep
- Pitch deck personalization
- LinkedIn profile optimization
- Email drafting with your voice

The markdown format is deliberate — it's the universal LLM input format. Your personal playbook becomes a portable AI prompt.

---

## App 2: NetworkHub

A dedicated Tauri app for networking activity. Inherits and evolves the current Chrome extension's auto-logging and capture logic — cleaner UI/UX aligned with reThink v2's design language.

### Core Concept

Four webview panels: WhatsApp Web | LinkedIn | Exit5 | X (Twitter). Keyboard shortcuts to switch: ⌘1, ⌘2, ⌘3, ⌘4. No browser chrome, no other tabs, no distractions.

### Heritage from Chrome Extension

The current Chrome extension already does:
- Auto-logging of interactions when pages load
- Contact capture from LinkedIn profiles
- WhatsApp ↔ LinkedIn association (basic)
- Bulk capture of uncaptured conversations

NetworkHub inherits ALL of this logic. It is not a rewrite from scratch — it's a port of the extension's capture engine into a native Tauri frame, with a redesigned UI that matches reThink v2's aesthetic, and expanded to cover 4 channels instead of 2.

### Built-in Contact Capture (per channel)

- **LinkedIn:** sidebar panel showing "Add to reThink" with auto-captured profile data (name, title, company, photo, LinkedIn URL). Inherits current extension behavior.
- **WhatsApp:** "Log conversation" button + auto-detect active chats. Captures phone number + name. Inherits current extension's auto-log on page load + "capture uncaptured conversations" feature.
- **Exit5:** capture for community members (name, company, role, Exit5 profile URL).
- **X (Twitter):** capture from profile pages (handle, display name, bio). Log interactions from DMs or public conversations.

### Auto-Logging

Inherits and extends the Chrome extension's auto-log behavior:
1. Creates/updates the contact in `outreach_logs`
2. Creates an interaction in `interactions`
3. Increments the weekly conversation counter in `weekly_kpis`
4. **NEW:** Attempts to match the contact against existing records using the identity resolution system (see below)

Your KPI feeds itself through the tool you use to do the work. No manual counting.

### Multi-Channel Identity Resolution (critical)

**The problem:** One person can exist across all 4 channels. "Juan Pérez" on WhatsApp (+56 9 1234 5678), "Juan Perez" on LinkedIn (/in/juanperez), "@jperez" on X, and "Juan P." on Exit5. Without identity resolution, this is 4 contacts with fragmented interactions, broken value tracking, and inflated KPIs.

**The solution: `contact_channels` table + matching engine.**

Every contact (`outreach_logs`) is the single source of truth — one person, one record. Channels are linked via a separate `contact_channels` table:

```
Contact: Juan Pérez (outreach_logs.id = 42)
├── WhatsApp: +56 9 1234 5678
├── LinkedIn: /in/juanperez
├── X: @jperez
└── Exit5: juan-perez-exit5
```

**How matching works:**

When you capture a contact from any channel, the system:

1. **Exact match** — checks if this channel identifier (phone number, LinkedIn URL, X handle, Exit5 profile) already exists in `contact_channels`. If yes, link to existing contact.
2. **Fuzzy match** — if no exact match, compares name + company against existing contacts. If confidence is high (same name + same company), suggests a merge: "Is this the same Juan Pérez from WhatsApp?" One tap to confirm.
3. **Manual link** — from any contact's detail drawer, you can "Link channel" and search/paste the identifier from another platform. This is the escape hatch for edge cases.
4. **Bulk reconciliation** — a periodic scan (on-demand or weekly) that finds likely duplicates across channels and presents them for review. Inherits and improves the Chrome extension's existing association feature.

**UX in NetworkHub:**

When you're on LinkedIn looking at Juan's profile, the capture sidebar shows:
- "Juan Pérez — already in reThink via WhatsApp" (if matched)
- Last interaction across ALL channels, not just LinkedIn
- Value Pulse indicator (from the unified record)
- Quick action: "Log LinkedIn interaction" (adds to the same contact)

When you're on WhatsApp and open a chat, the sidebar shows the same unified view — including LinkedIn interactions, X interactions, everything. One person, one story, one Value Pulse.

**Why this matters for KPIs:** If you message Juan on WhatsApp on Monday and then have a LinkedIn conversation on Wednesday, that's 2 interactions with 1 person, not 2 separate contacts. Your conversations/week KPI counts unique people reached, not messages sent.

### Keyboard-First Design

- ⌘1/⌘2/⌘3/⌘4 — switch between WhatsApp, LinkedIn, Exit5, X
- ⌘N — new contact (opens capture modal with current channel pre-selected)
- ⌘L — log conversation (opens quick-log modal)
- ⌘M — merge/link contact (opens identity resolution for current profile)
- ⌘P — open reThink People in a side panel
- ⌘K — command palette (search contacts, log interaction, open reThink)

### Future: Kapso.ai Integration (optional)

If Alexis ever adopts a WhatsApp Business number, Kapso could add an automation layer: auto-send follow-ups when health scores drop, batch gratitude messages from daisy chain actions, AI-suggested responses based on Playbook data. This is NOT a dependency — NetworkHub works fully without it. Kapso is a potential accelerator for outbound messaging if the Business number constraint is resolved. Requires WhatsApp Business API (personal numbers not supported).

---

## Database Schema Changes

### Keep As-Is
- `profiles` (T01)
- `goals` (T04)
- `habits` (T06) + `habit_logs` (T07)
- `todos` (T08) — add `parent_todo_id` for milestone-as-todo hierarchy
- `reviews` (T09)
- `outreach_logs` (T18) — extend with new fields
- `interactions` (T19) — extend with value tracking

### New Tables

**`companies`**
- id, user_id, name, domain, sector, size, notes, logo_url, created_at

**`opportunities`**
- id, user_id, company_id, title, type (job/consulting/business/partnership/other), stage (exploring/active/negotiating/won/lost), estimated_value, target_date, notes, created_at
- `decision_filter_pass` (boolean, nullable — does this pass your non-negotiables?)
- `interview_prep` (jsonb, nullable — CLOSER framework prep, research brief)
- `interview_map` (jsonb, nullable — Running the Gauntlet: interviewers + per-person prep notes)
- `negotiation_prep` (jsonb, nullable — GAINS, Three Pillars, alternatives mapping, comp levers, severance)

**`contact_channels`** (multi-channel identity resolution)
- id, outreach_log_id (FK to outreach_logs), channel (whatsapp/linkedin/exit5/x), channel_identifier (phone number, profile URL, handle, etc.), channel_name (display name on that platform, may differ from primary name), verified (boolean — confirmed by user vs. auto-matched), created_at
- Unique constraint: (channel, channel_identifier) — one identifier can only belong to one contact
- This is the backbone of identity resolution. One outreach_log can have 1-4 channel records. All interactions, regardless of channel, roll up to the same contact.

**`opportunity_contacts`** (junction table)
- opportunity_id, outreach_log_id, role (champion/contact/decision_maker/blocker)

**`value_logs`**
- id, user_id, outreach_log_id, type (introduction/content/referral/advice/endorsement/opportunity/other), description, date, created_at

**`weekly_kpis`**
- id, user_id, week_start, conversations_count, english_minutes, created_at

**`english_sessions`**
- id, user_id, type (reading/ai_conversation/podcast/real_conversation/other), minutes, source (manual/jacob_app), date, created_at

**`playbook_entries`**
- id, user_id, type (pitch/story/value_prop/positioning/skill/objection/value_bank/template/persona/script/boundary), title, content (markdown), tags (jsonb), framework (text, nullable — car/icarq/disney/clear for stories), updated_at, created_at

### Extend Existing

**`outreach_logs`** — add:
- `company_id` (FK to companies)
- `birthday` (date)
- `interests` (text — what they're looking for)
- `looking_for` (text — what they need right now)
- `tier` (int, 1/2/3/null — Airport Test tier from Session 4)
- `referred_by` (FK to outreach_logs, nullable — who introduced this contact, for daisy chain tracking)
- `advisory_role` (text, nullable — if tagged board_of_directors: industry_insider / negotiation_expert / brand_advisor / emotional_support / accountability / peer_perspective)

**`todos`** — add:
- `parent_todo_id` (FK to todos, nullable — for milestone hierarchy)
- `is_milestone` (boolean, default false)

**`interactions`** — add:
- `opportunity_id` (FK to opportunities, nullable)
- `value_log_id` (FK to value_logs, nullable — if this interaction included giving value)
- `next_step` (text, nullable — what's the next action after this conversation?)
- `next_step_date` (date, nullable — when should the next step happen?)
- `next_step_owner` (enum: 'me' / 'them', nullable — who controls the next step?)
- `channel` (enum: 'whatsapp' / 'linkedin' / 'exit5' / 'x' / 'email' / 'call' / 'in_person' / 'other', nullable — which channel did this interaction happen on?)

### Archive (don't delete, stop using in UI)
- `workbooks` + `workbook_entries` (T02, T03) — data migrated to `playbook_entries`
- `milestones` (T05) — replaced by todos with `is_milestone = true`
- `leading_indicators` + `indicator_daily_logs` + `monthly_kpi_entries` (T10, T11, T12) — replaced by `weekly_kpis`
- `monthly_plans` (T13)
- `strategies` (T14)
- `friction_logs` (T15)
- `focus_sessions` (T16)
- `captures` (T17)

---

## Attio Sync Strategy

Attio becomes a silent backend sync. Not a daily tool.

**What syncs to Attio:**
- People → Attio People object
- Companies → Attio Companies object
- Interactions → Attio activity timeline
- Opportunity stage changes → Attio deal updates

**When it syncs:**
- On-demand: "Sync to Attio" button in Settings
- Optional: scheduled background sync (daily or weekly)
- NOT real-time — reThink is the source of truth

**Why keep Attio at all:**
- If Alexis ever works with a team, the CRM data is already there
- Attio has email integration, calendar sync, and other features that might be useful later
- It's insurance — all data is backed up in a professional CRM format
- Zero daily cost — you just don't open it

---

## Jacob App Integration

The "Jacob" English practice web app sends session data to reThink.

### Option A: Direct Supabase Write
Jacob app gets a Supabase client with limited permissions. After each session, it writes to `english_sessions`:
```
{ user_id, type: 'ai_conversation', minutes: 25, source: 'jacob_app', date: '2026-04-06' }
```

### Option B: Webhook
Jacob app posts to a Supabase Edge Function:
```
POST /english-session
{ api_key, minutes: 25, date: '2026-04-06' }
```

Either way, reThink's Today screen reads `english_sessions` for the current week and displays the total. Manual entries and Jacob entries both count.

---

## Implementation Roadmap

### Phase 1: Simplify Today (3-4 days)
- Remove: Pomodoro, momentum scores, milestones widget, monthly grades
- Add: Three-goal KPI widget at top
- Add: Conversation logging (quick modal)
- Add: English logging (quick modal)
- Add: `parent_todo_id` to todos for milestone hierarchy
- Keep: Habits, todos, journal, wrap-up flow

### Phase 2: Upgrade People (1-2 weeks)
- Add: `companies` table + Company cards
- Add: `opportunities` table + Pipeline view
- Add: `value_logs` table + Value tracking in contact drawer
- Add: Table view (Attio-inspired compact layout)
- Add: Company grouping view
- Add: "People to reconnect" widget on Today
- Extend: `outreach_logs` with interests, looking_for, birthday

### Phase 3: Build Plan screen (2-3 days)
- Replace Strategy + Monthly + Dashboard with single Plan screen
- Weekly view: goals + KPI trends + active milestones + opportunity pipeline
- Monthly view: habit overview + KPI summary + simple reflection

### Phase 4: Build Playbook (2-3 days)
- New screen with sections: Pitch, Stories, Value Prop, Positioning, Skills
- Markdown editor for each entry
- Export to .md button
- Migrate relevant workbook_entries data

### Phase 5: Build NetworkHub (2-3 weeks)
- New Tauri app with 4 webview panels (WhatsApp, LinkedIn, Exit5, X)
- Port Chrome extension capture engine — inherit auto-log, contact capture, uncaptured conversation detection
- Redesign capture UI to match reThink v2 aesthetic
- Keyboard navigation (⌘1/⌘2/⌘3/⌘4 + ⌘N/⌘L/⌘M/⌘P/⌘K)
- `contact_channels` table + identity resolution: exact match, fuzzy match, manual link, bulk reconciliation
- Unified sidebar showing cross-channel contact view with Value Pulse
- Auto-write to Supabase (outreach_logs + contact_channels + interactions + weekly_kpis)

### Phase 6: AI Value Engine (1 week)
- AI suggestions for value generation per contact
- Connect-the-dots between your Playbook skills + contact needs
- Proactive birthday/follow-up reminders
- Jacob app integration for English KPI auto-feed

### Phase 7: Attio Background Sync (2-3 days)
- One-way sync: reThink → Attio
- On-demand + optional scheduled
- Companies, People, Interactions, Opportunities

### Phase 8: Network Map & Value Pulse (future vision)

The networking philosophy is the heart of reThink. Phases 1-7 capture all the data. Phase 8 makes it *visible*.

**Network Map — new view in People (alongside Table, Funnel, Company, Opportunities)**

A force-directed graph (react-force-graph or D3.js) where Alexis is the center node and every contact is a connected node.

Visual encoding:
- **Node size** = tier. Tier 1 (airport pickups) are large anchor nodes. Tier 3 are small, peripheral. This instantly communicates where your network strength lives.
- **Edges** = `referred_by` links. These are the daisy chains — visible as lines connecting people. Click any chain path and the entire referral sequence lights up: María → Carlos → Juan → CEO. You see the story of how a relationship was born.
- **Node color** = health score. Green (active, recent interaction), yellow (cooling, 2-4 weeks), red (dormant, 30+ days). At a glance you see which parts of your network need attention.
- **Clusters** = contacts group naturally by company. You see "I have 4 people at Airbnb" as a visual cluster, not as a number in a table. This is Jacob's "allies inside a company" made tangible.

Interactions:
- **Click a chain** → highlights the full referral path + shows action: "Send gratitude to everyone in this chain." Generates draft messages for each person acknowledging their role: "Gracias por presentarme a X — esa conexión ya generó Y."
- **Click a node** → opens the contact detail drawer (same as Table view) with Value Log, AI suggestions, and next steps.
- **Hover a node** → tooltip with name, company, tier, last contact, value balance.
- **Filter by** → tier, company, tag, health status, "contacts I haven't given value to recently."

**Value Pulse — visual layer on every contact**

Every node in the Network Map (and every row in the Table View) carries a Value Pulse indicator — a small ring/arc around the contact that shows the reciprocity balance.

How it works:
- The ring fills clockwise as you give value (each value_log entry = one segment).
- Ring segments are color-coded by value type: blue = introduction, green = content, orange = referral, purple = advice, gold = endorsement.
- A full, bright ring = well-nourished relationship. An empty or dim ring = you haven't given value recently.
- No numbers displayed — the visualization IS the metric. You look at your network and instantly feel: "this person needs attention" or "this relationship is thriving."

In Table View, the Value Pulse appears as a compact circular indicator in a column — dense, Attio-style, but carrying emotional weight.

**Chain Actions (batch operations from Network Map):**
- **"Thank the Chain"** — select a daisy chain path → generates personalized gratitude messages for every person in the referral sequence. One tap, multiple messages queued.
- **"Nurture the Dormant"** — filter to red (dormant) nodes → AI suggests a reason to reach out to each one based on their interests + your Value Bank. Batch-generate outreach drafts.
- **"Value Sweep"** — shows all contacts with empty Value Pulse rings → AI cross-references their needs with your skills/network/Value Bank and suggests specific value you could give each one.

**Design principles:**
- No gamification. No points, no badges, no leaderboards. The visualization communicates health and reciprocity, not competition.
- Organic feel. The graph should feel like a living network, not a corporate org chart. Nodes breathe (subtle animation on health transitions). Chains glow when activated. The whole thing should feel like looking at something alive.
- Progressive disclosure. Network Map starts zoomed out (see the whole picture). Zoom in to see detail. Click to act. Never overwhelming.

**Technical notes:**
- All data already exists after Phases 1-6: `referred_by`, `tier`, `value_logs`, health scores, `interactions`. Phase 8 is purely a presentation layer.
- Library candidates: `react-force-graph` (3D optional), `d3-force`, or `sigma.js`. All work within Tauri/React.
- Performance: for <500 contacts (realistic for personal CRM), any of these libraries handle it smoothly.

---

## The New reThink Objective

**Old:** "Run your year like a CEO runs a company."

**New:** "Know your people. Know your stories. Do the work."

---

## Appendix: Full Course-to-Feature Audit

Every session and workbook exercise from Jacob Warwick's PACE® course has been reviewed against this spec. Here's the complete mapping:

### Session 1 — Understanding the Market
| Content | reThink Location | Status |
|---|---|---|
| PACE® framework overview | Playbook > Key Positioning | ✅ |
| "Own your narrative" / consultant mindset | Playbook > My Story + Conversation Starters | ✅ |
| Five micro-habits of career masters | Habits > suggested defaults | ✅ NEW |
| Career red flags (echo chamber, expertise illusion, etc.) | Reference material — not daily feature | N/A |
| Strategic Executive Blackout concept | Reference material — not daily feature | N/A |
| ICARQ interview framework | Playbook > Story Bank frameworks | ✅ NEW |
| "One KPI: conversations/week" | Today > KPI widget | ✅ |

### Session 2 — Master Your Mind
| Content | reThink Location | Status |
|---|---|---|
| Define Value Proposition (top 3-5 achievements) | Playbook > Value Proposition | ✅ |
| Build 90-Second Pitch (3 versions) | Playbook > My Story | ✅ |
| Anticipate Objections (3-5 concerns + narratives) | Playbook > Objection Bank | ✅ NEW |
| Target Audience Persona | Playbook > Audience Personas | ✅ NEW |
| Research Target Companies | People > Companies | ✅ |
| Career Board of Directors | People > board_of_directors tag | ✅ NEW |
| Decision Filter (non-negotiable criteria) | Playbook > My Boundaries | ✅ NEW |
| Identity fusion / complex self-concept | Reference material — not daily feature | N/A |
| Vulnerability Spectrum / strategic transparency | Reference material for stories | N/A |

### Session 3 — Optimizing LinkedIn and Résumés
| Content | reThink Location | Status |
|---|---|---|
| LinkedIn Profile Audit checklist | Playbook > Key Positioning (informs it) | ✅ |
| CAR framework for résumé bullets | Playbook > Story Bank (CAR framework) | ✅ |
| Résumé structure (10-point template) | Playbook > export as markdown → LLM use | ✅ |
| LinkedIn Engagement Strategy | Habits > daily LinkedIn habit | ✅ |
| Recommendations as Market Research | Reference material | N/A |
| Reputation Architecture concept | Playbook > Value Proposition feeds this | ✅ |
| "Only What You Want More Of" filter | Playbook > My Boundaries | ✅ |

### Session 4 — Networking That Drives Results
| Content | reThink Location | Status |
|---|---|---|
| Airport Test (tier-1/2/3 classification) | People > tier field | ✅ NEW |
| Conversations/week KPI | Today > KPI widget | ✅ |
| Value Bank (introductions, content, insights, offers) | Playbook > Value Bank | ✅ NEW |
| Real-time introductions practice | People > Value Tracking (introduction type) | ✅ |
| Conversation Starters (4 opener types) | Playbook > Conversation Starters | ✅ NEW |
| Daisy Chain Ask + tracking | People > referred_by field | ✅ NEW |
| Champion Attribution | People > tags (champion) + Value Tracking | ✅ |
| Two-Thirds Rule | Reference material — behavioral, not feature | N/A |
| Reciprocity imbalance | People > Value Tracking shows balance | ✅ |

### Session 5 — Answering the Big 4 Interview Questions
| Content | reThink Location | Status |
|---|---|---|
| 30-Second "Tell Me About Yourself" | Playbook > My Story | ✅ |
| "Why Did You Leave?" (2 versions) | Playbook > Story Bank (tagged) | ✅ |
| "What's Next for You?" ambition statement | Playbook > My Story | ✅ |
| Combined 30-60 second answer | Playbook > My Story | ✅ |
| Compensation Deflection Scripts (3 scripts) | Playbook > Negotiation Scripts | ✅ NEW |
| Story Arsenal — CLEAR Framework (5-7 stories) | Playbook > Story Bank (CLEAR framework) | ✅ |
| Table of Contents Strategy | Playbook > My Story (design principle) | ✅ |

### Session 6 — Executive Interviews: Strategy and Storytelling
| Content | reThink Location | Status |
|---|---|---|
| Consultant Mindset (diagnostic questions) | Playbook > Conversation Starters | ✅ |
| Story Arsenal (4 core stories) | Playbook > Story Bank | ✅ |
| CLOSER Framework mapped to opportunity | Opportunities > Interview Prep (when active) | ✅ NEW |
| Running the Gauntlet (champion mapping) | Opportunities > Interview Map | ✅ NEW |
| 30-Minute Interview Script | Playbook > Negotiation Scripts | ✅ |
| Internal Champions Strategy map | Opportunities > Interview Map | ✅ NEW |
| "Why You Left" narrative framework | Playbook > Story Bank | ✅ |
| Pre-Interview Research Deep Dive | Opportunities > Research Brief | ✅ NEW |
| "Control next steps" principle | interactions > next_step fields | ✅ NEW |

### Session 7 — Negotiation Strategy
| Content | reThink Location | Status |
|---|---|---|
| Identify Negotiation Mistakes | Reference material | N/A |
| Personal Board of Advisors | People > board_of_directors tag | ✅ NEW |
| Partnership Mindset practice | Reference material | N/A |
| Information/Timing/Power map | Opportunities > Negotiation Prep (Three Pillars) | ✅ NEW |
| GAINS Framework | Opportunities > Negotiation Prep (GAINS) | ✅ NEW |
| EQ Scenarios (5 scenarios) | Playbook > Negotiation Scripts | ✅ NEW |
| Silence as tactic | Reference material | N/A |

### Session 8 — Negotiation Techniques
| Content | reThink Location | Status |
|---|---|---|
| Alternatives Mapping | Opportunities > Negotiation Prep | ✅ NEW |
| Compensation Deflection personalization | Playbook > Negotiation Scripts | ✅ NEW |
| Compensation Levers checklist | Opportunities > Negotiation Prep | ✅ NEW |
| Milestone Payment Design | Opportunities > Negotiation Prep | ✅ |
| Objection Reframing scripts | Playbook > Negotiation Scripts | ✅ NEW |
| Bidding War Transparency script | Playbook > Negotiation Scripts | ✅ NEW |
| "What Happened?" approach | Playbook > Negotiation Scripts | ✅ |
| Severance Assumption Checklist | Opportunities > Negotiation Prep | ✅ NEW |
| Walk-Away Confidence Assessment | Reference material | N/A |
| Integrity Boundaries | Playbook > My Boundaries | ✅ NEW |
| Negotiation Timeline planning | Opportunities > Negotiation Prep | ✅ |
| Seed Planting for future renegotiation | Playbook > Negotiation Scripts | ✅ NEW |

### Bonus Content
| Content | reThink Location | Status |
|---|---|---|
| "Always be looking for work" (Closing) | Conversations KPI — maintains pipeline always | ✅ |
| "Set a cadence — every 4 months" (Closing) | People > health score decay + reminders | ✅ |
| "Use a spreadsheet or CRM" (Closing) | People screen + Attio sync | ✅ |
| GAINS Framework (Lenny Newsletter) | Opportunities > Negotiation Prep | ✅ |
| Lenny Podcast case studies | Reference material | N/A |

### Summary
- **Total course elements mapped:** 80+
- **Already in original spec:** ~25
- **Added in this audit:** 22 new elements
- **Not mapped (reference/behavioral):** ~10 (concepts like "silence as tactic" or "identity fusion" that inform behavior but aren't features)
- **Nothing missing.** Every actionable teaching from the course is now represented in the spec.
