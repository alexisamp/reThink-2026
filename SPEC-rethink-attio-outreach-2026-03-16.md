# SPEC — reThink: Outreach + Attio Integration
**Date:** 2026-03-16
**Status:** ready-to-plan
**Reviewed codebase:** yes
**Scope:** Add a daily outreach log to the Today screen that auto-increments the networking habit, syncs new contacts to Attio, and surfaces conversion funnel stats in Dashboard and Weekly Review.

---

## Context

reThink tracks goals, habits, and todos — but "contact X people per day" produces no data beyond a binary habit checkbox. The user has two outreach goals: maintain their network (5 contacts/day) and prospect (find new business/job leads). Today they log habit completion manually after going to LinkedIn, then re-enter people into Attio. There is no funnel view anywhere.

After this spec is implemented, the user's daily flow is: log a contact in reThink (name + LinkedIn URL + type + notes) → habit auto-increments → person appears in Attio automatically. Weekly Review shows "you contacted 34 people, 4 responded, 1 meeting." Dashboard shows funnel.

---

## Business rationale

**Included:**
- Contact log ties daily execution directly to annual goals — closes the loop that currently exists only for habits/todos.
- Habit auto-increment eliminates double entry (log contact → habit auto-done).
- Attio sync eliminates manual CRM entry.
- Funnel stats (Dashboard + Weekly Review) make networking effort visible and reviewable.
- Contact → Todo spawn allows "send deck to Maria" to live in the same system.

**Descoped (with reasons):**
- **Chrome Extension:** Over-engineered for copy/paste. Adds separate build/maintenance surface. Re-evaluate after 2 weeks of usage.
- **Attio → reThink status pull (automatic/webhook):** Blocked by unknown Attio workspace attribute slug for status. Deferred to a separate spec. reThink is the source of truth for funnel status in this release.
- **Bidirectional real-time sync:** Not justified until outbound sync is stable.
- **Prospecting as a separate habit:** User has one outreach habit currently. Prospecting contacts are tracked separately by `contact_type` but don't need their own habit for now.

---

## Technical notes

