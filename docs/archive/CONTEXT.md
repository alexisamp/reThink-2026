# Context Index — reThink 2026
Last updated: 2026-03-23
> Auto-generated from PRODUCT.md and TECHNICAL.md. Do not edit manually.

---

## Feature Index
F01 · Annual Planning Wizard → S02 → FL01 → connects: F13 → T02, T03, T04
F02 · One Thing → S03 → FL02 → connects: F07, F22 → T09
F03 · Todos → S03 → FL02 → connects: F05, F07, F28 → T08
F04 · Habits & Daily Logs → S03, S05, S06, S08, S10, S12 → FL02, FL03 → connects: F09, F15, F16, F18 → T06, T07
F05 · Milestones → S03, S04, S05, S07, S08 → FL02, FL03, FL06 → connects: F16, F22 → T05
F06 · Daily Journal & Notes → S03 → FL02 → connects: F33, F27 → T09, T17
F07 · Pomodoro Focus Timer → S03 → FL02 → connects: F02, F04, F11 → T16
F08 · Morning Ritual Mode → S03 → FL02 → connects: F02, F03 → T09, T08
F09 · Habit Streaks & Adherence → S03, S05, S06, S07 → FL02, FL03 → connects: F04, F10, F15, F16 → T07
F10 · Streak Celebration → S03 → FL02 → connects: F09 → T07
F11 · Today Sidebar (PULSE/FOCUS/WRAP UP) → S03 → FL02 → connects: F07, F02 → T09
F12 · Strategy War Map → S04 → FL06 → connects: F01, F21 → T03
F13 · Goal Management → S03, S04, S05, S06, S07 → FL06 → connects: F05, F04, F18, F35, F16 → T04
F14 · Monthly Planning → S05 → FL04 → connects: F18, F15, F21 → T13
F15 · Monthly Habit Grades → S05 → FL04 → connects: F04, F09 → T07
F16 · Momentum Score → S04, S06, S07 → FL04 → connects: F04, F05, F18 → T07, T05, T12
F17 · Dashboard Overview → S06 → FL04 → connects: F04, F16, F18, F09, F22, F27 → T07, T04, T10, T12, T09
F18 · KPI Tracking → S05, S06, S07, S08 → FL03, FL04 → connects: F13, F16, F04 → T10, T11, T12
F19 · Weekly Review Wizard → S08 → FL03 → connects: F20, F04, F18, F05, F03, F27 → T09, T12, T05
F20 · Friction Log → S08 → FL03 → connects: F19, F04 → T15
F21 · Reflection Library → S09 → connects: F06, F14, F19, F12 → T09, T13, T03
F22 · Year at a Glance → S10 → connects: F04, F02, F05 → T07, T09, T05
F23 · People / Contact Funnel → S11 → FL05 → connects: F24, F25, F31 → T18, T19
F24 · Contact Detail Drawer → S11, S03 → FL05 → connects: F23, F25, F26 → T18, T19
F25 · Attio CRM Sync → S11 → FL05 → connects: F23, F24, F26 → T18
F26 · AI Contact Enrichment → S11 → FL05 → connects: F24, F25 → T18
F27 · AI Coach → S06, S08 → FL03 → connects: F06, F19 → R01, T09
F28 · Command Palette (⌘K) → All → FL02 → connects: F13, F05, F03, F33, F21 → T04, T05, T08, T17
F29 · Keyboard Shortcuts → All → connects: (global) → (none)
F30 · Compact Mode → S12 → connects: F04, F05, F02 → T06, T07, T05, T09
F31 · Chrome Extension → S11 → FL05 → connects: F23, F24 → T18, Supabase Storage
F32 · Auto-Update (Tauri) → Settings → connects: (none) → (none)
F33 · Capture Modal → S03, All → FL02 → connects: F06, F28 → T17
F34 · Notification System → All → connects: F04, F05, F19 → T06, T05
F35 · Systematize Modal → S04 → FL06 → connects: F05, F04, F18, F13 → T05, T06, T10

---

