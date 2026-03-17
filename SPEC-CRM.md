# SPEC — reThink Personal CRM Overhaul
**Status**: APPROVED FOR IMPLEMENTATION
**Date**: 2026-03-17
**Scope**: Full overhaul of the Outreach system into a two-dimension personal CRM

---

## 0. Naming

| Concept | UI label | Internal code name |
|---------|----------|-------------------|
| The new screen | **People** | `PeopleScreen` / route `/people` |
| A single person | **person** | `Contact` (type) |
| The list | **People** | `contacts` (DB table stays `outreach_logs`) |
| Nav item | **People** | — |
| Drawer | **[Name]'s profile** | `ContactDetailDrawer` |

> Never show "Contact" or "CRM" in the UI. It's always "People" / "person".

---

## 1. Vision

reThink becomes a **relationship OS**: every person lives in a relationship funnel (depth of bond), not a sales pipeline. Business pipeline tracking lives in Attio. The two are linked but separate.

**Two dimensions per contact:**
- **Relationship status** — where the relationship stands (PROSPECT → DORMANT)
- **Health score** — how alive the relationship is right now (1–10, computed from interactions)

---

## 2. Relationship Funnel (replaces OutreachStatus)

Two entry paths — not a single linear flow:

```
NEW CONTACTS:     PROSPECT → INTRO → CONNECTED ──┐
                                                   ↓
KNOWN CONTACTS:   RECONNECT ────────────────────► ENGAGED → NURTURING
                       ↑                                         │
DORMANT → (re-engage manually) ──────────────────┘             ↓
                                                             DORMANT
                                                         (auto 90d / manual)
```

| Status key | Default label | Default description |
|-----------|--------------|---------------------|
| `PROSPECT` | Prospect | Identified as someone worth knowing — haven't reached out yet |
| `INTRO` | Intro | Made first contact — waiting for response or very early exchange |
| `CONNECTED` | Connected | Mutual exchange established — building the relationship |
| `RECONNECT` | Reconnect | Known from before — relationship lapsed, actively trying to re-engage |
| `ENGAGED` | Engaged | Had real conversations — relationship actively growing |
| `NURTURING` | Nurturing | Established relationship — maintaining it with periodic touchpoints |
| `DORMANT` | Dormant | No recent activity — went quiet (90 days+ or manually flagged) |

**Key overlap clarifications:**
- `RECONNECT` vs `CONNECTED`: RECONNECT = existing past relationship being reactivated. CONNECTED = new relationship being built for the first time. Mutually exclusive by intent.
- `ENGAGED` vs `NURTURING`: Both have real conversations. ENGAGED = actively building (first months). NURTURING = established over time, now in maintenance mode. Transition is manual (user decides when the relationship feels "established").

**The labels, descriptions, and criteria are fully customizable per user** — stored in DB, editable in Settings. The status keys in the DB are immutable; only display content changes.

**Migration mapping** for existing `outreach_logs` records:
| Old status | → New status |
|-----------|-------------|
| CONTACTED | INTRO |
| RESPONDED | CONNECTED |
| MEETING_SCHEDULED | CONNECTED |
| MET | ENGAGED |
| FOLLOWING_UP | NURTURING |
| CLOSED_WON | NURTURING |
| CLOSED_LOST | DORMANT |
| NURTURING | NURTURING |

---

## 3. Contact Categories (replaces contact_type)

`contact_type: 'networking' | 'prospecting'` is **replaced** by `category`.

| Value | Use case |
|-------|---------|
| `business_dev` | Potential partnerships, BD conversations |
| `partner` | Active partners |
| `client` | Current or past clients |
| `mentor` | Advisors, coaches, mentors |
| `job_us` | People relevant to US job search |
| `peer` | Professional peers, industry contacts |
| `friend` | Personal friends |
| `family` | Family |

**Migration**: `contact_type='prospecting'` → `category='business_dev'`, `contact_type='networking'` → `category='peer'`
**Chrome extension**: shows category picker before saving. Defaults to `'peer'`.
**Attio**: `category` is always sent to Attio as a custom field. User configures the field options in Attio manually.

