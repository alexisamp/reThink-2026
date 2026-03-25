import { useState, useEffect, useCallback, useRef } from 'react'
import {
  MagnifyingGlass, Plus, ArrowSquareOut, UserCircle, Sparkle, ArrowsClockwise, X,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { Contact, ContactStatus, ContactCategory, Habit, HabitLog } from '@/types'
import { useContacts } from '@/hooks/useContacts'
import { useFunnelConfig } from '@/hooks/useFunnelConfig'
import {
  FUNNEL_STAGE_ORDER,
  CATEGORY_LABELS,
} from '@/lib/funnelDefaults'
import OutreachPanel from '@/components/OutreachPanel'
import ContactDetailDrawer from '@/components/ContactDetailDrawer'
import { openLink } from '@/lib/openLink'
import { enrichContact, hasGeminiEnrichKey } from '@/hooks/useContactEnricher'
import { hasAttioKey, listAllAttioPersons } from '@/lib/attio'
import type { AttioPersonResult } from '@/lib/attio'

// ── helpers ───────────────────────────────────────────────────────────────────

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  const then = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24))
}

/** Returns true if the name looks like it was captured from a LinkedIn URL slug
 *  e.g. "javiercopleJ", "JohnDoe", "juan-garcia-123" */
function isSlugName(name: string): boolean {
  if (!name || name.length < 4 || name.includes(' ')) return false
  // camelCase slug: uppercase after position 0
  if (/[A-Z]/.test(name.slice(1))) return true
  // all-lowercase with hyphens or digits — URL slug
  if (/^[a-z][a-z0-9\-]+$/.test(name)) return true
  return false
}

function formatAgo(days: number): string {
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  return `${days}d ago`
}

function healthColor(score: number): string {
  if (score <= 3) return 'text-red-400'
  if (score <= 6) return 'text-yellow-400'
  return 'text-pastel'
}

// ── component ─────────────────────────────────────────────────────────────────

