# Attio Objects Live UX Spec

Source: authenticated Attio workspace `Meridian 71`, captured via Firecrawl CDP on 2026-06-29.

Evidence files:

- `.context/attio-live/home.png`
- `.context/attio-live/index.png`
- `.context/attio-live/companiesGeneral.png`
- `.context/attio-live/companiesPermissions.png`
- `.context/attio-live/companiesAppearance.png`
- `.context/attio-live/companiesAttributes.png`
- `.context/attio-live/dealsGeneral.png`
- `.context/attio-live/usersGeneral.png`
- `.context/attio-live/newCustomObjectModal.png`
- `.context/attio-live/objectsKebabMenu.png`
- `.context/attio-live/fresh-objects-index.png`
- `.context/attio-live/fresh-companies-permissions.png`
- `.context/attio-live/fresh-companies-appearance.png`
- `.context/attio-live/fresh-appearance-configure-record-page.png`
- `.context/attio-live/fresh-companies-attributes.png`
- `.context/attio-live/fresh-deals-general.png`
- `.context/attio-live/fresh-users-general.png`
- `.context/attio-live/fresh-sidebar-records-gear-hover-click.png`
- `.context/attio-live/live2-objects-index.png`
- `.context/attio-live/live2-attributes-filter.png`
- `.context/attio-live/live2-companies-view.png`
- `.context/attio-live/live2-view-settings.png`
- `.context/attio-live/live2-new-record.png`

## Main Sidebar Entry

In the main app sidebar, Objects are surfaced under the `Records` group:

- Workspace name at top.
- Quick actions row.
- Main nav: Home, Notifications, Tasks, Notes, Emails, Calls, Reports, Automations.
- Favorites group.
- Records group:
  - Companies
  - People
  - Deals
- There is a small settings/gear affordance linked to `/settings/data/objects`; in DOM it is an empty-text link next to the Records section.
- Lists group appears below Records.

Visual notes:

- Sidebar is compact, pale gray, 260-280px wide.
- Section labels are small, muted.
- Record links use small colored square object icons.
- The settings/gear affordance is subtle and should not become a large text CTA.

## Objects Index

Route:

- Attio: `/settings/data/objects`
- reThink target: `/settings/objects`

Steps:

1. Open workspace settings.
2. Select `Data`.
3. Select the `Objects` tab.

Layout:

- Left settings sidebar remains visible.
- Top bar shows breadcrumb `Data` and `Help` on the right.
- Center content is narrow, about 768px, centered in the remaining workspace.
- Page hero:
  - H1 `Data`
  - subtitle `Configure settings and manage permissions across all workspace data`
  - tabs: `Objects`, `Lists`, `Data connectors` with `Beta` badge.
- Objects section:
  - title `Objects`
  - subtitle `Modify and add objects in your workspace`
  - right button `+ New custom object` with `Pro` badge.
- Pro banner:
  - pale blue background, blue border.
  - text: `Make the most out of objects. Create custom objects tailored to your use-case with our Pro plan.`
  - white `Upgrade` button.
- Toolbar:
  - `Search objects` input.
  - `Filter` button.
- Table:
  - rounded 10px border.
  - columns: Object, Type, Records, Attributes, trailing actions.
  - rows are compact, around 41px high.
  - Active rows show kebab/options action.
  - Inactive standard rows show `Activate` button instead of counts/actions.

Observed rows:

- Companies, Standard, 27 records, 36 attributes.
- Deals, Standard, 12 records, 14 attributes.
- People, Standard, 32 records, 37 attributes.
- Users, Standard, Activate.
- Workspaces, Standard, Activate.

Behavior:

- Clicking a row opens the object settings detail.
- Clicking inactive `Activate` activates that object.
- In the observed Free workspace, `New custom object` opens an Upgrade Plan modal. For reThink this branch keeps custom object creation functional by product decision, while retaining the `Pro` badge visual.

## Object Detail Shell

Example route:

- Attio: `/settings/data/objects/companies/general`
- reThink target: `/settings/objects/companies`

Layout:

- Same settings sidebar.
- Top breadcrumb: `Data / Objects / Companies`.
- Right side: `Help`.
- Content width remains narrow and centered.
- Top back link: `Back`.
- Header:
  - large colored square icon.
  - title `Companies`.
  - `Standard` badge next to title.
  - subtitle `Manage object attributes and other relevant settings`.
- Tabs:
  - Configuration
  - Permissions
  - Appearance
  - Attributes with count badge
  - Templates
  - `+2 more` with caret
- Active tab has a light pill background and black underline.

## Configuration Tab