---

## 4. Habit Tracking (no DB migration needed on habits table)

Two habits drive the relationship engine:

| Goal | Habit (target) | `tracks_outreach` value | Trigger |
|------|---------------|------------------------|---------|
| Map 10 contacts/day | "Mapear contactos" (target: 10) | `'prospecting'` | A new contact is added (any status: PROSPECT or RECONNECT, any category) |
| Talk to 5 people/day | "Hablar con contactos" (target: 5) | `'networking'` | An interaction is logged — counts **distinct contacts per day** |

**These two habits are fully independent and don't overlap:**
- You can map 10 without talking to anyone (just adding people)
- You can talk to 5 without adding new contacts
- Adding someone AND logging an interaction on the same day → increments both

**Count logic:**
```typescript
// 'prospecting' habit: total contacts added today
const mappedToday = contacts.filter(c => c.log_date === today).length

// 'networking' habit: distinct contacts with at least one interaction today
const talkedToday = new Set(
  interactions.filter(i => i.interaction_date === today).map(i => i.contact_id)
).size
```

**HabitEditModal UI labels** (update only):
- `'prospecting'` → "New contacts mapped"
- `'networking'` → "People talked to today"

**Logic in `useContacts.ts` + `useInteractions.ts`:**
```
addContact()       → upsertHabitCount('prospecting', mappedToday + 1)
logInteraction()   → upsertHabitCount('networking', distinctTalkedToday)
deleteInteraction()→ upsertHabitCount('networking', distinctTalkedToday)
```

---

## 5. New Table: `interactions`

Logs individual touchpoints between the user and a contact.

```sql
CREATE TABLE interactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  contact_id       UUID REFERENCES outreach_logs(id) ON DELETE CASCADE NOT NULL,
  type             TEXT NOT NULL CHECK (type IN (
                     'whatsapp', 'linkedin_msg', 'email',
                     'call', 'virtual_coffee', 'in_person'
                   )),
  direction        TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound', 'inbound')),
  notes            TEXT,
  interaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_interactions_contact_id ON interactions(contact_id);
CREATE INDEX idx_interactions_user_date ON interactions(user_id, interaction_date DESC);
```

**Interaction types and base points:**
| Type | Points |
|------|--------|
| `whatsapp` | 1 |
| `linkedin_msg` | 1 |
| `email` | 2 |
| `call` | 3 |
| `virtual_coffee` | 4 |
| `in_person` | 5 |

---

## 6. Health Score Formula

Computed in JS (not DB), stored in `outreach_logs.health_score` (INT, 1–10).

```typescript
// Time decay multipliers
function decayFactor(daysAgo: number): number {
  if (daysAgo <= 7)  return 1.0
  if (daysAgo <= 30) return 0.7
  if (daysAgo <= 90) return 0.4
  if (daysAgo <= 365) return 0.1
  return 0
}

// Base points per interaction type
const POINTS = {
  in_person: 5, virtual_coffee: 4, call: 3,
  email: 2, linkedin_msg: 1, whatsapp: 1
}

function computeHealthScore(interactions: Interaction[]): number {
  const rawScore = interactions.reduce((sum, i) => {
    const daysAgo = daysSince(i.interaction_date)
    return sum + (POINTS[i.type] * decayFactor(daysAgo))
  }, 0)
  return Math.min(10, Math.max(1, Math.round(rawScore)))
}
```

Health score is **recomputed and saved** to `outreach_logs.health_score` whenever an interaction is added, updated, or deleted.

---

## 7. DB Changes to `outreach_logs`

### New columns to add:
```sql
ALTER TABLE outreach_logs
  ADD COLUMN category TEXT CHECK (category IN (
    'business_dev','partner','client','mentor','job_us','peer','friend','family'
  )),
  ADD COLUMN personal_context TEXT,
  ADD COLUMN skills TEXT,            -- comma-separated skills/expertise, e.g. "growth marketing, PR"
  ADD COLUMN health_score INT DEFAULT 1,
  ADD COLUMN last_interaction_at TIMESTAMPTZ;
```

