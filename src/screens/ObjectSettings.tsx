import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Bell, Buildings, CaretLeft, CaretRight, ChartBar, Check,
  Code, CreditCard, CurrencyDollar, Database, DotsThreeVertical,
  EnvelopeSimple, GearSix, Gift, HardDrives, Image, Lifebuoy, LockKey,
  MagnifyingGlass, Microphone, Palette, PaperPlaneTilt, Plugs, Plus, Rows, Shield,
  Sparkle, UploadSimple, User, Users, UsersThree,
  Trash, Warning, X,
} from '@phosphor-icons/react'
import { useAuth } from '@/hooks/useAuth'
import { useAttioObjectBundle, useAttioObjects } from '@/hooks/useAttioObjects'
import {
  ACCESS_RANK,
  ACCESS_LABEL,
  addObjectPermission,
  createCustomObject,
  deleteCustomObject,
  slugifyObjectName,
  updateObjectConfig,
  updatePermission,
  getEffectiveAccess,
  type CrmAccessLevel,
  type CrmAttribute,
  type CrmObject,
} from '@/lib/attioObjects'

type SettingsTab = 'configuration' | 'appearance' | 'attributes' | 'permissions'

const TABS: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
  { id: 'configuration', label: 'Configuration', icon: <GearSix size={13} /> },
  { id: 'permissions', label: 'Permissions', icon: <LockKey size={13} /> },
  { id: 'appearance', label: 'Appearance', icon: <Image size={13} /> },
  { id: 'attributes', label: 'Attributes', icon: <Rows size={13} /> },
]

const ROUTE_TO_TAB: Record<string, SettingsTab> = {
  general: 'configuration',
  configuration: 'configuration',
  permissions: 'permissions',
  appearance: 'appearance',
  attributes: 'attributes',
}

const TAB_TO_ROUTE: Record<SettingsTab, string> = {
  configuration: 'general',
  permissions: 'permissions',
  appearance: 'appearance',
  attributes: 'attributes',
}

const SETTINGS_GROUPS = [
  ['Personal', 'Profile', 'Appearance', 'Email and calendar accounts', 'Call intelligence', 'Storage accounts', 'Refer and earn', 'Notifications', 'Ask Attio', 'App connections'],
  ['Workspace', 'General', 'Members and teams', 'Ask Attio', 'Call recorder', 'Plans', 'Billing', 'Developers', 'Support requests', 'Migrate CRM', 'Apps'],
  ['', 'Security', 'Email and calendar', 'Expert access grants'],
  ['', 'Data', 'Import history'],
  ['', 'Dashboards', 'Sequences', 'Workflows'],
]

const SETTINGS_ICON: Record<string, React.ReactNode> = {
  Profile: <User size={13} />,
  Appearance: <Palette size={13} />,
  'Email and calendar accounts': <EnvelopeSimple size={13} />,
  'Call intelligence': <Microphone size={13} />,
  'Storage accounts': <HardDrives size={13} />,
  'Refer and earn': <Gift size={13} />,
  Notifications: <Bell size={13} />,
  'Ask Attio': <Sparkle size={13} />,
  'App connections': <Plugs size={13} />,
  General: <GearSix size={13} />,
  'Members and teams': <Users size={13} />,
  'Call recorder': <Microphone size={13} />,
  Plans: <CreditCard size={13} />,
  Billing: <CurrencyDollar size={13} />,
  Developers: <Code size={13} />,
  'Support requests': <Lifebuoy size={13} />,
  'Migrate CRM': <UploadSimple size={13} />,
  Apps: <Rows size={13} />,
  Security: <Shield size={13} />,
  'Email and calendar': <EnvelopeSimple size={13} />,
  'Expert access grants': <UsersThree size={13} />,
  Data: <Database size={13} />,
  'Import history': <UploadSimple size={13} />,
  Dashboards: <ChartBar size={13} />,
  Sequences: <PaperPlaneTilt size={13} />,
  Workflows: <Rows size={13} />,
}