export default function People() {
  const [userId, setUserId] = useState<string | null>(null)
  const [habits, setHabits] = useState<Habit[]>([])
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([])
  const [profile, setProfile] = useState<{ contact_funnel_config: import('@/types').ContactFunnelConfig | null } | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ContactStatus | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<ContactCategory | 'all'>('all')
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [outreachPanelOpen, setOutreachPanelOpen] = useState(false)

  // Bulk re-enrich (fix slug names)
  const [bulkEnriching, setBulkEnriching] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)
  const bulkCancelRef = useRef(false)

  // Attio import flow
  const [attioChecking, setAttioChecking] = useState(false)
  const [attioCandidates, setAttioCandidates] = useState<(AttioPersonResult & { selected: boolean })[] | null>(null)
  const [attioImporting, setAttioImporting] = useState(false)
  const [attioImportDone, setAttioImportDone] = useState<number | null>(null)

  const today = localDate()

  // ── init: get user + habits ───────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      Promise.all([
        supabase.from('habits').select('*').eq('user_id', user.id).eq('is_active', true),
        supabase.from('habit_logs').select('*').eq('user_id', user.id).eq('log_date', today),
        supabase.from('profiles').select('contact_funnel_config').eq('id', user.id).maybeSingle(),
      ]).then(([habitsRes, logsRes, profileRes]) => {
        setHabits((habitsRes.data ?? []) as Habit[])
        setHabitLogs((logsRes.data ?? []) as HabitLog[])
        setProfile(profileRes.data as { contact_funnel_config: import('@/types').ContactFunnelConfig | null } | null)
      })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── habit count upsert ────────────────────────────────────────────────────
  const upsertHabitCount = useCallback(async (habitId: string, count: number) => {
    if (!userId) return
    const existing = habitLogs.find(l => l.habit_id === habitId)
    if (existing) {
      await supabase.from('habit_logs').update({ value: count }).eq('id', existing.id)
      setHabitLogs(prev => prev.map(l => l.id === existing.id ? { ...l, value: count } : l))
    } else {
      const { data } = await supabase
        .from('habit_logs')
        .insert({ habit_id: habitId, user_id: userId, log_date: today, value: count })
        .select().single()
      if (data) setHabitLogs(prev => [...prev, data as HabitLog])
    }
  }, [userId, habitLogs, today])

  // ── hooks ─────────────────────────────────────────────────────────────────
  const {
    contacts,
    loading,
    syncing,
    syncError,
    addContact,
    updateContact,
    deleteContact,
    syncContactToAttio,
    syncCompany,
    syncAll,
  } = useContacts(userId ?? undefined, habits, upsertHabitCount)

  const { getLabel, getActiveStages } = useFunnelConfig(userId ?? undefined, profile)

  // ── goals (needed for OutreachPanel) ──────────────────────────────────────
  const [goals, setGoals] = useState<{ id: string; text: string; alias: string | null }[]>([])
  useEffect(() => {
    if (!userId) return
    supabase.from('goals').select('id, text, alias').eq('user_id', userId).eq('goal_type', 'ACTIVE')
      .then(({ data }) => setGoals(data ?? []))
  }, [userId])

  // ── filtering + sorting ───────────────────────────────────────────────────
  const filtered = contacts
    .filter(c => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (categoryFilter !== 'all' && c.category !== categoryFilter) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        if (!c.name.toLowerCase().includes(q)) return false
      }
      return true
    })
    .sort((a, b) => {
      // last_interaction_at DESC NULLS LAST, then created_at DESC
      const aDate = a.last_interaction_at ?? null
      const bDate = b.last_interaction_at ?? null
      if (aDate && bDate) return bDate.localeCompare(aDate)
      if (aDate) return -1
      if (bDate) return 1
      return b.created_at.localeCompare(a.created_at)
    })

  const activeStages = getActiveStages()

  // ── handlers ──────────────────────────────────────────────────────────────
  function openDetail(contact: Contact) {
    setSelectedContact(contact)
    setDrawerOpen(true)
  }

  function closeDetail() {
    setDrawerOpen(false)
    setTimeout(() => setSelectedContact(null), 200)
  }

  async function handleUpdateContact(id: string, updates: Partial<Contact>): Promise<void> {
    await updateContact(id, updates)
    // Keep selectedContact in sync
    setSelectedContact(prev => prev && prev.id === id ? { ...prev, ...updates } : prev)
  }

  async function handleDeleteContact(id: string): Promise<void> {
    await deleteContact(id)
    closeDetail()
  }

  async function handleSyncToAttio(id: string): Promise<void> {
    await syncContactToAttio(id)
  }

  // OutreachPanel save handler (add new contact)
  async function handleSaveContact(input: import('@/hooks/useContacts').ContactInput): Promise<void> {
    await addContact(input)
  }

  // ── Bulk re-enrich (fix slug-style names) ─────────────────────────────────
  async function handleBulkFixNames() {
    const slugContacts = contacts.filter(c => isSlugName(c.name))
    if (slugContacts.length === 0) return
    setBulkEnriching(true)
    bulkCancelRef.current = false
    setBulkProgress({ done: 0, total: slugContacts.length })
    for (let i = 0; i < slugContacts.length; i++) {
      if (bulkCancelRef.current) break
      const c = slugContacts[i]
      const result = await enrichContact({
        name: c.name,
        company: c.company,
        company_domain: c.company_domain,
        job_title: c.job_title,
        about: c.about,
        personal_context: c.personal_context,
        linkedin_url: c.linkedin_url,
      })
      if (result) {
        const patch: Partial<Contact> = { ai_enriched_at: new Date().toISOString() }
        if (result.name) patch.name = result.name
        if (result.job_title && !c.job_title) patch.job_title = result.job_title
        if (result.company && !c.company) patch.company = result.company
        if (result.company_domain) patch.company_domain = result.company_domain
        if (result.profile_photo_url) patch.profile_photo_url = result.profile_photo_url
        await updateContact(c.id, patch)
      }
      setBulkProgress({ done: i + 1, total: slugContacts.length })
    }
    setBulkEnriching(false)
    setBulkProgress(null)
  }

  // ── Attio → reThink import flow ────────────────────────────────────────────
  async function handleCheckAttio() {
    setAttioChecking(true)
    setAttioCandidates(null)
    setAttioImportDone(null)
    const attioPersons = await listAllAttioPersons()
    // Build a set of normalized LinkedIn URLs from existing contacts
    const existingLinkedins = new Set(
      contacts
        .map(c => c.linkedin_url?.replace(/\/$/, '').toLowerCase())
        .filter(Boolean)
    )
    const existingNames = new Set(contacts.map(c => c.name.toLowerCase().trim()))
    // Find Attio people not in reThink
    const missing = attioPersons.filter(p => {
      if (p.linkedin_url) {
        const norm = p.linkedin_url.replace(/\/$/, '').toLowerCase()
        return !existingLinkedins.has(norm)
      }
      return !existingNames.has(p.full_name.toLowerCase().trim())
    })
    setAttioCandidates(missing.map(p => ({ ...p, selected: true })))
    setAttioChecking(false)
  }

  async function handleAttioImport() {
    if (!attioCandidates || !userId) return
    const toImport = attioCandidates.filter(c => c.selected)
    if (toImport.length === 0) return
    setAttioImporting(true)
    let created = 0
    for (const person of toImport) {
      await addContact({
        name: person.full_name,
        linkedin_url: person.linkedin_url ?? null,
        job_title: person.job_title ?? null,
        email: person.email ?? null,
        existing_attio_record_id: person.record_id,
      })
      created++
    }
    setAttioImporting(false)
    setAttioImportDone(created)
    setAttioCandidates(null)
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white px-4 pt-6 pb-32 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-burnham">People</h1>
          {!loading && (
            <span className="text-[11px] font-medium text-shuttle bg-mercury/40 rounded-full px-2 py-0.5">
              {contacts.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Fix slug names — only shown when there are slug contacts and Gemini key exists */}
          {!loading && hasGeminiEnrichKey() && contacts.some(c => isSlugName(c.name)) && (
            <button
              onClick={bulkEnriching ? () => { bulkCancelRef.current = true } : handleBulkFixNames}
              disabled={false}
              className="flex items-center gap-1 text-[11px] text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-2.5 py-1.5 hover:bg-yellow-100 transition-colors"
              title="Auto-fix names that look like LinkedIn URL slugs"
            >
              <Sparkle size={12} weight="fill" />
              {bulkEnriching && bulkProgress
                ? `${bulkProgress.done}/${bulkProgress.total} — cancel`
                : `Fix ${contacts.filter(c => isSlugName(c.name)).length} names`}
            </button>
          )}
          {/* Import from Attio */}
          {hasAttioKey() && (
            <button
              onClick={handleCheckAttio}
              disabled={attioChecking}
              className="flex items-center gap-1 text-[11px] text-shuttle bg-mercury/30 border border-mercury rounded-lg px-2.5 py-1.5 hover:bg-mercury/60 transition-colors disabled:opacity-50"
              title="Find Attio contacts not yet in reThink"
            >
              {attioChecking
                ? <ArrowsClockwise size={12} className="animate-spin" />
                : <img src="/attio.png" alt="Attio" className="w-3 h-3 object-contain" />}
              {attioChecking ? 'Checking…' : 'Sync Attio'}
            </button>
          )}
          <button
            onClick={() => setOutreachPanelOpen(true)}
            className="flex items-center gap-1.5 bg-burnham text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-burnham/90 transition-colors"
          >
            <Plus size={14} weight="bold" />
            Add person
          </button>
        </div>
      </div>

      {/* Attio import result banner */}
      {attioImportDone !== null && (
        <div className="flex items-center justify-between bg-gossip/20 border border-gossip/40 rounded-lg px-3 py-2 mb-3 text-[12px] text-burnham">
          <span>✓ Imported {attioImportDone} contact{attioImportDone !== 1 ? 's' : ''} from Attio</span>
          <button onClick={() => setAttioImportDone(null)}><X size={12} /></button>
        </div>
      )}

      {/* Attio import modal */}
      {attioCandidates !== null && (
        <div className="mb-4 border border-mercury rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-mercury/20 border-b border-mercury">
            <span className="text-[12px] font-semibold text-burnham">
              {attioCandidates.length === 0
                ? 'All Attio contacts are already in reThink ✓'
                : `${attioCandidates.filter(c => c.selected).length} Attio contacts not in reThink`}
            </span>
            <button onClick={() => setAttioCandidates(null)} className="text-shuttle hover:text-burnham">
              <X size={14} />
            </button>
          </div>
          {attioCandidates.length > 0 && (
            <>
              <ul className="max-h-64 overflow-y-auto divide-y divide-mercury/40">
                {attioCandidates.map((p, i) => (
                  <li key={p.record_id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-mercury/10">
                    <input
                      type="checkbox"
                      checked={p.selected}
                      onChange={e => setAttioCandidates(prev =>
                        prev ? prev.map((c, j) => j === i ? { ...c, selected: e.target.checked } : c) : prev
                      )}
                      className="accent-burnham"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-burnham truncate">{p.full_name}</div>
                      {(p.job_title || p.email) && (
                        <div className="text-[10px] text-shuttle/50 truncate">
                          {[p.job_title, p.email].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                    {p.linkedin_url && (
                      <button onClick={() => openLink(p.linkedin_url!)} className="text-shuttle/40 hover:text-shuttle flex-shrink-0">
                        <ArrowSquareOut size={12} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <div className="px-4 py-2.5 border-t border-mercury flex items-center justify-between gap-3">
                <button
                  onClick={() => setAttioCandidates(prev => prev?.map(c => ({ ...c, selected: true })) ?? prev)}
                  className="text-[11px] text-shuttle hover:text-burnham"
                >
                  Select all
                </button>
                <button
                  onClick={handleAttioImport}
                  disabled={attioImporting || attioCandidates.filter(c => c.selected).length === 0}
                  className="flex items-center gap-1.5 bg-burnham text-white text-[12px] font-medium px-3 py-1.5 rounded-lg hover:bg-burnham/90 disabled:opacity-50 transition-colors"
                >
                  {attioImporting ? 'Importing…' : `Import ${attioCandidates.filter(c => c.selected).length} contacts`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <MagnifyingGlass
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-shuttle/50"
        />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="w-full pl-8 pr-3 py-2 text-sm bg-mercury/20 border border-mercury rounded-lg placeholder-shuttle/40 text-burnham focus:outline-none focus:border-burnham/30"
        />
      </div>

      {/* Status filter pills */}
      <div className="flex gap-1.5 flex-wrap mb-2">
        <button
          onClick={() => setStatusFilter('all')}
          className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
            statusFilter === 'all'
              ? 'bg-burnham text-white border-burnham'
              : 'bg-white text-shuttle border-mercury hover:border-shuttle/40'
          }`}
        >
          All
        </button>
        {FUNNEL_STAGE_ORDER.filter(s => activeStages.includes(s)).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(prev => prev === s ? 'all' : s)}
            className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
              statusFilter === s
                ? 'bg-burnham text-white border-burnham'
                : 'bg-white text-shuttle border-mercury hover:border-shuttle/40'
            }`}
          >
            {getLabel(s)}
          </button>
        ))}
      </div>

      {/* Category filter chips */}
      <div className="flex gap-1.5 flex-wrap mb-5">
        <button
          onClick={() => setCategoryFilter('all')}
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
            categoryFilter === 'all'
              ? 'bg-shuttle text-white border-shuttle'
              : 'bg-white text-shuttle/70 border-mercury hover:border-shuttle/30'
          }`}
        >
          All categories
        </button>
        {(Object.keys(CATEGORY_LABELS) as ContactCategory[]).map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(prev => prev === cat ? 'all' : cat)}
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
              categoryFilter === cat
                ? 'bg-shuttle text-white border-shuttle'
                : 'bg-white text-shuttle/70 border-mercury hover:border-shuttle/30'
            }`}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Contact list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 border-[1.5px] border-mercury border-t-burnham rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <UserCircle size={40} className="text-mercury" weight="thin" />
          <p className="text-sm text-shuttle/60">
            {contacts.length === 0
              ? 'No people yet. Add someone to get started.'
              : 'No people match your filters.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-mercury/60">
          {filtered.map(contact => {
            const days = daysSince(contact.last_interaction_at)
            return (
              <li
                key={contact.id}
                onClick={() => openDetail(contact)}
                className="flex items-center gap-3 py-3 cursor-pointer hover:bg-mercury/10 -mx-2 px-2 rounded-lg transition-colors"
              >
                {/* Avatar */}
                <ContactAvatar name={contact.name} photoUrl={contact.profile_photo_url ?? null} healthScore={contact.health_score} />

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-burnham text-sm truncate">{contact.name}</span>
                    {isSlugName(contact.name) && (
                      <span className="text-[9px] bg-yellow-100 text-yellow-700 rounded px-1.5 py-0.5 flex-shrink-0" title="Name may be a URL slug — open and run Enrich to fix">
                        fix name
                      </span>
                    )}
                    {contact.category && (
                      <span className="text-[9px] uppercase bg-mercury/40 text-shuttle rounded px-1.5 py-0.5 flex-shrink-0">
                        {CATEGORY_LABELS[contact.category] ?? contact.category}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-shuttle/60 bg-mercury/30 rounded px-1.5 py-0.5">
                      {getLabel(contact.status)}
                    </span>
                    <span className="text-[10px] text-shuttle/40">
                      {days === null ? 'No contact yet' : formatAgo(days)}
                    </span>
                  </div>
                </div>

                {/* LinkedIn */}
                {contact.linkedin_url && (
                  <button
                    onClick={e => { e.stopPropagation(); openLink(contact.linkedin_url!) }}
                    className="text-shuttle/40 hover:text-shuttle flex-shrink-0"
                    title="Open LinkedIn"
                  >
                    <ArrowSquareOut size={14} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Outreach panel (add person) */}
      <OutreachPanel
        open={outreachPanelOpen}
        onClose={() => setOutreachPanelOpen(false)}
        editingLog={null}
        goals={goals}
        onSave={handleSaveContact}
        syncing={syncing}
        onSpawnTodo={() => {}}
      />

      {/* Contact detail drawer */}
      <ContactDetailDrawer
        open={drawerOpen}
        onClose={closeDetail}
        contact={selectedContact}
        onUpdate={handleUpdateContact}
        onDelete={handleDeleteContact}
        onSyncToAttio={handleSyncToAttio}
        onSyncCompany={syncCompany}
        onSyncAll={syncAll}
        funnelConfig={profile?.contact_funnel_config ?? null}
        userId={userId ?? ''}
        habits={habits}
        upsertHabitCount={upsertHabitCount}
        saveError={syncError}
      />
    </div>
  )
}

// ── Avatar component ───────────────────────────────────────────────────────────

function ContactAvatar({ name, photoUrl, healthScore }: { name: string; photoUrl: string | null; healthScore: number }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
  const dotColor = healthScore <= 3 ? '#f87171' : healthScore <= 6 ? '#fbbf24' : '#79D65E'

  return (
    <div className="relative flex-shrink-0">
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={name}
          className="w-9 h-9 rounded-full object-cover"
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex' }}
        />
      ) : null}
      <div
        className="w-9 h-9 rounded-full bg-mercury/60 flex items-center justify-center text-[13px] font-semibold text-shuttle"
        style={{ display: photoUrl ? 'none' : 'flex' }}
      >
        {initials}
      </div>
      <span
        className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white"
        style={{ background: dotColor }}
      />
    </div>
  )
}
