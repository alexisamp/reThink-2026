# SPEC — reThink: Core Features Upgrade
**Date:** 2026-03-16
**Status:** ready-to-plan
**Reviewed codebase:** yes
**Scope:** 20 features across journal, @mention system, todos, milestones, habits, leading indicators, newsletter feed, and AI writing scorer — all serving reThink's core purpose: help the user focus and execute on their annual strategy.

---

## Context

reThink is a personal focus OS built around a single year's goals, milestones, habits, and daily execution. All 20 sprints from the original master plan are implemented. The app is used daily via the Tauri desktop app.

This spec addresses the first major iteration after launch: sharpening the interaction model across all layers of the app. Three problems dominate:

1. **Fragmented links** — pills, todos, milestones, and habits don't connect to each other visibly or reliably. The @ system only partially works.
2. **Incomplete habit system** — quantified habits lack UI config and the app shows habits on irrelevant days, creating overwhelm.
3. **Missing small things** — bugs in Pomodoro and keyboard shortcuts, no way to unmark newsletter items, no AI writing tool.

After this spec, the user should be able to: write journal entries with linked captures, plan todos against milestones in a timeline view, see only today's relevant habits, get English writing feedback on demand, and have a functional newsletter feed.

---

## Business rationale

Every feature in this spec either removes friction from existing workflows (bugs, broken @mention, closed Pomodoro panel) or deepens the strategic-to-tactical connection (milestone modal, todo→milestone chip, journal pills linked to goals). Features that were challenged out:

- **@person mention** — descoped. The app is a personal focus tool; adding a social/collaboration layer contradicts the design intent.
- **AI scorer on every text field** — scoped down to todos, journal, and pill edit modals only. Goal/habit aliases are too short for meaningful scoring. The user's intent is English learning during active writing sessions — those are the right contexts.

---

## Technical notes