- **App is Tauri v2 (desktop):** API calls to Attio go directly from the React frontend via `fetch()`. No CORS issues. No backend proxy needed.
- **Attio API base URL:** `https://api.attio.com`. Auth: `Authorization: Bearer {apiKey}` header on every request.
- **Attio create person endpoint:** `POST /v2/objects/people/records`. Body shape: `{ data: { values: { name: { first_name, last_name, full_name }, linkedin_profile_url: ["url"] } } }`. Attribute slug for LinkedIn is `linkedin_profile_url` (Attio default people object).
- **Attio API key storage:** `localStorage.getItem('attio_api_key')`. Same pattern as other runtime keys in this app. Never hardcoded. Set by user in SettingsModal.
- **QUANTIFIED habits:** `habits.habit_type = 'QUANTIFIED'` and `habits.daily_target = number`. The `habit_logs.value` field stores the current count (integer, not 0/1). Existing `toggleHabit` in `useHabits.ts` only handles BINARY (value 0/1). A new `upsertHabitCount(habitId, count)` function must be added to `useHabits.ts`.
- **New `tracks_outreach` column on `habits`:** Nullable text, values `'networking'` or `'prospecting'`. This links a habit to outreach_log auto-increment without requiring the user to configure anything at runtime — they just set it once in HabitEditModal.
- **Today.tsx is ~1300 lines:** The outreach section is added inside the "Normal Today Content" div, after the Todos section, before the journal/JournalEditor section. Search for `{/* ── Todos ──` as the anchor point.
- **Habit auto-increment logic:** After inserting an outreach_log, call `countTodayOutreach(type)` (counts today's logs by type from local state), then call `upsertHabitCount(habitId, count)` for the matching habit. This replaces the entire habit_log value — not an increment — so it's idempotent.
- **useKeyboardShortcuts.ts pattern:** New ⌘O shortcut added there. Returns a `toggleOutreachPanel` callback that is wired in Today.tsx.
- **OutreachPanel is a slide-in from the right**, same z-index and overlay pattern as `EndOfDayDrawer.tsx`. Use that file as the structural reference.
- **Contact → Todo:** Spawns a new todo via the existing Supabase insert pattern in Today.tsx (`supabase.from('todos').insert(...)`). The todo's `url` field gets the LinkedIn URL of the contact, `goal_id` gets the contact's `goal_id`.

---

## Database migrations required

### 1. New table: `outreach_logs`

```sql
CREATE TABLE outreach_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  linkedin_url TEXT,
  contact_type TEXT NOT NULL DEFAULT 'networking'
    CHECK (contact_type IN ('networking', 'prospecting')),
  status TEXT NOT NULL DEFAULT 'CONTACTED'
    CHECK (status IN (
      'CONTACTED', 'RESPONDED', 'MEETING_SCHEDULED',
      'MET', 'FOLLOWING_UP', 'CLOSED_WON', 'CLOSED_LOST', 'NURTURING'
    )),
  notes TEXT,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  attio_record_id TEXT,
  attio_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE outreach_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own outreach logs"
  ON outreach_logs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_outreach_logs_user_date
  ON outreach_logs(user_id, log_date DESC);
```

### 2. Modify table: `habits`

```sql
ALTER TABLE habits
  ADD COLUMN tracks_outreach TEXT
  CHECK (tracks_outreach IN ('networking', 'prospecting'));
```

---

## Phase 1 — Foundation (no UI changes visible to user)
*Why first: every other phase depends on these types, the hook, and the Attio client existing.*

### F01 · TypeScript types

**File:** `src/types/index.ts`

**Add at end of file:**
```typescript
export type OutreachStatus =
  | 'CONTACTED' | 'RESPONDED' | 'MEETING_SCHEDULED'
  | 'MET' | 'FOLLOWING_UP' | 'CLOSED_WON' | 'CLOSED_LOST' | 'NURTURING'

export type OutreachType = 'networking' | 'prospecting'

export interface OutreachLog {
  id: string
  user_id: string
  goal_id: string | null
  name: string
  linkedin_url: string | null
  contact_type: OutreachType
  status: OutreachStatus
  notes: string | null
  log_date: string         // YYYY-MM-DD
  attio_record_id: string | null
  attio_synced_at: string | null
  created_at: string
  updated_at: string
}
```

**Modify `Habit` interface** — add one field:
```typescript
tracks_outreach: 'networking' | 'prospecting' | null
```
This field is added after `linked_indicator_id`.

**Edge cases:**
- If DB returns `tracks_outreach` as undefined (old rows before migration): treat as `null`. TypeScript type already handles this since it's nullable.

---

### F02 · Attio API client

**File created:** `src/lib/attio.ts`

**Full content:**
```typescript
const BASE = 'https://api.attio.com'

function getApiKey(): string | null {
  return localStorage.getItem('attio_api_key')
}

export const hasAttioKey = (): boolean => !!getApiKey()

interface AttioPersonValues {
  fullName: string
  linkedinUrl?: string
}

interface AttioCreateResult {
  record_id: string
}

/** Creates a person record in Attio. Returns the Attio record_id, or throws on error. */
export async function createAttioPerson(values: AttioPersonValues): Promise<AttioCreateResult> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('No Attio API key configured')

  const nameParts = values.fullName.trim().split(' ')
  const firstName = nameParts[0] ?? ''
  const lastName = nameParts.slice(1).join(' ') || ''

  const body: Record<string, unknown> = {
    data: {
      values: {
        name: {
          first_name: firstName,
          last_name: lastName,
          full_name: values.fullName.trim(),
        },
        ...(values.linkedinUrl ? { linkedin_profile_url: [values.linkedinUrl] } : {}),
      },
    },
  }

  const res = await fetch(`${BASE}/v2/objects/people/records`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Attio error ${res.status}: ${text}`)
  }

  const json = await res.json()
  // Attio returns { data: { id: { record_id: "..." } } }
  const recordId = json?.data?.id?.record_id as string | undefined
  if (!recordId) throw new Error('Attio response missing record_id')
  return { record_id: recordId }
}

