# Attio Clone Spec: Objects, Records, Attributes, Enriched Data, Lists and Views

Last researched: 2026-06-29
Status: implementation reference for parallel branches

This document is the source of truth for reproducing the Attio-style CRM model and UI in reThink. It combines the Attio documentation URLs provided by the user, the attached screenshots grouped by URL, and additional Attio reference pages for Objects and Records.

## Sources

Primary URLs provided by the user:

- Intro/data model: https://attio.com/help/reference/attio-101/attios-data-model/define-your-data-model-objects-lists-and-views
- Create lists: https://attio.com/help/reference/managing-your-data/lists/create-lists
- Manage lists: https://attio.com/help/reference/managing-your-data/lists/manage-lists
- List access: https://attio.com/help/reference/managing-your-data/lists/lists-access
- Table views: https://attio.com/help/reference/managing-your-data/views/create-and-manage-table-views
- Kanban views: https://attio.com/help/reference/managing-your-data/views/create-and-manage-kanban-views
- Filter and sort views: https://attio.com/help/reference/managing-your-data/views/filter-and-sort-views
- Attributes: https://attio.com/help/reference/managing-your-data/attributes/create-manage-attributes
- Relationship attributes: https://attio.com/help/reference/managing-your-data/attributes/relationship-attributes
- Enriched data: https://attio.com/help/reference/managing-your-data/enriched-data
- Academy hub for missing context: https://attio.com/help/academy

Additional URLs researched to complete Objects and Records:

- Custom objects: https://attio.com/help/reference/managing-your-data/objects/create-and-manage-custom-objects
- Standard objects: https://attio.com/help/reference/managing-your-data/objects/manage-standard-objects
- Object access: https://attio.com/help/reference/managing-your-data/objects/manage-access-to-objects
- Create and view records: https://attio.com/help/reference/managing-your-data/records/create-and-view-records
- Configure record pages: https://attio.com/help/reference/managing-your-data/records/configure-record-pages
- Merge and delete records: https://attio.com/help/reference/managing-your-data/records/merge-and-delete-records
- Add record activities: https://attio.com/help/reference/managing-your-data/records/add-record-activities

Local research artifacts:

- Scraped markdown: `.context/attio-research/scraped-md/attio.com-help-reference-*.md`
- Attachment manifest: `.context/attio-research/attachments-manifest.txt`
- Contact sheets: `.context/attio-research/contact-sheets/*.svg.png`

## Global Visual Language

The Attio experience is not a card-heavy CRM. It is a dense, white, spreadsheet-like operating surface.

Core visual rules:

- Background is white or near-white, with very light gray section dividers.
- Layout uses a persistent left sidebar plus a large main work area.
- Tables are the dominant visual primitive: thin grid lines, compact rows, sticky-ish headers, checkboxes on the left, and inline editable cells.
- Controls are small rounded pills with subtle borders, not large marketing buttons.
- Primary action buttons are compact blue buttons, usually top right.
- Popovers are white floating panels with light shadow, 8-12px radius, and row-based menu items.
- Menus use icons on the left, text labels, dividers, and red destructive actions at the bottom.
- Tags/chips are essential: status, categories, ARR, employee range, owners, relationship values, and enriched values are all shown as compact colored pills.
- Enriched data has a lilac/pale purple cell background and a sparkle indicator in headers.
- Relationship paths use breadcrumb labels in column names, for example `Person > Company > Description` or `Team > Primary location > City`.
- Empty/low-data states still keep the same table shell. Do not replace them with decorative empty-state cards.
- Typography is small, utilitarian, and readable. Most UI text should feel 12-14px; table rows should be dense.
- Icons are functional: object icons, table/kanban icons, gear, sliders/filter, sort, plus, overflow, drag handles, stars, comments, lightning/workflow, lock/permission.

Implementation target for reThink:

- Use the Attio layout behavior and interaction model, while adapting icons and color tokens to the app stack.
- The user expects the CRM/List/View areas to look substantially closer to Attio than the current implementation.
- Prioritize dense tables, popovers, chips, inline editing, object/list/view hierarchy, and sidebars before decorative polish.

## Attachment Map by URL

Every attached screenshot belongs to one URL group. Use this map in QA and branch work.

### Intro/data model

URL: `define-your-data-model-objects-lists-and-views`