function ObjectIcon({ object, large = false }: { object: Pick<CrmObject, 'icon' | 'plural_name' | 'object_type'> & { slug?: string }; large?: boolean }) {
  const size = large ? 28 : 11
  const icon = object.slug === 'companies'
    ? <Buildings size={size} weight="fill" />
    : object.slug === 'deals'
      ? <CurrencyDollar size={size} weight="bold" />
      : object.slug === 'people'
        ? <User size={size} weight="fill" />
        : object.slug === 'users'
          ? <User size={size} weight="fill" />
          : object.slug === 'workspaces'
            ? <UsersThree size={size} weight="fill" />
            : object.icon || object.plural_name[0]?.toUpperCase()
  return <span className={`obj-ic ${object.object_type} ${object.slug ?? ''} ${large ? 'lg' : ''}`}>{icon}</span>
}

function Badge({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'blue' | 'purple' | 'green' }) {
  return <span className={`obj-badge ${tone}`}>{children}</span>
}

function AttioMenu({ children, align = 'right' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <div className={`attio-pop-menu ${align}`}>{children}</div>
}

function MenuButton({ children, danger = false, disabled = false, onClick }: { children: React.ReactNode; danger?: boolean; disabled?: boolean; onClick?: () => void }) {
  return <button className={danger ? 'danger' : ''} disabled={disabled} onClick={onClick}>{children}</button>
}

function SettingsSidebar() {
  return (
    <aside className="attio-settings-side">
      <div className="settings-side-title"><CaretLeft size={13} /> <strong>Settings</strong></div>
      <div className="attio-search settings-search"><MagnifyingGlass size={13} /><input placeholder="Search settings..." /></div>
      <nav className="settings-nav-list">
        {SETTINGS_GROUPS.map((group, index) => (
          <div className="settings-group" key={index}>
            {group[0] && <span className="attio-settings-section">{group[0]}</span>}
            {group.slice(group[0] ? 1 : 0).map(item => (
              item === 'Data' ? (
                <Link key={`${index}-${item}`} className="attio-settings-nav active" to="/settings/data/objects">
                  {SETTINGS_ICON[item] ?? <Rows size={13} />} {item}
                </Link>
              ) : (
                <span key={`${index}-${item}`} className="attio-settings-nav disabled" aria-disabled="true">
                  {SETTINGS_ICON[item] ?? <Rows size={13} />} {item}
                </span>
              )
            ))}
          </div>
        ))}
      </nav>
    </aside>
  )
}

function SettingsTopbar({ crumbs }: { crumbs: React.ReactNode }) {
  return (
    <div className="attio-settings-worktop">
      <div className="settings-crumbs">{crumbs}</div>
      <span className="settings-help">? Help</span>
    </div>
  )
}

function DataTabs() {
  return (
    <nav className="data-tabs">
      <button className="active"><Database size={14} /> Objects</button>
      <button disabled><Rows size={14} /> Lists</button>
      <button disabled><Database size={14} /> Data connectors <Badge tone="blue">Beta</Badge></button>
    </nav>
  )
}

function ProBanner() {
  return (
    <div className="objects-pro-banner">
      <span className="pro-icon">◇</span>
      <span>Make the most out of objects. Create custom objects tailored to your use-case with our Pro plan.</span>
      <button>Upgrade</button>
    </div>
  )
}

function CreateObjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (slug: string) => void }) {
  const { user } = useAuth()
  const [plural, setPlural] = useState('')
  const [singular, setSingular] = useState('')
  const [slug, setSlug] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generatedSlug = slugifyObjectName(slug || plural)

  const save = async () => {
    if (!user || !plural.trim() || !singular.trim() || !generatedSlug) return
    setSaving(true)
    setError(null)
    const result = await createCustomObject(user.id, plural, singular, generatedSlug)
    setSaving(false)
    if (result.error || !result.object) {
      setError('Could not create object. Check that the identifier is unique.')
      return
    }
    onCreated(result.object.slug)
  }

  return (
    <div className="attio-modal-bg" onClick={onClose}>
      <div className="attio-modal obj-create" onClick={event => event.stopPropagation()}>
        <div className="attio-modal-hd">
          <h2>Create Custom Object</h2>
          <button aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="attio-modal-body">
          <label className="attio-field">
            <span>Plural noun</span>
            <input value={plural} onChange={event => setPlural(event.target.value)} placeholder="Subscriptions" autoFocus />
          </label>
          <label className="attio-field">
            <span>Singular noun</span>
            <input value={singular} onChange={event => setSingular(event.target.value)} placeholder="Subscription" />
          </label>
          <label className="attio-field">
            <span>Identifier / Slug</span>
            <input value={slug || generatedSlug} onChange={event => setSlug(event.target.value)} placeholder="subscriptions" />
            <small>This is used in the URL and cannot be changed after creation.</small>
          </label>
          {error && <p className="attio-error">{error}</p>}
        </div>
        <div className="attio-modal-actions">
          <button className="attio-btn" onClick={onClose}>Cancel</button>
          <button className="attio-btn primary" disabled={saving || !plural.trim() || !singular.trim() || !generatedSlug} onClick={save}>Create Object</button>
        </div>
      </div>
    </div>
  )
}

