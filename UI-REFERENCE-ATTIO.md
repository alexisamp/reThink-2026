# Attio UI Reference for reThink People CRM

> This document captures the Attio CRM UI/UX patterns that reThink's People screen should replicate,
> adapted to reThink's existing fonts, colors, and design language. Screenshots were taken from
> app.attio.com (Meridian 71 workspace) on April 6, 2026.

---

## 1. Left Sidebar Navigation

The sidebar is the primary navigation element. reThink should replicate this pattern for its People/CRM section.

### Structure (top to bottom):

```
[Workspace Logo] Workspace Name ▾    [Layout toggle]
─────────────────────────────────────
⌘K  Quick actions          🔍  /
─────────────────────────────────────
◎  Home
◎  Notifications
☑  Tasks
📝  Notes
✉  Emails
📞  Calls
📊  Reports

▷  Automations ▾
     ↳ Sequences
     ↳ Workflows

▽  Records          ⚙ 🔧 🏗
     ▪ Companies    (blue icon)
     ▪ People       (green icon)
     ▪ Deals        (orange icon)

▽  Lists
     ❤  Partners            (heart emoji)
     🌿  Revenue Funnel      (green plant emoji)
     📁  Invoice & Revenue   (folder icon)

▽  Chats
     + New chat
─────────────────────────────────────
👥  Invite team members
```

