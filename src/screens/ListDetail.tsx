import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Briefcase, Buildings, Clock, MagnifyingGlass, NotePencil, PencilSimple, Plus, Target, User, Users } from '@phosphor-icons/react'
import { useAuth } from '@/hooks/useAuth'
import { useLists, useListMemberships } from '@/hooks/useLists'
import { supabase } from '@/lib/supabase'
import CrmTable, { type CrmColumn } from '@/components/crm/CrmTable'
import RecordPeek from '@/components/crm/RecordPeek'
import ListEditorModal from '@/components/ListEditorModal'
import type { Company, Contact, List, ListMembership, Opportunity } from '@/types'

interface EnrichedMember extends ListMembership {
  record: ListRecord
}

type ListRecord =
  | { type: 'person'; id: string; label: string; subtitle: string; imageUrl?: string | null; route: string; contact: Contact }
  | { type: 'company'; id: string; label: string; subtitle: string; imageUrl?: string | null; route: string; company: Company }
  | { type: 'opportunity'; id: string; label: string; subtitle: string; imageUrl?: string | null; route: string; opportunity: Opportunity }

type HandoffListKind = 'job' | 'consult' | 'mentor' | 'board' | 'family' | 'default'

function handoffListKind(list?: List): HandoffListKind {
  const name = list?.name.toLowerCase() ?? ''
  if (name.includes('job')) return 'job'
  if (name.includes('consult')) return 'consult'
  if (name.includes('mentor')) return 'mentor'
  if (name.includes('board')) return 'board'
  if (name.includes('family')) return 'family'
  return 'default'
}

function handoffAttr(kind: HandoffListKind) {
  return {
    job: { key: 'role', label: 'Role', empty: '—' },
    consult: { key: 'engagement', label: 'Engagement', empty: '—' },
    mentor: { key: 'focus', label: 'Focus', empty: '—' },
    board: { key: 'seat', label: 'Seat', empty: '—' },
    family: { key: 'relation', label: 'Relation', empty: '—' },
    default: { key: 'role', label: 'Role', empty: '—' },
  }[kind]
}

