import { useState, useEffect, useRef } from 'react'
import { X } from '@phosphor-icons/react'
import { searchAttioPersons, hasAttioKey, type AttioPersonResult } from '@/lib/attio'
import type { OutreachLog, OutreachType, OutreachStatus, Goal } from '@/types'
import type { OutreachLogInput } from '@/hooks/useOutreach'

interface OutreachPanelProps {
  open: boolean
  onClose: () => void
  editingLog: OutreachLog | null
  goals: Pick<Goal, 'id' | 'text' | 'alias'>[]
  onSave: (input: OutreachLogInput) => Promise<void>
  syncing: boolean
  onSpawnTodo: (text: string, linkedinUrl: string | null, goalId: string | null) => void
}

const STATUS_OPTIONS: { value: OutreachStatus; label: string }[] = [
  { value: 'CONTACTED',         label: 'Contacted' },
  { value: 'RESPONDED',         label: 'Responded' },
  { value: 'MEETING_SCHEDULED', label: 'Meeting Scheduled' },
  { value: 'MET',               label: 'Met' },
  { value: 'FOLLOWING_UP',      label: 'Following Up' },
  { value: 'CLOSED_WON',        label: 'Closed Won' },
  { value: 'CLOSED_LOST',       label: 'Closed Lost' },
  { value: 'NURTURING',         label: 'Nurturing' },
]