- `rWTPwL`: Objects settings page. Centered settings layout, page title `Objects`, subtitle, search, Filter button, table with Object/Type/Records/Attributes, blue `New custom object` button.
- `VDVo2z`: All Companies table view. Top title `Companies`, view selector `All Companies`, toolbar buttons, sorted/filter pills, columns for company, city, foundation date, domains, employee range, categories. Colored tags and blue domain links.
- `eUjhtb`: Sidebar context view. Left nav with workspace, quick actions, notifications/tasks/notes/email/calls/reports/automations, Records and Lists groups. Main table still visible.
- `XGhj5j`: Full app shell with Records and Lists in sidebar, Workspaces selected, table of workspace records with subscription status, plan, seat count, ARR contribution, last interaction.
- `VQgrm7`: Narrow table crop showing User, User ID, Primary email, Person. Demonstrates object records can be represented by a single row with linked relationship pill.
- `IY9caT`: Strategic Accounts list table. List title with object badge, view selector, sort/filter controls, company table with owner, stage, ARR, values, and compact top-right actions.

### Create lists

URL: `create-lists`

- `GdEM1a`: Customer Success list table. List title, object badge, view dropdown, view settings, import/export, `Add Company`, sorted/filter pills, many list-specific attributes.
- `l7dDv7`: Sidebar list creation affordance. Lists section has hover controls with plus/settings; tooltip says `Create a list`. Records above Lists. Main table behind.
- `jEltIy`: List overflow menu. Top-right three-dot menu contains `List settings`, `Manage attributes`, `Duplicate list`, `Add integration`, and red `Delete List`.
- `0RJGgV`: View dropdown inside Recruiting list. Existing views have type icons and overflow menus; bottom row `Create new view`. Kanban columns visible behind.

### Manage lists

URL: `manage-lists`

- `p0rLF6`: Inline list rename. List title `Strategic Accounts` is selected/highlighted in place near the top, with object badge beside it.
- `l9eTys`: View management menu. View dropdown with search, view rows, overflow menu showing Move favorite to, Remove from favorites, Rename, Duplicate, Delete.
- `nYIzNw`: List overflow menu variant. Includes `List settings`, `Manage attributes`, `Duplicate list`, `Copy list ID`, `Add integration`, red `Delete List`.

### Table views

URL: `create-and-manage-table-views`

- `ISxdEU`: Recruiting table. Dense applicant rows, checkbox selection, colored role/source/stage tags, date columns, bottom count and `Add calculation`.
- `QQpXNZ`: View settings dropdown. `View settings` opens visible attributes list with drag handles, attribute icons, overflow buttons, `Add column`.
- `UJIX33`: Column header menu. Sort ascending/descending, move left/right, edit column label, hide from view.
- `G88lGG`: Column header menu after label rename. Same menu with footer showing underlying original attribute name/path.
- `DTynxi`: Attribute edit history popover. Cell list on left and `Edit history` timeline on right with user/integration rows and updated values.
- `bSkJvo`: Sort settings popover. Multi-sort rows with drag handles, attribute dropdown, direction dropdown, x remove, `Add sort`, `Learn about sorting`.
- `03RR6L`: Column calculation menu. Bottom `Add calculation` opens aggregations list: Count empty, Count filled, Percent empty, Percent filled, Sum, Average, Min, Max.

### Kanban views

URL: `create-and-manage-kanban-views`

- `1uvqYT`: Deals kanban. Horizontal columns by stage, each with colored status dot/count; compact cards with company, owner, tags, domain, description, value, small footer icons and time-in-stage.
- `Ssn7lf`: Create view modal. Modal overlays table, lets user choose Table vs Kanban, enter title, select status attribute, cancel or create.
- `a4ZwGh`: Visible columns popover. View settings menu lists `No status` and stage options with colored dots and toggles/visibility state.
- `lMd916`: Drag/drop kanban. Selected card lifted with blue outline; destination column shows gray placeholder; horizontal stage layout remains visible.
- `NuI4fj`: Confetti stage. Moving a card to a celebratory stage triggers confetti over the kanban; stage menu open with Confetti toggle and Hide/Delete stage.
- `rg6Dly`: Kanban attribute edit history. Card row value with star rating plus history timeline popover.
- `FzevXn`: Kanban view settings. Menu includes `Grouped by Deal stage`, `Visible columns`, `Show attribute labels`, and visible attributes below.
- `WP4iNt`: Kanban sort popover. Sort by `Deal stage > Active from`, direction dropdown, `Add sort`, `Learn about sorting`.
- `y7MTRP`: Stage settings popover. Stage name, `Track time in stage` toggle, target time input with days unit, Confetti toggle, Hide stage, red Delete stage.

