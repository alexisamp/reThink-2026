import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowsDownUp,
  CaretDown,
  Check,
  Copy,
  DotsThree,
  DownloadSimple,
  FunnelSimple,
  GearSix,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Star,
  Table,
  TrashSimple,
  UploadSimple,
  X,
} from '@phosphor-icons/react'
import { useAuth } from '@/hooks/useAuth'
import {
  DEFAULT_STATUS_OPTIONS,
  LIST_OBJECT_LABELS,
  type ListEntry,
  getListRecordId,
  useListEntries,
  useLists,
  useListWorkspace,
} from '@/hooks/useLists'
import { supabase } from '@/lib/supabase'
import type {
  Company,
  Contact,
  ListAttribute,
  ListAttributeOption,
  ListMembership,
  ListRecordKind,
  ListView,
  Opportunity,
} from '@/types'

type RecordRow = Contact | Company | Opportunity

interface ObjectColumn {
  key: string
  label: string
  icon: string
  group?: string
  read: (record: RecordRow) => string
}

const OBJECT_COLUMNS: Record<ListRecordKind, ObjectColumn[]> = {
  person: [
    { key: 'object:id', label: 'Record ID', icon: '#', read: record => (record as Contact).id },
    { key: 'object:name', label: 'Name', icon: '▣', read: record => (record as Contact).name ?? '' },
    { key: 'object:email', label: 'Email', icon: '@', read: record => String((record as Contact).email ?? '') },
    { key: 'object:phone', label: 'Phone', icon: '☏', read: record => String((record as Contact).phone ?? '') },
    { key: 'object:job_title', label: 'Job title', icon: '▤', read: record => String((record as Contact).job_title ?? '') },
    { key: 'object:company', label: 'Company', icon: '▦', read: record => String((record as Contact).company ?? '') },
    { key: 'object:location', label: 'Location', icon: '⌖', read: record => String((record as Contact).location ?? '') },
    { key: 'object:linkedin_url', label: 'LinkedIn', icon: '↗', read: record => String((record as Contact).linkedin_url ?? '') },
    { key: 'object:website', label: 'Website', icon: '◎', read: record => String((record as Contact).website ?? '') },
    { key: 'object:about', label: 'Description', icon: 'A', read: record => String((record as Contact).about ?? '') },
    { key: 'object:category', label: 'Category', icon: '◇', read: record => String((record as Contact).category ?? '') },
    { key: 'object:status', label: 'Status', icon: '●', read: record => String((record as Contact).status ?? '') },
    { key: 'object:tier', label: 'Tier', icon: '#', read: record => String((record as Contact).tier ?? '') },
    { key: 'object:connections_count', label: 'Connections', icon: '#', read: record => String((record as Contact).connections_count ?? '') },
    { key: 'object:followers_count', label: 'Followers', icon: '#', read: record => String((record as Contact).followers_count ?? '') },
    { key: 'object:last_interaction_at', label: 'Last interaction', icon: '◷', read: record => String((record as Contact).last_interaction_at ?? '') },
    { key: 'object:birthday', label: 'Birthday', icon: '◷', read: record => String((record as Contact).birthday ?? '') },
    { key: 'object:notes', label: 'Notes', icon: 'A', read: record => String((record as Contact).notes ?? '') },
  ],
  company: [
    { key: 'object:id', label: 'Record ID', icon: '#', read: record => (record as Company).id },
    { key: 'object:domain', label: 'Domains', icon: '◎', read: record => String((record as Company).domain ?? '') },
    { key: 'object:name', label: 'Name', icon: '▣', read: record => (record as Company).name ?? '' },
    { key: 'object:description', label: 'Description', icon: 'A', read: record => String((record as Company).description ?? '') },
    { key: 'object:team', label: 'Team', icon: '♚', group: 'relationship', read: () => '' },
    { key: 'object:sector', label: 'Categories', icon: '◇', read: record => String((record as Company).sector ?? '') },
    { key: 'object:primary_location', label: 'Primary location', icon: '⌖', read: record => String((record as Company).primary_location ?? (record as Company).hq_location ?? '') },
    { key: 'object:size', label: 'Size', icon: '#', read: record => String((record as Company).size ?? '') },
    { key: 'object:employees_count', label: 'Employees count', icon: '#', read: record => String((record as Company).employees_count ?? '') },
    { key: 'object:members_on_linkedin', label: 'LinkedIn members', icon: '#', read: record => String((record as Company).members_on_linkedin ?? '') },
    { key: 'object:followers_count', label: 'Followers', icon: '#', read: record => String((record as Company).followers_count ?? '') },
    { key: 'object:founded_year', label: 'Founded year', icon: '#', read: record => String((record as Company).founded_year ?? '') },
    { key: 'object:website_url', label: 'Website', icon: '↗', read: record => String((record as Company).website_url ?? '') },
    { key: 'object:linkedin_url', label: 'LinkedIn', icon: '↗', read: record => String((record as Company).linkedin_url ?? '') },
    { key: 'object:account_stage', label: 'Account stage', icon: '●', read: record => String((record as Company).account_stage ?? '') },
    { key: 'object:icp', label: 'ICP', icon: '◇', read: record => String((record as Company).icp ?? '') },
    { key: 'object:source', label: 'Source', icon: '◇', read: record => String((record as Company).source ?? '') },
    { key: 'object:motion', label: 'Motion', icon: '◇', read: record => String((record as Company).motion ?? '') },
    { key: 'object:next_step', label: 'Next step', icon: 'A', read: record => String((record as Company).next_step ?? '') },
    { key: 'object:notes', label: 'Notes', icon: 'A', read: record => String((record as Company).notes ?? '') },
  ],
  opportunity: [
    { key: 'object:id', label: 'Record ID', icon: '#', read: record => (record as Opportunity).id },
    { key: 'object:title', label: 'Name', icon: '▣', read: record => (record as Opportunity).title ?? '' },
    { key: 'object:company', label: 'Company', icon: '▦', read: record => String((record as Opportunity).company?.name ?? '') },
    { key: 'object:stage', label: 'Deal stage', icon: '●', read: record => String((record as Opportunity).stage ?? '') },
    { key: 'object:type', label: 'Type', icon: '◇', read: record => String((record as Opportunity).type ?? '') },
    { key: 'object:estimated_value', label: 'Value', icon: '#', read: record => String((record as Opportunity).estimated_value ?? '') },
    { key: 'object:target_date', label: 'Target date', icon: '◷', read: record => String((record as Opportunity).target_date ?? '') },
    { key: 'object:close_date', label: 'Close date', icon: '◷', read: record => String((record as Opportunity).close_date ?? '') },
    { key: 'object:application_source_url', label: 'Application source URL', icon: '↗', read: record => String((record as Opportunity).application_source_url ?? '') },
    { key: 'object:application_source_domain', label: 'Application source domain', icon: '◎', read: record => String((record as Opportunity).application_source_domain ?? '') },
    { key: 'object:application_source_name', label: 'Application source name', icon: 'A', read: record => String((record as Opportunity).application_source_name ?? '') },
    { key: 'object:decision_filter_pass', label: 'Decision filter pass', icon: '✓', read: record => String((record as Opportunity).decision_filter_pass ?? '') },
    { key: 'object:notes', label: 'Notes', icon: 'A', read: record => String((record as Opportunity).notes ?? '') },
  ],
}