### Key Design Notes:
- **Dark theme**: Background ~#1a1a2e or similar dark charcoal
- **Sidebar width**: ~190px fixed
- **Section headers** ("Records", "Lists", "Chats"): Collapsible with chevron, smaller/muted text
- **Records items**: Each has a colored square icon (Companies=blue, People=green, Deals=orange)
- **Lists items**: Each has a custom emoji/icon prefix with colored backgrounds
- **Active item**: Highlighted with subtle background (#2a2a3e or similar)
- **Hover**: Slightly lighter background on hover
- **Settings icons**: Appear next to "Records" header on hover (gear, wrench, build icons)
- **Quick actions**: Has keyboard shortcut hint (⌘K)
- **Search**: Magnifier icon with "/" shortcut hint

### reThink Adaptation:
For reThink, the sidebar should contain:
```
[reThink Logo]
─────────────────
⌘K Quick actions
─────────────────
◎  Today           (main dashboard)
📋  Playbook        (personal branding)

▽  CRM
     ▪ People       (contacts - main view)
     ▪ Companies    (organizations)
     ▪ Opportunities (deals/jobs)

▽  Lists
     ▪ Board of Directors
     ▪ Active Pipeline
     ▪ [Custom lists]
─────────────────
⚙  Settings
```

---

## 2. Table View (Primary List View)

Used for People, Companies, Deals, and List contents.

### People Table View
- **Header bar**: View selector dropdown ("All People" ▾) + "View settings" ▾ + right-side buttons (Import/Export, + New Person)
- **Filter bar**: "Sorted by [field]" pill + Filter pills (e.g., "Type is Company/Project Sale") + "..." menu + "+" to add filter
- **Column headers**: Icon + field name, each column independently sortable and resizable
  - Columns observed: Person, Connection strength, LinkedIn, Company Name, Job title, LinkedIn handle
- **Rows**: Compact, ~36px height, alternating subtle hover highlight
  - Person column shows avatar circle + name (left-aligned)
  - Status fields use colored dots (blue, green, orange, pink, red)
  - Tags use colored pills with rounded corners (e.g., "Company/Project Sale" in orange)
  - Empty cells show no placeholder
- **Footer row**: Count ("25 count") + "Add calculation" buttons per column (sum, average, etc.)
- **Add column**: "+" button at the end of header row

### Companies Table View
- Same pattern as People
- Columns: Company (with icon), Description, Primary domain, Country, Foundation date, Twitter followers, Twitter, LinkedIn, Domains
- Sort by any column

### Deals Table View
- Same pattern
- Columns: Deal (with colored square icon), Deal stage (colored dot + text like Lead/Proposal/Qualified/Won), Deal owner (avatar + name), Deal value ($), Next due task, Created by, Type (colored pill)
- Footer shows sum for Deal value column (e.g., "US$21,320.00 sum")
- Stage colors: Lead=blue, Proposal=pink, Qualified=yellow, Won=green with 🎉

### Design Specifications:
- **Row height**: ~36px compact
- **Header height**: ~40px
- **Font**: System font, ~13px for table content, ~12px for headers
- **Column dividers**: Very subtle, ~1px dark lines
- **Selection**: Checkbox on hover at left edge of each row
- **Hover row**: Slightly lighter background
- **Calculations footer**: "US$21,320.00 sum" / "6 count" aligned per column

---

## 3. Detail View (Record Page)

Full-page view when clicking into a Person, Company, or Deal.

### Layout Structure:
```
┌──────────────────────────────────────────────────────────────────────┐
│  [←Back breadcrumb]  Record Name  ⭐           [Compose email] [⚙]  │
├──────────────────────────────────────────────────────────────────────┤
│  [Overview] [Activity] [Notes 4] [Tasks 0] [Associated.. 1]        │
│  [Emails 0] [Calls 0] [Team 1] [Files]                             │
├─────────────────────────────────────────┬────────────────────────────┤
│                                         │                            │
│  ▦ Highlights                           │  ● Details  ○ Comments 0   │
│  ┌────────┬──────────┬──────────┐       │                            │
│  │ Field1 │ Field2   │ Field3   │       │  ▽ Record Details          │
│  │ Value  │ Value    │ Value    │       │    Field: Value            │
│  ├────────┼──────────┼──────────┤       │    Field: Value            │
│  │ Field4 │ Field5   │ Field6   │       │    Field: Value            │
│  │ Value  │ Value    │ Value    │       │    ...                     │
│  └────────┴──────────┴──────────┘       │    "Show all values >"     │
│                                         │                            │
│  ✎ Activity >                           │  ▽ Lists                   │
│    [Activity feed items...]             │    "Add to list"           │
│                                         │    [List membership cards] │
│  📝 Notes 4 >                           │                            │
│    [Note entries...]                    │  ▽ Contract / Related      │
│                                         │    [Associated records]    │
│                                         │                            │
└─────────────────────────────────────────┴────────────────────────────┘
```

### Person Detail View (e.g., Devin Reed):
- **Breadcrumb**: "People > Devin Reed"
- **Top navigation bar**: Close (X), navigation arrows (◀ ▶), position ("5 of 6 in All Deals")
- **Tabs**: Overview | Activity | Notes (count) | Tasks (count) | Associated People (count) | Emails (count) | Calls (count) | Company | Files
- **Highlights section** (3x2 grid of cards):
  - Connection strength
  - Next calendar interaction
  - Team (person avatars)
  - Estimated ARR
  - Funding raised
  - Employee range
- **Activity feed**: Chronological list with avatar + "changed" / "added" actions + timestamp
- **Right sidebar** (~350px):
  - **Details tab / Comments tab** toggle
  - **Record Details** section: Key-value pairs (Name, Email, Description, Company, Job title)
  - **Lists** section: Which lists this record belongs to, with "Add to list" button
  - **Contract** section: Associated deals shown as linked pill/chips

### Company Detail View (e.g., Wherex):
- Same layout pattern
- Tabs: Overview | Deals (5) | Activity | Emails (0) | Calls (0) | Team (1) | Notes (0) | Tasks (0) | Files
- Highlights: Connection strength, Next calendar interaction, Team (person name), Estimated ARR, Funding raised, Employee range
- Right sidebar: Domains (clickable link), Name, Description, Team, Categories (colored tags like "Marketplace", "B2B")
- Contract section: Shows associated deals as linked chips ("February 2026 | ...", "January 2026 | ...")

### Deal Detail View (e.g., "GTM | Juan & María"):
- Tabs: Overview | Activity | Notes (4) | Tasks (0) | Associated People (1) | Emails (0) | Files
- Highlights (2x3 grid):
  - Deal stage (text with colored progress bar, e.g., "Qualified" with orange bar)
  - Deal value ($1,500.00)
  - Deal owner (avatar + name)
  - Next due task
  - Associated people > Next interaction
  - Associated people > Last interaction
- Notes section inline: Shows note source (e.g., "Granola"), title, description snippet, timestamp
- Right sidebar Record Details: Deal name, Deal stage (colored dot), Deal owner, Deal value, Associated people
- Right sidebar Lists: Shows list membership with custom fields:
  - Revenue Funnel membership with:
    - Estimated close date: "Jan 31, 2026"
    - Product: "GTM Strategy" (green tag)
    - Partner: [name]

### Design Specifications:
- **Highlights cards**: ~200px wide, ~80px tall, subtle border, field label on top (muted), value below (white/bold)
- **Activity items**: Avatar (24px) + text + right-aligned timestamp (muted)
- **Right sidebar width**: ~330px fixed
- **Record Details**: Label (muted, left) : Value (white, right) pairs
- **Tag/pill styling**: Rounded, colored background, white text, ~24px height

---

## 4. Kanban / Board View (Pipeline)

Available as a view type on any object or list. Columns represent status stages.

### Partners Kanban View (observed):
```
No stage | Nothing yet (3) | In conversations | Agreed (1) | Open funnel (2) | Paused |  +
─────────┼─────────────────┼──────────────────┼────────────┼─────────────────┼────────┼────
         │ [Card]          │ + Add Person     │ [Card]     │ [Card]          │+ Add   │
         │ [Card]          │                  │            │ [Card]          │Person  │
         │ [Card]          │                  │            │                 │        │
```

### Card Design:
```
┌─────────────────────────┐
│ 👤  Person Name          │
│                         │
│ 📄 📧 💬       ⏱ 78d     │
└─────────────────────────┘
```
- **Card width**: Fills column (~200px)
- **Card height**: ~70px compact
- **Card content**: Avatar + Name on top, bottom row has activity icons (notes, emails, comments count) + age indicator (e.g., "78d" meaning 78 days since added/last activity)
- **Column header**: Colored dot (grey=No stage, grey=Nothing yet, blue=In conversations, green=Agreed, green=Open funnel, red=Paused) + Stage name + count badge
- **"+ Add Person" button**: Appears at top of empty columns or as floating button
- **"+" column**: Button to add new stage at the far right
- **Column footer**: "+ Add calculation" link
- **Drag & drop**: Cards can be dragged between columns to change status

### Design Specifications:
- **Column width**: ~200px, evenly distributed
- **Column header**: ~40px height, muted background
- **Card background**: Slightly lighter than page background (#252538 or similar)
- **Card border**: 1px subtle border, slight rounded corners (~8px)
- **Card hover**: Slightly lighter, subtle shadow
- **Status dot colors**: Map to stage colors (same as table view dots)

---

## 5. List Views

Lists in Attio are collections that can contain records from any object. They have custom fields specific to the list context.

### Revenue Funnel List (table view):
- **Title bar**: "Revenue Funnel" with green plant emoji
- **View selector**: "All Deals" ▾ (can have multiple views including Kanban)
- **Columns**: Deal, Company, Main point of contact, Estimated contract value, Stage, Type, Estimated close date, Parent > Name
- **6 records** with sum in footer (US$21,320.00)
- Sort and Filter controls at top

### Partners List (table view - "Potential Partners"):
- **Title bar**: "Partners" with heart emoji
- **Columns**: Person, Skill (colored tags: PR/Content/Growth/Design), Relation Status (Open funnel/Agreed/Nothing yet)
- **6 records** with Relation Status as stage indicator
- View name: "Potential Partners"

### Invoice & Revenue List:
- **Columns**: Company, Value ($), Close Date, Invoice Date, Deal stage (Won), Invoice Status (Collected/No collected), Parent Deal name, Comment
- **4 records**, sum: US$11,300.00

### Key List Design Patterns:
- Lists live under their own sidebar section (separate from Records)
- Each list has its own emoji/icon
- Lists can have **custom attributes** beyond the parent object's fields (e.g., Revenue Funnel adds "Estimated close date", "Product", "Partner")
- Lists support both Table and Kanban view types
- List entries show their list-specific fields in the record's detail sidebar under "Lists" section

---

## 6. View Type System

Attio offers two view types for any object or list:

| View Type | Icon | Description |
|-----------|------|-------------|
| **Table** | Grid icon (▦) | "Organize your records on a table" — default spreadsheet-like view |
| **Kanban** | Pipeline icon (≡≡) | "Organize your records on a pipeline" — board/column view grouped by status attribute |

### View Creation Dialog:
- View type selector (Table vs Kanban)
- Title input field
- For Kanban: "Kanban Columns" dropdown to select which status attribute defines the columns
- Cancel / Confirm buttons

### View Switching:
- Dropdown at top-left shows all views for current object/list
- Each view can be independently configured with different sorts, filters, and columns
- Search field to find views quickly

---

## 7. Common UI Components

### Filter Pills
- Rounded pill shape, ~28px height
- Active filters show as colored pills (e.g., orange "Company/Project Sale")
- "Sorted by [field]" shows as text with icon prefix
- "+" button to add more filters
- "⋮" menu for additional filter options

### Status Dots
- ~8px diameter circles
- Colors: Blue (Lead), Pink (Proposal), Yellow/Orange (Qualified), Green (Won with 🎉 emoji), Grey (No stage)

### Tag Pills
- Rounded corners (~12px radius)
- Colored background matching category
- White text, ~12px font
- Examples: "Company/Project Sale" (orange), "Marketplace" (teal), "B2B" (teal), "PR" (blue), "Content" (green), "Growth" (yellow), "Design" (purple)

### Avatar Circles
- ~24px for inline/table, ~32px for detail view
- Shows first letter or image
- Colored background when no image

### Breadcrumb Navigation
- "Object > Record Name" format at top of detail views
- Clickable to go back to list
- Close (X) button and arrow navigation for cycling through records

### Action Buttons
- Primary: Filled blue/purple, rounded corners (e.g., "+ New Deal", "Confirm")
- Secondary: Outlined or text-only (e.g., "Cancel", "Import/Export")
- Positioned at top-right of views

### Calculations Footer
- Per-column calculation (count, sum, average, etc.)
- "+" Add calculation" link when no calculation set
- Shows formatted values (e.g., "US$21,320.00 sum", "6 count")

---

## 8. Implementation Notes for reThink

### What to Replicate:
1. **Left sidebar navigation** with collapsible sections (Records, Lists)
2. **Table view** as the primary view for People, Companies, Opportunities
3. **Detail view** layout with Highlights cards + Activity feed + Right sidebar
4. **Kanban view** for pipeline/funnel visualization
5. **Filter pills** and sort controls
6. **View system** allowing multiple views per object (table + kanban)
7. **List system** for custom collections with their own fields
8. **Tag/status pill** styling
9. **Calculations footer** for columns

### CRITICAL — Fonts & Colors:
**Do NOT use Attio's visual identity.** All fonts, colors, backgrounds, and design tokens come from reThink's existing codebase. Before implementing any UI, read these files to extract the current design system:
- `tailwind.config.js` — color palette, font families, spacing, custom theme extensions
- `src/index.css` — CSS variables, base styles, global overrides
- `src/App.css` — app-level styles
- Any shadcn/ui or component library theme config

The Attio document describes **layout patterns, component structures, and interaction behaviors** only. The look-and-feel (colors, fonts, border radius, shadows, spacing) must match what reThink already uses. If there's a conflict between Attio's visual style and reThink's existing tokens, reThink always wins.

### What to Adapt:
1. **Color palette**: Use reThink's existing colors (read from `tailwind.config.js`) — NOT Attio's dark purple/charcoal
2. **Typography**: Use reThink's existing font stack (read from `tailwind.config.js` / `index.css`) — NOT Attio's system fonts
3. **Terminology**: "Opportunities" instead of "Deals", map to course concepts
4. **Simplified fields**: Only include fields relevant to job search/networking
5. **Custom Highlights**: For People detail, show Tier (Airport Test), Daisy Chain origin, Board of Directors role instead of Connection strength/ARR
6. **Playbook integration**: Link Playbook entries from detail views
7. **NetworkHub integration**: Show multi-channel identity (WhatsApp, LinkedIn, Exit5, X) in People detail sidebar
8. **No paid features**: Skip "Upgrade" prompts, Attio-specific features like Sequences/Workflows
9. **Interaction tracking**: Replace Attio's email/call tabs with reThink's interaction log (including channel field)

### Attio Patterns to Skip:
- Automations section (Sequences/Workflows)
- Chats section
- "Ask Attio" AI feature
- Share/permissions UI
- Import/Export in initial phase
- Compose email integration

---

## 9. reThink Detail Views — Field Mapping

This section specifies exactly what goes inside each detail view, mapping Attio's visual patterns to reThink's specific content from the course and spec.

### People Detail View

**Breadcrumb:** People > [Person Name]

**Tabs:** Overview | Interactions | Notes | Opportunities | Files

**Highlights Cards (2x3 grid):**
| Card | Description |
|------|-------------|
| Tier | Airport Test tier: 1 (inner circle) / 2 (shared identity) / 3 (loose). Color-coded: 1=green, 2=yellow, 3=grey |
| Health Score | Decays over time since last interaction. Green/Yellow/Red indicator + "X days ago" |
| Company | Linked company name (clickable) |
| Referred By | Who introduced this person (daisy chain origin). If blank: "Direct contact" |
| Last Interaction | Date + type + channel icon (WhatsApp/LinkedIn/etc.) |
| Value Balance | "Given 4 / Received 1" — reciprocity indicator from Value Log |

**Main Content Area:**
- **Activity feed** (same pattern as Attio): Chronological list of interactions, value exchanges, notes. Each entry shows: avatar + action text + channel icon + timestamp
- **Value Log** (visible section): List of value given/received with type tags (introduction, content, referral, advice, endorsement, opportunity)
- **Notes** section: Inline notes with source, title, date

**Right Sidebar:**
- **Details tab / Comments tab** toggle
- **Record Details section:**
  - Name
  - Email
  - Job title
  - Company (linked)
  - Tier (colored dot + text)
  - Tags (pills: champion, mentor, peer, client, prospect, board_of_directors)
  - Advisory role (if board_of_directors): industry insider / negotiation expert / brand advisor / emotional support / accountability partner / peer perspective
  - Birthday
  - Personal context (text)
  - What they're interested in
  - What they're looking for
- **Channels section** (NEW — not in Attio):
  - WhatsApp: [identifier] ✓/✗
  - LinkedIn: [handle] ✓/✗
  - Exit5: [username] ✓/✗
  - X (Twitter): [handle] ✓/✗
  - Each shows verified badge. "Link channel" button to associate.
- **Lists section:** Which lists this person belongs to (e.g., "Board of Directors", "Active Pipeline")
- **Opportunities section:** Linked opportunities as chips (like Attio's Contract section)

---

### Companies Detail View

**Breadcrumb:** Companies > [Company Name]

**Tabs:** Overview | People ([count]) | Opportunities ([count]) | Interactions | Notes | Files

**Highlights Cards (2x3 grid):**
| Card | Description |
|------|-------------|
| People Count | "3 contacts at [Company]" — clickable to People tab |
| Active Opportunities | Count of non-closed opportunities |
| Last Interaction | Most recent interaction with anyone at this company |
| Key Insight | Short text: "What problem can I solve here?" |
| Sector | Industry/sector tag |
| Size | Company size range |

**Main Content Area:**
- **Activity feed**: Aggregated interactions across all contacts at this company
- **People preview**: Top 3-5 contacts at this company shown as mini cards (avatar + name + role + tier dot)
- **Notes** section

**Right Sidebar:**
- **Record Details:**
  - Name
  - Domain (clickable link)
  - Sector
  - Size
  - Notes
  - Key insight
- **People section:** List of linked contacts (like Attio's Team section)
- **Opportunities section:** Linked opportunities as chips with stage dots

---

### Opportunities Detail View

**Breadcrumb:** Opportunities > [Opportunity Title]

**Tabs:** Overview | People ([count]) | Interactions | Notes | Files

**Highlights Cards (2x3 grid):**
| Card | Description |
|------|-------------|
| Stage | Text + colored progress bar (exploring=grey, active=blue, negotiating=orange, won=green, lost=red) |
| Estimated Value | Dollar amount |
| Company | Linked company name (clickable) |
| Type | job / consulting / business / partnership / other (colored tag) |
| Target Date | Date |
| Decision Filter | ✅ Pass / ❌ Fail / ⚠️ Not checked — links to Playbook > My Boundaries |

**Main Content Area:**
- **Activity feed**: Interactions related to this opportunity
- **People involved**: Cards showing contacts linked to this opportunity with role descriptions (champion, interviewer, hiring manager)
- **Notes** section

**Stage-Specific Sections (conditional — expand when relevant):**

When stage = **active** → show **Interview Prep** panel:
- CLOSER Framework prep (Clarify, Label, Overview, Sell, Explain, Reinforce)
- Interview Map: table of interviewers (name, role, priorities, coaching notes, continuity references)
- Research Brief: one-page prep area

When stage = **negotiating** → show **Negotiation Prep** panel:
- GAINS Framework (Goals, Alternatives, Interests, Numbers, Strategy)
- Three Pillars Map (Information, Timing, Power)
- Alternatives Mapping
- Compensation Levers checklist
- Severance Prep

**Right Sidebar:**
- **Record Details:**
  - Title
  - Type (colored tag)
  - Stage (colored dot)
  - Company (linked)
  - Estimated value
  - Target date
  - Decision Filter status
  - Next step
- **People section:** Linked contacts with their roles
- **Lists section:** If part of any custom list (e.g., "Active Pipeline")

---

### People Table View — Default Columns

| Column | Type | Notes |
|--------|------|-------|
| Name | Text + Avatar | Primary column, left-aligned |
| Company | Linked record | Clickable to Company detail |
| Role / Job Title | Text | |
| Tier | Colored dot (1/2/3) | Airport Test tier |
| Last Contact | Relative date | "3 days ago", "2 weeks ago" |
| Health | Colored indicator | Green/Yellow/Red based on decay |
| Tags | Colored pills | champion, mentor, board_of_directors, etc. |
| Value Given | Count | Number from Value Log |
| Channel | Icon(s) | Which channels linked (WhatsApp/LinkedIn/Exit5/X icons) |

### Companies Table View — Default Columns

| Column | Type | Notes |
|--------|------|-------|
| Company | Text + Icon | Primary column |
| Sector | Text | |
| People Count | Number | Contacts at this company |
| Active Opps | Number | Non-closed opportunities |
| Last Interaction | Relative date | |
| Key Insight | Truncated text | |

### Opportunities Table View — Default Columns

| Column | Type | Notes |
|--------|------|-------|
| Title | Text + Icon | Primary column |
| Stage | Colored dot + text | exploring/active/negotiating/won/lost |
| Company | Linked record | |
| Type | Colored tag | job/consulting/business/partnership |
| Estimated Value | Currency | |
| Target Date | Date | |
| Decision Filter | Icon | ✅/❌/⚠️ |
| People Count | Number | Contacts involved |

### Kanban Views

**People Kanban** — grouped by relationship stage:
Columns: Prospect → Intro → Connected → Engaged → Nurturing → Dormant
Cards show: Avatar + Name + Company + Tier dot + days since last contact

**Opportunities Kanban** — grouped by stage:
Columns: Exploring → Active → Negotiating → Won → Lost
Cards show: Title + Company + Type tag + Estimated value + Target date

---

## 10. Sidebar Navigation — reThink Final Structure

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

### Navigation Rules:
- Clicking a CRM item (People/Companies/Opportunities) → opens table view
- Clicking a List → opens that list's default view (table or kanban)
- Today and Playbook are standalone screens
- Plan is a standalone screen
- CRM section mirrors Attio's "Records" pattern (collapsible, each item has colored icon)
- Lists section mirrors Attio's "Lists" pattern (collapsible, each list has emoji/icon)
- Active item gets highlighted background

### Sidebar Collapse Behavior:
- **Expanded**: ~200px, shows icons + labels
- **Collapsed**: ~48px, shows icons only. Hover reveals tooltip with label name.
- **Toggle**: Button at bottom of sidebar (hamburger icon or ≡) + keyboard shortcut ⌘\
- **Transition**: Smooth animation (~200ms ease) when collapsing/expanding
- **Persistence**: Collapsed/expanded state saved in user preferences, persists across sessions
- **Sections in collapsed mode**: CRM and Lists section headers hidden; items show as icon-only. Divider lines remain to visually separate groups.

```
Expanded (~200px)          Collapsed (~48px)
┌──────────────────┐       ┌──────┐
│ ◎  Today         │       │  ◎   │
│ 📋  Playbook      │       │  📋   │
│                  │       │ ───  │
│ ▽ CRM           │       │  👤   │
│   👤 People      │  ⟷   │  🏢   │
│   🏢 Companies   │       │  🎯   │
│   🎯 Opportunities│       │ ───  │
│                  │       │  ⭐   │
│ ▽ Lists         │       │  🔥   │
│   ⭐ Board of Dir│       │ ───  │
│   🔥 Active Pipe │       │  📊   │
│                  │       │ ───  │
│ 📊  Plan          │       │  ⚙   │
│ ──────────────── │       │  ≡   │
│ ⚙  Settings      │       └──────┘
│ ≡  Collapse      │
└──────────────────┘
```