### Status constraint update:
```sql
-- Drop old constraint, add new one
ALTER TABLE outreach_logs
  DROP CONSTRAINT IF EXISTS outreach_logs_status_check;

ALTER TABLE outreach_logs
  ADD CONSTRAINT outreach_logs_status_check
  CHECK (status IN ('PROSPECT','INTRO','CONNECTED','RECONNECT','ENGAGED','NURTURING','DORMANT'));

-- Migrate existing data
UPDATE outreach_logs SET status = CASE status
  WHEN 'CONTACTED'         THEN 'INTRO'
  WHEN 'RESPONDED'         THEN 'CONNECTED'
  WHEN 'MEETING_SCHEDULED' THEN 'CONNECTED'
  WHEN 'MET'               THEN 'ENGAGED'
  WHEN 'FOLLOWING_UP'      THEN 'NURTURING'
  WHEN 'CLOSED_WON'        THEN 'NURTURING'
  WHEN 'CLOSED_LOST'       THEN 'DORMANT'
  ELSE status
END;

-- Migrate contact_type → category
UPDATE outreach_logs SET category = CASE contact_type
  WHEN 'prospecting' THEN 'business_dev'
  WHEN 'networking'  THEN 'peer'
  ELSE 'peer'
END
WHERE category IS NULL;
```

### TypeScript type update (`OutreachLog` → `Contact`):
```typescript
export type ContactStatus =
  'PROSPECT' | 'INTRO' | 'CONNECTED' | 'RECONNECT' | 'ENGAGED' | 'NURTURING' | 'DORMANT'

// User-customizable funnel config — stored in profiles.contact_funnel_config
export interface FunnelStageConfig {
  label: string
  description: string
  entry_criteria: string
  exit_criteria: string
}

export type ContactFunnelConfig = Record<ContactStatus, FunnelStageConfig>

// Full defaults defined in src/lib/funnelDefaults.ts (extracted from DB default JSONB)

export type ContactCategory =
  'business_dev' | 'partner' | 'client' | 'mentor' | 'job_us' | 'peer' | 'friend' | 'family'

export interface Contact {
  id: string
  user_id: string
  goal_id: string | null
  name: string
  linkedin_url: string | null
  category: ContactCategory | null
  status: ContactStatus
  personal_context: string | null
  skills: string | null        // comma-separated: "growth marketing, PR, content"
  notes: string | null
  job_title: string | null
  company: string | null
  location: string | null
  connections_count: number | null
  followers_count: number | null
  email: string | null
  phone: string | null
  website: string | null
  about: string | null
  health_score: number
  last_interaction_at: string | null
  log_date: string
  attio_record_id: string | null
  attio_synced_at: string | null
  created_at: string
  updated_at: string
}

export interface Interaction {
  id: string
  user_id: string
  contact_id: string
  type: 'whatsapp' | 'linkedin_msg' | 'email' | 'call' | 'virtual_coffee' | 'in_person'
  direction: 'outbound' | 'inbound'
  notes: string | null
  interaction_date: string
  created_at: string
}
```

---

## 8. Attio Sync (Manual Only)

**Remove**: Auto-sync on `addContact()`.
**Add**: `syncContactToAttio(contactId)` function — explicit button in ContactDetailDrawer.

### Fields sent to Attio:
```typescript
{
  name: [{ first_name, last_name, full_name }],
  email_addresses: email ? [{ email_address: email }] : [],
  phone_numbers: phone ? [{ phone_number: phone }] : [],
  job_title: job_title ?? undefined,
  description: about ?? undefined,          // Attio 'description' native field
  linkedin_profile_url: linkedin_url ? [{ value: linkedin_url }] : [],
  primary_location: location ? [{ locality: location }] : [],
  // Custom attributes (user creates in Attio):
  category: category ?? undefined,
  skills: skills ?? undefined,   // user maps to their Attio "Skills / Expertise" field
}
```

