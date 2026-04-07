# reThink Redesign — Strategic Proposal

**From:** Your co-founder thinking partner
**Date:** April 6, 2026
**Context:** Full knowledge of Jacob Warwick's PACE® course + complete audit of reThink's current 35-feature, 12-screen architecture

---

## The Diagnosis

reThink today is a personal operating system trying to be everything: Farnam Street workbook, daily planner, habit tracker, Pomodoro timer, AI coach, CRM, Chrome extension, monthly reviewer, weekly reviewer, KPI dashboard, reflection library, and year-at-a-glance visualizer. That's 35 features across 12 screens with 19 database tables.

The irony is that Jacob Warwick's entire course can be distilled to one insight: **the only KPI that matters is conversations per week.** Not momentum scores. Not monthly habit grades. Not 10-year visions broken into quarterly milestones. Just: are you talking to enough people?

You said it yourself — you need a literal rethink. So here it is.

---

## The Core Principle: One Screen, Two Numbers

Jacob's philosophy is ruthlessly simple. In Session 4, he introduces the single KPI that predicts executive career success: **conversations per week**. In the closing segment, he says: tone it down from 20-30 calls to one or two when you're employed. Stay active. Track it.

You want to add a second KPI that's personal to you: **English practice hours per week**. That's perfect — it follows the same logic. One leading indicator for career (conversations), one for personal growth (English).

Everything else in reThink should serve these two numbers.

---

## What to KEEP (the infrastructure is gold)

These pieces are already built, working, and directly aligned with the redesigned vision:

**1. The Today screen (S03) — your daily command center**
This is the right home base. The 70/30 layout with the collapsible sidebar is excellent. But it needs to be simplified from 13 features down to about 5.

**2. Chrome Extension (F31) + People/CRM (S11, F23)**
This is your networking pipeline. Jacob talks about the Daisy Chain Method, creating champions, and maintaining a contact CRM. You already have this built — the LinkedIn capture, the funnel stages (PROSPECT → INTRO → CONNECTED → etc.), the contact detail drawer. This is *directly* what Jacob teaches. Don't touch it.

**3. Habits (F04) + Daily Logs (F09)**
Keep habit tracking. It's clean, it works, and it's part of what you love about the app. But simplify — no momentum scores, no monthly grades, no A/B/C/D system. Just: did you do it today? What's your streak?

**4. Todos (F03) linked to a Plan**
You want todos associated with your HomePlan. Keep this. Simple daily task list tied to your goals.

**5. The "One Thing" prompt (F02) + Morning Ritual (F08)**
This is the "what's my objective today?" flow you described. It already exists and it's good.

---

## What to REMOVE or HIDE (for now)

These features are well-built but they're creating the cognitive overload you described:

| Feature | Why Remove |
|---|---|
| F01 · Annual Planning Wizard (11-step Farnam Street) | Beautiful but heavy. You already did it. It served its purpose. Hide it behind Settings or a "Revisit Plan" button, not a mandatory gate. |
| F12 · Strategy War Map | Same — it's a once-a-year exercise, not a daily driver. Move to a "Strategy" tab that you visit quarterly. |
| F05 · Milestones | Overkill for daily use. If you need milestones, they can be regular todos with a tag. |
| F07 · Pomodoro Timer | Nice to have but not core. If you want focus time, your Mac has Focus mode. This adds UI weight. |
| F14 · Monthly Planning | You don't need monthly planning forms. You need to look at your two numbers weekly. |
| F15 · Monthly Habit Grades | A/B/C/D grades for habits creates anxiety, not action. Remove. |
| F16 · Momentum Score | A composite metric (40% habits + 30% milestones + 30% KPIs) that you have to mentally decode. Replace with your two simple numbers. |
| F17 · Dashboard Overview | 48-week heatmaps, sparklines, AI suggestions... this is a dashboard for a company, not a person. Remove. |
| F18 · KPI Tracking (Leading Indicators) | Replace the entire generic KPI system with your two hardcoded KPIs. |
| F19 · Weekly Review Wizard (5 steps) | Too formal. Replace with a simple "How did this week go?" prompt on Sunday. |
| F20 · Friction Log | Over-engineering. If you skipped a habit, you know why. |
| F21 · Reflection Library | Archival feature. Not needed for daily execution. |
| F22 · Year at a Glance | Pretty visualization, zero daily utility. |
| F27 · AI Coach | Adding AI complexity to a system that needs simplicity. |
| F33 · Capture Modal | Captures, learnings, decisions... this is information hoarding. |
| F35 · Systematize Modal | Goal → Milestone → Habit → KPI breakdown is the exact over-engineering you're escaping. |

---

## The Redesigned reThink: 3 Screens, 2 Numbers

### Screen 1: TODAY (Home — your daily cockpit)

**Top bar:** Today's date + "What's your One Thing today?" prompt

**Left panel (70%):**

Section A — **My Two Numbers This Week**
A prominent, always-visible widget showing:
- 🗣 **Conversations this week:** 3 / 5 target (with a simple progress bar)
- 🇬🇧 **English practice:** 2h 15m / 5h target (with a simple progress bar)

Each number is clickable to log a new entry:
- Conversations: "Who did you talk to?" → name (auto-links to People if they exist) + quick note
- English: "What did you practice?" → dropdown (reading / AI conversation / podcast / meeting / other) + minutes

