import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, ArrowLeft, ArrowSquareOut, ChatCircle, Envelope, Phone,
  VideoCamera, Users, CaretDown, CaretUp, Trash, Plus, Check,
  Globe, Sparkle, SpinnerGap,
} from '@phosphor-icons/react'
import { useInteractions } from '@/hooks/useInteractions'
import { useContactEnricher, hasGeminiEnrichKey } from '@/hooks/useContactEnricher'
import { hasAttioKey, pullFromAttio, diffAttioFields } from '@/lib/attio'
import {
  DEFAULT_FUNNEL_CONFIG,
  FUNNEL_STAGE_ORDER,
  CATEGORY_LABELS,
  ATTIO_ELIGIBLE_CATEGORIES,
} from '@/lib/funnelDefaults'
import type {
  Contact, ContactStatus, ContactCategory,
  ContactFunnelConfig, Interaction, Habit,
} from '@/types'

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

function formatAgo(days: number): string {
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  return `${days}d ago`
}

function healthDotColor(score: number): string {
  if (score <= 3) return 'text-red-400'
  if (score <= 6) return 'text-yellow-400'
  return 'text-pastel'
}

const INTERACTION_TYPE_LABELS: Record<Interaction['type'], string> = {
  whatsapp:      'WhatsApp',
  linkedin_msg:  'LinkedIn',
  email:         'Email',
  call:          'Call',
  virtual_coffee:'Virtual coffee',
  in_person:     'In person',
}

function InteractionIcon({ type, size = 14 }: { type: Interaction['type']; size?: number }) {
  switch (type) {
    case 'whatsapp':
    case 'linkedin_msg': return <ChatCircle size={size} weight="fill" className="text-shuttle/50" />
    case 'email':        return <Envelope size={size} weight="fill" className="text-shuttle/50" />
    case 'call':         return <Phone size={size} weight="fill" className="text-shuttle/50" />
    case 'virtual_coffee': return <VideoCamera size={size} weight="fill" className="text-shuttle/50" />
    case 'in_person':    return <Users size={size} weight="fill" className="text-shuttle/50" />
  }
}

// ── props ─────────────────────────────────────────────────────────────────────