**Attio scope**: all categories EXCEPT `family`. Family contacts live in reThink only.
**No list assignment** — user manages Attio lists manually (free plan limitation).
**Status indicator** in ContactDetailDrawer: "Synced to Attio · 2 days ago" / "Not synced" + Sync button.

### Bidirectional sync strategy (free plan — no webhooks)

| Direction | Trigger | Fields |
|-----------|---------|--------|
| reThink → Attio | Manual "Sync to Attio" button | name, email, phone, job_title, about, linkedin, location, category, skills |
| Attio → reThink | **Auto-pull** when ContactDetailDrawer opens (silent background fetch) | name, email, phone, job_title, location (reThink fields that Attio might update) |

**Auto-pull behavior:**
- When ContactDetailDrawer mounts for a contact with `attio_record_id` → `getAttioPerson(attioRecordId)` in background
- Compare Attio values vs reThink values
- If Attio has newer/different data for: name, email, phone, job_title, location → auto-update reThink record silently
- Fields that reThink owns exclusively (personal_context, skills, health_score, status, category) → NEVER overwritten by Attio pull
- Show subtle "Updated from Attio" toast if any field changed

**Conflict resolution**: Attio wins on contact data (name, email, etc.). reThink wins on relationship data (status, health score, personal_context, skills).

```typescript
// In ContactDetailDrawer useEffect on mount:
if (contact.attio_record_id && hasAttioKey()) {
  pullFromAttio(contact.attio_record_id).then(attioData => {
    const diff = diffAttioFields(contact, attioData)
    if (Object.keys(diff).length > 0) {
      updateContact(contact.id, diff)  // silent update
      showToast('Updated from Attio')
    }
  }).catch(() => {}) // silent fail — Attio is optional
}
```

---

## 9. ContactDetailDrawer (new component)

**File**: `src/components/ContactDetailDrawer.tsx`
**Pattern**: Right-side full-height drawer, same style as `EndOfDayDrawer` / `HabitEditModal`.
**Opens via**: Click on any person's name — from OutreachPanel, Today sidebar, or People screen.
**UI title**: "[Person's name]'s profile" — never "Contact detail".

### Layout:
```
┌─────────────────────────────┐
│ ← Back    [Category badge]  │  Header
│ Name                        │
│ Status pill  ● Health: 8/10 │
├─────────────────────────────┤
│ job_title · company         │  Profile
│ location  · linkedin ↗      │
│ X connections · Y followers │
├─────────────────────────────┤
│ Personal context            │  Editable textarea
│ [free text]                 │
├─────────────────────────────┤
│ Skills / Expertise          │  Tag input (comma-separated → pill display)
│ [growth marketing] [PR] [+] │
├─────────────────────────────┤
│ About (collapsible)         │  LinkedIn about
├─────────────────────────────┤
│ Interactions         [+ Log]│  Timeline
│ ● in_person · 2d ago        │
│ ● call      · 14d ago       │
├─────────────────────────────┤
│ Status: [INTRO ▾]           │  Status selector
├─────────────────────────────┤
│ [Sync to Attio]  [Delete]   │  Actions
└─────────────────────────────┘
```

### Health score visual:
- Score 1–3: `text-red-400` dim ring
- Score 4–6: `text-yellow-400` ring
- Score 7–10: `text-pastel` green ring
- Display: `●●●●●○○○○○` (filled dots) or numeric "8/10"

---

## 10. Chrome Extension Updates

1. **Default status**: `'CONTACTED'` → `'PROSPECT'`
2. **Category picker**: After capture, show dropdown with category options before saving
3. **Field mapping**: `contact_type` → `category` in the message sent to background.js → Supabase
4. **Status triggers**: Chrome extension always saves as PROSPECT → only prospecting habit fires

---

## 11. `useContacts.ts` (renamed from `useOutreach.ts`)