export default function ObjectSettingsIndex() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { objects, loading, reload } = useAttioObjects(user?.id, user?.email, user?.user_metadata?.full_name)
  const [query, setQuery] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [openRowMenu, setOpenRowMenu] = useState<string | null>(null)
  const filtered = objects.filter(object => object.plural_name.toLowerCase().includes(query.toLowerCase()) || object.slug.includes(query.toLowerCase()))

  return (
    <div className="attio-settings-page">
      <SettingsSidebar />
      <main className="attio-settings-main">
        <SettingsTopbar crumbs={<><Database size={14} /> Data</>} />
        <div className="attio-data-content">
          <header className="data-hero">
            <h1>Data</h1>
            <p>Configure settings and manage permissions across all workspace data</p>
            <DataTabs />
          </header>
          <div className="objects-section-head">
            <div>
              <h2>Objects</h2>
              <p>Modify and add objects in your workspace</p>
            </div>
            <button className="attio-btn primary" onClick={() => setShowCreate(true)}><Plus size={13} /> New custom object <Badge tone="blue">Pro</Badge></button>
          </div>
          <ProBanner />
          <div className="attio-settings-toolbar">
            <div className="attio-search"><MagnifyingGlass size={13} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search objects" /></div>
          </div>
          <section className="attio-table settings-table">
            <div className="attio-tr attio-th obj-grid">
              <span><Database size={12} /> Object</span>
              <span><Rows size={12} /> Type</span>
              <span><Database size={12} /> Records</span>
              <span><Rows size={12} /> Attributes</span>
              <span />
            </div>
            {loading ? <div className="attio-empty">Loading...</div> : filtered.map(object => (
              <div key={object.id} className={`attio-tr obj-grid ${!object.is_enabled ? 'disabled-row' : ''}`} role="button" tabIndex={0} onClick={() => navigate(`/settings/objects/${object.slug}`)} onKeyDown={event => { if (event.key === 'Enter') navigate(`/settings/objects/${object.slug}`) }}>
                <span className="obj-name"><ObjectIcon object={object} /><strong>{object.plural_name}</strong></span>
                <span><Badge>{object.object_type === 'standard' ? 'Standard' : 'Custom'}</Badge></span>
                <span className="attio-mono">{object.is_enabled ? object.record_count : ''}</span>
                <span className="attio-mono">{object.is_enabled ? object.attribute_count : ''}</span>
                <span className="obj-row-action">
                  {!object.is_enabled ? (
                    <button className="attio-btn row-activate" onClick={async event => { event.stopPropagation(); await updateObjectConfig(object.id, { is_enabled: true }); void reload() }}>Activate</button>
                  ) : (
                    <span className="attio-menu-wrap">
                      <button
                        className="icon-menu-btn"
                        aria-label="options"
                        onClick={event => { event.stopPropagation(); setOpenRowMenu(openRowMenu === object.id ? null : object.id) }}
                      >
                        <DotsThreeVertical size={15} />
                      </button>
                      {openRowMenu === object.id && (
                        <AttioMenu>
                          <MenuButton onClick={() => navigate(`/settings/data/objects/${object.slug}/general`)}><GearSix size={13} /> Configuration</MenuButton>
                          <MenuButton onClick={() => navigate(`/settings/data/objects/${object.slug}/permissions`)}><LockKey size={13} /> Permissions</MenuButton>
                          <MenuButton onClick={() => navigate(`/settings/data/objects/${object.slug}/appearance`)}><Image size={13} /> Appearance</MenuButton>
                          <MenuButton onClick={() => navigate(`/settings/data/objects/${object.slug}/attributes`)}><Rows size={13} /> Attributes</MenuButton>
                          {object.object_type === 'standard' && !['people', 'companies'].includes(object.slug) && (
                            <>
                              <div className="attio-menu-sep" />
                              <MenuButton danger onClick={async () => { await updateObjectConfig(object.id, { is_enabled: false }); setOpenRowMenu(null); void reload() }}><Trash size={13} /> Deactivate object</MenuButton>
                            </>
                          )}
                        </AttioMenu>
                      )}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </section>
          {showCreate && <CreateObjectModal onClose={() => setShowCreate(false)} onCreated={slug => { setShowCreate(false); void reload(); navigate(`/settings/objects/${slug}`) }} />}
        </div>
      </main>
    </div>
  )
}

function ConfigurationTab({ object, canManage, onReload }: { object: CrmObject; canManage: boolean; onReload: () => void }) {
  const navigate = useNavigate()
  const [plural, setPlural] = useState(object.plural_name)
  const [singular, setSingular] = useState(object.singular_name)
  const [icon, setIcon] = useState(object.icon ?? '')
  const [confirmDelete, setConfirmDelete] = useState('')
  const canDelete = object.object_type === 'custom' && confirmDelete === object.slug
  const canToggleStandard = object.object_type === 'standard' && !['people', 'companies'].includes(object.slug)
  const save = async () => {
    if (!canManage) return
    await updateObjectConfig(object.id, { plural_name: plural.trim() || object.plural_name, singular_name: singular.trim() || object.singular_name, icon: icon.trim() || null })
    onReload()
  }

  return (
    <div className="obj-settings-panel">
      <section className="attio-panel">
        <h3>General</h3>
        <p className="attio-muted">Set words to describe a single and multiple objects of this type</p>
        <div className={`attio-form-grid ${object.object_type === 'custom' ? 'has-icon' : ''}`}>
          {object.object_type === 'custom' && <label className="attio-field"><span>Icon</span><input value={icon} disabled={!canManage} onChange={event => setIcon(event.target.value)} placeholder="◇" /></label>}
          <label className="attio-field"><span>Plural noun</span><input value={plural} disabled={!canManage} onChange={event => setPlural(event.target.value)} /></label>
          <label className="attio-field"><span>Singular noun</span><input value={singular} disabled={!canManage} onChange={event => setSingular(event.target.value)} /></label>
          <label className="attio-field"><span>Identifier / Slug</span><div className="slug-input"><span>/</span><input value={object.slug} readOnly /></div><small>You can't change the slug of an object</small></label>
        </div>
        <div className="attio-panel-actions"><button className="attio-btn primary" disabled={!canManage} onClick={save}><Check size={13} /> Save changes</button></div>
      </section>
      {object.object_type === 'standard' && canToggleStandard && object.is_enabled ? (
        <section className="danger-zone">
          <h3>Danger zone</h3>
          <div className="danger-box">
            <span><strong>Deactivate object</strong><small>Associated lists will be permanently destroyed.</small></span>
            <button className="danger-action" disabled={!canManage} onClick={async () => { if (!canManage) return; await updateObjectConfig(object.id, { is_enabled: false }); onReload() }}>
              Deactivate object
            </button>
          </div>
        </section>
      ) : object.object_type === 'standard' && canToggleStandard && !object.is_enabled ? (
        <section className="attio-panel">
          <h3>Activate standard object</h3>
          <p className="attio-muted">Activate this object to use its records, attributes, and views.</p>
          <button className="attio-btn primary" disabled={!canManage} onClick={async () => { if (!canManage) return; await updateObjectConfig(object.id, { is_enabled: true }); onReload() }}>Activate</button>
        </section>
      ) : object.object_type === 'standard' ? (
        <section className="attio-panel">
          <h3>Required standard object</h3>
          <p className="attio-muted">Attio keeps People and Companies active; these standard objects cannot be deactivated.</p>
        </section>
      ) : (
        <section className="attio-panel danger">
          <h3>Delete custom object</h3>
          <p className="attio-muted">Deleting a custom object is permanent. It removes all records, data, settings, and permissions associated with it.</p>
          <label className="attio-field"><span>Type `{object.slug}` to confirm</span><input value={confirmDelete} disabled={!canManage} onChange={event => setConfirmDelete(event.target.value)} /></label>
          <button className="attio-btn danger" disabled={!canDelete || !canManage} onClick={async () => { if (!canManage) return; await deleteCustomObject(object); navigate('/settings/objects') }}><Trash size={13} /> Delete object</button>
        </section>
      )}
    </div>
  )
}

function AppearanceTab({ object, attributes, canManage, onReload }: { object: CrmObject; attributes: CrmAttribute[]; canManage: boolean; onReload: () => void }) {
  const eligibleText = attributes.filter(attribute => ['Text', 'Email', 'URL', 'Record ID', 'Number'].includes(attribute.attribute_type))
  const eligibleImage = attributes.filter(attribute => ['Text', 'URL'].includes(attribute.attribute_type))
  return (
    <div className="obj-settings-panel">
      <section className="attio-panel compact-secondary">
        <h3>Record labels</h3>
        <p className="attio-muted">Configure which attributes are used for record image and text.</p>
        <label className="attio-field">
          <span>Record image</span>
          <select value={object.record_image_attribute_id ?? ''} disabled={!canManage} onChange={async event => { if (!canManage) return; await updateObjectConfig(object.id, { record_image_attribute_id: event.target.value || null }); onReload() }}>
            <option value="">No image attribute</option>
            {eligibleImage.map(attribute => <option key={attribute.id} value={attribute.id}>{attribute.name}</option>)}
          </select>
        </label>
        <label className="attio-field">
          <span>Record text</span>
          <select value={object.record_text_attribute_id ?? ''} disabled={!canManage} onChange={async event => { if (!canManage) return; await updateObjectConfig(object.id, { record_text_attribute_id: event.target.value || null }); onReload() }}>
            <option value="">Default primary name</option>
            {eligibleText.map(attribute => <option key={attribute.id} value={attribute.id}>{attribute.name}</option>)}
          </select>
        </label>
      </section>
    </div>
  )
}

function attributeTypeInitial(type: string) {
  return type === 'Multi-select' ? 'M' : type.slice(0, 1)
}

function AttributesTab({ attributes }: { attributes: CrmAttribute[] }) {
  return (
    <section className="attio-table attr-table">
      <div className="attio-tr attio-th attr-grid"><span><Database size={12} /> Name</span><span><Rows size={12} /> Type</span><span><LockKey size={12} /> Constraints</span><span><Rows size={12} /> Properties</span><span /></div>
      {attributes.map(attribute => (
        <div key={attribute.id} className="attio-tr attr-grid">
          <span className="attr-name"><span className="attr-type-icon">{attributeTypeInitial(attribute.attribute_type)}</span><strong>{attribute.name}</strong></span>
          <span>{attribute.attribute_type}</span>
          <span className="attr-tags">
            {attribute.is_required && <Badge>Required</Badge>}
            {attribute.is_unique && <Badge>Unique</Badge>}
            {!attribute.is_required && !attribute.is_unique && <span className="attio-muted">—</span>}
          </span>
          <span className="attr-tags">
            {attribute.is_system && <Badge tone="blue">System</Badge>}
            {attribute.is_enriched && <Badge tone="purple">Enriched</Badge>}
            {attribute.is_relationship && <Badge tone="green">Relationship</Badge>}
          </span>
          <span className="attr-menu" />
        </div>
      ))}
      {attributes.length === 0 && <div className="attio-empty">No attributes match this filter.</div>}
    </section>
  )
}

function PermissionsTab({ object, permissions, canManage, onReload }: { object: CrmObject; permissions: ReturnType<typeof useAttioObjectBundle>['permissions']; canManage: boolean; onReload: () => void }) {
  const { user } = useAuth()
  const workspace = permissions.find(permission => permission.subject_type === 'workspace')
  const teamPermissions = permissions.filter(permission => permission.subject_type === 'team')
  const memberPermissions = permissions.filter(permission => permission.subject_type === 'member')
  const automationPermissions = permissions.filter(permission => permission.subject_type === 'automation')
  const [label, setLabel] = useState('')
  const [type, setType] = useState<'team' | 'member' | 'automation'>('team')
  const [level, setLevel] = useState<CrmAccessLevel>('read_write')
  const [showAdd, setShowAdd] = useState(false)

  const add = async () => {
    if (!user || !canManage || !label.trim()) return
    await addObjectPermission(user.id, object.id, type, label.trim(), level)
    setLabel('')
    onReload()
  }

  const levelSelect = (value: CrmAccessLevel, onChange: (value: CrmAccessLevel) => void) => (
    <select value={value} disabled={!canManage} onChange={event => onChange(event.target.value as CrmAccessLevel)}>
      {(Object.keys(ACCESS_LABEL) as CrmAccessLevel[]).map(key => <option key={key} value={key}>{ACCESS_LABEL[key]}</option>)}
    </select>
  )

  return (
    <div className="obj-settings-panel">
      <section className="attio-panel">
        <h3>Members</h3>
        <p className="attio-muted">Set access rules for people in your workspace. Learn more</p>
        <div className="perm-block-title">Workspace access</div>
        <div className="perm-row no-line">
          <span><strong>Workspace access</strong><small>Set default access for all workspace members</small></span>
          {workspace ? levelSelect(workspace.access_level, async next => { if (!canManage) return; await updatePermission(workspace.id, next); onReload() }) : null}
        </div>
      </section>
      <section className="attio-panel">
        <div className="perm-section-head">
          <span><strong>Teams permissions</strong><small>Set object access for each team</small></span>
        </div>
        <div className="perm-block-title">Teams</div>
        <p className="perm-copy">Set access for teams.</p>
        {teamPermissions.length === 0 ? (
          <div className="perm-row no-line muted-row"><span><strong>No team access rules</strong><small>Teams inherit workspace access until a rule is added.</small></span></div>
        ) : teamPermissions.map(permission => (
          <div key={permission.id} className="perm-row">
            <span><strong>{permission.label}</strong><small>{permission.subject_type}</small></span>
            {levelSelect(permission.access_level, async next => { if (!canManage) return; await updatePermission(permission.id, next); onReload() })}
          </div>
        ))}
      </section>
      <section className="attio-panel">
        <div className="perm-section-head">
          <span><strong>Member permissions</strong><small>Set object access for individual members</small></span>
        </div>
        <div className="perm-block-title">Members</div>
        <p className="perm-copy">Set access for members.</p>
        {memberPermissions.length === 0 ? (
          <div className="perm-row no-line muted-row"><span><strong>No member-specific access rules</strong><small>Members inherit workspace and team access.</small></span></div>
        ) : memberPermissions.map(permission => (
          <div key={permission.id} className="perm-row">
            <span><strong>{permission.label}</strong><small>{permission.subject_type}</small></span>
            {levelSelect(permission.access_level, async next => { if (!canManage) return; await updatePermission(permission.id, next); onReload() })}
          </div>
        ))}
      </section>
      <section className="attio-panel">
        <div className="perm-section-head">
          <span><strong>Automations</strong><small>Set access rules for automations. Automations will still inherit workspace access. Learn more</small></span>
          <button className="attio-btn" disabled={!canManage} onClick={() => setShowAdd(value => !value)}><Plus size={12} /> Add</button>
        </div>
        {showAdd && (
          <div className="perm-add">
            <select value={type} disabled={!canManage} onChange={event => setType(event.target.value as typeof type)}>
              <option value="team">Team</option>
              <option value="member">Individual member</option>
              <option value="automation">Automation</option>
            </select>
            <input value={label} disabled={!canManage} onChange={event => setLabel(event.target.value)} placeholder="Name or email..." />
            {levelSelect(level, setLevel)}
            <button className="attio-btn" disabled={!canManage || !label.trim()} onClick={add}><Plus size={12} /> Add</button>
          </div>
        )}
        {automationPermissions.map(permission => (
          <div key={permission.id} className="perm-row">
            <span><strong>{permission.label}</strong><small>{permission.subject_type}</small></span>
            {levelSelect(permission.access_level, async next => { if (!canManage) return; await updatePermission(permission.id, next); onReload() })}
          </div>
        ))}
      </section>
    </div>
  )
}

export function ObjectSettingsDetail() {
  const { slug, tab: tabParam } = useParams<{ slug: string; tab?: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { object, attributes, permissions, loading, reload } = useAttioObjectBundle(user?.id, slug)
  const routeTab = ROUTE_TO_TAB[tabParam ?? 'general'] ?? 'configuration'
  const [tab, setTab] = useState<SettingsTab>(routeTab)
  const [attributeQuery, setAttributeQuery] = useState('')
  const sortedAttributes = useMemo(() => [...attributes].sort((a, b) => a.sort_order - b.sort_order), [attributes])
  const visibleAttributes = useMemo(() => {
    const needle = attributeQuery.trim().toLowerCase()
    if (!needle) return sortedAttributes
    return sortedAttributes.filter(attribute =>
        attribute.name.toLowerCase().includes(needle) ||
        attribute.key.toLowerCase().includes(needle) ||
        attribute.attribute_type.toLowerCase().includes(needle) ||
        attribute.source.toLowerCase().includes(needle)
    )
  }, [attributeQuery, sortedAttributes])

  useEffect(() => {
    setTab(routeTab)
  }, [routeTab])

  const effectiveAccess = getEffectiveAccess(permissions)
  const canManage = ACCESS_RANK[effectiveAccess] >= ACCESS_RANK.full_access

  const goTab = (next: SettingsTab) => {
    setTab(next)
    if (slug) navigate(`/settings/data/objects/${slug}/${TAB_TO_ROUTE[next]}`)
  }

  if (loading) return <div className="attio-settings-page"><main className="attio-settings-main"><div className="attio-empty">Loading...</div></main></div>
  if (!object) return <div className="attio-settings-page"><main className="attio-settings-main"><Link to="/settings/objects">Back to objects</Link><div className="attio-empty">Object not found.</div></main></div>

  return (
    <div className="attio-settings-page">
      <SettingsSidebar />
      <main className="attio-settings-main">
        <SettingsTopbar crumbs={<><Link to="/settings/data/objects"><Database size={14} /> Data</Link><CaretRight size={12} /><Link to="/settings/data/objects">Objects</Link><CaretRight size={12} /><ObjectIcon object={object} /> {object.plural_name}</>} />
        <div className="attio-data-content">
        <header className="object-detail-top">
          <Link className="object-back" to="/settings/data/objects"><ArrowLeft size={14} /> Back</Link>
          <div className="object-title-row">
            <ObjectIcon object={object} large />
            <div><h1>{object.plural_name} <Badge>{object.object_type === 'standard' ? 'Standard' : 'Custom'}</Badge></h1><p>Manage object attributes and other relevant settings</p></div>
          </div>
          {!object.is_enabled && (
            <div className="object-inactive-banner">
              <span>{object.plural_name} are currently deactivated. Activate them to use this object.</span>
              <button className="attio-btn primary" disabled={!canManage} onClick={async () => { if (!canManage) return; await updateObjectConfig(object.id, { is_enabled: true }); void reload() }}>Activate <Badge>Plus</Badge></button>
            </div>
          )}
          <nav className="object-tabs">
            {TABS.map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => goTab(item.id)}>{item.icon}{item.label}{item.id === 'attributes' && <span className="tab-count">{attributes.length}</span>}</button>)}
          </nav>
        </header>
        {tab === 'configuration' && <ConfigurationTab object={object} canManage={canManage} onReload={() => void reload()} />}
        {tab === 'appearance' && <AppearanceTab object={object} attributes={sortedAttributes} canManage={canManage} onReload={() => void reload()} />}
        {tab === 'attributes' && (
          <>
            <div className="objects-section-head attr-section-head">
              <div>
                <h2>Attributes</h2>
                <p>Review object attribute metadata. Attribute creation and editing are handled in the next branch.</p>
              </div>
            </div>
            <div className="attio-settings-toolbar">
              <div className="attio-search"><MagnifyingGlass size={13} /><input value={attributeQuery} onChange={event => setAttributeQuery(event.target.value)} placeholder="Search attributes..." /></div>
            </div>
            <AttributesTab attributes={visibleAttributes} />
          </>
        )}
        {tab === 'permissions' && <PermissionsTab object={object} permissions={permissions} canManage={canManage} onReload={() => void reload()} />}
        {object.object_type === 'custom' && tab === 'configuration' && <p className="attio-warning"><Warning size={13} /> Custom object deletion is permanent, matching Attio semantics.</p>}
        </div>
      </main>
    </div>
  )
}
