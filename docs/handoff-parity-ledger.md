# Full App Handoff Parity Ledger

Source of truth: `/Users/alexi/Downloads/design_handoff_full_app`.

| State | Source | Production surface | Backend | Automated check |
|---|---|---|---|---|
| Today home/default/dark | `rethink-today.jsx`, `today.css` | `TodayHandoffView` | todos, reviews, Google Calendar, outreach metrics | `handoff-preview.spec.ts` |
| Close Day / Plan Tomorrow | `today-recap.jsx` | `CloseDayFlow` | todos, reviews, todo history | state + persistence smoke |
| Milestones / recurring / backlog | `rethink-today.jsx`, `today-recurring.jsx` | Today panels | milestones, recurring series, todos | panel interaction smoke |
| Command / focus / meeting | Today and record modal sources | Today overlays | local focus state, Google Calendar | keyboard + modal smoke |
| Funnel / objective / hover / time picker | `rethink-today.jsx` | Today funnel and planner | outreach events, reviews, todos | hover/popover smoke |
| Companies / People table | `lists-views.jsx` | `CrmViewSurface` | object adapters + `crm_views` | columns/filter/sort persistence |
| Kanban boards | `lists-views.jsx` | `CrmViewSurface` | `crm_list_entries` or Select attribute | DnD + stage persistence |
| View switcher/settings | `lists-views.jsx`, `lists-filter.jsx` | shared view popovers | `crm_views` | view CRUD + refresh |
| Record overview | `lists-record.jsx` | shared `CrmRecordDetail` for Companies, People, Deals, custom objects | object adapter, generic list entries, related deals, tasks, notes, channel activity | route + inline edit smoke |
| Compose / meeting modals | `lists-record-modals.jsx` | record modal host | Gmail scope stub / Google Calendar real | modal validation smoke |

## 2026-07-10 Parity Fix Pass

| Area | Gap found | Fix implemented | Verification |
|---|---|---|---|
| List sidebar sync | Lists created by the extension existed in Supabase but did not appear in the left menu until reload. | `lists`, `crm_views`, `crm_list_entries`, and `list_memberships` are now in `supabase_realtime`; list/view/membership hooks refresh on Realtime, focus, and visibility change. | Remote publication includes all four tables. `YC Combinator` exists with 1 canonical entry; `ABM \| Dream Jobs` has 18 canonical company entries. |
| Icon picker crash / blank page | Picker/popover clicks were fighting global scrims and z-index rules from Today/List CSS. | CRM popovers use a dedicated `CrmPopFrame` with isolated `crm-pop-scrim`/`crm-pop` layering. List icon picker has its own layer above dismiss scrim. | `npm run build`; `list-icon-layer.spec.ts` passes. |
| Custom list icons | Lists supported emoji/line icon only; upload was not wired. | Added `list-icons` Storage bucket, owner-scoped upload/update/delete policies, typed `storage:list-icons:<path>` references, public rendering via `ListGlyph`, upload from existing list header and create-list setup. | Remote bucket exists with 1MB limit and allowed image MIME types; parser test covers uploaded icon references. |
| Sort/filter/view menus | Menus could close on click or sit under a scrim. | Sort, Filter, Add Column, View Settings, view row menu, card/stage/context menus all route through the shared CRM popover layer. | `crm-view-logic.spec.ts` passes; authenticated UI smoke blocked locally by missing `.context/playwright/auth.json`. |
| Record page field parity | Media values could be treated like normal fields; date/source display needed handoff treatment. | Record pages hide media/system keys from detail fields, render dates as day labels, render URL/domain/email via `crmUrlPresentation`, and use LinkedIn/Gmail/etc. source icons in activity. | Type/build pass; visual auth smoke still pending auth state. |

## Invariants

- Production routes never read preview fixtures.
- Primary record columns remain locked; all other columns can be shown, hidden, reordered, and resized.
- Lists use `object_slug` and `crm_list_entries`, not People-only memberships.
- Legacy list writes for `contact_id`, `company_id`, and `opportunity_id` synchronize one-way into `crm_list_entries`.
- Record Details use the handoff's ordered five-field catalogue per standard object; media attributes never appear as fields or Highlights.
- Record dates render as calendar days, and activity sources render as line icons from `interactions.channel`.
- Table and Kanban own their bounded scroll surface; production route wrappers preserve the handoff's `flex: 1` / `min-height: 0` chain.
- Table checkbox and primary-record columns remain frozen during horizontal scrolling without the handoff gutter's initial 8px drift.
- List identity is editable from the topbar: inline rename plus a persisted emoji/line-icon picker, reflected in the sidebar and related-list surfaces.
- Known README §8 stubs respond visibly but do not invent backend behavior.
- Every screenshot is available in the development gallery at `/__handoff-preview`.
- List icons may be line icons, emojis, or uploaded Storage images; saved Table/Kanban views keep fixed type icons.