const STAGE_COLORS = ['#8B8F98', '#4169E1', '#2F8F5B', '#D97706', '#C2410C', '#7C3AED', '#0891B2']

export default function ListDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const workspace = useListWorkspace(user?.id, id)
  const { deleteList } = useLists(user?.id)
  const { list, attributes, views, loading } = workspace
  const entriesState = useListEntries(user?.id, list)
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [createViewOpen, setCreateViewOpen] = useState(false)
  const [addRecordOpen, setAddRecordOpen] = useState(false)
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false)
  const [addColumnOpen, setAddColumnOpen] = useState(false)
  const [stageEditorOpen, setStageEditorOpen] = useState(false)
  const [editingStage, setEditingStage] = useState<ListAttributeOption | null>(null)
  const [createViewInitialType, setCreateViewInitialType] = useState<'table' | 'kanban'>('table')

  useEffect(() => {
    if (views.length === 0) {
      setActiveViewId(null)
      return
    }
    if (!activeViewId || !views.some(view => view.id === activeViewId)) {
      setActiveViewId((views.find(view => view.is_default) ?? views[0]).id)
    }
  }, [activeViewId, views])

  const activeView = views.find(view => view.id === activeViewId) ?? views[0] ?? null
  const statusAttributes = attributes.filter(attribute => attribute.type === 'status')
  const kanbanStatusAttribute = activeView?.type === 'kanban'
    ? attributes.find(attribute => attribute.id === activeView.config.kanbanStatusAttributeId && attribute.type === 'status')
    : null
  const objectLabels = list ? LIST_OBJECT_LABELS[list.parent_object] : LIST_OBJECT_LABELS.person
  const visibleColumnKeys = useMemo(() => activeView?.config.columns ?? [], [activeView])

  async function handleCreateTableView(name: string) {
    const view = await workspace.createView({ name, type: 'table', config: { columns: [] } })
    if (view) setActiveViewId(view.id)
  }

  async function handleCreateKanbanView(name: string, statusAttributeId: string | null) {
    let attrId = statusAttributeId
    if (!attrId) {
      const attr = await workspace.createDefaultStatusAttribute()
      attrId = attr?.id ?? null
    }
    if (!attrId) return
    const view = await workspace.createView({
      name,
      type: 'kanban',
      config: { kanbanStatusAttributeId: attrId, columns: [] },
    })
    if (view) setActiveViewId(view.id)
  }

  async function addColumn(key: string) {
    if (!activeView) return
    const current = activeView.config.columns ?? []
    if (current.includes(key)) return setAddColumnOpen(false)
    await workspace.updateView(activeView.id, { config: { ...activeView.config, columns: [...current, key] } })
    setAddColumnOpen(false)
  }

  async function handleDeleteList() {
    if (!list || !window.confirm(`Delete "${list.name}"? Entries for this list will be removed, but records stay intact.`)) return
    await deleteList(list.id)
    navigate('/lists')
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center text-[12px] text-shuttle">Loading list...</div>
  }

  if (!list) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-shuttle">
        <div className="text-center">
          <p>List not found.</p>
          <button onClick={() => navigate('/lists')} className="mt-2 text-burnham hover:underline">Back to lists</button>
        </div>
      </div>
    )
  }

  if (views.length === 0) {
    return (
      <div className="atl-page min-h-full bg-white">
        <ListPageHeader list={list} count={entriesState.entries.length} />
        <StartWithView
          objectLabel={objectLabels.singular}
          onCreateTable={() => handleCreateTableView('Table')}
          onCreateKanban={() => {
            setCreateViewInitialType('kanban')
            setCreateViewOpen(true)
          }}
          onDeleteList={handleDeleteList}
        />
        <CreateViewModal
          open={createViewOpen}
          initialType={createViewInitialType}
          statusAttributes={statusAttributes}
          defaultName={list.name}
          onClose={() => setCreateViewOpen(false)}
          onCreateTable={async name => {
            await handleCreateTableView(name)
            setCreateViewOpen(false)
          }}
          onCreateKanban={async (name, statusAttributeId) => {
            await handleCreateKanbanView(name, statusAttributeId)
            setCreateViewOpen(false)
          }}
        />
      </div>
    )
  }

  return (
    <div className="atl-page flex h-full min-h-0 flex-col bg-white">
      <ListPageHeader list={list} count={entriesState.entries.length} />

      <div className="atl-toolbar shrink-0">
        <div className="relative">
          <button
            onClick={() => setViewMenuOpen(prev => !prev)}
            className="atl-button"
          >
            {activeView?.type === 'kanban' ? <SquaresIcon /> : <Table size={14} />}
            <span>{activeView?.name}</span>
            <CaretDown size={12} />
          </button>
          {viewMenuOpen && activeView && (
            <ViewMenu
              views={views}
              activeViewId={activeView.id}
              onClose={() => setViewMenuOpen(false)}
              onSelect={viewId => {
                setActiveViewId(viewId)
                setViewMenuOpen(false)
              }}
              onCreate={() => {
                setCreateViewInitialType('table')
                setViewMenuOpen(false)
                setCreateViewOpen(true)
              }}
              onRename={async view => {
                const name = window.prompt('View name', view.name)
                if (name?.trim()) await workspace.updateView(view.id, { name: name.trim() })
              }}
              onDuplicate={workspace.duplicateView}
              onDelete={async view => {
                if (views.length <= 1 || !window.confirm(`Delete "${view.name}"?`)) return
                await workspace.deleteView(view.id)
              }}
              onFavorite={view => workspace.updateView(view.id, { config: { ...view.config, favorite: !view.config.favorite } })}
            />
          )}
        </div>

        <div className="relative">
          <button onClick={() => setViewSettingsOpen(prev => !prev)} className="atl-button">
            <GearSix size={13} />
            <span>View settings</span>
          </button>
          {viewSettingsOpen && (
            <div className="absolute left-0 top-8 z-30 w-48 rounded-lg border border-mercury bg-white p-1 shadow-xl">
              <button
                onClick={() => {
                  setViewSettingsOpen(false)
                  void handleDeleteList()
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] font-medium text-red-600 hover:bg-red-50"
              >
                <TrashSimple size={13} />
                <span>Delete list</span>
              </button>
            </div>
          )}
        </div>
        <ToolbarButton icon={<ArrowsDownUp size={15} />} label="Sort" />
        <ToolbarButton icon={<FunnelSimple size={15} />} label="Filter" />

        <div className="atl-toolbar-spacer" />
        <ToolbarButton icon={<UploadSimple size={15} />} label="Import / Export" />
        <div className="flex items-center gap-2">
          {activeView?.type === 'table' && (
            <div className="relative">
              <button onClick={() => setAddColumnOpen(prev => !prev)} className="atl-button">
                <Plus size={15} />
                <span>Add column</span>
              </button>
            </div>
          )}
          <button onClick={() => setAddRecordOpen(true)} className="atl-button primary">
            <Plus size={16} />
            <span>Add {objectLabels.singular}</span>
          </button>
        </div>
      </div>

      {activeView?.type === 'kanban' && kanbanStatusAttribute ? (
        <KanbanView
          entries={entriesState.entries}
          statusAttribute={kanbanStatusAttribute}
          objectKind={list.parent_object}
          onMove={(membership, status) => entriesState.moveEntryStatus(membership, kanbanStatusAttribute.id, status)}
          onAddStage={() => {
            setEditingStage(null)
            setStageEditorOpen(true)
          }}
          onEditStage={option => {
            setEditingStage(option)
            setStageEditorOpen(true)
          }}
        />
      ) : (
        <TableView
          entries={entriesState.entries}
          objectKind={list.parent_object}
          attributes={attributes}
          visibleColumnKeys={visibleColumnKeys}
          onAdd={() => setAddRecordOpen(true)}
        />
      )}

      <CreateViewModal
        open={createViewOpen}
        initialType={createViewInitialType}
        statusAttributes={statusAttributes}
        defaultName={list.name}
        onClose={() => setCreateViewOpen(false)}
        onCreateTable={async name => {
          await handleCreateTableView(name)
          setCreateViewOpen(false)
        }}
        onCreateKanban={async (name, statusAttributeId) => {
          await handleCreateKanbanView(name, statusAttributeId)
          setCreateViewOpen(false)
        }}
      />

      <AddColumnModal
        open={addColumnOpen}
        kind={list.parent_object}
        attributes={attributes}
        onClose={() => setAddColumnOpen(false)}
        onAdd={addColumn}
        onCreateAttribute={async input => {
          const attr = await workspace.createAttribute(input)
          if (attr) await addColumn(`attr:${attr.id}`)
        }}
      />

      <AddRecordModal
        open={addRecordOpen}
        list={list}
        attributes={attributes}
        entries={entriesState.memberships}
        statusAttribute={kanbanStatusAttribute ?? statusAttributes[0] ?? null}
        onClose={() => setAddRecordOpen(false)}
        onAdd={async (recordId, values, notes) => {
          await entriesState.addEntry(recordId, values, notes, kanbanStatusAttribute?.id ?? statusAttributes[0]?.id)
          setAddRecordOpen(false)
        }}
        onUpdate={async (membershipId, values, notes) => {
          await entriesState.updateEntry(membershipId, values, notes, kanbanStatusAttribute?.id ?? statusAttributes[0]?.id)
          setAddRecordOpen(false)
        }}
      />

      {kanbanStatusAttribute && (
        <StageEditorModal
          open={stageEditorOpen}
          attribute={kanbanStatusAttribute}
          onClose={() => setStageEditorOpen(false)}
          onSave={async option => {
            const options = kanbanStatusAttribute.config.options ?? []
            await workspace.updateAttribute(kanbanStatusAttribute.id, {
              config: {
                ...kanbanStatusAttribute.config,
                options: editingStage
                  ? options.map(existing => existing.id === editingStage.id ? option : existing)
                  : [...options, option],
              },
            })
            setStageEditorOpen(false)
          }}
          existing={editingStage}
        />
      )}
    </div>
  )
}