## Screen Index
S01 · Login — /login → features: F01 → flows: FL01
S02 · Assessment — /assessment/* → features: F01 → flows: FL01
S03 · Today — /today → features: F02, F03, F04, F05, F06, F07, F08, F09, F10, F11, F24, F28, F33 → flows: FL02
S04 · Strategy — /strategy → features: F12, F13, F16, F35 → flows: FL06
S05 · Monthly — /monthly → features: F14, F15, F18, F16 → flows: FL04
S06 · Dashboard — /dashboard → features: F16, F17, F27 → flows: FL04
S07 · Goal Detail — /dashboard/goal/:id → features: F16, F18, F05, F04, F09 → flows: FL04
S08 · Weekly Review — /weekly-review → features: F19, F20 → flows: FL03
S09 · Library — /library → features: F21 → flows: (standalone)
S10 · Year at a Glance — /year → features: F22 → flows: (standalone)
S11 · People — /people → features: F23, F24, F25, F26, F31 → flows: FL05
S12 · Compact Mode — /compact → features: F30 → flows: (standalone)

---

## Flow Index
FL01 · Annual Planning (first-time setup) → screens: S01, S02, S03 → features: F01, F13
FL02 · Daily Execution → screens: S03 → features: F02, F03, F04, F05, F06, F07, F08, F09, F10, F11, F28, F33
FL03 · Weekly Review → screens: S08 → features: F19, F20, F04, F18, F27
FL04 · Monthly Review & Planning → screens: S05, S06 → features: F14, F15, F18, F16, F17
FL05 · Add Contact via Extension → screens: S11 → features: F31, F23, F24, F26, F25
FL06 · Goal Systematization → screens: S04, S03 → features: F12, F13, F05, F04, F18, F35

---

## Backend Index

### Tables
T01 · profiles → features: F01
T02 · workbooks → features: F01, F12
T03 · workbook_entries → features: F01, F12, F21
T04 · goals → features: F13, F16, F28
T05 · milestones → features: F05, F16, F22, F34
T06 · habits → features: F04, F09, F15, F34
T07 · habit_logs → features: F04, F09, F15, F16, F22 — critical: log_date (not logged_date), value int 0/1
T08 · todos → features: F03 — critical: text (not title), date (not due_date), effort enum
T09 · reviews → features: F02, F06, F11, F19, F22, F27 — critical: date (not review_date), energy_level, one_thing
T10 · leading_indicators → features: F18, F16 — critical: target (not annual_target)
T11 · indicator_daily_logs → features: F18
T12 · monthly_kpi_entries → features: F18, F16 — critical: actual_value (not value)
T13 · monthly_plans → features: F14, F21
T14 · strategies → features: F12
T15 · friction_logs → features: F20
T16 · focus_sessions → features: F07 — critical: completion_status COMPLETE/CARRIED_OVER/INCOMPLETE
T17 · captures → features: F33, F06
T18 · outreach_logs → features: F23, F24, F25, F26, F31 — unique: (user_id, linkedin_url)
T19 · interactions → features: F23, F24

### Edge Functions
R01 · ai-coach → features: F27
R02 · proxy-image → features: F24, F31

### Storage
contact-photos bucket → features: F31, F24 — path: {user_id}/{slug}.ext

### External APIs
Attio REST v2 → features: F25
Gemini 2.5 Flash → features: F26
Anthropic Claude (via R01) → features: F27

---

## Critical Field Names (common sources of bugs)

| Table | Correct | Wrong |
|---|---|---|
| goals | `text`, `position`, `motivation` | title, order_index, why |
| milestones | `text`, `target_date`, `status` 'COMPLETE'/'PENDING' | title, due_date |
| habits | `text`, `default_time` | title, time_of_day |
| habit_logs | `log_date`, `value` int 0/1 | logged_date, completed bool |
| todos | `text`, `date`, `effort` | title, due_date, priority |
| leading_indicators | `target` | annual_target |
| monthly_kpi_entries | `actual_value` | value |
| reviews | `date` | review_date |
| focus_sessions | `started_at`, `ended_at`, `completion_status` 'COMPLETE'/'CARRIED_OVER'/'INCOMPLETE' | — |
