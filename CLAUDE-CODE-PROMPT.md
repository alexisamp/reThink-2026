# Prompt para Claude Code — reThink v2 Redesign

## Context

You are about to implement a radical redesign of **reThink 2026**, a personal operating system built with **Tauri + React + Supabase**. The current app works but is overcomplicated. The redesign simplifies everything into a "simple daily loop" while adding a powerful People CRM inspired by Attio's UI/UX.

This is a **desktop app** (Tauri), not a web app. The frontend is React. The backend is Supabase (Postgres + Auth + Realtime).

## Step 0: Read These Files First (mandatory)

Before writing ANY code, read these files in this exact order:

1. **`RETHINK-V2-SPEC.md`** — The complete product spec. This is the source of truth for what to build. It defines every screen (Today, People, Plan, Playbook), every object (People, Companies, Opportunities), every field, every interaction, the database schema, and the phased implementation plan.

2. **`UI-REFERENCE-ATTIO.md`** — The visual design reference. This documents every UI pattern to replicate from Attio CRM: sidebar navigation, table views, detail views, kanban/board views, filter pills, tag styling, and more. It includes a section mapping each Attio pattern to reThink's specific fields and content (Section 9).

3. **`TECHNICAL.md`** — The current technical architecture. Understand what exists before changing anything.

4. **`PRODUCT.md`** — Documents the current app features. Know what you're simplifying.

5. **`CONTEXT.md`** — Compressed index of the codebase.

6. **`tailwind.config.js`** + **`src/index.css`** — The current design tokens (fonts, colors, spacing). **ALL visual styling must use these existing tokens.** Do not introduce new colors or fonts. The Attio reference defines layout patterns only — the look-and-feel comes from reThink's existing design system.

## What You're Building

### Architecture
- **App 1: reThink** — The daily cockpit with 4 screens + global sidebar navigation
- **App 2: NetworkHub** — A separate Tauri app with 4 webview panels (WhatsApp, LinkedIn, Exit5, X). This is Phase 5 — don't build it yet in early phases.
- **Shared backend**: Both apps share the same Supabase project

### Global Navigation (ALL screens)
A persistent left sidebar (Attio-style) replaces any existing top-level navigation:

```
[reThink Logo]  reThink 2026
─────────────────────────────
⌘K  Quick actions       🔍
─────────────────────────────
◎  Today
📋  Playbook

▽  CRM
     👤  People
     🏢  Companies
     🎯  Opportunities

▽  Lists
     ⭐  Board of Directors
     🔥  Active Pipeline
     [+ Create list]

📊  Plan
─────────────────────────────
⚙  Settings
```

Key behaviors:
- Collapsible to icon-only mode (~48px) via toggle button or ⌘\
- Collapsed state persists across sessions (user preference)
- CRM and Lists sections are independently collapsible
- Active item gets highlighted background
- Each CRM object has a colored square icon

### Screens

**Today** — Daily cockpit. Left main area (goals, todos, habits) + collapsible right sidebar for journaling. The left nav sidebar + right journaling sidebar coexist (nav=global, journaling=Today-specific).

**People (CRM)** — Three objects: People, Companies, Opportunities. Each has:
- Table view (default) — compact rows, sortable columns, filter pills, calculations footer
- Detail view — Highlights cards + Activity feed + right sidebar (Record Details + Channels + Lists)
- Kanban view — pipeline columns, draggable cards
- See Section 9 of UI-REFERENCE-ATTIO.md for exact field mappings per object

**Plan** — Weekly/monthly strategy view with goal KPI trends

**Playbook** — 11 sections organized in 3 visual blocks ("Who I Am" / "How I Engage" / "How I Close"). Markdown editor per entry, export to .md.

### Database Changes
The spec defines all schema changes in detail. Key new tables:
- `companies` — company records
- `opportunities` — deal/job pipeline
- `value_logs` — value tracking per contact
- `contact_channels` — multi-channel identity resolution (WhatsApp, LinkedIn, Exit5, X)

Key extensions to existing tables:
- `outreach_logs` — add: tier, referred_by, advisory_role, birthday, interests, looking_for
- `interactions` — add: next_step, next_step_date, next_step_owner, channel
- `playbook_entries` — expand type enum, add framework field

## Implementation Plan

Follow the phases defined in RETHINK-V2-SPEC.md:

**Phase 1: Simplify Today (3-4 days)** — Remove clutter, add Three-goal KPI widget, conversation/English logging modals

**Phase 2: Upgrade People (1-2 weeks)** — This is the biggest phase. Build the Attio-inspired CRM with sidebar navigation, table views, detail views, kanban views. New tables for companies and opportunities.

**Phase 3: Build Plan screen (2-3 days)** — Replace Strategy + Monthly + Dashboard with single Plan screen

**Phase 4: Build Playbook (2-3 days)** — New screen with 11 sections, markdown editor, export

**Phase 5: Build NetworkHub (2-3 weeks)** — Separate Tauri app (do NOT start until Phases 1-4 are solid)

**Phase 6-8: Later** — AI engine, Attio sync, Network Map

## Critical Rules

1. **Fonts and colors from reThink ONLY.** Read `tailwind.config.js` and `src/index.css` before any UI work. Never use Attio's colors/fonts.

2. **Start with Phase 1.** Don't jump ahead. Each phase builds on the previous one.

3. **Sidebar navigation is global.** It appears on EVERY screen, not just CRM. It replaces any existing top-level navigation.

4. **Today keeps its journaling sidebar.** The right panel (30%) for journaling coexists with the left nav sidebar. Layout: [Nav ~200px | Main ~60% | Journaling ~30% collapsible]

5. **The left sidebar collapses.** Toggle button + ⌘\ shortcut. Collapsed = icon-only (~48px). State persists.

6. **Detail views follow Attio's layout.** Highlights cards grid (2x3) + Activity feed + right sidebar with Record Details. See UI-REFERENCE-ATTIO.md Section 3 for the pattern, Section 9 for reThink-specific field mappings.

7. **Multi-channel identity is key.** A person can exist on WhatsApp, LinkedIn, Exit5, and X. The `contact_channels` table prevents duplicates. Detail view shows all linked channels in the right sidebar.

8. **Stage-specific sections in Opportunities.** When stage=active → show Interview Prep (CLOSER Framework). When stage=negotiating → show Negotiation Prep (GAINS Framework). These expand/collapse based on the current stage.

9. **Don't delete data.** The redesign simplifies the UI but the existing Supabase data should be preserved and migrated, not dropped.

10. **Use `/ultraplan` before coding.** Before touching any file, run `/ultraplan` to create a comprehensive implementation plan covering all phases. Do NOT start coding until the plan is reviewed and approved.

## Starting Point

Begin by:
1. Reading all 6 files listed in Step 0
2. Understanding the current codebase structure (`src/`, `src-tauri/`, component hierarchy)
3. **Run `/ultraplan` to plan the entire implementation.** This is mandatory before writing any code. Use the ultraplan feature to create a comprehensive, phased plan that covers all 8 phases defined in the spec. The plan should break each phase into specific tasks with file paths, dependencies, and estimated effort. Present the plan for review and get explicit approval before proceeding to code.