function ListPageHeader({ list, count }: { list: { icon: string | null; name: string; parent_object: ListRecordKind }, count: number }) {
  const objectLabels = LIST_OBJECT_LABELS[list.parent_object]
  return (
    <header className="atl-header shrink-0">
      <span className="atl-title-icon">{list.icon || objectLabels.icon}</span>
      <div className="min-w-0">
        <div className="atl-title-row">
          <h1 className="truncate">{list.name}</h1>
          <span className="atl-object-pill">{objectLabels.plural}</span>
        </div>
        <p className="atl-count">{count} {count === 1 ? 'entry' : 'entries'}</p>
      </div>
    </header>
  )
}

function StartWithView({
  objectLabel,
  onCreateTable,
  onCreateKanban,
  onDeleteList,
}: {
  objectLabel: string
  onCreateTable: () => void
  onCreateKanban: () => void
  onDeleteList: () => void
}) {
  return (
    <main className="flex min-h-[calc(100vh-68px)] items-center justify-center bg-white px-6">
      <div className="w-full max-w-[620px]">
        <h2 className="text-center text-[21px] font-semibold text-midnight">Start with a view</h2>
        <p className="mx-auto mt-1 max-w-[420px] text-center text-[13px] leading-5 text-shuttle">
          Choose how you want to work with this list of {objectLabel.toLowerCase()} records.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button onClick={onCreateTable} className="rounded-xl border border-mercury bg-white p-5 text-left shadow-sm hover:border-shuttle/40 hover:shadow-md">
            <Table size={22} className="text-burnham" />
            <h3 className="mt-4 text-[14px] font-semibold text-midnight">Table</h3>
            <p className="mt-1 text-[12px] leading-5 text-shuttle">A spreadsheet-style view for fields, filters, sorting, and bulk updates.</p>
          </button>
          <button onClick={onCreateKanban} className="rounded-xl border border-mercury bg-white p-5 text-left shadow-sm hover:border-shuttle/40 hover:shadow-md">
            <SquaresIcon size={22} />
            <h3 className="mt-4 text-[14px] font-semibold text-midnight">Kanban</h3>
            <p className="mt-1 text-[12px] leading-5 text-shuttle">Track list entries through stages using a list-specific status attribute.</p>
          </button>
        </div>
        <button onClick={onDeleteList} className="mt-4 w-full rounded-lg border border-mercury px-3 py-2 text-[12px] font-medium text-red-600 hover:bg-red-50">
          Delete list
        </button>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <LearnMoreCard title="Understanding lists" />
          <LearnMoreCard title="Create views and attributes" />
        </div>
      </div>
    </main>
  )
}