/** Fetches a person record from Attio by record_id. Used for pull sync. */
export async function getAttioPerson(recordId: string): Promise<Record<string, unknown> | null> {
  const apiKey = getApiKey()
  if (!apiKey) return null

  const res = await fetch(`${BASE}/v2/objects/people/records/${recordId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!res.ok) return null
  const json = await res.json()
  return json?.data ?? null
}
```

**Edge cases:**
- Full name with only one word (e.g., "Madonna") → `first_name: "Madonna"`, `last_name: ""`. Attio accepts empty last_name.
- LinkedIn URL without `https://` prefix → sent as-is (Attio accepts partial URLs).
- API key has leading/trailing spaces → `localStorage.getItem` returns it as-is. The `getApiKey()` function should trim: `return localStorage.getItem('attio_api_key')?.trim() ?? null`.

---

### F03 · Attio API key in Settings

**File modified:** `src/components/SettingsModal.tsx`

**What changes:** Add a new section "Integrations" below the existing content (before the closing `</div>` of the Content section). The section title style matches the existing Settings header pattern (`text-[10px] font-semibold text-shuttle uppercase tracking-widest`).

**UI markup:**
```
── Integrations ──────────────────────────────────────────────
ATTIO
[input: placeholder "Bearer token..." type="password" show/hide toggle]
[Saved ✓] shown when key is set; [Not configured] when empty
```

**State variables added to SettingsModal:**
- `attioKey: string` — initialized from `localStorage.getItem('attio_api_key') ?? ''`
- `attioKeyVisible: boolean` — default false
- `attioSaved: boolean` — default false (shows "Saved ✓" for 2 seconds after save)

**Functions added:**
- `saveAttioKey()` — trims value, writes to `localStorage.setItem('attio_api_key', attioKey.trim())`, sets `attioSaved = true`, resets it to false after 2000ms via `setTimeout`.
- `clearAttioKey()` — removes from localStorage, clears `attioKey` state.

**Trigger:** Input `onBlur` + Enter key `onKeyDown` both call `saveAttioKey()`. Also a visible "Save" button next to the input.

**Edge cases:**
- User clears the input and saves: calls `clearAttioKey()` — removes key, shows "Not configured".
- Input shows `••••••••` by default (type="password"). Eye icon (PhosphorIcon `Eye`/`EyeSlash`) toggles `attioKeyVisible`.

---

### F04 · `upsertHabitCount` in useHabits

**File modified:** `src/hooks/useHabits.ts`

**Add new exported function inside `useHabits`:**
```typescript
/** For QUANTIFIED habits: sets today's log value to `count`. Idempotent. */
const upsertHabitCount = async (habitId: string, count: number) => {
  if (!userId) return
  const existing = logs.find(l => l.habit_id === habitId)
  if (existing) {
    await supabase.from('habit_logs').update({ value: count }).eq('id', existing.id)
    setLogs(prev => prev.map(l => l.id === existing.id ? { ...l, value: count } : l))
  } else {
    const { data } = await supabase
      .from('habit_logs')
      .insert({ habit_id: habitId, user_id: userId, log_date: today, value: count })
      .select().single()
    if (data) setLogs(prev => [...prev, data])
  }
}
```

**Return value update:** Add `upsertHabitCount` to the return object of `useHabits`.

**Edge cases:**
- Called with `count = 0`: writes value 0, which un-completes the habit. This is correct behavior (if user deletes a contact log, count decreases).
- Called concurrently (two contacts logged in rapid succession): second call overwrites first. This is acceptable since both calls recount from local state which is already updated.

---

### F05 · `useOutreach` hook

**File created:** `src/hooks/useOutreach.ts`

**Exports:**
```typescript
export function useOutreach(
  userId: string | undefined,
  habits: Habit[],               // from Today — needed for habit auto-increment
  upsertHabitCount: (habitId: string, count: number) => Promise<void>
)
```

**State:**
- `logs: OutreachLog[]` — all logs for the current user (fetched on mount)
- `todayLogs: OutreachLog[]` — computed: `logs.filter(l => l.log_date === localDate())`
- `loading: boolean`
- `syncing: boolean` — true while Attio API call is in flight
- `syncError: string | null` — last Attio sync error message, cleared on next save

**Functions:**

`fetchLogs()`:
```
SELECT * FROM outreach_logs WHERE user_id = userId ORDER BY log_date DESC, created_at DESC
```
Fetches last 90 days (`.gte('log_date', dateNinetyDaysAgo)`). Stores in `logs`.

`addContact(input: OutreachLogInput) → Promise<OutreachLog>`:
```
OutreachLogInput = {
  name: string
  linkedin_url?: string
  contact_type: OutreachType
  status: OutreachStatus       // default 'CONTACTED'
  notes?: string
  goal_id?: string
  log_date?: string            // default: localDate()
}
```
Steps:
1. INSERT into `outreach_logs` with `user_id`, all input fields, `log_date = input.log_date ?? localDate()`
2. Update local `logs` state with new record
3. Call `autoIncrementHabit(input.contact_type)` (see below)
4. If `hasAttioKey()`: call `createAttioPerson({ fullName: input.name, linkedinUrl: input.linkedin_url })` in background (do not await — fire and forget with catch)
   - On success: `supabase.from('outreach_logs').update({ attio_record_id, attio_synced_at: now() }).eq('id', newLog.id)`; update local state.
   - On failure: set `syncError` to the error message. Do NOT block the user — contact is already saved locally.
5. Return the newly created `OutreachLog`.

`updateContact(id: string, updates: Partial<OutreachLogInput>) → Promise<void>`:
1. PATCH `outreach_logs` row by id
2. Update local `logs` state
3. If `contact_type` changed: re-run `autoIncrementHabit` for both old and new type (to correctly recount)

`deleteContact(id: string) → Promise<void>`:
1. DELETE from `outreach_logs`
2. Remove from local `logs` state
3. Re-run `autoIncrementHabit` for the deleted contact's type (decrements the count)

`autoIncrementHabit(type: OutreachType) → void`:
1. Find `habit` in `habits` where `habit.tracks_outreach === type && habit.is_active`
2. If not found: return (no-op)
3. Count today's logs of that type in local state (after state update): `countToday = todayLogs.filter(l => l.contact_type === type).length`
4. Call `upsertHabitCount(habit.id, countToday)`

`pullAttioStatus(logs: OutreachLog[]) → Promise<void>`:
- Filters logs where `attio_record_id !== null`
- For each (with 300ms delay between calls to respect rate limits):
  - Calls `getAttioPerson(attio_record_id)` — currently just refreshes the record but does NOT map status (deferred to future spec — Attio status slug unknown)
- Currently a no-op placeholder for Phase 3 future implementation.

**Return:** `{ logs, todayLogs, loading, syncing, syncError, addContact, updateContact, deleteContact, fetchLogs, pullAttioStatus }`

---

### F06 · `tracks_outreach` in HabitEditModal

**File modified:** `src/components/HabitEditModal.tsx`

**What changes:** Add a new optional field at the bottom of the form: "This habit tracks outreach" — a `<select>` with options:
- `""` → "None" (default)
- `"networking"` → "Networking contacts"
- `"prospecting"` → "Prospecting contacts"

**UI:** Same `<select>` style as existing dropdowns in the modal. Label: `text-[10px] font-semibold text-shuttle uppercase tracking-widest`.

**Behavior:** On save, writes the selected value (or `null` if "None") to `habits.tracks_outreach` via the existing `upsertHabit` call (the field is already part of the Habit type from F01).

**Edge cases:**
- Two habits both set to `tracks_outreach = 'networking'`: the hook uses `find()` which returns the first match. Add a note in the UI: if this would create a duplicate, warn "Another habit already tracks networking." — check via `habits.find(h => h.tracks_outreach === selectedValue && h.id !== currentHabit.id)`.

---

## Phase 2 — Today Screen UI
*Depends on: Phase 1 (all features)*

### F07 · Outreach section in Today

**File modified:** `src/screens/Today.tsx`

**State variables added (inside `Today()` function, with existing state declarations):**
- `outreachPanelOpen: boolean` — default `false`
- `outreachLogs: OutreachLog[]` — populated by `useOutreach`
- `editingOutreachLog: OutreachLog | null` — `null` = new, non-null = editing existing

**Hook instantiation (near top of Today, with other hooks):**
```typescript
const {
  todayLogs: todayOutreach,
  logs: allOutreachLogs,
  loading: outreachLoading,
  syncing: outreachSyncing,
  syncError: outreachSyncError,
  addContact,
  updateContact,
  deleteContact,
} = useOutreach(userId ?? undefined, habits, upsertHabitCount)
```
Note: `upsertHabitCount` must be imported from the `useHabits` call that already exists in Today. Verify that `useHabits` is called in Today.tsx and its return is destructured — add `upsertHabitCount` to that destructure.

**Keyboard shortcut ⌘O:**
In `src/hooks/useKeyboardShortcuts.ts`, add a new shortcut entry for `metaKey + key === 'o'` that calls `onToggleOutreach()`. Pass this callback from Today.tsx.

In Today.tsx, inside `useKeyboardShortcuts` call (or directly in the existing `useEffect` for keyboard events), add:
```typescript
if (e.metaKey && e.key === 'o') {
  e.preventDefault()
  setOutreachPanelOpen(prev => !prev)
}
```

**UI location:** Inside the "Normal Today Content" `<div className="flex-1 min-h-0 overflow-y-auto">`, after the closing `</section>` of the Todos section, before the journal section. Anchor: find `{/* ── Journal/Notes ──` or the `<JournalEditor` component.

**Section JSX structure:**
```tsx
{/* ── Outreach ──────────────────────────────────────── */}
<section className="mb-8">
  <div className="flex items-center justify-between mb-3">
    <h3 className="text-[10px] font-semibold text-shuttle uppercase tracking-widest flex items-center gap-2">
      Outreach
      <span className="font-mono font-normal text-shuttle/40 normal-case">
        {todayOutreach.length}
      </span>
    </h3>
    <span className="text-[9px] font-mono text-shuttle/25 border border-mercury/50 rounded px-1">⌘O</span>
  </div>

  {/* Contact rows */}
  <div className="space-y-1">
    {todayOutreach.map(log => (
      <OutreachRow
        key={log.id}
        log={log}
        onEdit={() => { setEditingOutreachLog(log); setOutreachPanelOpen(true) }}
        onDelete={() => deleteContact(log.id)}
      />
    ))}
  </div>

  {/* Quick-add row */}
  <button
    onClick={() => { setEditingOutreachLog(null); setOutreachPanelOpen(true) }}
    className="mt-2 flex items-center gap-2 text-[11px] text-shuttle/40 hover:text-shuttle transition-colors w-full text-left py-1"
  >
    <span className="text-base leading-none">+</span>
    <span>Log a contact</span>
  </button>

  {/* Attio sync error toast */}
  {outreachSyncError && (
    <p className="mt-1 text-[10px] text-red-400">{outreachSyncError}</p>
  )}
</section>
```

**`OutreachRow` component** (defined in the same file, above `Today()`):
```tsx
interface OutreachRowProps {
  log: OutreachLog
  onEdit: () => void
  onDelete: () => void
}

function OutreachRow({ log, onEdit, onDelete }: OutreachRowProps) {
  return (
    <div className="group flex items-center gap-2 py-1.5 px-2 -mx-2 rounded hover:bg-gossip/20 transition-colors">
      {/* Type badge */}
      <span className={`text-[8px] font-mono uppercase px-1.5 py-0.5 rounded shrink-0 ${
        log.contact_type === 'networking'
          ? 'bg-burnham/10 text-burnham'
          : 'bg-shuttle/10 text-shuttle'
      }`}>
        {log.contact_type === 'networking' ? 'NET' : 'PRO'}
      </span>

      {/* Name */}
      <span className="text-[13px] font-medium text-burnham flex-1 truncate">{log.name}</span>

      {/* Status badge */}
      <StatusBadge status={log.status} />

      {/* LinkedIn icon */}
      {log.linkedin_url && (
        <a
          href={log.linkedin_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity text-shuttle"
          title="Open LinkedIn profile"
        >
          <ArrowSquareOut size={12} />
        </a>
      )}

      {/* Attio synced indicator */}
      {log.attio_record_id && (
        <span className="opacity-0 group-hover:opacity-40 text-[8px] font-mono text-pastel shrink-0">attio</span>
      )}

      {/* Actions */}
      <button
        onClick={onEdit}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-shuttle hover:text-burnham p-0.5"
      >
        <Pencil size={11} />
      </button>
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-shuttle hover:text-red-400 p-0.5"
      >
        <TrashSimple size={11} />
      </button>
    </div>
  )
}
```

**`StatusBadge` component** (defined above `Today()`):
```tsx
const STATUS_CONFIG: Record<OutreachStatus, { label: string; classes: string }> = {
  CONTACTED:          { label: 'contacted',  classes: 'bg-mercury/50 text-shuttle/60' },
  RESPONDED:          { label: 'responded',  classes: 'bg-gossip text-burnham' },
  MEETING_SCHEDULED:  { label: 'meeting',    classes: 'bg-pastel/30 text-burnham' },
  MET:                { label: 'met',        classes: 'bg-pastel/60 text-burnham' },
  FOLLOWING_UP:       { label: 'follow up',  classes: 'bg-gossip text-shuttle' },
  CLOSED_WON:         { label: 'won',        classes: 'bg-pastel text-burnham font-semibold' },
  CLOSED_LOST:        { label: 'lost',       classes: 'bg-mercury text-shuttle/50' },
  NURTURING:          { label: 'nurturing',  classes: 'bg-mercury/30 text-shuttle/50' },
}

function StatusBadge({ status }: { status: OutreachStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={`text-[8px] px-1.5 py-0.5 rounded font-mono ${cfg.classes}`}>
      {cfg.label}
    </span>
  )
}
```

**Required new imports in Today.tsx:**
- `OutreachLog, OutreachStatus, OutreachType` from `@/types`
- `useOutreach` from `@/hooks/useOutreach`
- `OutreachPanel` from `@/components/OutreachPanel`
- `ArrowSquareOut` from `@phosphor-icons/react`
- `StatusBadge`, `OutreachRow` are defined in the same file (no import needed)

**Edge cases:**
- `todayOutreach` is empty: show only the "+ Log a contact" button, no empty state message.
- `outreachLoading` is true on mount: show nothing (section renders empty then fills in, same pattern as todos).
- User presses ⌘O while `OutreachPanel` is already open: closes it (toggle).
- Day state is `'COMPLETED'` (day complete summary view): Outreach section is NOT shown (it's inside the `dayState !== 'COMPLETED'` branch anyway — verify the JSX wrapping).

---

### F08 · OutreachPanel component

**File created:** `src/components/OutreachPanel.tsx`

**Props:**
```typescript
interface OutreachPanelProps {
  open: boolean
  onClose: () => void
  editingLog: OutreachLog | null          // null = new contact
  goals: Pick<Goal, 'id' | 'text' | 'alias'>[]
  onSave: (input: OutreachLogInput) => Promise<void>
  syncing: boolean
}
```

**Structure:** Slide-in panel from right, same as `EndOfDayDrawer.tsx`. Use `fixed inset-y-0 right-0 z-[200] w-80 bg-white border-l border-mercury shadow-2xl flex flex-col transition-transform duration-200` with `translate-x-0` when open and `translate-x-full` when closed. Overlay backdrop: `fixed inset-0 z-[199] bg-black/10` (click closes panel).

**Local state:**
- `name: string` — initialized from `editingLog?.name ?? ''`
- `linkedinUrl: string` — initialized from `editingLog?.linkedin_url ?? ''`
- `contactType: OutreachType` — initialized from `editingLog?.contact_type ?? 'networking'`
- `status: OutreachStatus` — initialized from `editingLog?.status ?? 'CONTACTED'`
- `notes: string` — initialized from `editingLog?.notes ?? ''`
- `goalId: string` — initialized from `editingLog?.goal_id ?? ''`
- `saving: boolean` — default false

**Reset on open:** `useEffect(() => { if (open) { setName(editingLog?.name ?? ''); setLinkedinUrl(...); ... } }, [open, editingLog])`

**Header:**
```
[X button]   "Log contact" (new) | editingLog.name (edit)
```
X button closes panel (`onClose()`). Keyboard: Escape key closes panel (`useEffect` adds/removes `keydown` listener).

**Form fields (in order):**

1. **Name** — `<input type="text" required placeholder="Full name" value={name} onChange={...} className="w-full border border-mercury rounded-lg px-3 py-2 text-sm text-burnham focus:outline-none focus:border-burnham">`
   - Label: `text-[10px] font-semibold text-shuttle uppercase tracking-widest mb-1`
   - Auto-focus on open via `autoFocus` prop.

2. **LinkedIn URL** — `<input type="text" placeholder="linkedin.com/in/..." value={linkedinUrl} ...>`
   - Optional. No validation (user can paste partial URLs).

3. **Type** — Pill toggle (two buttons side by side):
   ```
   [Networking]  [Prospecting]
   ```
   Active pill: `bg-burnham text-white`. Inactive: `bg-mercury/30 text-shuttle`.
   Both are `text-xs font-medium px-3 py-1.5 rounded-lg transition-colors`.

4. **Status** — `<select value={status} onChange={...} className="w-full border border-mercury rounded-lg px-3 py-2 text-sm text-burnham focus:outline-none focus:border-burnham">`:
   ```
   <option value="CONTACTED">Contacted</option>
   <option value="RESPONDED">Responded</option>
   <option value="MEETING_SCHEDULED">Meeting Scheduled</option>
   <option value="MET">Met</option>
   <option value="FOLLOWING_UP">Following Up</option>
   <option value="CLOSED_WON">Closed Won</option>
   <option value="CLOSED_LOST">Closed Lost</option>
   <option value="NURTURING">Nurturing</option>
   ```

5. **Goal** — `<select value={goalId} onChange={...}>`:
   ```
   <option value="">No goal linked</option>
   {goals.map(g => <option key={g.id} value={g.id}>{g.alias ?? g.text?.slice(0, 30)}</option>)}
   ```

6. **Notes** — `<textarea rows={3} placeholder="Notes about the conversation..." value={notes} onChange={...} className="w-full border border-mercury rounded-lg px-3 py-2 text-sm text-burnham resize-none focus:outline-none focus:border-burnham">`

**Footer:**
```
[Cancel (text button, text-shuttle)]  [Save (burnham bg, text-white, disabled+opacity-50 while saving)]
```
If `syncing && editingLog === null`: show a small spinner next to Save, and text "Saving to Attio..." below the button.

**Attio sync status** (only when editing an existing log with attio_record_id):
```
<p className="text-[10px] text-shuttle/40 font-mono">
  Synced to Attio {formatRelativeTime(editingLog.attio_synced_at)}
</p>
```

**Save behavior:**
1. Validate: `name.trim()` is required. If empty: set error state, do not save.
2. Set `saving = true`.
3. Call `onSave({ name, linkedin_url: linkedinUrl || null, contact_type: contactType, status, notes: notes || null, goal_id: goalId || null })`.
4. `onSave` is async — await it.
5. On completion: `saving = false`, call `onClose()`.
6. On error: `saving = false`, show error toast inside panel.

**Contact → Todo spawn:**
Below the Notes field, add a checkbox: `[ ] Create a todo from this contact`.
If checked, reveal a text input: placeholder "What do you need to do?" (pre-filled with empty string).
On save, if checked and todo text is non-empty: after `onSave()`, call the `submitTodo` function passed from Today via an `onSpawnTodo` prop:
```typescript
onSpawnTodo?: (text: string, linkedinUrl: string | null, goalId: string | null) => void
```
This creates a todo with `text = todoText`, `url = linkedinUrl`, `goal_id = goalId`.

**Props update to include `onSpawnTodo`:**
```typescript
onSpawnTodo: (text: string, linkedinUrl: string | null, goalId: string | null) => void
```

**Edge cases:**
- User opens panel for edit, changes nothing, clicks Save: saves with unchanged values (OK — idempotent update).
- LinkedIn URL entered without `https://`: saved as-is. Not validated. Attio handles partial URLs.
- Panel open on mobile/compact mode (Today is ~400px wide): panel overlaps entire screen. Acceptable since this is a desktop app.

---

## Phase 3 — Intelligence & Visibility
*Depends on: Phase 1 (all), Phase 2 (all)*

### F09 · Weekly Review outreach stats

**File modified:** `src/screens/WeeklyReview.tsx`

**Where:** In the `'Data Review'` step (index 1 in `STEPS` array: `['Wins', 'Data Review', 'Friction Log', 'Next Week', 'Commit']`). Add after the existing habit/KPI review section.

**Data to fetch:** Inside `WeeklyReview`, add a `useEffect` that runs on mount:
```typescript
const [weekOutreach, setWeekOutreach] = useState<OutreachLog[]>([])

useEffect(() => {
  if (!userId) return
  supabase
    .from('outreach_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('log_date', startStr)
    .lte('log_date', endStr)
    .then(({ data }) => setWeekOutreach(data ?? []))
}, [userId, startStr, endStr])
```

**Computed stats** (derived from `weekOutreach`):
```typescript
const outreachStats = {
  total: weekOutreach.length,
  networking: weekOutreach.filter(l => l.contact_type === 'networking').length,
  prospecting: weekOutreach.filter(l => l.contact_type === 'prospecting').length,
  responded: weekOutreach.filter(l => ['RESPONDED','MEETING_SCHEDULED','MET','FOLLOWING_UP','CLOSED_WON'].includes(l.status)).length,
  meetings: weekOutreach.filter(l => ['MEETING_SCHEDULED','MET'].includes(l.status)).length,
  won: weekOutreach.filter(l => l.status === 'CLOSED_WON').length,
}
```

**UI block to add in Data Review step:**
```tsx
{weekOutreach.length > 0 && (
  <div className="mt-6 pt-5 border-t border-mercury">
    <p className="text-[10px] font-mono text-shuttle/40 uppercase tracking-[0.15em] mb-3">Outreach this week</p>
    <div className="grid grid-cols-3 gap-3">
      <StatBox label="Contacted" value={outreachStats.total} />
      <StatBox label="Responded" value={outreachStats.responded} />
      <StatBox label="Meetings" value={outreachStats.meetings} />
    </div>
    {outreachStats.total > 0 && (
      <p className="mt-2 text-[10px] text-shuttle/50">
        {Math.round((outreachStats.responded / outreachStats.total) * 100)}% response rate
        {outreachStats.networking > 0 && ` · ${outreachStats.networking} network`}
        {outreachStats.prospecting > 0 && ` · ${outreachStats.prospecting} prospects`}
      </p>
    )}
  </div>
)}
```

`StatBox` is a local inline component (defined above `WeeklyReview`):
```tsx
function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-mercury/20 rounded-xl p-3 text-center">
      <p className="text-xl font-semibold text-burnham font-mono">{value}</p>
      <p className="text-[9px] text-shuttle/50 uppercase tracking-widest mt-0.5">{label}</p>
    </div>
  )
}
```

**Edge cases:**
- `weekOutreach.length === 0`: entire block is hidden (`weekOutreach.length > 0` guard). No empty state shown.
- `outreachStats.total === 0` but array is non-empty: impossible (total = array.length). Safe.

---

### F10 · Dashboard mini-funnel

**File modified:** `src/screens/Dashboard.tsx`

**What to add:** A new card "Outreach Funnel" placed after the existing "Habits" card. Read last 30 days of outreach_logs.

**Data fetch:** Add inside `Dashboard`:
```typescript
const [outreach30, setOutreach30] = useState<OutreachLog[]>([])

useEffect(() => {
  if (!userId) return
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const cutoff = thirtyDaysAgo.toISOString().split('T')[0]
  supabase
    .from('outreach_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('log_date', cutoff)
    .then(({ data }) => setOutreach30(data ?? []))
}, [userId])
```

**Funnel data:**
```typescript
const funnel = [
  { label: 'Contacted',  count: outreach30.length },
  { label: 'Responded',  count: outreach30.filter(l => ['RESPONDED','MEETING_SCHEDULED','MET','FOLLOWING_UP','CLOSED_WON'].includes(l.status)).length },
  { label: 'Meetings',   count: outreach30.filter(l => ['MEETING_SCHEDULED','MET'].includes(l.status)).length },
  { label: 'Won',        count: outreach30.filter(l => l.status === 'CLOSED_WON').length },
]
```

**UI card:**
```tsx
{outreach30.length > 0 && (
  <section className="mb-8">
    <h3 className="text-[10px] font-semibold text-shuttle uppercase tracking-widest mb-4">
      Outreach · 30 days
    </h3>
    <div className="flex items-end gap-3">
      {funnel.map((step, i) => {
        const pct = funnel[0].count > 0 ? (step.count / funnel[0].count) * 100 : 0
        return (
          <div key={step.label} className="flex-1 text-center">
            <div className="relative bg-mercury/20 rounded-lg overflow-hidden" style={{ height: 60 }}>
              <div
                className="absolute bottom-0 left-0 right-0 bg-pastel/60 rounded-lg transition-all"
                style={{ height: `${pct}%` }}
              />
            </div>
            <p className="text-lg font-semibold text-burnham font-mono mt-1">{step.count}</p>
            <p className="text-[8px] text-shuttle/40 uppercase tracking-widest">{step.label}</p>
            {i > 0 && funnel[i - 1].count > 0 && (
              <p className="text-[8px] font-mono text-shuttle/30">
                {Math.round((step.count / funnel[i - 1].count) * 100)}%
              </p>
            )}
          </div>
        )
      })}
    </div>
  </section>
)}
```

**Edge cases:**
- All contacts have status `'CONTACTED'`: funnel shows 1 bar filled, rest empty. Valid.
- `outreach30.length === 0`: entire block hidden.
- Conversion rate `Infinity` (0 contacts in previous stage but some in current): guarded by `funnel[i-1].count > 0` check.

---

## Descoped

| Feature | Reason |
|---------|--------|
| Chrome Extension | Separate build/distribution surface. Copy/paste sufficient for now. |
| Attio → reThink webhook | Attio custom status slug unknown. Deferred to Phase 4 spec. |
| Bidirectional real-time sync | Not justified until Phase 1-3 are stable. |
| Prospecting as a daily habit | User has one outreach habit. Type filter handles the distinction. |
| Attio status push (outbound) | reThink is source of truth for status. Attio receives person, not status. |

---

## Open questions

**Before implementation starts, I need answers to:**

1. **¿Cuál es el texto exacto del habit de networking en tu Supabase?** (ej: "Contactar 5 personas") — Esto es para la nota en HabitEditModal que guía al usuario a configurar `tracks_outreach` correctamente. No bloquea el código, pero necesito saber si es un habit BINARY hoy para incluir instrucciones de migración en el plan.

2. **¿El habit de prospecting existe como habit separado, o solo el de networking?** — Si existe un segundo habit para prospecting, se puede configurar con `tracks_outreach = 'prospecting'`. Si no existe, el sistema simplemente no auto-incrementa nada para ese tipo (el log se crea igual, pero no modifica ningún habit).

3. **Cuando el usuario edita un contacto que ya fue sincronizado a Attio (tiene `attio_record_id`), ¿querés que se actualice también en Attio, o solo en reThink?** — En el spec actual, edits solo actualizan Supabase. Attio queda con los datos del primer sync. Si querés que también se actualice en Attio, necesito agregar `PATCH /v2/objects/people/records/{id}` en `updateContact()`. Esto es una línea de código pero cambia el comportamiento y el spec debe reflejarlo.