interface ContactDetailDrawerProps {
  open: boolean
  onClose: () => void
  contact: Contact | null
  onUpdate: (id: string, updates: Partial<Contact>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onSyncToAttio: (id: string) => Promise<void>
  onSyncCompany?: (id: string) => Promise<void>
  onSyncAll?: (id: string) => void
  funnelConfig: ContactFunnelConfig | null
  userId: string
  habits: Habit[]
  upsertHabitCount: (habitId: string, count: number) => Promise<void>
  saveError?: string | null
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ContactDetailDrawer({
  open,
  onClose,
  contact,
  onUpdate,
  onDelete,
  onSyncToAttio,
  onSyncCompany,
  onSyncAll,
  funnelConfig,
  userId,
  habits,
  upsertHabitCount,
  saveError,
}: ContactDetailDrawerProps) {
  const config: ContactFunnelConfig = funnelConfig ?? DEFAULT_FUNNEL_CONFIG

  // ── local editable state ─────────────────────────────────────────────────
  const [localStatus, setLocalStatus] = useState<ContactStatus | null>(null)
  const [localCategory, setLocalCategory] = useState<ContactCategory | null>(null)
  const [personalContext, setPersonalContext] = useState('')
  const [notes, setNotes] = useState('')
  const [skillsInput, setSkillsInput] = useState('')
  const [skillsList, setSkillsList] = useState<string[]>([])
  const [aboutExpanded, setAboutExpanded] = useState(false)
  const [logFormOpen, setLogFormOpen] = useState(false)
  const [attioToast, setAttioToast] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [companyDomain, setCompanyDomain] = useState('')
  const [enrichStatus, setEnrichStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [enrichSuccessTimer, setEnrichSuccessTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [syncErrorExpanded, setSyncErrorExpanded] = useState(false)
  const [contextBannerDismissed, setContextBannerDismissed] = useState(false)
  const [contextBannerText, setContextBannerText] = useState('')

  const { enriching, enrichError, enrich } = useContactEnricher()

  // Log form state
  const [logType, setLogType] = useState<Interaction['type']>('whatsapp')
  const [logDirection, setLogDirection] = useState<Interaction['direction']>('outbound')
  const [logNotes, setLogNotes] = useState('')
  const [logDate, setLogDate] = useState(localDate())
  const [logSaving, setLogSaving] = useState(false)

  const personalContextRef = useRef<HTMLTextAreaElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)

  // ── interactions hook ─────────────────────────────────────────────────────
  const { fetchInteractions, logInteraction, deleteInteraction, getInteractions } =
    useInteractions(userId || undefined, habits, upsertHabitCount)

  // ── sync contact state when contact changes ───────────────────────────────
  useEffect(() => {
    if (!contact) return
    setLocalStatus(contact.status)
    setLocalCategory(contact.category ?? null)
    setPersonalContext(contact.personal_context ?? '')
    setNotes(contact.notes ?? '')
    setSkillsList(
      contact.skills
        ? contact.skills.split(',').map(s => s.trim()).filter(Boolean)
        : []
    )
    setSkillsInput('')
    setLogFormOpen(false)
    setConfirmDelete(false)
    setAboutExpanded(false)
    setCompanyDomain(contact.company_domain ?? '')
    setSyncErrorExpanded(false)
    setContextBannerDismissed(false)
    setContextBannerText('')
    setEnrichStatus('idle')

    // Fetch interactions for this contact
    fetchInteractions(contact.id)
  }, [contact?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── auto-pull from Attio on mount ─────────────────────────────────────────
  useEffect(() => {
    if (!contact?.attio_record_id || !hasAttioKey()) return
    pullFromAttio(contact.attio_record_id)
      .then(attioData => {
        const diff = diffAttioFields(contact, attioData)
        if (Object.keys(diff).length > 0) {
          onUpdate(contact.id, diff as Partial<Contact>)
          setAttioToast('Updated from Attio')
          setTimeout(() => setAttioToast(''), 3000)
        }
      })
      .catch(() => {}) // silent fail — Attio is optional
  }, [contact?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── escape key ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // ── auto-save helpers ─────────────────────────────────────────────────────
  const savePersonalContext = useCallback(() => {
    if (!contact) return
    onUpdate(contact.id, { personal_context: personalContext || null })
  }, [contact, personalContext, onUpdate])

  const saveNotes = useCallback(() => {
    if (!contact) return
    onUpdate(contact.id, { notes: notes || null })
  }, [contact, notes, onUpdate])

  // ── skills ────────────────────────────────────────────────────────────────
  function addSkill(raw: string) {
    const incoming = raw.split(',').map(s => s.trim()).filter(Boolean)
    const merged = [...new Set([...skillsList, ...incoming])]
    setSkillsList(merged)
    setSkillsInput('')
    if (!contact) return
    onUpdate(contact.id, { skills: merged.join(', ') || null })
  }

  function removeSkill(skill: string) {
    const updated = skillsList.filter(s => s !== skill)
    setSkillsList(updated)
    if (!contact) return
    onUpdate(contact.id, { skills: updated.join(', ') || null })
  }

  function handleSkillsKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (skillsInput.trim()) addSkill(skillsInput)
    }
  }

  // ── status change ─────────────────────────────────────────────────────────
  function handleStatusChange(status: ContactStatus) {
    if (!contact) return
    setLocalStatus(status)
    onUpdate(contact.id, { status })
  }

  // ── category change ───────────────────────────────────────────────────────
  function handleCategoryChange(category: ContactCategory) {
    if (!contact) return
    setLocalCategory(category)
    onUpdate(contact.id, { category })
  }

  // ── log interaction ───────────────────────────────────────────────────────
  async function handleLogSave() {
    if (!contact) return
    setLogSaving(true)
    await logInteraction(contact.id, logType, logDirection, logNotes || null, logDate, contact.attio_record_id)
    setLogSaving(false)
    setLogFormOpen(false)
    setLogNotes('')
    setLogType('whatsapp')
    setLogDirection('outbound')
    setLogDate(localDate())
  }

  // ── AI enrichment ─────────────────────────────────────────────────────────
  async function handleEnrich(overridePersonalContext?: string) {
    if (!contact) return
    setEnrichStatus('idle')
    const result = await enrich({
      name: contact.name,
      company: contact.company,
      company_domain: contact.company_domain,
      job_title: contact.job_title,
      about: contact.about,
      personal_context: overridePersonalContext ?? contact.personal_context,
      linkedin_url: contact.linkedin_url,
    })
    if (!result) {
      setEnrichStatus('error')
      return
    }
    const updates: Partial<Contact> = {}

    if (result.company_domain && !contact.company_domain) {
      updates.company_domain = result.company_domain
      setCompanyDomain(result.company_domain)
    }

    if (result.skills) {
      const incoming = result.skills.split(',').map((s: string) => s.trim()).filter(Boolean)
      const merged = [...new Set([...skillsList, ...incoming])]
      updates.skills = merged.join(', ')
      setSkillsList(merged)
    }

    // Only update about if missing, short (< 100 chars), or contains accessibility error text
    const aboutIsError = contact.about?.toLowerCase().includes('modal window') || contact.about?.toLowerCase().includes('beginning of dialog')
    if (result.about && (!contact.about || contact.about.length < 100 || aboutIsError)) {
      updates.about = result.about
    }

    // relationship_context: append to personal_context or set it
    if (result.relationship_context) {
      const existingCtx = overridePersonalContext ?? contact.personal_context ?? ''
      const newCtx = existingCtx
        ? `${existingCtx}\n\n[AI] ${result.relationship_context}`
        : `[AI] ${result.relationship_context}`
      updates.personal_context = newCtx
      setPersonalContext(newCtx)
    }

    // approach_angles + enrichment_notes: append to notes
    const noteAdditions: string[] = []
    if (result.approach_angles) noteAdditions.push(`[Approach angles]\n${result.approach_angles}`)
    if (result.enrichment_notes) noteAdditions.push(`[Enrichment notes]\n${result.enrichment_notes}`)
    if (noteAdditions.length > 0) {
      const existingNotes = notes ?? contact.notes ?? ''
      const newNotes = existingNotes
        ? `${existingNotes}\n\n${noteAdditions.join('\n\n')}`
        : noteAdditions.join('\n\n')
      updates.notes = newNotes
      setNotes(newNotes)
    }

    updates.ai_enriched_at = new Date().toISOString()

    await onUpdate(contact.id, updates)

    setEnrichStatus('success')
    if (enrichSuccessTimer) clearTimeout(enrichSuccessTimer)
    const t = setTimeout(() => setEnrichStatus('idle'), 2000)
    setEnrichSuccessTimer(t)
  }

  // ── sync to Attio (person + company in one click) ────────────────────────
  async function handleSyncAll() {
    if (!contact) return
    setSyncing(true)
    try {
      if (onSyncAll) {
        onSyncAll(contact.id)
      } else {
        await onSyncToAttio(contact.id)
      }
      setAttioToast('✓ Synced')
      setTimeout(() => setAttioToast(''), 3000)
    } finally {
      setSyncing(false)
    }
  }

  // ── delete ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!contact) return
    await onDelete(contact.id)
    setConfirmDelete(false)
  }

  // ── derived ───────────────────────────────────────────────────────────────
  const interactions = contact ? getInteractions(contact.id) : []
  // Sort most recent first
  const sortedInteractions = [...interactions].sort(
    (a, b) => new Date(b.interaction_date).getTime() - new Date(a.interaction_date).getTime()
  )
  const healthScore = contact?.health_score ?? 1
  const healthDotClass = healthDotColor(healthScore)
  const lastDays = daysSince(contact?.last_interaction_at ?? null)
  const isFamily = contact?.category === 'family'
  const attioEligible = !isFamily && ATTIO_ELIGIBLE_CATEGORIES.includes(
    (contact?.category ?? '') as typeof ATTIO_ELIGIBLE_CATEGORIES[number]
  )
  const attioSyncedDays = daysSince(contact?.attio_synced_at ?? null)

  // Sync error display helpers
  const syncErrRaw = saveError ?? null
  const syncErrShort = syncErrRaw && syncErrRaw.length > 100
    ? syncErrRaw.slice(0, 100) + '…'
    : syncErrRaw

  // ── context banner visibility ────────────────────────────────────────────
  const isNewContact = contact
    ? (Date.now() - new Date(contact.created_at).getTime()) < 24 * 60 * 60 * 1000
    : false
  const showContextBanner =
    !!contact &&
    !contact.personal_context &&
    isNewContact &&
    !contextBannerDismissed

  // ── enriched timestamp display ────────────────────────────────────────────
  function formatEnrichedAt(isoStr: string): string {
    const days = daysSince(isoStr)
    if (days === null) return ''
    if (days === 0) return 'Last enriched: today'
    if (days === 1) return 'Last enriched: 1 day ago'
    return `Last enriched: ${days} days ago`
  }

  // ── section label style ───────────────────────────────────────────────────
  const sectionLabel = 'text-[10px] font-semibold text-shuttle uppercase tracking-widest mb-2'

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[199] bg-black/10"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed inset-y-0 right-0 z-[200] w-96 bg-white border-l border-mercury shadow-2xl flex flex-col overflow-y-auto transform transition-transform duration-200 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {!contact ? null : (
          <>
            {/* ── 1. Header ───────────────────────────────────────────────── */}
            <div className="p-4 border-b border-mercury flex items-start justify-between sticky top-0 bg-white z-10">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <button
                    onClick={onClose}
                    className="text-shuttle/60 hover:text-burnham transition-colors flex-shrink-0"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <h2 className="text-sm font-semibold text-burnham truncate">
                    {contact.name}'s profile
                  </h2>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-shuttle/40 hover:text-shuttle transition-colors flex-shrink-0 ml-2"
              >
                <X size={16} />
              </button>
            </div>

            {/* ── 1b. Personal context first-flow banner ───────────────────── */}
            {showContextBanner && (
              <div className="mx-4 mt-4 bg-gossip/20 border border-pastel/40 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <Sparkle size={14} weight="fill" className="text-pastel flex-shrink-0" />
                  <p className="text-xs font-semibold text-burnham">Add context to power AI enrichment</p>
                </div>
                <p className="text-[11px] text-shuttle/70 mb-2">
                  How do you know {contact.name.split(' ')[0]}? Where did you meet?
                </p>
                <textarea
                  value={contextBannerText}
                  onChange={e => setContextBannerText(e.target.value)}
                  placeholder="Met at Latam Conf..."
                  className="w-full min-h-[80px] text-xs text-burnham/80 bg-white/70 border border-pastel/30 rounded-lg p-2 placeholder-shuttle/30 resize-none focus:outline-none focus:border-burnham/30 mb-2"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setContextBannerDismissed(true)}
                    className="text-[11px] text-shuttle/60 hover:text-shuttle transition-colors px-2 py-1"
                  >
                    Skip
                  </button>
                  <button
                    onClick={async () => {
                      if (!contact) return
                      const ctx = contextBannerText.trim()
                      await onUpdate(contact.id, { personal_context: ctx || null })
                      setPersonalContext(ctx)
                      setContextBannerDismissed(true)
                      await handleEnrich(ctx || undefined)
                    }}
                    disabled={enriching}
                    className="flex items-center gap-1.5 text-[11px] font-semibold bg-burnham text-white rounded-lg px-3 py-1.5 hover:bg-burnham/90 disabled:opacity-50 transition-colors"
                  >
                    {enriching ? (
                      <>
                        <SpinnerGap size={12} className="animate-spin" />
                        Enriching…
                      </>
                    ) : (
                      <>
                        <Sparkle size={12} weight="fill" />
                        Save &amp; Enrich →
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ── 2. Profile section ───────────────────────────────────────── */}
            <div className="px-4 py-3 border-b border-mercury">
              {/* Avatar initial + name + category + status */}
              <div className="flex items-start gap-3 mb-3">
                {/* Avatar */}
                {contact.profile_photo_url ? (
                  <img
                    src={contact.profile_photo_url}
                    alt={contact.name}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-burnham/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-base font-semibold text-burnham">
                      {contact.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-burnham truncate">{contact.name}</p>
                    {/* Category badge */}
                    <select
                      value={localCategory ?? ''}
                      onChange={e => handleCategoryChange(e.target.value as ContactCategory)}
                      className="text-[9px] uppercase bg-mercury/30 text-shuttle rounded px-1.5 py-0.5 border-0 focus:outline-none focus:ring-1 focus:ring-burnham/20 cursor-pointer"
                    >
                      {(Object.entries(CATEGORY_LABELS) as [ContactCategory, string][]).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </div>
                  {(contact.job_title || contact.company) && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-xs text-burnham/70 truncate">
                        {[contact.job_title, contact.company].filter(Boolean).join(' · ')}
                      </p>
                      {contact.company_linkedin_url && (
                        <a
                          href={contact.company_linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-shuttle/50 hover:text-burnham transition-colors flex-shrink-0"
                          title="Company LinkedIn"
                        >
                          <ArrowSquareOut size={11} />
                        </a>
                      )}
                    </div>
                  )}
                  {contact.location && (
                    <p className="text-xs text-shuttle/50 mt-0.5">{contact.location}</p>
                  )}
                </div>
              </div>

              {/* Status selector (funnel pill) */}
              <div className="mb-1">
                <div className={sectionLabel}>Status</div>
                <div className="flex gap-1.5 flex-wrap">
                  {FUNNEL_STAGE_ORDER.filter(s => config[s]).map(s => (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(s)}
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full border transition-colors ${
                        (localStatus ?? contact.status) === s
                          ? 'bg-burnham text-white border-burnham'
                          : 'bg-white text-shuttle border-mercury hover:border-shuttle/40'
                      }`}
                    >
                      {config[s]?.label ?? s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── 3. Contact info ──────────────────────────────────────────── */}
            <div className="px-4 py-3 border-b border-mercury">
              <div className={sectionLabel}>Contact info</div>
              <div className="space-y-1.5">
                {contact.email && (
                  <a
                    href={`mailto:${contact.email}`}
                    className="flex items-center gap-2 text-xs text-burnham/70 hover:text-burnham transition-colors"
                  >
                    <Envelope size={13} className="text-shuttle/50 flex-shrink-0" />
                    <span className="truncate">{contact.email}</span>
                  </a>
                )}
                {contact.phone && (
                  <div className="flex items-center gap-2">
                    <Phone size={13} className="text-shuttle/50 flex-shrink-0" />
                    <span className="text-xs text-shuttle/70">{contact.phone}</span>
                  </div>
                )}
                {contact.linkedin_url && (
                  <a
                    href={contact.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-shuttle/60 hover:text-burnham transition-colors"
                  >
                    <ArrowSquareOut size={13} className="text-shuttle/50 flex-shrink-0" />
                    <span>LinkedIn</span>
                  </a>
                )}
                {(contact.connections_count !== null || contact.followers_count !== null) && (
                  <p className="text-[10px] text-shuttle/40 pl-5">
                    {[
                      contact.connections_count !== null ? `${contact.connections_count} connections` : null,
                      contact.followers_count !== null ? `${contact.followers_count} followers` : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            </div>

            {/* ── 4. About ─────────────────────────────────────────────────── */}
            {contact.about && (
              <div className="px-4 py-3 border-b border-mercury">
                <button
                  onClick={() => setAboutExpanded(p => !p)}
                  className="flex items-center justify-between w-full"
                >
                  <span className={sectionLabel + ' mb-0'}>About</span>
                  {aboutExpanded
                    ? <CaretUp size={12} className="text-shuttle/50" />
                    : <CaretDown size={12} className="text-shuttle/50" />}
                </button>
                {aboutExpanded && (
                  <p className="text-xs text-shuttle/70 mt-2 leading-relaxed whitespace-pre-wrap">
                    {contact.about}
                  </p>
                )}
              </div>
            )}

            {/* ── 5. Skills ────────────────────────────────────────────────── */}
            <div className="px-4 py-3 border-b border-mercury">
              <div className={sectionLabel}>Skills</div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {skillsList.map(skill => (
                  <span
                    key={skill}
                    className="inline-flex items-center gap-1 bg-gossip text-burnham text-[10px] rounded px-2 py-0.5"
                  >
                    {skill}
                    <button
                      onClick={() => removeSkill(skill)}
                      className="opacity-60 hover:opacity-100 ml-0.5"
                      aria-label={`Remove ${skill}`}
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
              <input
                type="text"
                value={skillsInput}
                onChange={e => setSkillsInput(e.target.value)}
                onKeyDown={handleSkillsKeyDown}
                onBlur={() => { if (skillsInput.trim()) addSkill(skillsInput) }}
                placeholder="Add skills (comma or Enter)"
                className="w-full text-xs bg-mercury/10 border border-mercury rounded-lg px-2 py-1.5 placeholder-shuttle/30 text-burnham focus:outline-none focus:border-burnham/30"
              />
            </div>

            {/* ── 6. Personal context ──────────────────────────────────────── */}
            <div className="px-4 py-3 border-b border-mercury">
              <div className={sectionLabel}>Personal context</div>
              <textarea
                ref={personalContextRef}
                value={personalContext}
                onChange={e => setPersonalContext(e.target.value)}
                onBlur={savePersonalContext}
                rows={3}
                placeholder="What do you know about this person? What matters to them?"
                className="w-full text-xs text-burnham/80 bg-mercury/10 border border-mercury rounded-lg p-2 placeholder-shuttle/30 resize-none focus:outline-none focus:border-burnham/30"
              />
            </div>

            {/* ── 7. Health score ──────────────────────────────────────────── */}
            <div className="px-4 py-3 border-b border-mercury">
              <div className={sectionLabel}>Relationship health</div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <span className={`text-base leading-none tracking-tight ${healthDotClass}`}>
                    {'●'.repeat(healthScore)}{'○'.repeat(Math.max(0, 10 - healthScore))}
                  </span>
                  <span className={`text-xs font-semibold ml-1 ${healthDotClass}`}>
                    {healthScore}/10
                  </span>
                </div>
                <span className="text-[10px] text-shuttle/50">
                  {lastDays === null
                    ? 'No interactions yet'
                    : `Last seen ${formatAgo(lastDays)}`}
                </span>
              </div>
            </div>

            {/* ── 8. Interactions timeline ─────────────────────────────────── */}
            <div className="px-4 py-3 border-b border-mercury">
              <div className="flex items-center justify-between mb-2">
                <span className={sectionLabel + ' mb-0'}>Interactions</span>
                <button
                  onClick={() => setLogFormOpen(p => !p)}
                  className="flex items-center gap-1 text-[10px] text-burnham/70 hover:text-burnham border border-burnham/20 hover:border-burnham/50 rounded px-2 py-0.5 transition-colors"
                >
                  <Plus size={10} />
                  Log
                </button>
              </div>

              {/* Timeline — most recent first */}
              {sortedInteractions.length === 0 ? (
                <p className="text-[11px] text-shuttle/40">No interactions logged yet.</p>
              ) : (
                <ul className="space-y-2">
                  {sortedInteractions.map(interaction => {
                    const days = daysSince(interaction.interaction_date)
                    return (
                      <li
                        key={interaction.id}
                        className="group flex items-start gap-2"
                      >
                        <div className="flex-shrink-0 mt-0.5">
                          <InteractionIcon type={interaction.type} size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-medium text-burnham/80">
                              {INTERACTION_TYPE_LABELS[interaction.type]}
                            </span>
                            <span className="text-[10px] text-shuttle/40">
                              {interaction.direction === 'outbound' ? '→' : '←'}
                            </span>
                            <span className="text-[10px] text-shuttle/40">
                              {days === null ? interaction.interaction_date : formatAgo(days)}
                            </span>
                          </div>
                          {interaction.notes && (
                            <p className="text-[10px] text-shuttle/60 truncate mt-0.5">
                              {interaction.notes}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => deleteInteraction(interaction)}
                          className="opacity-0 group-hover:opacity-100 text-shuttle/30 hover:text-red-400 transition-all flex-shrink-0 mt-0.5"
                          aria-label="Delete interaction"
                        >
                          <Trash size={12} />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* ── 9. Log interaction form ──────────────────────────────────── */}
            {logFormOpen && (
              <div className="px-4 py-3 border-b border-mercury">
                <div className={sectionLabel}>Log interaction</div>
                <div className="space-y-2">
                  {/* Type */}
                  <select
                    value={logType}
                    onChange={e => setLogType(e.target.value as Interaction['type'])}
                    className="w-full text-xs bg-white border border-mercury rounded px-2 py-1.5 text-burnham focus:outline-none"
                  >
                    {(Object.keys(INTERACTION_TYPE_LABELS) as Interaction['type'][]).map(t => (
                      <option key={t} value={t}>{INTERACTION_TYPE_LABELS[t]}</option>
                    ))}
                  </select>

                  {/* Direction toggle */}
                  <div className="flex gap-1">
                    {(['outbound', 'inbound'] as const).map(dir => (
                      <button
                        key={dir}
                        onClick={() => setLogDirection(dir)}
                        className={`flex-1 text-[10px] font-medium py-1 rounded border transition-colors capitalize ${
                          logDirection === dir
                            ? 'bg-burnham text-white border-burnham'
                            : 'bg-white text-shuttle border-mercury hover:border-shuttle/40'
                        }`}
                      >
                        {dir === 'outbound' ? '→ Outbound' : '← Inbound'}
                      </button>
                    ))}
                  </div>

                  {/* Date */}
                  <input
                    type="date"
                    value={logDate}
                    onChange={e => setLogDate(e.target.value)}
                    className="w-full text-xs bg-white border border-mercury rounded px-2 py-1.5 text-burnham focus:outline-none"
                  />

                  {/* Notes */}
                  <textarea
                    value={logNotes}
                    onChange={e => setLogNotes(e.target.value)}
                    rows={2}
                    placeholder="Notes (optional)"
                    className="w-full text-xs bg-white border border-mercury rounded px-2 py-1.5 placeholder-shuttle/30 text-burnham resize-none focus:outline-none"
                  />

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleLogSave}
                      disabled={logSaving}
                      className="flex-1 flex items-center justify-center gap-1 text-[11px] font-medium bg-burnham text-white rounded px-3 py-1.5 hover:bg-burnham/90 disabled:opacity-50 transition-colors"
                    >
                      <Check size={11} weight="bold" />
                      {logSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setLogFormOpen(false)}
                      className="text-[11px] text-shuttle/60 hover:text-shuttle px-3 py-1.5 rounded border border-mercury transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── 10. Notes ────────────────────────────────────────────────── */}
            <div className="px-4 py-3 border-b border-mercury">
              <div className={sectionLabel}>Notes</div>
              <textarea
                ref={notesRef}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                onBlur={saveNotes}
                rows={3}
                placeholder="Any notes about this person…"
                className="w-full text-xs text-burnham/80 bg-mercury/10 border border-mercury rounded-lg p-2 placeholder-shuttle/30 resize-none focus:outline-none focus:border-burnham/30"
              />
            </div>

            {/* ── 11. Attio section ─────────────────────────────────────────── */}
            {attioEligible && (
              <div className="px-4 py-3 border-b border-mercury">
                <div className={sectionLabel}>Attio</div>

                {/* Company domain field */}
                <div className="flex items-center gap-1.5 mb-2">
                  <Globe size={13} className="text-shuttle/40 flex-shrink-0" />
                  <input
                    type="text"
                    value={companyDomain}
                    onChange={e => setCompanyDomain(e.target.value)}
                    onBlur={() => {
                      if (!contact) return
                      onUpdate(contact.id, { company_domain: companyDomain || null })
                    }}
                    placeholder="company.com"
                    className="flex-1 text-xs bg-mercury/10 border border-mercury rounded px-2 py-1 placeholder-shuttle/30 text-burnham focus:outline-none focus:border-burnham/30"
                  />
                  <span className="text-[9px] text-shuttle/40 flex-shrink-0">Domain</span>
                </div>

                {/* Single Sync to Attio button — syncs person + company */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-shuttle/40">
                    {contact.attio_record_id
                      ? `Synced${attioSyncedDays !== null ? ` · ${attioSyncedDays}d ago` : ''}`
                      : 'Not yet synced'}
                  </span>
                  <button
                    onClick={handleSyncAll}
                    disabled={syncing}
                    className="text-[10px] text-burnham/70 hover:text-burnham border border-burnham/20 hover:border-burnham/50 rounded px-2 py-0.5 transition-colors disabled:opacity-40"
                  >
                    {syncing ? 'Syncing…' : attioToast === '✓ Synced' ? '✓ Synced' : 'Sync to Attio'}
                  </button>
                </div>

                {/* Sync error display */}
                {syncErrRaw && (
                  <div className="mt-1.5">
                    <p className="text-xs text-red-500">
                      {syncErrorExpanded ? syncErrRaw : syncErrShort}
                      {syncErrRaw.length > 100 && (
                        <button
                          onClick={() => setSyncErrorExpanded(p => !p)}
                          className="ml-1 text-red-400 underline hover:text-red-600"
                        >
                          {syncErrorExpanded ? 'Collapse' : 'View full error'}
                        </button>
                      )}
                    </p>
                  </div>
                )}

                {/* Toast */}
                {attioToast && (
                  <p className="mt-1.5 text-[11px] text-pastel font-medium">{attioToast}</p>
                )}
              </div>
            )}

            {/* ── 12. AI Enrich ─────────────────────────────────────────────── */}
            {hasGeminiEnrichKey() && (
              <div className="px-4 py-3 border-b border-mercury">
                <div className={sectionLabel}>AI enrichment</div>
                <button
                  onClick={() => handleEnrich()}
                  disabled={enriching}
                  className={`w-full flex items-center justify-center gap-1.5 text-xs font-medium rounded-lg px-3 py-2 transition-colors disabled:opacity-40 ${
                    enrichStatus === 'success'
                      ? 'border border-pastel/40 text-pastel bg-gossip/10'
                      : 'border border-shuttle/20 hover:border-shuttle/50 text-shuttle'
                  }`}
                >
                  {enriching ? (
                    <>
                      <SpinnerGap size={13} className="animate-spin" />
                      Enriching…
                    </>
                  ) : enrichStatus === 'success' ? (
                    <>
                      <Check size={13} weight="bold" className="text-pastel" />
                      Enriched
                    </>
                  ) : (
                    <>
                      <Sparkle size={13} weight="fill" />
                      Enrich with AI
                    </>
                  )}
                </button>
                {contact.ai_enriched_at && enrichStatus !== 'success' && (
                  <p className="mt-1.5 text-[10px] text-shuttle/40 text-center">
                    {formatEnrichedAt(contact.ai_enriched_at)}
                  </p>
                )}
                {enrichError && (
                  <p className="mt-1.5 text-xs text-red-500">{enrichError}</p>
                )}
              </div>
            )}

            {/* ── Footer: delete ────────────────────────────────────────────── */}
            <div className="p-4 border-t border-mercury mt-auto sticky bottom-0 bg-white">
              {/* Save error banner */}
              {saveError && !attioEligible && (
                <p className="mb-2 text-xs text-red-500 text-center">
                  {saveError.length > 120 ? saveError.slice(0, 120) + '…' : saveError}
                </p>
              )}
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-red-500 flex-1">Sure? This is permanent.</span>
                  <button
                    onClick={handleDelete}
                    className="text-[11px] text-white bg-red-500 rounded px-3 py-1.5 hover:bg-red-600 transition-colors"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-[11px] text-shuttle/60 hover:text-shuttle transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-xs text-red-400 hover:text-red-500 transition-colors"
                >
                  Delete person
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