Observed for Companies:

- Section title `General`.
- Subtitle `Set words to describe a single and multiple objects of this type`.
- Form:
  - Singular noun
  - Plural noun
  - Identifier / Slug
- Slug input has `/` prefix and helper text `You can't change the slug of an object`.

Observed for Deals:

- Same General section.
- Includes `Danger zone`.
- Danger zone is a red outlined horizontal card:
  - left: `Deactivate object`, helper `Associated lists will be permanently destroyed.`
  - right: red `Deactivate object` button.

Observed for Users inactive:

- Header includes a pale blue banner before tabs:
  - text `Users are currently deactivated. Activate them to use this object.`
  - right `Activate` button with `Plus` badge.
- Configuration fields still show, but object is inactive.

Rules:

- People and Companies cannot be deactivated.
- Deals, Users, and Workspaces can be deactivated/activated.
- Slug is immutable.

## Attributes Tab

Observed for Companies:

- Section title `Attributes`.
- Subtitle `Modify and add object attributes`.
- Right `+ Create attribute` button.
- Toolbar:
  - `Search attributes`
  - `Filter`.
- Table columns:
  - Name
  - Type
  - Constraints
  - Properties
  - trailing kebab.
- Row shape:
  - drag handle at far left.
  - small type icon.
  - attribute name.
  - type value.
  - constraints such as `Unique`.
  - property badges such as `System` and purple `Enriched`.
  - kebab menu at far right.

Live Companies attributes include:

- Record ID, Domains, Name, Description, Team, List entries, Categories, Primary location, Logo URL.
- AngelList, Facebook, Instagram, LinkedIn, Twitter, Twitter follower count.
- Estimated ARR, Funding raised, Foundation date, Employee range.
- First/Last/Next calendar interaction.
- First/Last email interaction.
- First/Last/Next interaction.
- Connection strength (legacy), Connection strength, Strongest connection.
- Next due task, Associated deals, Created at, Created by.
- Workspace-specific custom attributes also appear, e.g. `ABM`, `What's next?`.
- Attribute filter menu observed:
  - `Reset filters`.
  - attribute type options such as `Text`, `Domain`, `Relationship`, `Record`, `Multi-select`, `Location`, `Number`, `Select`, `Currency`, `Date`, `Interaction`, `User`, `Timestamp`.
  - toggles `Hide archived` and `Hide system`.

Branch decision:

- reThink Objects branch displays attributes read-only.
- `Create attribute` is hidden until the Attributes branch.
- Attribute row kebabs and drag affordances are hidden because they imply edit/archive/reorder behavior outside this branch.

## Appearance Tab

Observed for Companies:

- Tab content is not record label selectors in this workspace.
- It shows:
  - `Record page layout`
  - `Configure tabs, widgets, and layout for this object's record pages`
  - `Configure record page` button.
- Clicking `Configure record page` navigates to a record-page builder overlay at `/settings/data/objects/companies/record-page/:id`.
- The builder keeps the settings sidebar and topbar context, then overlays a full-height record page configuration surface:
  - topbar with close button, object switcher `Companies`, and title `Configure record page`.
  - left record preview column with `Record name`, actions `Compose email`, `Add to list`, `New note`, overflow, and editable sections.
  - default left sections include `Record Details` with object attributes and a relationship/list section such as `Contract`.
  - left column has `Add section`.
  - main canvas has record tabs: `Overview`, `Deals`, `Activity`, `Emails`, `Calls`, `Team`, `Notes`, `Tasks`, `Files`, plus `Add tab`.
  - `Highlights` widget area has `Add widget (6/6)` and cards such as `Connection strength`, `Next calendar interaction`, `Team`, `Estimated ARR`, `Funding raised`, `Employee range`.

Branch decision:

- The original Objects scope includes record text/image configuration from documentation.
- The settings tab exposes only functional record text/image configuration.
- Record page layout builder, tabs, widgets, and section configuration are hidden until a later Record Page/Layout branch.

## Permissions Tab

Observed loaded state:

- Header `Members`.
- Helper `Set access rules for people in your workspace. Learn more`.
- `Workspace access` subsection:
  - copy `Set default access for all workspace members`.
  - right access dropdown, observed `Read and write`.
- `Teams permissions` subsection:
  - copy `Set object access for each team`.
  - `Upgrade` button.
  - `Learn more`.
  - `Teams` subsection with copy `Set access for teams.`
  - observed team rows `Sales` and `Sales Managers` with member counts.
- `Member permissions` subsection:
  - copy `Set object access for individual members`.
  - `Upgrade` button.
  - `Learn more`.
  - `Members` subsection with copy `Set access for members.`
  - observed member rows include avatar initials, name, and email.