export default function ListDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { lists, reload: reloadLists } = useLists(user?.id)
  const { memberships, moveStage, addToList, reload } = useListMemberships(user?.id, { listId: id })
  const [contactsById, setContactsById] = useState<Record<string, Contact>>({})
  const [companiesById, setCompaniesById] = useState<Record<string, Company>>({})
  const [opportunitiesById, setOpportunitiesById] = useState<Record<string, Opportunity>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('kanban')
  const [peekId, setPeekId] = useState<string | null>(null)

  const list: List | undefined = lists.find(l => l.id === id)
  const listKind = handoffListKind(list)
  const attr = handoffAttr(listKind)
  const cadenceList = listKind === 'board' || listKind === 'family'

  // Load records for each membership. Manual add still adds people; mobile capture
  // can add companies/opportunities through the same membership table.
  useEffect(() => {
    if (!user || memberships.length === 0) {
      setContactsById({})
      setCompaniesById({})
      setOpportunitiesById({})
      return
    }
    const ids = memberships.map(m => m.contact_id).filter((id): id is string => Boolean(id))
    const companyIds = memberships.map(m => m.company_id).filter((companyId): companyId is string => Boolean(companyId))
    const opportunityIds = memberships.map(m => m.opportunity_id).filter((opportunityId): opportunityId is string => Boolean(opportunityId))
    Promise.all([
      ids.length
        ? supabase.from('outreach_logs').select('*').in('id', ids)
        : Promise.resolve({ data: [] }),
      companyIds.length
        ? supabase.from('companies').select('*').in('id', companyIds)
        : Promise.resolve({ data: [] }),
      opportunityIds.length
        ? supabase.from('opportunities').select('*, company:companies(*)').in('id', opportunityIds)
        : Promise.resolve({ data: [] }),
    ]).then(([contactsRes, companiesRes, opportunitiesRes]) => {
      const contactMap: Record<string, Contact> = {}
      for (const contact of (contactsRes.data ?? []) as Contact[]) contactMap[contact.id] = contact
      setContactsById(contactMap)

      const companyMap: Record<string, Company> = {}
      for (const company of (companiesRes.data ?? []) as Company[]) companyMap[company.id] = company
      setCompaniesById(companyMap)

      const opportunityMap: Record<string, Opportunity> = {}
      for (const opportunity of (opportunitiesRes.data ?? []) as Opportunity[]) opportunityMap[opportunity.id] = opportunity
      setOpportunitiesById(opportunityMap)
    })
  }, [user, memberships])

  const enriched: EnrichedMember[] = useMemo(() =>
    memberships
      .map(member => {
        const record = recordForMembership(member, contactsById, companiesById, opportunitiesById)
        return record ? { ...member, record } : null
      })
      .filter((member): member is EnrichedMember => Boolean(member)),
    [memberships, contactsById, companiesById, opportunitiesById],
  )
  const peekIndex = enriched.findIndex(member => member.id === peekId)
  const peekMember = peekIndex >= 0 ? enriched[peekIndex] : null

  const columns: CrmColumn<EnrichedMember>[] = useMemo(() => [
    {
      key: 'person',
      label: 'Record',
      locked: true,
      width: 'minmax(220px, 1.4fr)',
      icon: <Users size={12} />,
      render: member => (
        <span className="crm-name">
          {member.record.imageUrl ? (
            <span className="crm-av"><img src={member.record.imageUrl} alt="" /></span>
          ) : (
            <span className="crm-av">
              {member.record.label[0]?.toUpperCase()}
            </span>
          )}
          <span className="min-w-0">
            <span className="link">{member.record.label}</span>
            <span className="block truncate text-[10px] text-shuttle">{member.record.subtitle || '—'}</span>
          </span>
          <span className="crm-chip muted">{recordTypeLabel(member.record.type)}</span>
        </span>
      ),
    },
    {
      key: 'stage',
      label: cadenceList ? 'Cadence' : 'Stage',
      width: '130px',
      icon: <NotePencil size={12} />,
      render: member => {
        const stage = list?.stages.find(s => s.key === member.current_stage)
        return (
          <span className="crm-chip stage" style={{ '--chip': stage?.color ?? list?.color ?? '#3E7A4E' } as CSSProperties}>
            <span className="seg" style={{ background: stage?.color ?? list?.color ?? '#3E7A4E' }} />
            {stage?.label ?? member.current_stage}
          </span>
        )
      },
    },
    {
      key: attr.key,
      label: attr.label,
      width: listKind === 'job' ? '180px' : '160px',
      icon: <Briefcase size={12} />,
      render: member => <span className={listKind === 'board' ? 'crm-chip muted' : 'crm-soft'}>{String((member.attributes?.[attr.key] ?? (attr.key === 'role' && member.record.type === 'person' ? member.record.contact.job_title : '')) || attr.empty)}</span>,
    },
    {
      key: 'cadence',
      label: 'Cadence',
      width: '110px',
      defaultOff: cadenceList,
      icon: <Clock size={12} />,
      render: member => <span className="text-shuttle">{String(member.attributes?.cadence ?? '—')}</span>,
    },
    {
      key: attr.key === 'relation' ? 'record_relation' : 'relation',
      label: 'Relation',
      width: '130px',
      defaultOff: true,
      render: member => <span className="text-shuttle">{String(member.attributes?.relation ?? (member.record.type === 'person' ? member.record.contact.relationship_domain : null) ?? '—')}</span>,
    },
    {
      key: 'notes',
      label: listKind === 'family' ? 'Coming up' : cadenceList ? 'Why on the board' : 'Next step',
      width: 'minmax(230px, 1fr)',
      icon: <NotePencil size={12} />,
      render: member => <span className="text-shuttle">{member.notes || String(member.attributes?.notes ?? '—')}</span>,
    },
    {
      key: 'stage_age',
      label: 'Stage Age',
      width: '100px',
      render: member => <span className="text-shuttle">{daysAgo(member.stage_changed_at)}d</span>,
    },
  ], [attr.empty, attr.key, attr.label, cadenceList, list?.color, list?.stages, listKind])

  if (!list) {
    return (
      <div className="flex items-center justify-center h-full text-shuttle">
        <div className="text-center">
          <p className="mb-3">List not found.</p>
          <button onClick={() => navigate('/lists')} className="text-sm text-burnham hover:underline">
            ← Back to lists
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="ppl-page wide">
      <header className="list-hd">
        <span className="list-pip" style={{ background: list.color ?? 'var(--burnham)' }}>{list.icon || <Users size={18} weight="fill" />}</span>
        <div className="list-hd-txt">
          <div className="list-hd-top">
            <h1 className="list-title">{list.name}</h1>
            <span className="list-obj"><User size={11} /> Records</span>
            <span className="list-count">{enriched.length} {enriched.length === 1 ? 'entry' : 'entries'}</span>
          </div>
          <p className="list-sub">{list.purpose || 'A contextual relationship funnel with list-specific attributes.'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/lists')} className="crm-tool ghost">
            <span>All lists</span>
          </button>
          <button
            onClick={() => setShowEditor(true)}
            className="crm-tool ghost"
            title="Edit list"
          >
            <PencilSimple size={12} />
            <span>Edit</span>
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="crm-tool primary"
          >
            <Plus size={13} />
            <span>Add contact</span>
          </button>
        </div>
      </header>

      <div>
        <CrmTable
          entity="list members"
          title={list.purpose ?? undefined}
          viewName="Kanban"
          rows={enriched}
          columns={columns}
          view={viewMode}
          onViewChange={v => setViewMode(v as 'table' | 'kanban')}
          views={[
            { id: 'table', label: 'Table', type: 'table' },
            { id: 'kanban', label: 'Kanban', type: 'kanban' },
          ]}
          addLabel="Add contact"
          onAdd={() => setShowAdd(true)}
          onRowClick={member => setPeekId(member.id)}
          storageKey={`list.${list.id}`}
          kanban={{
            stages: list.stages.map((stage, index) => ({
              id: stage.key,
              label: stage.label,
              color: list.color ?? ['#79D65E', '#3E7A4E', '#94A3B8', '#EAB308', '#F87171'][index % 5],
            })),
            groupValue: member => member.current_stage,
            groupLabel: cadenceList ? 'Cadence' : 'Stage',
            cardColumns: [attr.key, 'notes', 'stage_age'],
            onMove: (member, stage) => {
              if (stage && member.current_stage !== stage) return moveStage(member.id, stage)
            },
          }}
        />
      </div>

      {showAdd && (
        <AddContactToListModal
          list={list}
          existingIds={new Set(memberships.map(m => m.contact_id).filter((id): id is string => Boolean(id)))}
          onClose={() => setShowAdd(false)}
          onAdded={async (contactId, stage, notes, attributes) => {
            await addToList(contactId, list.id, stage, notes, attributes)
            setShowAdd(false)
          }}
        />
      )}

      {showEditor && (
        <ListEditorModal
          open={showEditor}
          existing={list}
          onClose={() => setShowEditor(false)}
          onSaved={() => {
            reloadLists()
            reload()
            setShowEditor(false)
          }}
        />
      )}

      {peekMember && (
        <RecordPeek
          open
        title={peekMember.record.label}
        subtitle={peekMember.record.subtitle || 'List member'}
        eyebrow={list.name}
        avatar={<ListPeekAvatar record={peekMember.record} />}
          index={peekIndex}
          total={enriched.length}
          highlights={[
            { label: 'Stage', value: list.stages.find(s => s.key === peekMember.current_stage)?.label ?? peekMember.current_stage },
            { label: 'Age', value: `${daysAgo(peekMember.stage_changed_at)}d in stage` },
          ]}
          fields={[
            { label: 'Type', value: recordTypeLabel(peekMember.record.type) },
            { label: 'Role', value: String(peekMember.attributes?.role ?? (peekMember.record.type === 'person' ? peekMember.record.contact.job_title : null) ?? '—') },
            { label: 'Cadence', value: String(peekMember.attributes?.cadence ?? '—') },
            { label: 'Relation', value: String(peekMember.attributes?.relation ?? (peekMember.record.type === 'person' ? peekMember.record.contact.relationship_domain : null) ?? '—') },
            { label: 'Notes', value: peekMember.notes || String(peekMember.attributes?.notes ?? '—'), wide: true },
          ]}
          onClose={() => setPeekId(null)}
          onOpenFull={() => navigate(peekMember.record.route)}
          onPrev={() => setPeekId(enriched[(peekIndex - 1 + enriched.length) % enriched.length].id)}
          onNext={() => setPeekId(enriched[(peekIndex + 1) % enriched.length].id)}
        >
          <div className="peek-captured">
            <div className="peek-section-hd"><span>Why in this list</span></div>
            <ul className="peek-why">
              <li><span className="why-dot" /> {peekMember.notes || String(peekMember.attributes?.notes ?? list.purpose ?? 'No list note yet.')}</li>
            </ul>
          </div>
        </RecordPeek>
      )}
    </div>
  )
}

function recordForMembership(
  member: ListMembership,
  contactsById: Record<string, Contact>,
  companiesById: Record<string, Company>,
  opportunitiesById: Record<string, Opportunity>,
): ListRecord | null {
  if (member.contact_id) {
    const contact = contactsById[member.contact_id]
    if (!contact) return null
    return {
      type: 'person',
      id: contact.id,
      label: contact.name,
      subtitle: [contact.job_title, contact.company].filter(Boolean).join(' @ '),
      imageUrl: contact.profile_photo_url,
      route: `/people/${contact.id}`,
      contact,
    }
  }
  if (member.company_id) {
    const company = companiesById[member.company_id]
    if (!company) return null
    return {
      type: 'company',
      id: company.id,
      label: company.name,
      subtitle: [company.domain, company.account_stage].filter(Boolean).join(' · '),
      imageUrl: company.logo_url,
      route: `/people/companies/${company.id}`,
      company,
    }
  }
  if (member.opportunity_id) {
    const opportunity = opportunitiesById[member.opportunity_id]
    if (!opportunity) return null
    return {
      type: 'opportunity',
      id: opportunity.id,
      label: opportunity.title,
      subtitle: [opportunity.company?.name, opportunity.stage].filter(Boolean).join(' · '),
      imageUrl: opportunity.company?.logo_url,
      route: `/people/opportunities/${opportunity.id}`,
      opportunity,
    }
  }
  return null
}

function recordTypeLabel(type: ListRecord['type']) {
  if (type === 'company') return 'Company'
  if (type === 'opportunity') return 'Deal'
  return 'Person'
}

function ListPeekAvatar({ record }: { record: ListRecord }) {
  if (record.imageUrl) return <img src={record.imageUrl} alt="" />
  if (record.type === 'company') return <Buildings size={16} weight="fill" />
  if (record.type === 'opportunity') return <Target size={16} weight="fill" />
  return <span>{record.label.trim().slice(0, 2).toUpperCase()}</span>
}

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

// ─── Add Contact to List Modal ──────────────────────────────────────────────

interface AddContactProps {
  list: List
  existingIds: Set<string>
  onClose: () => void
  onAdded: (contactId: string, stage: string, notes?: string, attributes?: Record<string, unknown>) => void
}

function AddContactToListModal({ list, existingIds, onClose, onAdded }: AddContactProps) {
  const { user } = useAuth()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [search, setSearch] = useState('')
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [stage, setStage] = useState<string>(list.stages[0]?.key ?? '')
  const [notes, setNotes] = useState('')
  const [role, setRole] = useState('')
  const [cadence, setCadence] = useState('')
  const [relation, setRelation] = useState('')

  useEffect(() => {
    if (!user) return
    supabase
      .from('outreach_logs')
      .select('id, name, job_title, company, profile_photo_url, tier, relationship_domain')
      .eq('user_id', user.id)
      .order('name')
      .then(({ data }) => setContacts((data ?? []) as Contact[]))
  }, [user])

  const filtered = contacts
    .filter(c => !existingIds.has(c.id))
    .filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 30)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-md w-full max-h-[70vh] flex flex-col shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-mercury">
          <h2 className="text-sm font-semibold text-burnham">Add to {list.name}</h2>
        </div>

        <div className="px-4 py-3 border-b border-mercury">
          <div className="relative">
            <MagnifyingGlass size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-shuttle" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search contacts..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-mercury rounded-lg focus:outline-none focus:border-burnham"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-sm text-shuttle">
              <Users size={24} className="mx-auto mb-2 text-mercury" />
              No contacts found.
            </div>
          ) : (
            filtered.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedContactId(c.id)}
                className={`w-full flex items-center gap-2 p-2 rounded-lg text-left ${selectedContactId === c.id ? 'bg-gossip/40' : 'hover:bg-mercury/20'}`}
              >
                <div className="w-7 h-7 rounded-full bg-gossip flex items-center justify-center text-[11px] font-semibold text-burnham shrink-0">
                  {c.name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-midnight truncate">{c.name}</p>
                  {c.job_title && (
                    <p className="text-[10px] text-shuttle truncate">
                      {c.job_title}{c.company ? ` @ ${c.company}` : ''}
                    </p>
                  )}
                </div>
                {c.tier != null && <span className="text-[9px] px-1.5 py-0.5 bg-mercury text-shuttle rounded-full">T{c.tier}</span>}
              </button>
            ))
          )}
        </div>

        {selectedContactId && (
          <div className="border-t border-mercury p-3 space-y-2">
            <div>
              <label className="block text-[11px] text-shuttle mb-1">Start in stage</label>
              <select
                value={stage}
                onChange={e => setStage(e.target.value)}
                className="w-full text-sm border border-mercury rounded-lg px-2 py-1.5 focus:outline-none focus:border-burnham bg-white"
              >
                {list.stages.map(s => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-shuttle mb-1">Notes (optional)</label>
              <input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Why are you adding them?"
                className="w-full text-xs border border-mercury rounded-lg px-2 py-1.5 focus:outline-none focus:border-burnham"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="block text-[11px] text-shuttle mb-1">Role</span>
                <input
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  placeholder="Champion"
                  className="w-full text-xs border border-mercury rounded-lg px-2 py-1.5 focus:outline-none focus:border-burnham"
                />
              </label>
              <label className="block">
                <span className="block text-[11px] text-shuttle mb-1">Cadence</span>
                <input
                  value={cadence}
                  onChange={e => setCadence(e.target.value)}
                  placeholder="Monthly"
                  className="w-full text-xs border border-mercury rounded-lg px-2 py-1.5 focus:outline-none focus:border-burnham"
                />
              </label>
              <label className="block">
                <span className="block text-[11px] text-shuttle mb-1">Relation</span>
                <input
                  value={relation}
                  onChange={e => setRelation(e.target.value)}
                  placeholder="Investor"
                  className="w-full text-xs border border-mercury rounded-lg px-2 py-1.5 focus:outline-none focus:border-burnham"
                />
              </label>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-mercury">
          <button onClick={onClose} className="px-3 py-1 text-xs text-shuttle hover:text-burnham">
            Cancel
          </button>
          <button
            onClick={() => selectedContactId && onAdded(selectedContactId, stage, notes || undefined, {
              ...(role.trim() ? { role: role.trim() } : {}),
              ...(cadence.trim() ? { cadence: cadence.trim() } : {}),
              ...(relation.trim() ? { relation: relation.trim() } : {}),
              ...(notes.trim() ? { notes: notes.trim() } : {}),
            })}
            disabled={!selectedContactId}
            className="px-3 py-1.5 bg-burnham text-gossip text-xs rounded-lg disabled:opacity-40"
          >
            Add to list
          </button>
        </div>
      </div>
    </div>
  )
}