Key changes:
- Type: `OutreachLog` → `Contact`, `OutreachStatus` → `ContactStatus`
- Remove auto-sync on add
- Add `logInteraction(contactId, type, direction, notes, date)` function
- Add `syncContactToAttio(contactId)` function
- Update `autoIncrementHabit`:
  - Always increment `'prospecting'` habit on `addContact()`
  - Increment `'networking'` habit on `updateContact({ status: 'INTRO' })`
- Add `computeAndSaveHealthScore(contactId)` — fetches interactions, computes score, saves to DB
- `addContact` default status: `'PROSPECT'`

---

## 12. Funnel Label Customization

**User can rename any funnel stage label** from the Settings (or future CRM Settings section).
The **status keys in the DB never change** — only the display labels are customized.

### DB storage:
```sql
-- Add JSONB column to profiles table
ALTER TABLE profiles
  ADD COLUMN contact_funnel_config JSONB DEFAULT '{
    "PROSPECT":  {
      "label": "Prospect",
      "description": "Identified as someone worth knowing — haven't reached out yet",
      "entry_criteria": "Found on LinkedIn, referred by someone, or met briefly. Saved for future outreach.",
      "exit_criteria": "You send the first message → move to Intro"
    },
    "INTRO": {
      "label": "Intro",
      "description": "Made first contact — waiting for response or very early exchange",
      "entry_criteria": "Sent a LinkedIn DM, email, or cold message. First touch made.",
      "exit_criteria": "They respond or you have a real back-and-forth → move to Connected"
    },
    "CONNECTED": {
      "label": "Connected",
      "description": "Mutual exchange established — building the new relationship",
      "entry_criteria": "They responded. You have had at least one real exchange (2+ messages back and forth).",
      "exit_criteria": "You have a real conversation (call, coffee, meeting) → move to Engaged"
    },
    "RECONNECT": {
      "label": "Reconnect",
      "description": "Known from before — relationship lapsed, actively trying to re-engage",
      "entry_criteria": "Someone you already knew (colleague, friend, mentor) added after a long silence. OR a Dormant contact you decided to re-activate.",
      "exit_criteria": "You have a real conversation with them again → move to Engaged"
    },
    "ENGAGED": {
      "label": "Engaged",
      "description": "Had real conversations — relationship actively growing",
      "entry_criteria": "Had at least one substantive conversation: call, virtual coffee, in-person meeting, or a real collaborative exchange.",
      "exit_criteria": "Relationship feels established over 30+ days with multiple touchpoints → move to Nurturing"
    },
    "NURTURING": {
      "label": "Nurturing",
      "description": "Established relationship — maintaining it with periodic touchpoints",
      "entry_criteria": "Relationship is solid. You know each other well. You maintain it intentionally.",
      "exit_criteria": "No contact for 90+ days → auto-moved to Dormant"
    },
    "DORMANT": {
      "label": "Dormant",
      "description": "No recent activity — went quiet (90 days+ or manually flagged)",
      "entry_criteria": "Automatic after 90 days with no logged interaction. Or manually moved.",
      "exit_criteria": "You decide to re-engage → manually move to Reconnect"
    }
  }'::jsonb;
```

### TypeScript shape:
```typescript
export interface FunnelStageConfig {
  label: string
  description: string
  entry_criteria: string
  exit_criteria: string
}

export type ContactFunnelConfig = Record<ContactStatus, FunnelStageConfig>
```

### How it works:
1. User edits any field in Settings → `updateFunnelStage(status, field, value)` in `useFunnelConfig` hook
2. `PATCH /profiles` with updated `contact_funnel_config` JSONB — single call, no extra roundtrips
3. All components use `funnelConfig[status].label` (never the raw key)
4. The criteria are shown in the ContactDetailDrawer when selecting a status (tooltip / hover / expandable)
5. Attio is NOT affected — Attio pipeline stages are managed manually by the user