### Filter and sort views

URL: `filter-and-sort-views`

- `xV0WFI`: Advanced filter builder. Floating panel with nested groups, `Where`, `And`/`Or` connectors, attribute dropdowns, condition dropdowns, value chips, per-condition overflow, `Add filter`, Delete group, Clear all filters.
- `ul0n6q`: Sort popover. Same multi-sort model over Companies table; top toolbar pill reads sorted by primary location plus count.

### Attributes

URL: `create-manage-attributes`

- `ZYHrmr`: Table columns as attributes. Domains, Description, Categories, LinkedIn; cells show blue links, colored category chips, enriched purple backgrounds.
- `1Mzl1x`: Object attribute settings for Companies. Header with object icon/name/badge, tabs Configuration/Appearance/Attributes/Templates/Integrations/Imports, attribute table, search, Filter, blue Create attribute.
- `Xklcda`: Enriched attribute columns. Lilac cell backgrounds, sparkle header icons, linked values and ARR chips.
- `il8ynt`: Top-right object/list menu. `Object settings`, `Manage attributes`, `Add integration`.
- `ODIYFL`: Deals attributes settings. Shows system/custom attribute list for Deals with types and constraints.
- `FIFEER`: Create attribute modal. Attribute Type dropdown, Name input, Description, Default value, Constraints, AI autofill area, Cancel/Create.
- `dwTZxD`: AI autofill settings. Toggle on, autofill type dropdown such as Research agent, guidance textarea, save changes.
- `vnYtlA`: Select attribute options. Options appear as colored chips and rows with color indicators, drag handles, delete icons, and `Create option`.
- `uD9IbF`: Required/unique constraints. Create/edit modal for custom object with Required and Unique checkboxes selected.
- `CBcrGt`: Currency formatting. Currency dropdown, Decimal Places, Display dropdown with Code/Name/Narrow symbol/Symbol previews.
- `NEMgkL`: Attribute overflow menu. Edit attribute, Duplicate attribute, Copy ID, red Archive attribute.
- `6SoMOz`: Attribute edit history timeline. Same right-side history popover pattern as table/kanban.

### Relationship attributes

URL: `relationship-attributes`

- `EvZdzy`: System relationship attributes in object settings. Attribute table shows `Team` as Relationship with People badge, System and Enriched pills.
- `F48kBv`: Create relationship modal. Relationship attribute type, info banner, two object panels, relationship cardinality selector, associated attribute names, Create.
- `kRfmjt`: Relationship filter path. Companies table filtered by `Team > Primary location > City is London`; table displays Team and path column values.
- `Lnas8v`: Relationship table value. Users list with `Referred workspaces` pills such as ClarityHQ, Optivio, StreamForge.
- `BawHS1`: Relationship linked attributes in table. Column `Company > Team > LinkedIn`, showing many person chips/links in a single relationship-derived cell.
- `L8QD1I`: Editable single relationship path. People view shows `Person > Company` and `Person > Company > Description`; description cell is actively edited with blue focus ring.

### Enriched data

URL: `enriched-data`

- `jCPrpS`: Enriched table columns. Estimated ARR, city, employee range, connection strength and strongest connection; lilac backgrounds, colored strength dots/chips.
- `qgbV9M`: Record page. Mailchimp record with left Record Details panel, action icons, tags, relationship fields, and right-side Overview/Activity/Emails tabs faded behind.
- `fwccdb`: Communication intelligence attribute picker. Search attributes menu with company attributes: First interaction, Last interaction, Next interaction, Connection strength, Strongest connection, Next due task, associated deals/workspaces, created fields.
- `wW3b2o`: Interaction type submenu. User chooses First interaction then All interactions, Calendar events, Emails, each with counts and chevrons.
- `wRcFyZ`: Interaction final submenu. Calendar events expands to `When` and `With`.
- `vsPedR`: Table view of people with relationship-derived enriched fields: Company, Description, Job title; top has Table view, Filter, Sort.

## Data Model

### Objects

Objects are entity types. Standard objects include Companies, People, Deals, Users, and Workspaces. Custom objects represent domain-specific entities such as Invoices, Products, Subscriptions, Projects, Events, Partners.

Must support:

