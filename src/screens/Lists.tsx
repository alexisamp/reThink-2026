import { useEffect, useState, useMemo, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, List as ListIcon, Archive, PencilSimple, TrashSimple, Rows, Users } from '@phosphor-icons/react'
import { useAuth } from '@/hooks/useAuth'
import { useLists, LIST_TEMPLATES } from '@/hooks/useLists'
import { supabase } from '@/lib/supabase'
import ListEditorModal from '@/components/ListEditorModal'
import CrmTable, { type CrmColumn } from '@/components/crm/CrmTable'
import type { List as ListType } from '@/types'

interface ListRow extends ListType {
  member_count: number
  kind: 'template' | 'custom'
}

export default function Lists() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { lists, loading, createFromTemplate, archiveList, deleteList, reload } = useLists(user?.id)
  const [showEditor, setShowEditor] = useState(false)
  const [editing, setEditing] = useState<ListType | null>(null)
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({})
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table')

  useEffect(() => {
    if (!user || lists.length === 0) {
      setMemberCounts({})
      return
    }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('list_memberships')
        .select('list_id')
        .eq('user_id', user.id)
      if (cancelled || !data) return
      const counts: Record<string, number> = {}
      for (const r of data as Array<{ list_id: string }>) {
        counts[r.list_id] = (counts[r.list_id] ?? 0) + 1
      }
      setMemberCounts(counts)
    })()
    return () => { cancelled = true }
  }, [user, lists])

  const hasLists = lists.length > 0

  const existingTemplateKeys = useMemo(
    () => new Set(lists.map(l => l.name)),
    [lists],
  )

  const rows: ListRow[] = useMemo(() => lists.map(list => ({
    ...list,
    member_count: memberCounts[list.id] ?? 0,
    kind: LIST_TEMPLATES.some(template => template.name === list.name) ? 'template' : 'custom',
  })), [lists, memberCounts])

  const columns: CrmColumn<ListRow>[] = [
    {
      key: 'name',
      label: 'List',
      locked: true,
      width: 'minmax(240px, 1.4fr)',
      icon: <ListIcon size={12} />,
      render: list => (
        <span className="crm-name">
          <span className="crm-av sq logo" style={{ background: list.color ?? 'var(--burnham)' }}>{list.icon || list.name[0]?.toUpperCase()}</span>
          <span className="link">{list.name}</span>
        </span>
      ),
    },
    {
      key: 'members',
      label: 'People',
      width: '92px',
      align: 'right',
      icon: <Users size={12} />,
      render: list => <span className="crm-mono">{list.member_count}</span>,
    },
    {
      key: 'kind',
      label: 'Type',
      width: '110px',
      render: list => <span className="crm-chip muted">{list.kind}</span>,
    },
    {
      key: 'stages',
      label: 'Stages',
      width: 'minmax(220px, 1fr)',
      render: list => (
        <span className="flex min-w-0 flex-wrap gap-1">
          {list.stages.slice(0, 4).map(stage => (
            <span key={stage.key} className="crm-chip stage" style={{ '--chip': stage.color ?? list.color ?? '#3E7A4E' } as CSSProperties}>
              <span className="seg" style={{ background: stage.color ?? list.color ?? '#3E7A4E' }} />
              {stage.label}
            </span>
          ))}
          {list.stages.length > 4 && <span className="crm-empty">+{list.stages.length - 4}</span>}
        </span>
      ),
    },
    {
      key: 'purpose',
      label: 'Purpose',
      width: 'minmax(260px, 1.2fr)',
      render: list => <span className="crm-next">{list.purpose || 'Add list purpose.'}</span>,
    },
    {
      key: 'actions',
      label: '',
      width: '118px',
      align: 'right',
      render: list => (
        <span className="flex items-center justify-end gap-1">
          <button onClick={e => onEditClick(list, e)} className="crm-tool ghost !p-1.5" title="Edit"><PencilSimple size={12} /></button>
          <button onClick={e => onArchiveClick(list, e)} className="crm-tool ghost !p-1.5" title="Archive"><Archive size={12} /></button>
          <button onClick={e => onDeleteClick(list, e)} className="crm-tool ghost !p-1.5" title="Delete"><TrashSimple size={12} /></button>
        </span>
      ),
    },
  ]

  function onTemplateClick(templateKey: string) {
    createFromTemplate(templateKey)
  }

  function onCustomClick() {
    setEditing(null)
    setShowEditor(true)
  }

  function onEditClick(list: ListType, e: ReactMouseEvent) {
    e.stopPropagation()
    setEditing(list)
    setShowEditor(true)
  }

  function onArchiveClick(list: ListType, e: ReactMouseEvent) {
    e.stopPropagation()
    if (confirm(`Archive "${list.name}"? Memberships stay but the list is hidden.`)) {
      archiveList(list.id)
    }
  }

  function onDeleteClick(list: ListType, e: ReactMouseEvent) {
    e.stopPropagation()
    if (confirm(`Delete "${list.name}" permanently? All memberships will be lost.`)) {
      deleteList(list.id)
    }
  }

  return (
    <div className="ppl-page wide">
      <header className="ppl-hd">
        <div className="ppl-hd-l">
          <h1 className="ppl-title">Lists</h1>
          <p className="ppl-sub">Contextual relationship funnels for fundraising, hiring, clients, advisors, and custom operating lists.</p>
        </div>
        <button
          onClick={onCustomClick}
          className="crm-tool primary"
        >
          <Plus size={13} />
          <span>New list</span>
        </button>
      </header>

      {loading ? (
        <div className="py-12 text-center text-[12px] text-shuttle">Loading...</div>
      ) : hasLists ? (
        <CrmTable
          entity="lists"
          title="All lists"
          viewName="All lists"
          rows={rows}
          columns={columns}
          view={viewMode}
          onViewChange={v => setViewMode(v as 'table' | 'kanban')}
          views={[
            { id: 'table', label: 'Table', type: 'table' },
            { id: 'kanban', label: 'Kanban', type: 'kanban' },
          ]}
          addLabel="New list"
          onAdd={onCustomClick}
          onRowClick={list => navigate(`/lists/${list.id}`)}
          storageKey="lists"
          kanban={{
            groupLabel: 'Type',
            stages: [
              { id: 'template', label: 'Template lists', color: '#3E7A4E' },
              { id: 'custom', label: 'Custom lists', color: '#94A3B8' },
            ],
            groupValue: list => list.kind,
            cardColumns: ['members', 'stages', 'purpose'],
          }}
        />
      ) : (
        <section className="fsec">
          <header className="fsec-hd">
            <h3>No lists yet</h3>
            <span className="fsec-rule" />
            <span className="fsec-hint">start with a template or create your own stages</span>
          </header>
        </section>
      )}

      <section className="fsec mt-6">
        <header className="fsec-hd">
          <h3>Add from template</h3>
          <span className="fsec-count">{LIST_TEMPLATES.filter(t => !existingTemplateKeys.has(t.name)).length}</span>
          <span className="fsec-rule" />
          <span className="fsec-hint">prebuilt relationship funnels</span>
        </header>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {LIST_TEMPLATES.filter(t => !existingTemplateKeys.has(t.name)).map(t => (
            <button
              key={t.key}
              onClick={() => onTemplateClick(t.key)}
              className="crm-trow !grid-cols-[32px_1fr_auto] rounded-lg border border-dashed border-mercury bg-white text-left"
              style={{ gridTemplateColumns: '32px 1fr auto' }}
            >
              <span className="crm-cell"><span className="crm-av sq logo" style={{ background: t.color }}>{t.icon}</span></span>
              <span className="crm-cell min-w-0">
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-medium text-burnham">{t.name}</span>
                  <span className="block truncate text-[11px] text-shuttle">{t.purpose}</span>
                </span>
              </span>
              <span className="crm-cell r"><Rows size={12} /> {t.stages.length}</span>
            </button>
          ))}
          <button
            onClick={onCustomClick}
            className="crm-trow !grid-cols-[32px_1fr_auto] rounded-lg border border-dashed border-mercury bg-white text-left"
            style={{ gridTemplateColumns: '32px 1fr auto' }}
          >
            <span className="crm-cell"><Plus size={14} /></span>
            <span className="crm-cell"><span><span className="block text-[12.5px] font-medium text-burnham">Custom list</span><span className="block text-[11px] text-shuttle">Build your own stages</span></span></span>
            <span className="crm-cell r">Create</span>
          </button>
        </div>
      </section>

      {showEditor && (
        <ListEditorModal
          open={showEditor}
          existing={editing}
          onClose={() => { setShowEditor(false); setEditing(null) }}
          onSaved={() => { reload(); setShowEditor(false); setEditing(null) }}
        />
      )}
    </div>
  )
}