Section B — **Today's Todos**
Exactly what you have now (F03), but simplified. Text + checkbox + optional link to a goal. No effort levels, no time blocks, no drag-to-reorder complexity. Just a clean list.

Section C — **Habits**
Your existing habit checkboxes (F04). Binary: did it / didn't. Streak count visible. No adherence percentages, no momentum scores. Just the checkboxes and the number.

**Right sidebar (30%, collapsible):**

- Quick journal/notes for the day (F06, simplified)
- "How's your energy?" slider (1-10)
- "Tomorrow's focus" text field
- A weekly mini-summary: your two numbers + habits done this week

### Screen 2: PEOPLE (your networking pipeline)

Keep S11 exactly as-is. This is your Jacob Warwick networking machine:
- Contact funnel (PROSPECT → CONNECTED → ENGAGED → etc.)
- Chrome extension captures from LinkedIn
- WhatsApp sidebar captures
- Contact detail drawer with personal context
- Attio sync (when you're ready)

**One addition:** Every time you log a conversation in the Today screen, it should auto-create an interaction in People. This connects your primary KPI directly to your CRM. The conversation count IS your networking metric from Session 4.

### Screen 3: PLAN (simplified strategy — visited weekly/monthly, not daily)

Replace Strategy (S04) + Monthly (S05) + Dashboard (S06) + Goal Detail (S07) with one clean screen:

- **Your goals** (simple list, not a war map — just text + status emoji)
- **Weekly trend** for your two KPIs (last 8 weeks, simple bar chart)
- **Habit streaks** overview (which habits have the longest streaks)
- **Upcoming todos** for the week

This is where "HomePlan" lives. You visit it on Sunday to set your week. Not a 5-step wizard — just: look at your numbers, look at your goals, set your todos for the week.

---

## How Jacob's Course Maps to the New reThink

| Jacob's Teaching | Old reThink Feature | New reThink |
|---|---|---|
| "Single KPI: conversations/week" (Session 4) | F18 — generic KPI system with leading indicators, monthly entries, sparklines | **Hardcoded KPI #1** — conversations counter, always visible on Today |
| "The Daisy Chain Method" (Session 4) | F23 — People funnel | **People screen** — unchanged, it's perfect |
| "Always be looking for work" (Closing) | Not represented | **Conversations KPI** — maintains pipeline even while employed |
| "Continuous learning" (Closing) | Not represented | **Hardcoded KPI #2** — English practice hours |
| "Set a cadence — every 4 months check in" (Closing) | F34 — notification system | **People screen** — health score already decays over time |
| "Airport Test" (Session 4) | F23 — categories | **People screen** — funnel stages already capture this |
| "Use a spreadsheet or CRM" (Closing) | F23 + F25 Attio | **People screen** + Attio sync — already built |
| "Revisit resume every 3 months" (Closing) | F14 — Monthly Planning | **Plan screen** — quarterly goal check-in, not monthly forms |
| "10-minute read of a podcast, journaling" (Closing) | F06 — Daily Journal, F07 — Pomodoro | **Today sidebar** — simple journal. No Pomodoro complexity. |

---

## Technical Simplification

### Database tables to keep active:
- `profiles` (T01)
- `goals` (T04) — simplified, no workbook dependency
- `habits` (T06) + `habit_logs` (T07)
- `todos` (T08)
- `reviews` (T09) — for daily one_thing, energy, notes
- `outreach_logs` (T18) + `interactions` (T19)

### New table:
- `weekly_kpis` — user_id, week_start, conversations_count, english_minutes. That's it. Four columns.

### Tables to archive (don't delete, just stop using):
- `workbooks` + `workbook_entries` (T02, T03)
- `milestones` (T05)
- `leading_indicators` + `indicator_daily_logs` + `monthly_kpi_entries` (T10, T11, T12)
- `monthly_plans` (T13)
- `strategies` (T14)
- `friction_logs` (T15)
- `focus_sessions` (T16)
- `captures` (T17)

### Screens:
- **Keep:** Today (S03), People (S11)
- **New:** Plan (replaces S04 + S05 + S06 + S07)
- **Remove from nav:** Assessment (S02, one-time only), Weekly Review (S08), Library (S09), Year at a Glance (S10), Compact Mode (S12)

---

## The Philosophy Behind This

Jacob's closing words: "It's not the skills that set you apart. It's the discipline and the habit to be continuously learning."

The old reThink was designed around skills — momentum scores, KPI trajectories, monthly grades, systematization workflows. It was a system built for measuring everything.

The new reThink is designed around discipline — am I talking to people? Am I improving my English? Am I doing my habits? Am I clear on what matters today?

That's it. Two numbers. Your habits. Your todos. Your people. Open the app, see where you stand, do the work.

---

## Implementation Path

**Phase 1 (1-2 days):** Simplify the Today screen. Remove Pomodoro, milestones widget, momentum score. Add the two-KPI widget at the top. Keep habits and todos.

**Phase 2 (1 day):** Create the simplified Plan screen. One page with goals list + weekly KPI trend + habit overview.

**Phase 3 (1 day):** Wire conversations log → People interactions. Every conversation logged on Today auto-creates an interaction entry in the CRM.

**Phase 4 (ongoing):** Hide nav items for screens you're not using. Don't delete the code — just remove from the sidebar. The infrastructure is there if you ever want it back.

---

## One Last Thing

The old reThink objective was: "Run your year like a CEO runs a company."

The new objective should be: **"Open your laptop. Know exactly what matters. Do it."**

That's the rethink.