### `useFunnelConfig()` hook:
```typescript
function useFunnelConfig() {
  const config: ContactFunnelConfig = profile?.contact_funnel_config ?? DEFAULT_FUNNEL_CONFIG
  const getLabel = (status: ContactStatus) => config[status]?.label ?? status
  const getConfig = (status: ContactStatus) => config[status]
  const updateStage = async (status: ContactStatus, updates: Partial<FunnelStageConfig>) => {
    const updated = { ...config, [status]: { ...config[status], ...updates } }
    await supabase.from('profiles').update({ contact_funnel_config: updated }).eq('id', userId)
  }
  return { config, getLabel, getConfig, updateStage }
}
```

### Settings UI — Funnel Editor:
```
┌─────────────────────────────────────────┐
│ Relationship Funnel                      │
│                                          │
│ [Prospect]     ✎ rename  🗑 (undeletable)│
│  "Identified as someone worth knowing"   │
│  Entry: Found on LinkedIn...      [edit] │
│  Exit: You send first msg...      [edit] │
│                                          │
│ [Intro]        ✎ rename  🗑 delete       │
│  ...                                     │
│                                          │
│ [+ Add custom stage]  ← Phase 2          │
└─────────────────────────────────────────┘
```

Criteria appear as **tooltip on status pill** in ContactDetailDrawer (hover shows entry/exit criteria for the NEXT stage — guides the user on when to move someone forward).

---

## 13. Todos → Attio Tasks Sync

When a todo is created with a linked contact (`outreach_log_id`) **and** that contact has an `attio_record_id`:
- Show checkbox "Create task in Attio" (default: off, opt-in per todo)
- On confirm → `POST /v2/tasks` in Attio, linked to the person record
- Save returned `attio_task_id` in `todos.attio_task_id`
- On todo completion in reThink → auto-PATCH Attio task as completed (fire-and-forget, one-way)

### DB change needed:
```sql
ALTER TABLE todos
  ADD COLUMN outreach_log_id UUID REFERENCES outreach_logs(id) ON DELETE SET NULL,
  ADD COLUMN attio_task_id TEXT;
```

### Attio task creation:
```typescript
// POST /v2/tasks
{
  data: {
    content: todo.text,
    deadline_at: todo.date ? `${todo.date}T23:59:59Z` : null,
    linked_records: [{ target_object: 'people', target_record_id: attioRecordId }],
    is_completed: false,
  }
}
```

### Note on sync direction:
- reThink → Attio: ✅ creates task, marks complete on todo done
- Attio → reThink: ❌ not supported (requires webhooks / paid plan)
- User manages Attio task stages manually from Attio if needed

---

## 14. Attio `attio.ts` updates

**Attio-eligible categories**: `business_dev`, `partner`, `client`, `mentor`, `job_us`, `peer`, `friend` — all except `family`.
The "Sync to Attio" button is hidden/disabled for contacts with `category = 'family'`.

Functions to add/update in `attio.ts`:
- `syncFullContact(contact: Contact)` — sends all available fields at once (name, email, phone, job_title, about→description, linkedin, location, category, skills). Guard: throws if category = 'family'.
- `pullFromAttio(attioRecordId: string)` — fetches person record, returns only the fields reThink cares about (name, email, phone, job_title, location). Used for auto-pull on ContactDetailDrawer open.
- `diffAttioFields(contact: Contact, attioData)` — returns object of changed fields (only contact-data fields, never relationship fields)
- `createAttioTask(attioRecordId, text, dueDate)` → returns `{ task_id }`
- `completeAttioTask(taskId)` → marks task done

---

## 13. Files to Create/Modify