export default function OutreachPanel({
  open,
  onClose,
  editingLog,
  goals,
  onSave,
  syncing,
  onSpawnTodo,
}: OutreachPanelProps) {
  const [name, setName] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [contactType, setContactType] = useState<OutreachType>('networking')
  const [status, setStatus] = useState<OutreachStatus>('CONTACTED')
  const [notes, setNotes] = useState('')
  const [goalId, setGoalId] = useState('')
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState(false)
  const [spawnTodo, setSpawnTodo] = useState(false)
  const [spawnTodoText, setSpawnTodoText] = useState('')

  // Attio search
  const [attioSearchResults, setAttioSearchResults] = useState<AttioPersonResult[]>([])
  const [attioSearching, setAttioSearching] = useState(false)
  const [selectedAttioRecord, setSelectedAttioRecord] = useState<{ record_id: string; full_name: string } | null>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Reset on open
  useEffect(() => {
    if (!open) return
    setName(editingLog?.name ?? '')
    setLinkedinUrl(editingLog?.linkedin_url ?? '')
    setContactType(editingLog?.contact_type ?? 'networking')
    setStatus(editingLog?.status ?? 'CONTACTED')
    setNotes(editingLog?.notes ?? '')
    setGoalId(editingLog?.goal_id ?? '')
    setSaving(false)
    setNameError(false)
    setSpawnTodo(false)
    setSpawnTodoText('')
    setAttioSearchResults([])
    setAttioSearching(false)
    setSelectedAttioRecord(
      editingLog?.attio_record_id
        ? { record_id: editingLog.attio_record_id, full_name: editingLog.name }
        : null
    )
    setTimeout(() => nameInputRef.current?.focus(), 50)
  }, [open, editingLog])

  // Escape key
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  const handleNameChange = (value: string) => {
    setName(value)
    setNameError(false)
    setSelectedAttioRecord(null)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    if (value.length < 2 || !hasAttioKey()) {
      setAttioSearchResults([])
      return
    }
    setAttioSearching(true)
    searchDebounceRef.current = setTimeout(async () => {
      const results = await searchAttioPersons(value)
      setAttioSearchResults(results)
      setAttioSearching(false)
    }, 400)
  }

  const selectAttioResult = (result: AttioPersonResult) => {
    setName(result.full_name)
    setLinkedinUrl(result.linkedin_url ?? '')
    setSelectedAttioRecord({ record_id: result.record_id, full_name: result.full_name })
    setAttioSearchResults([])
  }

  const handleSave = async () => {
    if (!name.trim()) { setNameError(true); return }
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        linkedin_url: linkedinUrl.trim() || null,
        contact_type: contactType,
        status,
        notes: notes.trim() || null,
        goal_id: goalId || null,
        existing_attio_record_id: selectedAttioRecord?.record_id,
      })
      if (spawnTodo && spawnTodoText.trim()) {
        onSpawnTodo(spawnTodoText.trim(), linkedinUrl.trim() || null, goalId || null)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[199] bg-black/10"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-[200] w-80 bg-white border-l border-mercury shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-mercury shrink-0">
          <h2 className="text-sm font-semibold text-burnham">
            {editingLog ? editingLog.name : 'Log contact'}
          </h2>
          <button onClick={onClose} className="text-shuttle/40 hover:text-shuttle transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Name */}
          <div className="relative">
            <label className="text-[10px] uppercase tracking-wide text-shuttle/50 font-medium block mb-1">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="Full name"
              className={`w-full text-sm text-burnham border rounded-lg px-3 py-2 focus:outline-none focus:border-burnham transition-colors ${
                nameError ? 'border-red-300' : 'border-mercury'
              }`}
            />
            {nameError && (
              <p className="text-[10px] text-red-400 mt-0.5">Name is required</p>
            )}

            {/* Attio search results dropdown */}
            {(attioSearching || attioSearchResults.length > 0) && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-mercury rounded-lg shadow-lg z-10 overflow-hidden">
                {attioSearching && (
                  <div className="px-3 py-2 text-[11px] text-shuttle/40 flex items-center gap-2">
                    <div className="w-3 h-3 border border-shuttle/30 border-t-transparent rounded-full animate-spin" />
                    Searching Attio…
                  </div>
                )}
                {attioSearchResults.map(result => (
                  <button
                    key={result.record_id}
                    onClick={() => selectAttioResult(result)}
                    className="w-full text-left px-3 py-2 text-sm text-burnham hover:bg-gossip/30 transition-colors flex items-center justify-between gap-2"
                  >
                    <span className="font-medium truncate">{result.full_name}</span>
                    {result.linkedin_url && (
                      <span className="text-[9px] font-mono text-shuttle/40 shrink-0">linkedin</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Attio linked pill */}
            {selectedAttioRecord && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="text-[9px] bg-gossip text-burnham rounded px-2 py-0.5 font-mono">
                  Linked to Attio · {selectedAttioRecord.full_name}
                </span>
                <button
                  onClick={() => setSelectedAttioRecord(null)}
                  className="text-shuttle/40 hover:text-shuttle transition-colors"
                >
                  <X size={10} />
                </button>
              </div>
            )}
          </div>

          {/* LinkedIn URL */}
          <div>
            <label className="text-[10px] uppercase tracking-wide text-shuttle/50 font-medium block mb-1">
              LinkedIn URL
            </label>
            <input
              type="text"
              value={linkedinUrl}
              onChange={e => setLinkedinUrl(e.target.value)}
              placeholder="linkedin.com/in/…"
              className="w-full text-sm text-burnham border border-mercury rounded-lg px-3 py-2 focus:outline-none focus:border-burnham transition-colors"
            />
          </div>

          {/* Type toggle */}
          <div>
            <label className="text-[10px] uppercase tracking-wide text-shuttle/50 font-medium block mb-1.5">
              Type
            </label>
            <div className="flex gap-2">
              {(['networking', 'prospecting'] as OutreachType[]).map(t => (
                <button
                  key={t}
                  onClick={() => setContactType(t)}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    contactType === t
                      ? t === 'networking'
                        ? 'bg-burnham text-white'
                        : 'bg-shuttle text-white'
                      : 'bg-mercury/30 text-shuttle hover:bg-mercury/50'
                  }`}
                >
                  {t === 'networking' ? 'Networking' : 'Prospecting'}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="text-[10px] uppercase tracking-wide text-shuttle/50 font-medium block mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as OutreachStatus)}
              className="w-full text-sm text-burnham border border-mercury rounded-lg px-3 py-2 focus:outline-none focus:border-burnham transition-colors bg-white"
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Goal */}
          <div>
            <label className="text-[10px] uppercase tracking-wide text-shuttle/50 font-medium block mb-1">
              Goal
            </label>
            <select
              value={goalId}
              onChange={e => setGoalId(e.target.value)}
              className="w-full text-sm text-burnham border border-mercury rounded-lg px-3 py-2 focus:outline-none focus:border-burnham transition-colors bg-white"
            >
              <option value="">No goal linked</option>
              {goals.map(g => (
                <option key={g.id} value={g.id}>{g.alias ?? g.text?.slice(0, 40)}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] uppercase tracking-wide text-shuttle/50 font-medium block mb-1">
              Notes
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Notes about the conversation…"
              className="w-full text-sm text-burnham border border-mercury rounded-lg px-3 py-2 focus:outline-none focus:border-burnham transition-colors resize-none"
            />
          </div>

          {/* Spawn todo */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={spawnTodo}
                onChange={e => setSpawnTodo(e.target.checked)}
                className="rounded border-mercury text-burnham"
              />
              <span className="text-[11px] text-shuttle/60">Create a todo from this contact</span>
            </label>
            {spawnTodo && (
              <input
                type="text"
                value={spawnTodoText}
                onChange={e => setSpawnTodoText(e.target.value)}
                placeholder="What do you need to do?"
                className="mt-2 w-full text-sm text-burnham border border-mercury rounded-lg px-3 py-2 focus:outline-none focus:border-burnham transition-colors"
                autoFocus
              />
            )}
          </div>

          {/* Attio sync status for existing synced records */}
          {editingLog?.attio_synced_at && (
            <p className="text-[9px] text-shuttle/30 font-mono">
              Synced to Attio · {new Date(editingLog.attio_synced_at).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-mercury flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-sm font-medium text-shuttle/60 hover:text-shuttle transition-colors"
          >
            Cancel
          </button>
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-burnham text-white text-sm font-medium rounded-lg hover:bg-burnham/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {syncing && !editingLog && (
              <p className="text-[9px] text-shuttle/40 font-mono">Syncing to Attio…</p>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