- Object list/settings page with object icon, type (Standard/Custom), record count, attribute count.
- Standard objects available by default or enabled by workspace config.
- Custom object creation from workspace settings.
- Custom object fields: plural noun, singular noun, identifier/slug.
- Slug is internal and URL-facing; once created it must not be editable.
- Custom objects include system attributes by default: Record ID, List Entries, Next due task, Created at, Created by.
- Object appearance settings define record image and record text.
- Object access controls separate from list access.
- Delete custom object is destructive and removes records, data, and views.

Object selection guidance:

- Use People for individuals identified by email.
- Use Companies for organizations identified by domain.
- Use Deals for sales opportunities that need their own notes/tasks/attributes and relationships.
- Use Users/Workspaces for product usage/account data.
- Use custom objects when the entity is independent, reportable, related to other objects, or not a subset of an existing object.
- Use Lists when grouping existing records for a workflow and needing list-specific attributes or permissions.

### Records

Records are instances of objects.

Must support creation from:

- Quick actions (`cmd+k` / `ctrl+k`), `Add [object]`.
- All records view first-column plus button or top-right `New [Object]`.
- Lists via `Add [Object]`, which can search existing records or create a new one.
- CSV import.
- Workflow automation.
- Integrations.
- Email/calendar sync for people and companies.
- Email forwarding and Ask Attio-like assistant flows if implemented later.

Record identity:

- People should include email when possible.
- Companies should include domain when possible.
- These identifiers drive dedupe, enrichment, and automatic company/person linking.

Record page must include:

- Title area with icon/avatar/logo, record name, star/favorite, overflow menu.
- Actions under name: compose email, add to list, new note, run workflow, new task, enroll in sequence for people, app-specific actions.
- Left Record Details panel with key attributes, resize divider, `View all values`, search attributes, inline editing.
- Main tab area: Overview, Activity, Emails, Files, Notes, Team/Company/relationship tabs, Tasks, Calls when available.
- Activity timeline containing calendar events, manually added meetings, notes, attribute updates, list additions/updates, record creation, upcoming tasks.
- Lists summary showing every list that includes the record and list-specific attributes.
- Lists summary modes: Standard (editable, larger) and Compact (read-only, smaller).

Record relationships:

- Relationship tabs list connected records.
- Adding/removing a relationship updates both records.
- Multi-record relationship tabs support checkbox selection and bulk actions: Add to list, Enroll in sequence, Run workflow, Send email, Unassociate, Delete.
- Single-record relationship rows use row overflow actions.

Merge/delete:

- Members with write access can merge/delete.
- Merge only for companies and people.
- Merge combines list entries, notes, tasks, comments, and emails for people.
- The right-side record is prioritized and remains; the other is permanently deleted.
- Delete is permanent, removes linked notes/files, references in tasks/notes/comments, report data, and does not restore previously merged records.

Manual activities:

- Record Activity tab supports `Add meeting`.
- Meeting fields: title, short summary, date/time, participants, linked records.
- Activity appears on every linked record, quick actions, home, and assistant context.
- Activity can be edited inline or deleted from overflow menu.

### Lists and List Entries

A list is a workflow/project/segment over one parent object. Adding a record to a list creates a list entry. List-specific attributes live on the list entry, not on the underlying record.

Core rules:

- A list has exactly one parent object for future additions.
- A record can be in multiple lists.
- The same record can be added to the same list multiple times as multiple list entries.
- Duplicate list copies list-specific attributes and views, but not records.
- If the parent object changes later, existing records of other object types remain, but new additions are constrained to the new parent object. Existing view/filter/sort references remain but cannot be newly added if incompatible.

Create list flow:

- Sidebar Lists section has a plus affordance.
- User chooses template or `Start from scratch`.
- Template creates useful predefined attributes and views.
- From scratch requires parent object, unique list name, and starting view type (table or kanban).
- Initial list opens immediately with top-level title, object badge, view selector, view settings, sort/filter controls, and add/import/export actions.

Add records to lists:

- Press `e` in a list and search for a record.
- Click plus at top of first column.
- Use quick actions `Add to list`.
- If record exists in workspace, suggest it while typing.
- If record does not exist, prompt to create.
- If record is already in the list, allow editing the existing instance or `Add duplicate`.
- Bulk add from object pages or other lists via selected checkboxes and bottom action bar.
- CSV import can bulk add.
- Must block adding records from the wrong object type.

Manage lists:

- Inline rename by clicking the list title.
- Emoji/icon can be set or changed next to the title.
- Reorder lists in sidebar.
- List top-right overflow menu: List settings, Manage attributes, Duplicate list, Copy list ID, Add integration, Delete List.
- Delete list permanently deletes list attribute data.
- Rename/delete requires Full access or admin.

List access:

- Access levels: No access, Read only, Read and write, Full access.
- Full access: rename/icon, create/update/delete attributes, manage options, add/import records, export, duplicate, delete list, manage list access.
- Read and write: create/update/delete entries and views, add/import records, view, export, duplicate, comments.
- Read only: view, export, duplicate, comments.
- No access: cannot see list or content anywhere.
- Permission priority is most permissive across workspace default, teams, individual members. Specific settings can grant more access but cannot reduce below workspace default.
- Defaults: workspace No access, creator Full access, admins see lists in Workspace settings, workflows inherit workspace access.
- Share menu and Workspace settings Permissions tab both configure access.

### Views

Views are saved presentations of object or list data. They do not change underlying data.

Must support:

- Multiple views per object/list.
- View selector below title.
- View dropdown with search, view type icons, rows, overflow menus, and `Create new view`.
- View management: reorder via drag; top view is default landing view for list.
- View overflow: rename, duplicate, delete, add/remove favorite, move favorite to.
- Favorites are user-specific.
- Views are visible to everyone who has access to the list, or all workspace members for all-records views.

View create modal:

- Overlay over existing table.
- Choose Table or Kanban as large selectable tiles.
- Enter title.
- For Kanban choose status attribute or create one.
- Actions: Cancel, Create view.

## Table Views

Table views are spreadsheet-style layouts where rows are records/list entries and columns are attributes.

Visual requirements:

- Top title line with object/list name and optional object badge.
- Under title: view selector pill, `View settings` pill, top-right actions like Share, Import/Export, Add [Object].
- Control row: sorted/filter pills. Active sort pill should read like `Sorted by Name` or `Sorted by Primary location +1`.
- Table has checkbox column, primary record column, then attribute columns.
- Header cells show attribute icon, label/path, optional sparkle for enriched, plus/overflow affordances.
- First column header has plus button to add a record.
- Rows have avatars/logos, linked blue text, truncated descriptions, colored chips, and inline editable cells.
- Bottom row shows count in first column and `Add calculation` under attribute columns.

Column/attribute display:

- `View settings > Add column` opens attribute picker.
- Attribute picker supports object attributes, list attributes, and relationship paths.
- Columns can be reordered via view settings drag or header drag.
- Click plus after last column to add existing attribute or create new attribute.
- Hide columns through header menu or settings.
- Resize columns by dragging header edge.

Column header menu:

- Sort ascending.
- Sort descending.
- Move left.
- Move right.
- Edit column label.
- Hide from view.
- If label was changed, footer shows original attribute path/name.

Column label behavior:

- Editing a table column label only changes that view column, not the underlying attribute.
- `Clear label` returns to original name.

Cell editing:

- Direct inline edit.
- Enter/Return saves.
- Arrow keys move across cells.
- Select/multi-select/status use dropdown with keyboard up/down.
- Copy/paste with cmd/ctrl+C/V.
- Multi-cell selection by drag or shift-click.
- Paste must validate attribute type compatibility.

Calculations:

- Numeric columns: Sum, Average, Min, Max plus filled/empty calculations.
- Non-numeric columns: Count empty, Count filled, Percent empty, Percent filled.
- Calculation menu opens from bottom `Add calculation`.

Edit history:

- Right-click cell value and choose View edit history.
- Popover shows timeline entries with user/integration, timestamp, and updated value.
- Available only on higher plans in Attio; in reThink can be gated or implemented universally.

## Kanban Views

Kanban views visualize records/cards progressing through statuses.

Visual requirements:

- Horizontal columns with status dot, status name, count.
- Cards are compact white tiles with subtle border/shadow.
- Card content includes record name/logo, owner/person row, tags, domains/links, description, value chips, relationship-derived rows, footer icons for task/comment/activity and time-in-stage.
- Columns scroll horizontally if needed.
- Sort/filter pills sit above board.
- Dragging a card lifts it with blue outline and shows a gray placeholder in destination column.

Create Kanban:

- From view dropdown `Create new`.
- Choose Kanban tile, title, status attribute.
- Status attribute is required and defines columns.

Stage/visible columns:

- View settings > Visible columns lists No status plus all status options.
- Each row has colored dot, label, and visibility toggle/state.
- Hide stage available from stage header menu.
- No status can be toggled off.
- Stages can be reordered, hidden, and added through view settings.