| Action | File |
|--------|------|
| CREATE | `src/screens/People.tsx` — main People screen at `/people` (list + search + filters) |
| CREATE | `src/components/ContactDetailDrawer.tsx` — right drawer, UI title: "[Name]'s profile" |
| CREATE | `src/hooks/useInteractions.ts` |
| CREATE | `src/lib/funnelDefaults.ts` — default labels + descriptions + criteria |
| CREATE | `src/hooks/useFunnelConfig.ts` — read/write profiles.contact_funnel_config |
| RENAME | `src/hooks/useOutreach.ts` → `src/hooks/useContacts.ts` |
| MODIFY | `src/types/index.ts` — new types + DEFAULT_FUNNEL_LABELS |
| MODIFY | `src/lib/attio.ts` — syncFullContact + task functions |
| MODIFY | `src/components/OutreachPanel.tsx` — category picker, PROSPECT default, open detail |
| MODIFY | `src/components/HabitEditModal.tsx` — updated labels |
| MODIFY | `src/components/SettingsModal.tsx` — funnel stage editor (label + description + criteria + delete) |
| MODIFY | `src/screens/Today.tsx` — import useContacts |
| MODIFY | `src/screens/WeeklyReview.tsx` — use new types |
| MODIFY | `src/screens/Dashboard.tsx` — use new types |
| MODIFY | `chrome-extension/content.js` — status PROSPECT default |
| MODIFY | `chrome-extension/background.js` — category field |
| MODIFY | `chrome-extension/popup.html/js` — category picker |
| SUPABASE | Migration 1: alter outreach_logs + status constraint + data migration |
| SUPABASE | Migration 2: create interactions table |
| SUPABASE | Migration 3: alter profiles (contact_funnel_labels) + alter todos (outreach_log_id, attio_task_id) |

---

## Implementation Phases

### Phase 1 — DB + Types (no visual change, all tests green)
1. Supabase migration: alter `outreach_logs` (add category, personal_context, health_score, last_interaction_at, update status constraint, migrate data)
2. Supabase migration: create `interactions` table
3. Update `src/types/index.ts`: new `Contact`, `ContactStatus`, `ContactCategory`, `Interaction` types
4. Keep `OutreachLog` as a type alias for backward compat during transition

### Phase 2 — Hook Refactor
5. Create `src/hooks/useContacts.ts` (from useOutreach + new logic)
6. Create `src/hooks/useInteractions.ts`
7. Update `attio.ts` with `syncFullContact()`
8. Update all imports in Today, WeeklyReview, Dashboard

### Phase 3 — UI
9. `ContactDetailDrawer.tsx` — full component with all sections
10. Update `OutreachPanel.tsx` — category picker, status = PROSPECT default, click → open detail
11. Update `HabitEditModal.tsx` — new labels for tracks_outreach
12. Wire ContactDetailDrawer into Today.tsx

### Phase 4 — Chrome Extension
13. Update background.js: `contact_type` → `category`, status = 'PROSPECT'
14. Update popup.html/js: add category picker
15. Bump extension to v1.2.0

### Phase 5 — Funnel Labels + Todos Sync
16. `useFunnelLabels.ts` — read/write `profiles.contact_funnel_labels`
17. Funnel label editor in SettingsModal (rename + delete stages with migration prompt)
18. Todos → Attio tasks sync (opt-in checkbox per todo, one-way completion sync)

### Phase 6 — Polish
19. DORMANT auto-flag: on `fetchContacts()`, flag contacts with `last_interaction_at` > 90 days ago
20. Health score ring visual in ContactDetailDrawer

---

## Funnel Stage Deletion Rules

When a user deletes a funnel stage (e.g., removes RECONNECT):
1. UI shows a warning: "X contacts are in RECONNECT. Choose a stage to migrate them to."
2. User picks a target stage from the remaining stages
3. `UPDATE outreach_logs SET status = '<target>' WHERE user_id = ? AND status = '<deleted>'`
4. The deleted stage key is removed from `profiles.contact_funnel_labels`
5. The stage no longer appears in dropdowns or the funnel UI

**Undeletable stages**: `PROSPECT` and `DORMANT` are always kept (they're the entry and exit states).
All other stages (INTRO, CONNECTED, RECONNECT, ENGAGED, NURTURING) can be deleted with migration.

---

## Out of Scope (future)
- Inbound interaction logging from ⌘K CommandPalette
- Bidirectional Attio sync (pull data from Attio → reThink)
- Programmatic Attio list creation (free plan limitation)
