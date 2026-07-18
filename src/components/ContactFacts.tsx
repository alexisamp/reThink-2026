import { useState } from 'react'
import {
  Plus, PencilSimple, TrashSimple, X, Star,
  UsersThree, Briefcase, CurrencyDollar, Fire, Lightning, Waves,
  Prohibit, FilmSlate, FirstAidKit, Sparkle, NotePencil,
} from '@phosphor-icons/react'
import { useAuth } from '@/hooks/useAuth'
import { useContactFacts, FACT_CATEGORIES, factCategoryIcon, factCategoryLabel } from '@/hooks/useContactFacts'
import type { ContactFact, ContactFactCategory } from '@/types'

/**
 * Displays + captures key facts (Jacob's "ammunition for the Two-Thirds rule").
 * - Top view: all facts sorted by importance, with quick-expire badge if set
 * - Add button opens compact modal
 * - Edit/delete inline
 */
export default function ContactFacts({ contactId }: { contactId: string }) {
  const { user } = useAuth()
  const { facts, addFact, updateFact, deleteFact } = useContactFacts(user?.id, contactId)
  const [editing, setEditing] = useState<ContactFact | null>(null)
  const [creating, setCreating] = useState(false)

  function startCreate() {
    setEditing(null)
    setCreating(true)
  }
  function startEdit(f: ContactFact) {
    setEditing(f)
    setCreating(true)
  }

  // Group by category, then sort by importance within each
  const grouped = facts.reduce<Record<string, ContactFact[]>>((acc, f) => {
    (acc[f.category] = acc[f.category] ?? []).push(f)
    return acc
  }, {})

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-shuttle/60 mb-2 flex items-center justify-between">
        <span>Key facts</span>
        <button
          onClick={startCreate}
          className="flex items-center gap-0.5 text-[10px] text-burnham hover:opacity-70 normal-case tracking-normal"
        >
          <Plus size={10} /> Add fact
        </button>
      </div>

      {facts.length === 0 ? (
        <p className="text-[11px] text-shuttle/50 italic">
          Capture what matters about this person — family, obsessions, life phase — to surprise them in the next conversation.
        </p>
      ) : (
        <div className="space-y-1.5">
          {Object.entries(grouped).map(([category, list]) => (
            <div key={category}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-shuttle/50 mb-1 flex items-center gap-1">
                <FactCategoryIcon category={category as ContactFactCategory} />
                <span>{factCategoryLabel(category as ContactFactCategory)}</span>
              </p>
              <div className="space-y-1 pl-4">
                {list.map(f => (
                  <FactRow key={f.id} fact={f} onEdit={() => startEdit(f)} onDelete={() => {
                    if (confirm('Delete this fact?')) deleteFact(f.id)
                  }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <FactEditorModal
          existing={editing}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSave={async (input) => {
            if (editing) {
              await updateFact(editing.id, input)
            } else {
              await addFact(input)
            }
            setCreating(false)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function FactCategoryIcon({ category }: { category: ContactFactCategory }) {
  const props = { size: 11, className: 'text-shuttle/60 shrink-0' }
  switch (factCategoryIcon(category)) {
    case 'users-three': return <UsersThree {...props} />
    case 'briefcase': return <Briefcase {...props} />
    case 'currency-dollar': return <CurrencyDollar {...props} />
    case 'fire': return <Fire {...props} />
    case 'lightning': return <Lightning {...props} />
    case 'waves': return <Waves {...props} />
    case 'prohibit': return <Prohibit {...props} />
    case 'film-slate': return <FilmSlate {...props} />
    case 'first-aid-kit': return <FirstAidKit {...props} />
    case 'sparkle': return <Sparkle {...props} />
    default: return <NotePencil {...props} />
  }
}

// ─── Fact row ───────────────────────────────────────────────────────────────

function FactRow({ fact, onEdit, onDelete }: { fact: ContactFact; onEdit: () => void; onDelete: () => void }) {
  const isExpiring = fact.expires_at && daysUntil(fact.expires_at) <= 30
  return (
    <div className="flex items-start gap-1.5 group">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: fact.importance }).map((_, i) => (
          <Star key={i} size={8} weight="fill" className="text-burnham" />
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-midnight">
          {fact.label && <span className="font-medium">{fact.label}: </span>}
          {fact.value}
        </p>
        {fact.expires_at && (
          <span className={`text-[10px] ${isExpiring ? 'text-red-600 font-medium' : 'text-shuttle/60'}`}>
            {daysUntil(fact.expires_at) >= 0 ? `in ${daysUntil(fact.expires_at)}d` : `expired ${-daysUntil(fact.expires_at)}d ago`}
          </span>
        )}
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="text-shuttle hover:text-burnham" title="Edit"><PencilSimple size={10} /></button>
        <button onClick={onDelete} className="text-shuttle hover:text-red-600" title="Delete"><TrashSimple size={10} /></button>
      </div>
    </div>
  )
}

function daysUntil(isoDate: string): number {
  return Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86400000)
}

// ─── Fact editor modal ──────────────────────────────────────────────────────

interface FactEditorModalProps {
  existing: ContactFact | null
  onClose: () => void
  onSave: (input: {
    category: ContactFactCategory
    value: string
    label?: string
    importance?: 1 | 2 | 3
    expires_at?: string | null
  }) => void
}

function FactEditorModal({ existing, onClose, onSave }: FactEditorModalProps) {
  const [category, setCategory] = useState<ContactFactCategory>(existing?.category ?? 'family')
  const [label, setLabel] = useState(existing?.label ?? '')
  const [value, setValue] = useState(existing?.value ?? '')
  const [importance, setImportance] = useState<1 | 2 | 3>(existing?.importance ?? 2)
  const [expiresAt, setExpiresAt] = useState(existing?.expires_at ?? '')

  const catMeta = FACT_CATEGORIES.find(c => c.key === category)

  function submit() {
    if (!value.trim()) return
    onSave({
      category,
      value: value.trim(),
      label: label.trim() || undefined,
      importance,
      expires_at: expiresAt || null,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg max-w-md w-full shadow-[var(--shadow-pop)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-mercury">
          <h2 className="text-sm font-semibold text-burnham">
            {existing ? 'Edit fact' : 'Capture fact'}
          </h2>
          <button onClick={onClose} aria-label="Close fact editor" className="text-shuttle hover:text-burnham"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="block text-[11px] text-shuttle mb-1">Category</label>
            <div className="grid grid-cols-3 gap-1">
              {FACT_CATEGORIES.map(c => (
                <button
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] transition-colors ${
                    category === c.key ? 'bg-gossip text-burnham border border-gossip' : 'bg-white text-shuttle border border-mercury hover:border-burnham'
                  }`}
                >
                  <FactCategoryIcon category={c.key} />
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
            {catMeta && <p className="text-[10px] text-shuttle/60 mt-1 italic">{catMeta.hint}</p>}
          </div>

          <div>
            <label className="block text-[11px] text-shuttle mb-1">Label (optional)</label>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Hija, Hijo mayor, Esposa"
              className="w-full text-sm border border-mercury rounded-lg px-2 py-1.5 focus:outline-none focus:border-burnham"
            />
          </div>

          <div>
            <label className="block text-[11px] text-shuttle mb-1">Fact *</label>
            <textarea
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="e.g. Sofía, 6 años, nacida 3/marzo"
              rows={2}
              className="w-full text-sm border border-mercury rounded-lg px-2 py-1.5 focus:outline-none focus:border-burnham resize-none"
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[11px] text-shuttle mb-1">Importance</label>
              <div className="flex gap-1">
                {([1, 2, 3] as const).map(n => (
                  <button
                    key={n}
                    onClick={() => setImportance(n)}
                    className={`flex items-center gap-0.5 px-2 py-1 rounded-lg text-xs transition-colors ${
                      importance === n ? 'bg-burnham text-gossip' : 'bg-mercury/30 text-shuttle hover:bg-mercury/60'
                    }`}
                  >
                    {Array.from({ length: n }).map((_, i) => (
                      <Star key={i} size={10} weight="fill" />
                    ))}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-[11px] text-shuttle mb-1">Expires (optional)</label>
              <input
                type="date"
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
                className="w-full text-xs border border-mercury rounded-lg px-2 py-1.5 focus:outline-none focus:border-burnham"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-mercury">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-shuttle hover:text-burnham">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!value.trim()}
            className="px-4 py-1.5 bg-burnham text-gossip text-sm rounded-lg disabled:opacity-40"
          >
            {existing ? 'Save' : 'Capture'}
          </button>
        </div>
      </div>
    </div>
  )
}