function LearnMoreCard({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-dashed border-mercury bg-alabaster/35 px-3 py-2 text-[12px] text-shuttle">
      <span className="font-medium text-midnight">{title}</span>
      <span className="ml-1">Learn more</span>
    </div>
  )
}

function ToolbarButton({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <button className="atl-button">
      {icon}
      <span>{label}</span>
    </button>
  )
}

function TableView({
  entries,
  objectKind,
  attributes,
  visibleColumnKeys,
  onAdd,
}: {
  entries: ListEntry[]
  objectKind: ListRecordKind
  attributes: ListAttribute[]
  visibleColumnKeys: string[]
  onAdd: () => void
}) {
  const objectColumns = OBJECT_COLUMNS[objectKind].filter(column => visibleColumnKeys.includes(column.key))
  const attrColumns = attributes.filter(attribute => visibleColumnKeys.includes(`attr:${attribute.id}`))
  const primaryLabel = LIST_OBJECT_LABELS[objectKind].singular

  return (
    <div className="atl-table-wrap">
      <table className="atl-table">
        <thead className="sticky top-0 z-10 bg-white">
          <tr>
            <th className="w-[340px]">{primaryLabel}</th>
            {objectColumns.map(column => <th key={column.key} className="w-[220px]">{column.label}</th>)}
            {attrColumns.map(attribute => <th key={attribute.id} className="w-[220px]">{attribute.name}</th>)}
            <th className="w-[180px]">+ Add column</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td colSpan={objectColumns.length + attrColumns.length + 2} className="atl-empty-table">
                No records in this list yet. <button onClick={onAdd} className="font-medium text-burnham hover:underline">Add {primaryLabel}</button>
              </td>
            </tr>
          ) : entries.map(entry => (
            <tr key={entry.membership.id}>
              <td>
                <RecordName kind={objectKind} record={entry.record} />
              </td>
              {objectColumns.map(column => <td key={column.key} className="text-[13px] text-[#666]">{column.read(entry.record) || '—'}</td>)}
              {attrColumns.map(attribute => (
                <td key={attribute.id} className="text-[13px] text-[#666]">
                  {formatAttributeValue(attribute, entry.membership.attributes?.[attribute.id])}
                </td>
              ))}
              <td />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={objectColumns.length + attrColumns.length + 2} className="atl-count-row">
              Count {entries.length}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function KanbanView({
  entries,
  statusAttribute,
  objectKind,
  onMove,
  onAddStage,
  onEditStage,
}: {
  entries: ListEntry[]
  statusAttribute: ListAttribute
  objectKind: ListRecordKind
  onMove: (membership: ListMembership, status: string | null) => void
  onAddStage: () => void
  onEditStage: (option: ListAttributeOption) => void
}) {
  const options = statusAttribute.config.options ?? DEFAULT_STATUS_OPTIONS
  const columns: Array<Omit<ListAttributeOption, 'id'> & { id: string | null; label: string }> = [
    { id: null, label: 'No stage', color: '#C7C9CD' },
    ...options,
  ]
  const [dragId, setDragId] = useState<string | null>(null)
  const byMembershipId = new Map(entries.map(entry => [entry.membership.id, entry]))

  return (
    <div className="atl-kanban">
      {columns.map(column => {
        const columnEntries = entries.filter(entry => String(entry.membership.attributes?.[statusAttribute.id] ?? entry.membership.current_stage ?? '') === String(column.id ?? ''))
        return (
          <section
            key={column.id ?? 'none'}
            onDragOver={event => event.preventDefault()}
            onDrop={() => {
              if (!dragId) return
              const entry = byMembershipId.get(dragId)
              if (entry) onMove(entry.membership, column.id)
              setDragId(null)
            }}
            className="atl-kanban-col"
          >
            <header className="atl-kanban-head">
              <span className="atl-dot" style={{ background: column.color ?? '#8B8F98' }} />
              <span className="atl-kanban-title truncate">{column.label}</span>
              <span className="atl-kanban-count">{columnEntries.length}</span>
              {column.id && (
                <button
                  onClick={() => onEditStage(column as ListAttributeOption)}
                  className="atl-icon-btn"
                  title="Edit stage"
                >
                  <DotsThree size={15} weight="bold" />
                </button>
              )}
            </header>
            <div className="atl-kanban-body">
              {columnEntries.map(entry => (
                <div
                  key={entry.membership.id}
                  draggable
                  onDragStart={() => setDragId(entry.membership.id)}
                  className="atl-card"
                >
                  <RecordName kind={objectKind} record={entry.record} />
                  {entry.membership.notes && <p className="mt-2 line-clamp-2 text-[12px] text-shuttle">{entry.membership.notes}</p>}
                </div>
              ))}
            </div>
          </section>
        )
      })}
      <button
        onClick={onAddStage}
        className="atl-new-stage"
      >
        <Plus size={16} />
        <span>New stage</span>
      </button>
    </div>
  )
}

function RecordName({ kind, record }: { kind: ListRecordKind; record: RecordRow }) {
  const name = getRecordName(kind, record)
  const subtitle = getRecordSubtitle(kind, record)
  return (
    <span className="atl-record">
      <span className="atl-record-avatar">{name.slice(0, 1).toUpperCase()}</span>
      <span className="min-w-0">
        <span className="atl-record-name">{name}</span>
        {subtitle && <span className="atl-record-subtitle">{subtitle}</span>}
      </span>
    </span>
  )
}

function ViewMenu({
  views,
  activeViewId,
  onClose,
  onSelect,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
  onFavorite,
}: {
  views: ListView[]
  activeViewId: string
  onClose: () => void
  onSelect: (viewId: string) => void
  onCreate: () => void
  onRename: (view: ListView) => void
  onDuplicate: (view: ListView) => void
  onDelete: (view: ListView) => void
  onFavorite: (view: ListView) => void
}) {
  const [query, setQuery] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const filtered = views.filter(view => view.name.toLowerCase().includes(query.toLowerCase()))
  return (
    <div className="absolute left-0 top-8 z-30 w-[280px] rounded-xl border border-mercury bg-white p-2 shadow-xl">
      <div className="relative mb-2">
        <MagnifyingGlass size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-shuttle" />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search views" className="h-8 w-full rounded-lg border border-mercury pl-8 pr-2 text-[12px] outline-none focus:border-burnham" autoFocus />
      </div>
      <div className="max-h-[260px] overflow-auto">
        {filtered.map(view => (
          <div key={view.id} className="relative flex items-center gap-1 rounded-md hover:bg-mercury/25">
            <button onClick={() => onSelect(view.id)} className="flex h-8 min-w-0 flex-1 items-center gap-2 px-2 text-left text-[12px] text-midnight">
              {view.config.favorite ? <Star size={13} weight="fill" /> : view.type === 'kanban' ? <SquaresIcon /> : <Table size={13} />}
              <span className="truncate">{view.name}</span>
              {view.id === activeViewId && <Check size={13} className="ml-auto text-burnham" />}
            </button>
            <button onClick={() => setMenuFor(menuFor === view.id ? null : view.id)} className="mr-1 rounded p-1 text-shuttle hover:bg-mercury/50">
              <DotsThree size={16} weight="bold" />
            </button>
            {menuFor === view.id && (
              <div className="absolute right-1 top-8 z-40 w-[168px] rounded-lg border border-mercury bg-white p-1 shadow-xl">
                <ViewAction icon={<Star size={13} />} label={view.config.favorite ? 'Remove favorite' : 'Add to favorites'} onClick={() => onFavorite(view)} />
                <ViewAction icon={<PencilSimple size={13} />} label="Rename" onClick={() => onRename(view)} />
                <ViewAction icon={<Copy size={13} />} label="Duplicate" onClick={() => onDuplicate(view)} />
                <ViewAction icon={<TrashSimple size={13} />} label="Delete" danger onClick={() => onDelete(view)} />
              </div>
            )}
          </div>
        ))}
      </div>
      <button onClick={onCreate} className="mt-1 flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] font-medium text-burnham hover:bg-gossip/35">
        <Plus size={13} />
        <span>Create new view</span>
      </button>
      <button onClick={onClose} className="sr-only">Close</button>
    </div>
  )
}

function ViewAction({ icon, label, danger, onClick }: { icon: ReactNode; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex h-7 w-full items-center gap-2 rounded px-2 text-left text-[12px] hover:bg-mercury/35 ${danger ? 'text-red-600' : 'text-midnight'}`}>
      {icon}
      <span>{label}</span>
    </button>
  )
}

function CreateViewModal({
  open,
  initialType,
  statusAttributes,
  defaultName,
  onClose,
  onCreateTable,
  onCreateKanban,
}: {
  open: boolean
  initialType: 'table' | 'kanban'
  statusAttributes: ListAttribute[]
  defaultName: string
  onClose: () => void
  onCreateTable: (name: string) => void
  onCreateKanban: (name: string, statusAttributeId: string | null) => void
}) {
  const [type, setType] = useState<'table' | 'kanban'>(initialType)
  const [name, setName] = useState(defaultName)
  const [statusAttributeId, setStatusAttributeId] = useState<string | null>(statusAttributes[0]?.id ?? null)
  useEffect(() => {
    if (!open) return
    setType(initialType)
    setName(defaultName)
    setStatusAttributeId(statusAttributes[0]?.id ?? null)
  }, [defaultName, initialType, open, statusAttributes])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-[460px] rounded-xl border border-mercury bg-white shadow-2xl" onMouseDown={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-mercury px-5 py-3">
          <h2 className="text-[14px] font-semibold text-midnight">Create view</h2>
          <button onClick={onClose} className="rounded p-1 text-shuttle hover:bg-mercury/40"><X size={15} /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setType('table')} className={`rounded-lg border p-3 text-left ${type === 'table' ? 'border-burnham bg-gossip/30' : 'border-mercury'}`}>
              <Table size={17} />
              <span className="mt-2 block text-[13px] font-semibold">Table</span>
            </button>
            <button onClick={() => setType('kanban')} className={`rounded-lg border p-3 text-left ${type === 'kanban' ? 'border-burnham bg-gossip/30' : 'border-mercury'}`}>
              <SquaresIcon size={17} />
              <span className="mt-2 block text-[13px] font-semibold">Kanban</span>
            </button>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium text-shuttle">Title</span>
            <input value={name} onChange={event => setName(event.target.value)} className="h-9 w-full rounded-lg border border-mercury px-3 text-[13px] outline-none focus:border-burnham" />
          </label>
          {type === 'kanban' && (
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium text-shuttle">Kanban Columns</span>
              {statusAttributes.length > 0 ? (
                <select value={statusAttributeId ?? ''} onChange={event => setStatusAttributeId(event.target.value || null)} className="h-9 w-full rounded-lg border border-mercury px-3 text-[13px] outline-none focus:border-burnham">
                  {statusAttributes.map(attribute => <option key={attribute.id} value={attribute.id}>{attribute.name}</option>)}
                </select>
              ) : (
                <div className="rounded-lg border border-dashed border-mercury p-3 text-[12px] text-shuttle">
                  <div>No attributes found</div>
                  <div className="mt-2 inline-flex items-center gap-1 text-burnham"><Plus size={12} /> New Status Attribute</div>
                </div>
              )}
            </label>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-mercury bg-alabaster/40 px-5 py-3">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[12px] text-shuttle hover:bg-mercury/40">Cancel</button>
          <button
            onClick={() => type === 'table' ? onCreateTable(name || 'Table') : onCreateKanban(name || 'Kanban', statusAttributeId)}
            className="rounded-lg bg-burnham px-3 py-1.5 text-[12px] font-semibold text-white"
          >
            Create view
          </button>
        </div>
      </div>
    </div>
  )
}

function AddColumnModal({
  open,
  kind,
  attributes,
  onClose,
  onAdd,
  onCreateAttribute,
}: {
  open: boolean
  kind: ListRecordKind
  attributes: ListAttribute[]
  onClose: () => void
  onAdd: (key: string) => void
  onCreateAttribute: (input: { name: string; type: ListAttribute['type']; config?: ListAttribute['config'] }) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<ListAttribute['type']>('text')

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelectedKey('')
    setDropdownOpen(false)
    setCreateOpen(false)
    setNewName('')
    setNewType('text')
  }, [open])

  if (!open) return null

  const objectLabel = LIST_OBJECT_LABELS[kind].singular
  const objectAttributes = OBJECT_COLUMNS[kind].filter(column => {
    const haystack = `${column.label} ${column.key}`.toLowerCase()
    return haystack.includes(query.toLowerCase())
  })
  const listAttributes = attributes.filter(attribute => {
    const haystack = `${attribute.name} ${attribute.type}`.toLowerCase()
    return haystack.includes(query.toLowerCase())
  })
  const selectedObjectColumn = OBJECT_COLUMNS[kind].find(column => column.key === selectedKey)
  const selectedListAttribute = attributes.find(attribute => attributeKey(attribute.id) === selectedKey)
  const selectedLabel = selectedObjectColumn?.label ?? selectedListAttribute?.name ?? 'Choose an attribute...'

  async function handleCreateAttribute() {
    if (!newName.trim()) return
    await onCreateAttribute({ name: newName.trim(), type: newType, config: {} })
    onClose()
  }

  return (
    <div className="atl-modal-backdrop" onMouseDown={onClose}>
      <div className="atl-modal md" onMouseDown={event => event.stopPropagation()}>
        <div className="atl-modal-head">
          <h2>Create column</h2>
          <button onClick={onClose} className="atl-x" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="atl-modal-body">
          <label className="atl-form-label">Attribute (required)</label>
          <div className="atl-combo">
            <button onClick={() => setDropdownOpen(prev => !prev)} className="atl-select-trigger">
              <span>{selectedLabel}</span>
              <CaretDown size={18} />
            </button>
            {dropdownOpen && (
              <div className="atl-popover wide left-0 top-[56px]">
                <div className="atl-pop-search">
                  <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search attributes..." autoFocus />
                </div>
                <div className="max-h-[440px] overflow-auto pb-2">
                  <div className="atl-pop-section">{objectLabel} attributes</div>
                  {objectAttributes.map(column => (
                    <button
                      key={column.key}
                      onClick={() => {
                        setSelectedKey(column.key)
                        setDropdownOpen(false)
                      }}
                      className={`atl-pop-row ${selectedKey === column.key ? 'active' : ''}`}
                    >
                      <span className="w-6 text-center text-[18px] text-[#202020]">{column.icon}</span>
                      <span>{column.label}</span>
                      {column.group === 'relationship' && <span className="meta">30 ›</span>}
                    </button>
                  ))}
                  {listAttributes.length > 0 && (
                    <>
                      <div className="atl-pop-section">List attributes</div>
                      {listAttributes.map(attribute => (
                        <button
                          key={attribute.id}
                          onClick={() => {
                            setSelectedKey(`attr:${attribute.id}`)
                            setDropdownOpen(false)
                          }}
                          className={`atl-pop-row ${selectedKey === attributeKey(attribute.id) ? 'active' : ''}`}
                        >
                          <span className="w-6 text-center text-[18px] text-[#202020]">{attribute.type === 'status' ? '●' : attribute.type === 'number' ? '#' : attribute.type === 'date' ? '◷' : 'A'}</span>
                          <span>{attribute.name}</span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
                <div className="atl-pop-footer">
                  <button
                    onClick={() => {
                      setDropdownOpen(false)
                      setCreateOpen(true)
                    }}
                    className="atl-pop-row"
                  >
                    <Plus size={20} />
                    <span>Create new attribute</span>
                    <span className="meta">›</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {createOpen && (
            <div className="mt-5 rounded-[14px] border border-[var(--atl-border)] bg-[#fbfbfa] p-4">
              <label className="atl-form-label">New list attribute</label>
              <div className="grid grid-cols-[1fr_180px] gap-3">
                <input value={newName} onChange={event => setNewName(event.target.value)} className="atl-input" placeholder="Attribute name" autoFocus />
                <select value={newType} onChange={event => setNewType(event.target.value as ListAttribute['type'])} className="atl-input">
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="select">Select</option>
                  <option value="checkbox">Checkbox</option>
                </select>
              </div>
            </div>
          )}

          {!createOpen && (
            <div className="mt-24 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--atl-border)] bg-[#fbfbfa] text-[#8a8a8a]">
                <Plus size={22} />
              </div>
              <h3 className="text-[18px] font-semibold text-[var(--atl-text)]">Add your first attribute column</h3>
              <p className="mx-auto mt-1 max-w-[360px] text-[14px] leading-5 text-[#777]">
                Create a custom attribute or add an existing attribute to this view.
              </p>
            </div>
          )}
        </div>
        <div className="atl-modal-foot">
          <button onClick={onClose} className="atl-button">Cancel</button>
          <button
            disabled={createOpen ? !newName.trim() : !selectedKey}
            onClick={() => {
              if (createOpen) void handleCreateAttribute()
              else if (selectedKey) onAdd(selectedKey)
            }}
            className="atl-button primary disabled:opacity-40"
          >
            <Plus size={16} />
            <span>{createOpen ? 'Create attribute' : 'Add attribute column'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function attributeKey(id: string) {
  return `attr:${id}`
}

function AddRecordModal({
  open,
  list,
  attributes,
  entries,
  statusAttribute,
  onClose,
  onAdd,
  onUpdate,
}: {
  open: boolean
  list: { parent_object: ListRecordKind; name: string }
  attributes: ListAttribute[]
  entries: ListMembership[]
  statusAttribute: ListAttribute | null
  onClose: () => void
  onAdd: (recordId: string, values: Record<string, unknown>, notes?: string | null) => void
  onUpdate: (membershipId: string, values: Record<string, unknown>, notes?: string | null) => void
}) {
  const { user } = useAuth()
  const [records, setRecords] = useState<RecordRow[]>([])
  const [search, setSearch] = useState('')
  const [selectedRecord, setSelectedRecord] = useState<RecordRow | null>(null)
  const [editingMembership, setEditingMembership] = useState<ListMembership | null>(null)
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [notes, setNotes] = useState('')
  const [step, setStep] = useState<'choose' | 'duplicate' | 'details'>('choose')

  useEffect(() => {
    if (!open || !user) return
    const table = LIST_OBJECT_LABELS[list.parent_object].table
    supabase.from(table).select('*').eq('user_id', user.id).limit(80).then(({ data }) => setRecords((data ?? []) as unknown as RecordRow[]))
  }, [list.parent_object, open, user])

  useEffect(() => {
    if (!open) return
    setSearch('')
    setSelectedRecord(null)
    setEditingMembership(null)
    setValues({})
    setNotes('')
    setStep('choose')
  }, [open])

  if (!open) return null

  const selectedId = selectedRecord ? selectedRecord.id : null
  const matchingEntries = selectedId
    ? entries.filter(entry => getListRecordId(entry, list.parent_object) === selectedId)
    : []
  const filtered = records.filter(record => getRecordName(list.parent_object, record).toLowerCase().includes(search.toLowerCase())).slice(0, 40)
  const entryAttributes = attributes.filter(attribute => attribute.type !== 'status')

  function beginAdd(record: RecordRow) {
    setSelectedRecord(record)
    setEditingMembership(null)
    setValues(statusAttribute ? { [statusAttribute.id]: '' } : {})
    setNotes('')
  }

  function beginEdit(membership: ListMembership) {
    setEditingMembership(membership)
    setValues(membership.attributes ?? {})
    setNotes(membership.notes ?? '')
    setStep('details')
  }

  function continueFromSelection() {
    if (!selectedRecord) return
    if (matchingEntries.length > 0) {
      setStep('duplicate')
      return
    }
    setStep('details')
  }

  return (
    <div className="atl-modal-backdrop" onMouseDown={onClose}>
      <div className="atl-modal wide flex max-h-[82vh] min-h-[620px] flex-col" onMouseDown={event => event.stopPropagation()}>
        <div className="atl-modal-head">
          <h2>{step === 'choose' ? 'Choose record' : `Add to ${list.name}`}</h2>
          <button onClick={onClose} className="atl-x" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {step === 'choose' && (
          <>
            <div className="atl-pop-search h-[74px] shrink-0 border-b border-[var(--atl-border)] px-7">
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find record..." autoFocus />
            </div>
            <div className="atl-record-picker-list flex-1">
              <div className="mb-3 text-[13px] font-semibold uppercase text-[#777]">Records</div>
              {filtered.map(record => (
                <button
                  key={record.id}
                  onClick={() => beginAdd(record)}
                  onDoubleClick={() => {
                    beginAdd(record)
                    continueFromSelection()
                  }}
                  className={`atl-record-row ${selectedRecord?.id === record.id ? 'active' : ''}`}
                >
                  <RecordName kind={list.parent_object} record={record} />
                  <span className="atl-object-chip">{LIST_OBJECT_LABELS[list.parent_object].singular}</span>
                </button>
              ))}
            </div>
            <div className="atl-modal-foot">
              <div className="atl-record-foot-left">
                <span className="atl-key">↑</span>
                <span className="atl-key">↓</span>
                <span>Navigate</span>
              </div>
              <button onClick={continueFromSelection} disabled={!selectedRecord} className="atl-button primary disabled:opacity-40">
                <span>Select record</span>
                <span className="atl-key border-white/30 bg-white/10 text-white">↵</span>
              </button>
            </div>
          </>
        )}

        {step === 'duplicate' && selectedRecord && (
          <>
            <div className="atl-modal-body flex-1">
              <RecordName kind={list.parent_object} record={selectedRecord} />
              <div className="mt-5 rounded-[16px] border border-[var(--atl-border)] p-4">
                <div className="text-[15px] font-semibold text-[var(--atl-text)]">This record is already in the list.</div>
                <div className="mt-3 space-y-1">
                  {matchingEntries.map((membership, index) => (
                    <button key={membership.id} onClick={() => beginEdit(membership)} className="atl-pop-row mx-0 w-full">
                      <span>Edit existing entry {index + 1}</span>
                      <PencilSimple size={16} className="ml-auto" />
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setEditingMembership(null)
                      setValues(statusAttribute ? { [statusAttribute.id]: '' } : {})
                      setNotes('')
                      setStep('details')
                    }}
                    className="atl-pop-row mx-0 w-full"
                  >
                    <Plus size={18} />
                    <span>Add duplicate</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="atl-modal-foot">
              <button onClick={() => setStep('choose')} className="atl-button">Back</button>
            </div>
          </>
        )}

        {step === 'details' && selectedRecord && (
          <>
            <div className="atl-modal-body flex-1 overflow-auto">
              <RecordName kind={list.parent_object} record={selectedRecord} />
              <div className="mt-5 grid gap-4">
                {statusAttribute && (
                  <label className="block">
                    <span className="atl-form-label">{statusAttribute.name}</span>
                    <select value={String(values[statusAttribute.id] ?? '')} onChange={event => setValues(prev => ({ ...prev, [statusAttribute.id]: event.target.value }))} className="atl-input">
                      <option value="">No stage</option>
                      {(statusAttribute.config.options ?? []).map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                  </label>
                )}
                {entryAttributes.map(attribute => (
                  <label key={attribute.id} className="block">
                    <span className="atl-form-label">{attribute.name}</span>
                    <input value={String(values[attribute.id] ?? '')} onChange={event => setValues(prev => ({ ...prev, [attribute.id]: event.target.value }))} className="atl-input" />
                  </label>
                ))}
                <label className="block">
                  <span className="atl-form-label">Notes</span>
                  <textarea value={notes} onChange={event => setNotes(event.target.value)} className="atl-textarea" />
                </label>
              </div>
            </div>
            <div className="atl-modal-foot">
              <button onClick={() => setStep(matchingEntries.length ? 'duplicate' : 'choose')} className="atl-button">Back</button>
              <button
                onClick={() => {
                  if (editingMembership) onUpdate(editingMembership.id, values, notes || null)
                  else onAdd(selectedRecord.id, values, notes || null)
                }}
                className="atl-button primary"
              >
                {editingMembership ? 'Save entry' : 'Add to list'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function StageEditorModal({
  open,
  attribute,
  onClose,
  onSave,
  existing,
}: {
  open: boolean
  attribute: ListAttribute
  onClose: () => void
  onSave: (option: ListAttributeOption) => void
  existing: ListAttributeOption | null
}) {
  const [label, setLabel] = useState(existing?.label ?? '')
  const [color, setColor] = useState(existing?.color ?? STAGE_COLORS[0])
  const [trackTime, setTrackTime] = useState(Boolean(existing?.track_time))
  const [confetti, setConfetti] = useState(Boolean(existing?.confetti))
  useEffect(() => {
    if (!open) return
    setLabel(existing?.label ?? '')
    setColor(existing?.color ?? STAGE_COLORS[0])
    setTrackTime(Boolean(existing?.track_time))
    setConfetti(Boolean(existing?.confetti))
  }, [existing, open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-[360px] rounded-xl border border-mercury bg-white shadow-2xl" onMouseDown={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-mercury px-5 py-3">
          <h2 className="text-[14px] font-semibold text-midnight">{existing ? 'Edit' : 'New'} {attribute.name}</h2>
          <button onClick={onClose} className="rounded p-1 text-shuttle hover:bg-mercury/40"><X size={15} /></button>
        </div>
        <div className="space-y-4 p-5">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-shuttle">Stage name</span>
            <input value={label} onChange={event => setLabel(event.target.value)} className="h-9 w-full rounded-lg border border-mercury px-3 text-[13px] outline-none focus:border-burnham" autoFocus />
          </label>
          <div>
            <div className="mb-2 text-[11px] font-medium text-shuttle">Color</div>
            <div className="flex gap-2">
              {STAGE_COLORS.map(stageColor => (
                <button key={stageColor} onClick={() => setColor(stageColor)} className="flex h-7 w-7 items-center justify-center rounded-full border border-mercury" style={{ background: stageColor }}>
                  {color === stageColor && <Check size={13} className="text-white" weight="bold" />}
                </button>
              ))}
            </div>
          </div>
          <ToggleRow label="Track time in stage" checked={trackTime} onChange={setTrackTime} />
          <ToggleRow label="Confetti" checked={confetti} onChange={setConfetti} />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-mercury bg-alabaster/40 px-5 py-3">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[12px] text-shuttle hover:bg-mercury/40">Cancel</button>
          <button
            disabled={!label.trim()}
            onClick={() => onSave({ id: existing?.id ?? slugify(label), label: label.trim(), color, track_time: trackTime, confetti })}
            className="rounded-lg bg-burnham px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
          >
            {existing ? 'Save stage' : 'Add stage'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-lg border border-mercury px-3 py-2">
      <span className="text-[12px] font-medium text-midnight">{label}</span>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
    </label>
  )
}

function SquaresIcon({ size = 14 }: { size?: number }) {
  return (
    <span className="grid grid-cols-2 gap-0.5 text-burnham" style={{ width: size, height: size }}>
      <span className="rounded-[2px] bg-current" />
      <span className="rounded-[2px] bg-current" />
      <span className="rounded-[2px] bg-current" />
      <span className="rounded-[2px] bg-current" />
    </span>
  )
}

function getRecordName(kind: ListRecordKind, record: RecordRow) {
  if (kind === 'company') return (record as Company).name || 'Untitled company'
  if (kind === 'opportunity') return (record as Opportunity).title || 'Untitled deal'
  return (record as Contact).name || 'Untitled person'
}

function getRecordSubtitle(kind: ListRecordKind, record: RecordRow) {
  if (kind === 'company') return (record as Company).domain ?? (record as Company).sector ?? ''
  if (kind === 'opportunity') return (record as Opportunity).company?.name ?? (record as Opportunity).type ?? ''
  const contact = record as Contact
  return [contact.job_title, contact.company].filter(Boolean).join(' @ ')
}

function formatAttributeValue(attribute: ListAttribute, value: unknown) {
  if (value == null || value === '') return '—'
  if (attribute.type === 'status' || attribute.type === 'select') {
    const option = attribute.config.options?.find(item => item.id === value)
    return option?.label ?? String(value)
  }
  if (attribute.type === 'checkbox') return value ? 'Yes' : 'No'
  return String(value)
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `stage_${Date.now()}`
}