Bulk stage update:

- Hover card to show checkbox.
- Select multiple cards.
- Shift-select range inside a stage.
- Drag selected cards to another stage.

Stage settings:

- Clicking stage name opens popover.
- Options include Track time in stage toggle, target time numeric input with unit days, Confetti toggle, Hide stage, Delete stage.
- When target time expires, card timer turns red.
- Confetti fires when card enters that stage.

Kanban view settings:

- Grouped by [status attribute], switchable among status-type attributes.
- Visible columns.
- Show attribute labels toggle.
- Visible attributes/card rows.
- Add card row.
- Attribute row overflow can expose formatting for date/timestamp/currency.
- Card row labels can be edited per view without renaming underlying attribute.

Kanban sorting:

- Sort by any attribute.
- Multi-sort supported.
- For time in stage, sort by status attribute > Active from.
- Sort popover mirrors table sort rows with drag handle, attribute dropdown, direction dropdown, remove x.

Kanban calculations:

- `Add calculation` at bottom of each stage.
- Same calculation model as table views.

## Filters and Sorts

Filters and sorts are saved per view. Unsaved changes should revert on next load.

Save behavior:

- `Save for everyone` applies filter/sort to the view for all users with access.
- Dropdown from save allows `Save as new view`.
- `Discard changes` reverts to last saved state.

Filter builder:

- Basic filter: attribute, condition, value.
- Conditions include is, is not, contains, etc. based on attribute type.
- Attribute picker supports relationship paths.
- User attributes can filter by `Current user`.
- Plus adds condition.
- Condition overflow supports delete and convert to advanced condition.
- Advanced groups support nested `And`/`Or`.
- Group UI must show connectors in left rail: Where, And, Or.
- Each condition row is a pill-like sequence: attribute dropdown, operator dropdown, value dropdown/chip, overflow.
- Group-level actions: Add filter, Delete group, Clear all filters.

And/Or logic:

- Use Or when including records that match any condition.
- Use And when excluding multiple conditions so all exclusions apply.

Sort builder:

- Sort pill appears in toolbar.
- Popover rows contain drag handle, attribute selector, direction selector, remove x.
- `Add sort` adds more rows.
- Multiple sorts apply in order; later sorts break ties from earlier sorts.
- Sort settings can be saved or discarded like filters.

## Attributes

Attributes are fields that store information about records or list entries. They power columns, cards, filters, sorts, record pages, and forms.

Attribute scopes:

- Object attributes apply to every record of an object across workspace.
- List attributes apply only to one list and cannot be used outside it.
- Choose object attribute when data applies broadly or across multiple lists.
- Choose list attribute when data is workflow-specific.

Permissions:

- Admins can manage attributes.
- Members with Full access can manage attributes for relevant object/list depending on scope.
- Write access users can assign values but not necessarily create/manage attributes.

Attribute settings page:

- Header with object/list icon, name, standard/custom badge.
- Tabs: Configuration, Appearance, Attributes, Templates, Integrations, Imports or relevant subset.
- Attributes tab: search, Filter, blue Create attribute, table rows.
- Attribute table columns: Name, Type, Constraints, Properties/Description.
- Drag handles reorder attributes.
- Overflow menu: Edit attribute, Duplicate attribute, Copy ID, Archive attribute.
- System/enriched attributes cannot be archived; most cannot be edited.

Create/edit attribute modal:

- White modal over dimmed background.
- Attribute Type dropdown at top.
- Name input.
- Description optional textarea.
- Default value optional.
- Constraints section.
- Type-specific settings.
- AI Autofill section for supported types.
- Bottom actions: Cancel, Create attribute or Save changes.

Attribute types:

- Status: required for kanban columns/stages.
- User: workspace member owner/assignee.
- Select: single color-coded option.
- Multi-select: multiple color-coded options.
- Text: text/URLs, supports shift+enter line breaks.
- Date: dates with absolute/relative display.
- Timestamp: date/time with absolute/relative display.
- Number: numeric with decimal/grouping formatting.
- Currency: one currency per attribute; display code/name/narrow symbol/symbol; decimals; grouping.
- Checkbox: yes/no.
- Rating: 1-5 stars.
- Record: one or multiple referenced records from selected object types.
- Relationship: bidirectional object-level relationship only.
- Location: city/state/country.
- Phone number: valid international phone format.

Select/multi-select options:

- Options show as colored chips.
- Rows have drag handles, color selectors, labels, delete x.
- `Create option` adds option.
- Deleting an option removes existing data using it and cannot be undone.

Required/unique:

- Required means value must be filled on record creation.
- Required custom attributes only on custom objects, not lists or standard objects.
- Unique prevents duplicate values.
- Unique custom attributes available on custom objects and standard Deals/Users/Workspaces, not lists or Companies/People.
- Unique is case-sensitive.

AI Autofill:

- Available for Text, Select, Multi-select.
- Toggle enables AI Autofill.
- Select autofill type, e.g. Research agent.
- Guidance textarea explains how to infer/fill value.
- AI can access record attributes.

Currency/number formatting:

- Currency: choose one currency.
- Display: Code, Name, Narrow symbol, Symbol.
- Decimal places: 0 or 2.
- Grouping: on/off.

## Relationship Attributes

Relationship attributes are bidirectional links between records. They consist of two attributes, one on each side.

System relationships:

- Company <> Team (People), one to many.
- Associated deals <> Associated company, many to one.
- Associated deals <> Associated people, many to many.
- Associated users <> Person, many to one.
- Workspaces <> Users, many to many.

Custom relationship requirements:

- Pro/Enterprise in Attio; decide gating in reThink.
- Only object-level, not list-level.
- Creator needs Full access/admin on both objects.
- Can link two different objects or the same object.
- Cardinalities: one-to-one, one-to-many, many-to-one, many-to-many.
- Both sides require associated attribute names.
- Updating either side automatically updates the other side.

Relationship setup UI:

- Create attribute modal with type Relationship.
- Info banner: changes on one side reflect on other side.
- Two object panels with object icon/name.
- Cardinality dropdown between panels.
- Associated attribute name input under each object.

Relationship paths in views:

- Attribute picker first selects relationship, then either the relationship itself or an attribute from the linked record.
- Path labels display with `>` breadcrumbs.
- Relationship values render as linked record pills with avatars/logos.
- Linked attributes can be displayed, filtered, and sorted.

Multi-value path rules:

- Only one multi-value relationship can exist in a single attribute path.
- Filtering through multi-value relationships matches parent records if any linked record matches.
- Filtering does not reduce displayed linked values; it only filters parent rows.
- Attributes through multi-value relationships are view-only.
- Attributes through single linked record relationships can be edited inline from the current view.

## Enriched Data

Enriched data is automatically populated for People and Companies when Attio has enough data.

Visual markers:

- Enriched cells use pale lilac background.
- Enriched column headers show sparkle icon.
- Enriched values often appear as colored pills, blue links, or avatar/member chips.

Rules:

- Company records need domain for enrichment.
- People records need email for enrichment.
- Manual edits to most enriched attributes should not be overwritten by future enrichment.
- Enriched data availability depends on data source availability.
- In Attio enriched data cannot be exported unless manually overwritten; decide whether reThink needs this limitation.

Company enriched attributes:

- Name, logo, description, categories.
- Location: city, state, country.
- Estimated ARR, employee range, funding raised.
- Social media: AngelList, Facebook, Twitter.
- Foundation date, Team, Twitter follower count.

People enriched attributes:

- Name, profile picture, description.
- Location: city, state, country.
- Social media: Facebook, Twitter.
- Company, job title, Twitter follower count.

Communication intelligence:

- Derived from synced email/calendar and manually added meetings.
- Attributes: First interaction, Last interaction, Next interaction, Connection strength, Strongest connection.
- Interaction-type variants: emails and calendar events/meetings.
- For First/Last/Next interaction, picker flow is:
  1. Choose First, Last, or Next interaction.
  2. Choose interaction type: all interactions, calendar events, emails.
  3. Choose output: When, With, or both if supported.
- Connection strength values: No Connection, Very Weak, Weak, Good, Strong, Very Strong.
- Company communication intelligence includes people whose email domains match company domain.
- Calendar event counts require active non-canceled meeting, at least one workspace member, and member not declined.

Company/Team/Job title automatic linking:

- Person Company is inferred from first non-public email domain matching a company domain.
- If first email is public domain, check next email.
- If all emails use public domains, do not create company automatically.
- Company Team includes person records connected to the company manually or by automatic enrichment.
- Updating a person's Company updates company Team; updating company Team updates each person's Company.

## Implementation TODOs

### Foundation