- `Automations` subsection:
  - copy `Set access rules for automations. Automations will still inherit workspace access. Learn more`
  - right `Add` button.
- Docs establish access levels:
  - Full access
  - Read and write
  - Read only
- Most-permissive access wins across workspace/team/member/automation.

Branch decision:

- Keep workspace/team/member/automation rows.
- Visual is compact like Attio and separates Workspace, Teams, Members, and Automations.
- Permission rows work through the schema where records exist.
- Upgrade gates that would be visual-only are hidden in this branch.

## New Custom Object / Upgrade

Observed in live Free workspace:

- Clicking `New custom object Pro` opens an `Upgrade Plan` modal.
- Modal is large and plan-focused, with tabs Annual/Monthly and plan cards.

Branch decision:

- reThink branch must allow creating custom objects.
- Keep Attio visual entry point: `New custom object` button with `Pro` badge.
- Use the documented create modal fields:
  - Plural noun
  - Singular noun
  - Identifier / Slug
  - Cancel / Create Object.

## Object Records View

Observed for Companies:

- Route: `/companies/view/:viewId`.
- Left app sidebar is visible.
- Topbar:
  - object name `Companies`.
  - right actions `Share`, comments/help/menu icons, `Ask Attio`.
- Viewbar:
  - `All Companies`.
  - `View settings`.
  - right actions `Import / Export` and `New Company`.
- Toolbar:
  - `Sorted by Twitter follower count`.
  - `Filter`.
- Table columns observed:
  - `Company`
  - `Last interaction`
  - `Connection strength`
  - `Categories`
  - `Domains`
  - `LinkedIn`
  - `Twitter`
  - `Twitter follower count`
  - `Foundation date`
  - `Primary location`
  - `Country`
  - `Description`
- View settings popover:
  - list of visible attributes in reverse view order.
  - each attribute row has a small menu button.
  - footer `Add attribute to view`.

Branch decision:

- Add Attio-style route aliases `/companies/view/all`, `/people/view/all`, `/deals/view/all`.
- Keep `/records/:objectSlug` as backward-compatible route.
- Search is functional over loaded records and visible columns.
- Keep the Attio-style records toolbar controls visible for visual parity: Share, Ask Attio, View settings, Import/Export, New record, sort/filter pills, column plus, row overflow, and calculation footers.
- Full saved-view behavior, column persistence, real filters/sorts, imports/exports, and calculations remain for the Views/Attributes branches.
- Companies metadata includes `Country` as a System + Enriched attribute.

## UI Fidelity Rules

- Do not use marketing-card layout for settings.
- Use the narrow centered content column.
- Settings sidebar width is 274px on the captured 1920px viewport.
- Settings topbar height is 48px.
- Objects content column starts at x ~= 713px and is about 768px wide on a 1920px viewport.
- Objects table row height is about 41px; header row is about 40px.
- Use pale gray settings sidebar, not dark app shell.
- Use compact row heights and subtle borders.
- Use small rounded badges, not large pills.
- Use top breadcrumbs, not only page-local breadcrumbs.
- Buttons are 30-34px high with 8-10px radius.
- Tables use rounded outer border and horizontal dividers only.
- Disabled/inactive object states must be visible but not hidden.
- The Objects gear/settings affordance in the main sidebar should be subtle.

## Implementation Status

Implemented in this branch:

- Settings shell closer to Attio live.
- Objects index layout, Pro banner, compact table, Activate rows.
- Object detail header/tabs.
- Configuration general section.
- Deals danger zone.
- Users/Workspaces inactive banner.
- Attributes read-only table with type icon and system/enriched/relationship badges.
- People/Companies cannot be deactivated in UI and DB.
- Permissions loaded state with Workspace, Teams, Members, and Automations sections.
- Appearance record text/image configuration.
- Attio-style settings routes `/settings/data/objects` and `/settings/data/objects/:slug/:tab`.
- Attio-style record routes for standard objects.
- Companies all-records view shell, including `All Companies`, `View settings`, `Sorted by`, `Filter`, `Import / Export`, `New Company`, search, and live column order.
- `Country` Companies attribute.

Remaining fidelity gaps:

- Pixel-perfect QA still needs local screenshot comparison against the captured PNGs after final styling.
- Record toolbar controls remain visible for Attio visual parity; their full persistence/advanced behavior belongs to Views/Attributes.
- Settings controls that depend on Attributes CRUD, Lists, Enrichment, Imports, or Automations remain hidden until their branch.