- Stack: React 19 + Vite 7 + TypeScript + TailwindCSS v3 + Supabase + Tauri v2
- `@dnd-kit/core` is already installed — use it for all drag & drop
- `@phosphor-icons/react` for all icons — no emojis in UI
- Color palette: burnham (#003720), shuttle (#536471), mercury (#E3E3E3), pastel (#79D65E), gossip (#E5F9BD)
- The `@mention` system currently lives inside `computeQaDropdown()` in `Today.tsx` (lines 327–369) — it must be extracted before building any dependent features
- Journal pills currently serialize as `[~type:title~]` in `reviews.notes`. New format: `[~type:title:gid:mid:tid~]` (empty string for missing ids). Backward compatible — old format parses with empty ids.
- `captures` table needs 3 new nullable UUID columns: `milestone_id`, `goal_id`, `todo_id`
- `focus_sessions` table needs 1 new nullable UUID column: `todo_id`
- `todos` table needs 1 new boolean column: `waiting` (default false) — represents WAITING state alongside existing `completed` boolean
- `habits` table needs 1 new column: `scheduled_days` (integer array, 0=Sun, 1=Mon … 6=Sat; null = every day)
- Gemini API key assumed available as `VITE_GEMINI_API_KEY` in `.env` — verify before Phase 8 implementation
- Supabase realtime must be enabled on `newsletter_items` table in Supabase dashboard

---

## Phase 1 — Bug fixes & quick wins
*Why first: zero dependencies, immediate daily-use impact, low regression risk*

### F01 · Pomodoro config panel — can't be closed

**What it does:** Once the Pomodoro settings panel is open, the user can close it again without starting a session.
**Trigger:** Click on the gear icon again (same toggle) or press Escape.
**UI:** The settings panel behaves as a toggle — same button opens and closes. Escape always closes.
**Data:** No data change.
**Technical notes:** `Today.tsx` Pomodoro section ~line 1670. The settings panel visibility is controlled by a state variable — likely the toggle handler is missing the close condition. Check that `onClick` on the gear icon does `setShowSettings(prev => !prev)` not `setShowSettings(true)`.
**Edge cases:**
- Timer is running + settings open → allowed, but don't reset timer state
- Pressing Escape while settings open AND intention modal open → close intention modal first, then settings

---

### F02 · ⌘M shortcut conflict fix

**What it does:** Remaps the milestones panel shortcut from ⌘M (macOS minimize) to ⌘⇧M.
**Trigger:** User presses ⌘⇧M anywhere in the app.
**UI:** Milestones floating panel opens/closes. Update any visible keyboard hint labels that show ⌘M.
**Data:** No data change.
**Technical notes:** In `Today.tsx`, find the keydown event listener that handles `'m'` with metaKey. Change condition to also require `shiftKey`. In Tauri v2, ⌘M is handled at the OS window level — the existing app-level listener never fires because the OS intercepts it first. Adding `shiftKey` requirement resolves the conflict without needing Tauri capability changes.
**Edge cases:**
- ⌘⇧M while modal is open → closes the panel

---

### F03 · Newsletter — prominent "Open" link

**What it does:** Each newsletter item displays a clearly visible, always-present button to open the original newsletter in Gmail. Currently the link exists (`gmail_link` field) but is not visually distinct enough — users don't see it.
**Trigger:** Click the "Open" button on any newsletter item (read or unread).
**UI:** Replace the small `ArrowSquareOut` icon with a labeled pill-style button: `Abrir →` or an `ArrowSquareOut` icon + label "Gmail" — placed at the right end of each row, always visible (not only on hover). Opening the link does NOT automatically mark the item as read — those are now two separate actions.
**Data:** No change to `newsletter_items`. Opening a link is fire-and-forget.
**Technical notes:** `NewsletterPill.tsx`. Currently clicking the row triggers both `window.open(gmail_link)` AND `markAsRead()`. Decouple these: row click → nothing or expand. The open button → `window.open(gmail_link)`. The checkbox → `markAsRead()`.
**Edge cases:**
- `gmail_link` is null or empty → hide the open button for that item, don't show a broken link

---

### F04 · Newsletter — unmark read items

**What it does:** Items in the "Leídos" section have a button to revert them to unread.
**Trigger:** Click an unmark icon (ArrowCounterClockwise or similar) on a read item.
**UI:** In the "Leídos" section, show a small icon button on each row (visible on hover). On click, the item moves back to "Sin leer" instantly (optimistic update), with the checkbox available again.
**Data:** `update newsletter_items set read_at = null where id = ?`
**Technical notes:** `NewsletterPill.tsx`. The read section currently renders items without any click handler. Add the unmark button with `onClick: () => handleUnmark(item.id)`. Optimistic: update local state immediately, then update Supabase async.
**Edge cases:**
- Network failure on unmark → revert local state, show brief error toast

---

### F05 · Newsletter — refresh button + real-time sync

**What it does:** (a) A small refresh icon in the feed modal header lets the user manually pull latest items. (b) The app subscribes to `newsletter_items` via Supabase realtime — when the scheduled skill writes new items at 7:30 AM, the feed updates automatically without user action.
**Trigger:** (a) Click refresh icon. (b) Supabase INSERT event on `newsletter_items`.
**UI:** ArrowClockwise icon in the modal header, top-right, next to the close button. Shows a brief spinning animation while fetching. Unread count badge on the Feed pill in the Today sidebar updates automatically when new items arrive.
**Data:** Read-only. Subscribes to realtime INSERT events on `newsletter_items`.
**Technical notes:** `NewsletterPill.tsx`. Use `supabase.channel('newsletter_items').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'newsletter_items' }, handler).subscribe()`. Unsubscribe on component unmount. The 7-day filter still applies. Must enable realtime on the table in Supabase dashboard.
**Edge cases:**
- New item arrives while modal is closed → unread count badge increments
- New item arrives while modal is open → item appears at top of "Sin leer" list with a subtle slide-in animation

---

## Phase 2 — @Mention system foundation
*Why first: blocks journal pill associations (Phase 4), inline todo editing (Phase 3), and all future mention-enabled inputs*

### F06 · MentionDropdown — reusable component with progressive tree

**What it does:** Replaces the ad-hoc `computeQaDropdown()` logic in `Today.tsx` with a standalone, reusable `MentionDropdown` component that can be mounted anywhere there's a text input.
**Trigger:** User types `@` in any supported text input. Progressive filtering: `@` alone → shows all categories (Goals, Milestones, Todos). `@g` + text → narrows to Goals matching the text. `@m` + text → Milestones. `@t` + text → Todos.
**UI:** Floating dropdown anchored below the cursor position. Three sections with headers: "Goals", "Milestones", "Todos". Each section shows up to 5 items. Items display: emoji/avatar + primary label + secondary context (e.g., milestone shows its goal alias in muted text). Keyboard nav: ↑↓ to move, Enter to select, Escape to dismiss. At most 15 items visible total; scroll if more.
**Data:** Reads from existing `goals`, `milestones`, `todos` in memory (no new queries — the Today screen already loads all of these).
**Technical notes:** New file: `src/components/MentionDropdown.tsx`. Interface: `onSelect(type: 'goal'|'milestone'|'todo', item: Goal|Milestone|Todo) => void`. The component receives the current trigger string (the text after `@`) and the full data sets. Today.tsx's `computeQaDropdown()` is refactored to use `MentionDropdown` instead of its inline dropdown. The component uses a portal (`ReactDOM.createPortal`) to avoid z-index conflicts.
**Edge cases:**
- No matches for the typed text → show "Sin resultados" in the relevant section
- `@` typed inside a word (not at word boundary) → do NOT trigger the dropdown
- Dropdown open + user deletes back past `@` → close dropdown

---

### F07 · @Mention in inline todo editing

**What it does:** When a user edits an existing todo inline (clicking the text to edit), the `@mention` system activates — they can type `@m` to link to a milestone or `@g` to link to a goal, changing the todo's associations.
**Trigger:** User enters edit mode on a todo row and types `@`.
**UI:** Same `MentionDropdown` component from F06 appears. On selection, the mention text is removed from the input and the todo's `milestone_id` / `goal_id` is updated. The todo row's chip updates immediately.
**Data:** `update todos set milestone_id = ?, goal_id = ? where id = ?`
**Technical notes:** `SortableTodoRow` currently has an inline edit input. Wire `MentionDropdown` into that input's onChange handler. On selection, update the todo via the existing mutation pattern.
**Assumptions:** Linking a milestone in a todo edit automatically sets `goal_id` from `milestone.goal_id`.

---

## Phase 3 — Todo evolution
*Why first: WAITING status and chip redesign are high-frequency daily interactions; Pomodoro todo-link depends on this phase*

### F08 · Todo WAITING status

**What it does:** Todos can be put in a WAITING state — "I did my part, waiting on someone else for confirmation." WAITING todos are neither pending nor done. They appear in a separate section in the Today view.
**Trigger:** User clicks a new "waiting" icon on a pending todo row (a Clock or HourglassMedium icon from Phosphor).
**UI:** New section below the pending todos list, titled "En seguimiento" with a shuttle (#536471) colored left border or header. Each WAITING todo shows:
  - The todo text (normal weight, not strikethrough)
  - A HourglassMedium icon in shuttle color
  - A "Marcar como hecho" button (check icon) and an "Undo" button (ArrowCounterClockwise — reverts to pending)
  - The milestone chip (see F09)
Pending todos show the waiting icon on hover. WAITING todos do NOT show in the pending count.
**Data:** DB migration: `ALTER TABLE todos ADD COLUMN waiting boolean DEFAULT false`. State: `waiting=true, completed=false`. Done: `completed=true, waiting=false`. Pending: `completed=false, waiting=false`.
**Technical notes:** `Today.tsx`. Update all Supabase queries that filter todos to account for the new `waiting` column. Existing `completed = false` filters become `completed = false AND waiting = false` for the pending list. Add a separate query/filter for `waiting = true AND completed = false`. Update `submitTodo()` mutation to never set `waiting` on creation.
**Edge cases:**
- Completing a WAITING todo → `completed=true, waiting=false`
- Reverting WAITING to pending → `waiting=false`
- A WAITING todo past its date → stays in WAITING section, not in backlog (it's not overdue, it's blocked)

---

### F09 · Todo chip redesign — milestone-first, minimal

**What it does:** Removes the loud goal-colored chip from todo rows. Replaces it with a subtle milestone chip. If no milestone, nothing is shown. The goal name appears inside the milestone chip as secondary context.
**Trigger:** Automatic — any todo with a `milestone_id`.
**UI:** Single pale chip per todo (no chip if no milestone_id). Style: very light background (mercury #E3E3E3 at 40% opacity), small text (9px), format: `[milestone short name · goal alias]`. Always visible but visually receding. No colored border. On hover, chip brightens slightly to mercury at 80%.
**Data:** No schema change. Reads existing `milestone_id` and the milestone's `goal_id` to look up goal alias.
**Technical notes:** `SortableTodoRow.tsx`. Remove current goal chip logic. Add milestone chip. Requires milestones and goals to be passed as props (or accessible via context). If milestone name is long, truncate to 20 chars + ellipsis.
**Assumptions:** If a todo has a `goal_id` but no `milestone_id`, no chip is shown (milestone is the entry point; goal is derived from it).

---

### F10 · Pomodoro — link to active todo, auto-derive goal

**What it does:** In the Pomodoro settings, the user picks a todo from today's active list (pending todos only) instead of picking goal + habit separately. The app silently derives `goal_id` from the todo's `milestone.goal_id` and saves it to the focus session.
**Trigger:** User opens Pomodoro settings, selects a todo from a dropdown of today's pending todos.
**UI:** Replace the current goal dropdown + habit dropdown in the Pomodoro settings panel with a single "Todo de hoy" dropdown. Shows the todo text (truncated to 40 chars if needed) + milestone chip if available. If no todos today, shows "Sin todos para hoy".
**Data:** DB migration: `ALTER TABLE focus_sessions ADD COLUMN todo_id uuid REFERENCES todos(id)`. On session save: `goal_id` is derived from the selected todo's milestone → goal chain. If todo has no milestone, `goal_id = null`. `habit_id` is no longer written from Pomodoro (removed from this flow).
**Technical notes:** `Today.tsx` Pomodoro section (~lines 1706–1726). Remove goal and habit dropdowns, add todo dropdown. `focus_sessions` still saves `goal_id` (derived) and the new `todo_id`. The Dashboard/Momentum analytics that read `goal_id` from focus sessions continue to work.
**Edge cases:**
- User starts a session without selecting a todo → allowed, `todo_id = null`, `goal_id = null`
- Selected todo is completed mid-session → session still saves with original `todo_id`

---

## Phase 4 — Journal enhancement
*Depends on Phase 2 (F06 MentionDropdown) for the @m/@g/@t associations inside pills*

### F11 · Journal pills — link to milestone, goal, or todo

**What it does:** When creating or editing a capture pill in the journal, the user can associate it with a milestone, goal, or todo using the @mention system. The association is stored and visible on the pill.
**Trigger:** While in the pill creation dropdown (after typing `/type`), user types `@m`, `@g`, or `@t` followed by text to search. Same `MentionDropdown` from F06.
**UI:** Inside the pill creation flow, after selecting the capture type, the user can optionally link via @. The pill renders a small secondary label showing the linked object (e.g., `→ Milestone name` in muted text below the pill title). Clicking the pill to open `CaptureModal` shows all associations clearly with edit capability.
**Data:** DB migration: `ALTER TABLE captures ADD COLUMN milestone_id uuid REFERENCES milestones(id), ADD COLUMN goal_id uuid REFERENCES goals(id), ADD COLUMN todo_id uuid REFERENCES todos(id)`. Serialization: change `[~type:title~]` to `[~type:title:gid:mid:tid~]` where empty string = not linked. Old format (`[~type:title~]`) parses correctly — missing parts default to empty string.
**Technical notes:** `JournalEditor.tsx` (pill creation flow), `CaptureModal.tsx` (edit view), `captureParser.ts` (serialization). The parser must handle both old (2-part) and new (5-part) formats. Migration: existing captures in DB are unaffected (no `milestone_id` etc. yet until migration runs). Existing pill markers in `reviews.notes` strings are backward compatible.
**Edge cases:**
- Linked todo is deleted → show pill as "todo eliminado" in muted style, don't crash
- Linked milestone is completed → pill still shows the association, no automatic change

---

### F12 · Journal pills — creation and edit date tracking

**What it does:** Each capture pill shows when it was created and when its content was last modified. "Last modified" means: any attribute of the capture record changed (title, body, type, associations).
**Trigger:** Automatic — tracked on every create/update of a capture record.
**UI:** In `CaptureModal` (pill detail view), show two metadata lines at the bottom: `Creado: [date]` and `Editado: [date]`. Format: "lun 16 mar 2026, 14:30". Not shown inline in the journal text — only in the modal.
**Data:** `captures` table already has `created_at` from Supabase defaults. Add `updated_at` via Supabase trigger: `CREATE TRIGGER set_updated_at BEFORE UPDATE ON captures FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at)` (requires `moddatetime` extension, already available in Supabase).
**Technical notes:** `CaptureModal.tsx`. Read `created_at` and `updated_at` from the capture record. No component logic needed beyond display — Supabase handles the timestamp updates automatically.
**Assumptions:** The `moddatetime` extension is available (it is by default in Supabase). If not, update `updated_at` manually on every `update captures` call.

---

### F13 · Journal expand modal

**What it does:** Opens the journal in a large centered modal for longer writing sessions. The same journal content, same pill system, more vertical and horizontal space.
**Trigger:** Keyboard shortcut ⌘⇧J, or a small expand icon (ArrowsOut) in the journal section header.
**UI:** Full-screen overlay (max-w-3xl, max-h-90vh), centered, with a close button (X) and the same keyboard shortcut to close. The journal editor inside is the same `JournalEditor` component — same state, no data duplication.
**Data:** No data change. The modal operates on the same journal state.
**Technical notes:** `Today.tsx`. Add a modal state `journalExpanded`. The `JournalEditor` component is rendered in both the sidebar and the modal — pass the same `value`/`onChange` props. When modal closes, content is already synced (same state reference). No separate save needed.
**Edge cases:**
- User opens expand modal while journal has unsaved changes → same debounce autosave applies in the modal
- Close via Escape → confirm if there's been a recent change (or just close and trust autosave)

---

## Phase 5 — Milestone detail modal
*Depends on Phase 3 F08 (todo WAITING) and F09 (chip design) so the modal shows consistent todo states*

### F14 · Milestone detail modal — timeline view

**What it does:** Clicking a milestone in the milestones panel opens a full detail modal showing: the milestone's title, an optional description, and a vertical timeline of all todos linked to that milestone — ordered oldest to newest. Pending and planned todos are drag-and-droppable to re-order. Users can add new todos directly from this modal, edit and delete existing ones.
**Trigger:** Click on a milestone name/row in the milestones panel (currently clicking just toggles complete).
**UI:**
- Modal: max-w-2xl, centered overlay.
- Header: milestone title (editable inline) + target date + goal badge + status toggle.
- Optional description field: multiline text, placeholder "Añadir descripción…"
- Timeline: vertical center line. Cards left-aligned, each connected to the center line with a horizontal connector. Cards show: todo text + date (if set) + status icon (CheckCircle for done, HourglassMedium for waiting, Circle for pending). Completed cards: muted, non-draggable, below a "Completados" collapsible section. Pending/planned cards: draggable with @dnd-kit.
- Add todo input at the bottom: text field + optional date picker + "Añadir" button.
- All edits are saved immediately (optimistic updates).
**Data:** Reads `todos` filtered by `milestone_id`. Creates/updates/deletes todos with `milestone_id` set. Updates `sort_order` on drag. Optionally adds `description` column to `milestones` table: `ALTER TABLE milestones ADD COLUMN description text`.
**Technical notes:** New file: `src/components/MilestoneDetailModal.tsx`. Uses `@dnd-kit/core` and `@dnd-kit/sortable`. Fetches todos for the milestone on open. Mutations reuse the same patterns as `Today.tsx` todo CRUD.
**Edge cases:**
- Milestone has 0 todos → show empty state "Añadí el primer paso hacia este hito"
- New todo added from modal → also appears in Today's todo list if `date = today`
- Drag reorder → updates `sort_order` for the milestone-scoped list (not the global todo sort)

---

## Phase 6 — Habits rework
*No hard dependencies — can run in parallel with Phase 5 if desired*

### F15 · Habit config UI — binary vs. quantified, units, target

**What it does:** Users can configure whether a habit is binary (done/not done) or quantified (track a numeric value with units). For quantified habits, they set a `daily_target` and `unit` label.
**Trigger:** New "Editar hábito" submodal, accessible from the ⌘H habit drawer and from the existing habit strip's expand arrow (▾).
**UI:** Submodal with fields: alias (text, ≤20 chars), emoji picker, description (optional), type toggle (Binario / Con unidades), if quantified: daily_target (number input) + unit (text, e.g. "km", "vasos", "páginas"), goal association dropdown. Save / Cancel buttons.
**Data:** Updates `habits` table fields: `habit_type`, `daily_target`, `alias`, `emoji`. `unit` field may need to be added: `ALTER TABLE habits ADD COLUMN unit text` (check if it exists first — not in the current schema noted in memory).
**Technical notes:** New file: `src/components/HabitEditModal.tsx`. Opened from both the habit strip expand button and the ⌘H drawer. After save, refresh the habits list.

---

### F16 · +/- inline buttons for quantified habits in pill strip

**What it does:** Quantified habits in the Today habit strip show +/- buttons directly in the pill, so users can increment/decrement without opening any modal.
**Trigger:** Visible on the pill for all `QUANTIFIED` habits. +/- buttons are always shown (not only on hover) because they are the primary interaction.
**UI:** Inside the habit pill: `[-] [current value] / [target] [unit] [+]`. The +/- buttons use `CaretLeft` / `CaretRight` or `Minus` / `Plus` icons (Phosphor). Value updates immediately (optimistic). At 100% target: pill shows green (pastel). At 50–99%: yellow. Below 50%: default.
**Data:** Same as existing quantified habit logging — updates/upserts `habit_logs` for today with `value` incremented/decremented. Min value: 0. Max: none enforced (users may exceed target).
**Technical notes:** `Today.tsx` habit pill rendering section. The +/- logic already partially exists for the drawer view — extract and reuse it in the pill strip.
**Edge cases:**
- Value at 0, user hits `-` → stays at 0 (no negative values)
- Multiple rapid taps → debounce the Supabase write by 500ms, update local state immediately

---

### F17 · ⌘H panel — grouped, with edit submodal

**What it does:** The ⌘H habit drawer groups habits into two sections: "Binarios" and "Con unidades". Each habit row has an edit button (Pencil icon) that opens the `HabitEditModal` from F15.
**Trigger:** ⌘H opens the drawer (existing). Edit button on each row.
**UI:** Section headers with a subtle divider. Binaries: numbered 1–9 for keyboard toggling (existing). Quantified: +/- controls (consistent with F16). Edit icon (Pencil, small) at the end of each row, visible on hover.
**Data:** No schema change. Edit actions handled by F15 modal.
**Technical notes:** `Today.tsx` habit drawer section (~lines 1757–1880). Refactor to split habits into two arrays by `habit_type`. Mount `HabitEditModal` conditionally.

---

### F18 · Habit weekly schedule

**What it does:** Users define which days of the week a habit applies (e.g., gym = [Mon, Wed, Fri, Sat, Sun]). The Today screen only shows the habit on scheduled days. Days where the habit was scheduled but not logged appear as missed in the Monthly view and contribution graph — but are NOT shown as pending in Today (to avoid demotivation).
**Trigger:** Config via `HabitEditModal` from F15 — a "Días de la semana" multi-select toggle (Mon Tue Wed Thu Fri Sat Sun).
**UI:** In HabitEditModal: a row of 7 day toggles (L M X J V S D). Multiple selectable. If none selected = every day (default behavior). Selecting specific days saves them to `scheduled_days`.
In Today's habit strip: habits where `scheduled_days` is set and today's day is NOT in `scheduled_days` are hidden from the strip entirely.
**Data:** DB migration: `ALTER TABLE habits ADD COLUMN scheduled_days integer[]`. Integer values: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat. `NULL` means every day. Filtering in Today.tsx: `const todayDay = new Date().getDay(); const show = !h.scheduled_days || h.scheduled_days.includes(todayDay);`
Monthly/dashboard: when calculating adherence/contribution, treat a non-scheduled day as "N/A" (not a miss), and a scheduled day with no log as a miss.
**Technical notes:** `Today.tsx` habit loading and filtering. `Monthly.tsx` adherence calculation (`getAdherence()` and `getHabitGrade()`) must be updated to skip non-scheduled days from the denominator.
**Edge cases:**
- User changes scheduled days mid-month → adherence recalculates based on new schedule going forward only (past logs remain as-is)
- Habit with no `scheduled_days` → behaves exactly as today (shown every day)

---

## Phase 7 — Leading indicators
*No dependencies*

### F19 · Leading indicators modal — grouped by goal + consistent +/- UI

**What it does:** The leading indicators panel (⌘L) groups indicators by the goal they belong to, with section headers per goal. Uses the same +/- increment/decrement buttons as quantified habits (F16), consistent design language.
**Trigger:** ⌘L opens the panel (existing behavior).
**UI:** Section header per goal: goal emoji + goal alias. Under each: the indicator name + unit + current value input (or +/- buttons if the indicator is numeric). If an indicator has `habit_id` (auto-fed from habit), show it as read-only with the source habit name in muted text instead of an editable input. Indicators without a goal association go in an "Otros" section at the bottom.
**Data:** No schema change. Groups by `leading_indicators.goal_id` (already exists). Reads goals to get names/order.
**Technical notes:** `Today.tsx` LI panel (~lines 220–225, 806–830). Pass `goals` array (already in scope) to the panel rendering logic. Sort groups by goal `position` (same order as goals list).
**Edge cases:**
- Indicator with `habit_id` set → display-only, no input field, show habit name as source
- Goal with no indicators → hide the goal section entirely

---

## Phase 8 — AI writing scorer (Gemini)
*No dependencies on other phases*

### F20 · On-demand AI writing scorer (Gemini)

**What it does:** A small wand icon (MagicWand from Phosphor) appears in supported text fields. When clicked, it sends the current field text to Gemini and shows: a score 1–10, a corrected version, and a brief explanation of what to improve. The user is learning English and wants feedback on their writing quality when they ask for it.
**Trigger:** Click the MagicWand icon. Never automatic — always opt-in per field per session.
**UI:** The wand icon appears at the right edge of the text input, small (16px), in shuttle color (#536471). On click: loading spinner → small popover/tooltip appears below the field showing:
```
Nota: 7/10
Versión mejorada: "My goal: become a native-level English speaker."
Por qué: "My objective" → "My goal" is more natural. "Natively" → "at a native level" is idiomatic.
```
Popover has a "Aplicar corrección" button (replaces text) and an X to dismiss. Uses burnham/gossip palette for the popover.
**Supported contexts:**
  - Every todo text input (quick-add, inline edit)
  - Journal editor (evaluates the full current entry or selected text if there's a selection)
  - Pill edit modal (CaptureModal) — evaluates the pill's title + body text
**Not supported:** Goal aliases, habit aliases, milestone short titles (too short for meaningful scoring).
**Data:** No DB storage — ephemeral scoring, no logs saved. API call is fire-and-forget per request.
**Technical notes:** New hook: `src/hooks/useGeminiScorer.ts`. Uses `VITE_GEMINI_API_KEY`. Calls `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`. Prompt: `"You are an English writing coach. Score this text 1-10 for English quality, provide a corrected version, and explain in 1-2 sentences what to improve. Text: [input]. Respond in JSON: {score: number, corrected: string, explanation: string}"`. Keep the hook simple — one function `scoreText(text: string): Promise<ScoringResult>`. Each context that needs it calls the hook independently.
**Assumptions:** Gemini API key is available as `VITE_GEMINI_API_KEY`. If not found, the wand icon is hidden and no error is shown. Scoring uses Gemini Flash (cheapest/fastest) to minimize cost. No rate limiting needed for personal use.
**Edge cases:**
- Text is empty → wand icon disabled (greyed out)
- Text is in Spanish → Gemini will score it and note it's not English; that's correct behavior
- API error (timeout, quota) → show "No se pudo evaluar" in the popover, no crash
- Text is already 10/10 → show "¡Excelente! No hay mejoras sugeridas."

---

## Descoped

| Idea | Reason |
|------|--------|
| @person mention in @mention tree | The app is a personal focus tool. Adding a social/contact dimension contradicts the design intent. Not in this spec. |
| AI scorer on goal aliases, habit labels, milestone short titles | These are too short (usually <6 words) for meaningful writing quality feedback. The value is in full-sentence writing contexts (todos, journal, pill descriptions). |
| Copy/cut/paste pills across different journal entries | Technically complex (contentEditable cross-context clipboard), low-frequency use case. Within the same editor session, copy/paste of pills works via standard browser behavior. Cross-entry paste deferred. |

---

## Open questions

None — all blockers resolved. Ready for implementation planning.