- Build a shared CRM shell matching Attio density: left sidebar, title area, view toolbar, table/kanban content.
- Replace decorative card layouts in list/view areas with dense table and kanban primitives.
- Create shared primitives: `ViewSelector`, `ViewSettingsPopover`, `FilterBuilder`, `SortBuilder`, `AttributePicker`, `AttributeChip`, `RecordPill`, `OverflowMenu`, `InlineCellEditor`, `EditHistoryPopover`.
- Implement object/list/view state model before polishing visuals.
- Add keyboard shortcuts: `cmd/ctrl+k` quick actions, `e` add to list, arrows/enter in table cells, copy/paste.

### Objects and Records

- Implement object settings page with attributes tab.
- Support standard object registry and custom object metadata.
- Support all records pages per object with saved views.
- Build record page with actions, tabs, Record Details, Lists summary, Activity timeline, relationship tabs.
- Add merge/delete flows for People/Companies if current data model supports dedupe.
- Add manual meeting activity flow.

### Lists

- Implement create list flow: template vs scratch, parent object, name, starting view.
- Implement list entries separate from records.
- Allow same record multiple times in one list.
- Implement list-specific attributes.
- Implement duplicate list copying attributes/views only.
- Implement list overflow menu and list settings.
- Implement list access model or a simplified equivalent.

### Views

- Implement view dropdown with search, type icons, overflow menu, create new.
- Implement saved table and kanban view settings per view.
- Implement favorites and view reorder.
- Implement `Save for everyone`, `Save as new view`, `Discard changes` behavior for filter/sort changes.

### Table

- Rebuild table with dense rows, sticky headers if possible, checkbox selection, first-column plus, bottom calculation row.
- Implement column add/hide/reorder/resize.
- Implement header menu and column label override.
- Implement inline cell editors by attribute type.
- Implement multi-cell selection and copy/paste if feasible.
- Implement calculations.

### Kanban

- Implement kanban grouped by status attribute.
- Implement drag/drop cards and bulk move.
- Implement visible columns, no-status toggle, stage settings.
- Implement card rows from visible attributes.
- Implement track time in stage and red overdue state.
- Implement confetti on stage entry.

### Attributes

- Implement attribute settings table.
- Implement create/edit modal for all supported types.
- Implement option management for select/multi-select/status.
- Implement currency/number formatting.
- Implement constraints and validation.
- Implement AI Autofill settings UI even if backend is later.
- Implement attribute archive/restore and edit history.

### Relationships and Enrichment

- Implement bidirectional relationship attributes and relationship paths in picker.
- Implement relationship-derived display/filter/sort.
- Enforce multi-value path limitations or document where current product differs.
- Add enriched visual markers for enriched/generated fields.
- Implement communication intelligence attributes if email/calendar data exists; otherwise stub visible UI with clear disabled states.

## QA Acceptance Checklist

- A user can create a list from sidebar plus, choose object, choose table/kanban, and land in the new view.
- A list can show list-specific attributes that do not mutate the underlying record.
- A record can appear in multiple lists and multiple times in one list.
- Table views visually match Attio: dense rows, subtle grid, toolbar pills, colored chips, inline edit, calculation row.
- Kanban views visually match Attio: horizontal status columns, compact cards, drag placeholder, stage settings popover.
- Filter builder supports nested And/Or groups and displays path attributes.
- Sort builder supports multi-sort, reorder, remove, and saved/discarded state.
- View dropdown supports search, create, duplicate, rename, delete, favorite.
- Attribute settings page supports create/edit/duplicate/archive and type-specific modals.
- Relationship attributes update both sides and expose linked attributes in views.
- Enriched fields are visually distinguishable with lilac cells and sparkle headers.
- Record page includes actions, tabs, details panel, activity, relationships, and list summary.
- Permission-gated actions are hidden/disabled where relevant.

## Design Pitfalls to Avoid

- Do not make lists look like generic cards; Attio lists are data surfaces.
- Do not make a kanban card too tall; cards are compact and information-dense.
- Do not collapse attributes into a single details drawer only; table/kanban inline editing is core.
- Do not treat lists as object types. Lists hold entries for records from one parent object.
- Do not store list-specific values on the base record.
- Do not make filters a simple flat list only; advanced nested groups are required.
- Do not ignore relationship paths; `Company > Categories` and `Team > City` are central.
- Do not hide enriched-data visual markers; they are part of the product language.
- Do not replace Attio popovers with full pages unless the flow truly requires settings-level configuration.
