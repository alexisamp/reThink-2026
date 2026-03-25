import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import type { CurrentContact } from '../App'
import { SidebarHeader } from '../App'
import { DailyProgress } from '../components/DailyProgress'
import { supabase } from '../../lib/supabase'

// ===== TYPES =====

interface Milestone {
  id: string
  type: string
  label: string
  date_mm_dd: string | null
  date_full: string | null
  show_days_before: number
  notes: string | null
}

interface Todo {
  id: string
  text: string
  date: string | null
  completed: boolean
}

interface ContactLink {
  url: string
  label: string
  type?: string
  created_at?: string
}

interface Props {
  contact: CurrentContact
  user: User
  onSignOut: () => void
}

// ===== HELPERS =====

const STATUSES = ['PROSPECT', 'INTRO', 'CONNECTED', 'RECONNECT', 'ENGAGED', 'NURTURING', 'DORMANT']

const SECTION_HEADING: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  color: '#536471',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '8px',
}

const CARD: React.CSSProperties = {
  padding: '12px',
  background: '#F8FAF8',
  borderRadius: '10px',
  marginBottom: '10px',
}

function milestoneEmoji(type: string): string {
  if (type === 'birthday_contact') return '🎂'
  if (type === 'birthday_child') return '👶'
  if (type === 'birthday_partner') return '💑'
  if (type.startsWith('anniversary')) return '🎉'
  return '⭐'
}

function formatMmDd(mmdd: string | null): string {
  if (!mmdd) return ''
  const [m, d] = mmdd.split('-')
  const date = new Date(2000, parseInt(m) - 1, parseInt(d))
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function daysUntilMmDd(mmdd: string): number {
  const today = new Date()
  const [m, d] = mmdd.split('-').map(Number)
  const target = new Date(today.getFullYear(), m - 1, d)
  const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (target < todayNorm) target.setFullYear(today.getFullYear() + 1)
  return Math.round((target.getTime() - todayNorm.getTime()) / 86400000)
}

function formatTodoDate(dateStr: string | null): { text: string; overdue: boolean } {
  if (!dateStr) return { text: '', overdue: false }
  const today = new Date()
  const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const due = new Date(dateStr + 'T00:00:00')
  const diff = Math.round((due.getTime() - todayNorm.getTime()) / 86400000)
  if (diff < 0) return { text: 'overdue', overdue: true }
  if (diff === 0) return { text: 'today', overdue: false }
  return {
    text: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    overdue: false,
  }
}

function formatLastInteraction(ts: string | null | undefined): string {
  if (!ts) return 'No interactions yet'
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

function isSlugName(name: string | null | undefined): boolean {
  if (!name) return false
  if (!name.includes(' ') && (
    /[a-z][A-Z]/.test(name) ||
    /^[a-z0-9-]+$/.test(name)
  )) return true
  return false
}


function formatDatePrefix(): string {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ===== MAIN SCREEN =====

export function WhatsAppMappedScreen({ contact, user, onSignOut }: Props) {
  const [interactionCount, setInteractionCount] = useState<number>(0)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillResult, setBackfillResult] = useState<{ found: number; created: number } | null>(null)

  // SmartBanner
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [bannerText, setBannerText] = useState<string | null>(null)

  // Name editing
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(contact.name ?? '')
  const [nameSaving, setNameSaving] = useState(false)

  // Personal context
  const [contextValue, setContextValue] = useState(contact.personalContext ?? '')
  const [contextOriginal, setContextOriginal] = useState(contact.personalContext ?? '')
  const [contextSaved, setContextSaved] = useState(false)

  // Headline (first line of personal_context, editable inline)
  const firstContextLine = (contact.personalContext ?? '').split('\n')[0].slice(0, 80)
  const [headlineEditing, setHeadlineEditing] = useState(false)
  const [headlineValue, setHeadlineValue] = useState(firstContextLine)
  const [headlineSaving, setHeadlineSaving] = useState(false)

  // Status
  const [currentStatus, setCurrentStatus] = useState(contact.status ?? '')
  const [statusSaving, setStatusSaving] = useState(false)

  // Milestones
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [showMilestoneForm, setShowMilestoneForm] = useState(false)
  const [mType, setMType] = useState('birthday_contact')
  const [mLabel, setMLabel] = useState('')
  const [mDateMmDd, setMDateMmDd] = useState('')
  const [mDateFull, setMDateFull] = useState('')
  const [mIsAnnual, setMIsAnnual] = useState(true)
  const [mShowBefore, setMShowBefore] = useState(7)
  const [mSaving, setMSaving] = useState(false)

  // Todos
  const [todos, setTodos] = useState<Todo[]>([])
  const [showTodoForm, setShowTodoForm] = useState(false)
  const [todoText, setTodoText] = useState('')
  const [todoDate, setTodoDate] = useState('')
  const [todoSaving, setTodoSaving] = useState(false)

  // Links
  const [links, setLinks] = useState<ContactLink[]>(contact.links ?? [])
  const [showLinkForm, setShowLinkForm] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkLabel, setLinkLabel] = useState('')
  const [linkType, setLinkType] = useState('Resource')
  const [linkSaving, setLinkSaving] = useState(false)

  // Quick note
  const [quickNote, setQuickNote] = useState('')
  const [noteSaved, setNoteSaved] = useState(false)

  // Interaction logging
  const [logTarget, setLogTarget] = useState<string | null>(null)
  const [logNote, setLogNote] = useState('')
  const [logSaving, setLogSaving] = useState(false)
  const [logToast, setLogToast] = useState(false)

  // Open in reThink
  const [openingReThink, setOpeningReThink] = useState(false)

  // Import meeting notes
  const [showImportNotes, setShowImportNotes] = useState(false)
  const [importNotesText, setImportNotesText] = useState('')
  const [importNotesDate, setImportNotesDate] = useState(new Date().toISOString().split('T')[0])
  const [importAnalyzing, setImportAnalyzing] = useState(false)
  const [importSuggestions, setImportSuggestions] = useState<{
    milestones: Array<{ type: string; label: string; isAnnual: boolean; date_mm_dd?: string; date_full?: string; show_days_before: number; notes?: string }>
    context_bullets: string[]
    interaction_type: 'in_person' | 'virtual_coffee'
    meeting_summary: string
  } | null>(null)
  const [checkedMilestones, setCheckedMilestones] = useState<boolean[]>([])
  const [checkedContext, setCheckedContext] = useState<boolean[]>([])
  const [importSaving, setImportSaving] = useState(false)

  useEffect(() => {
    if (!contact.reThinkId) return
    loadInteractionCount()
    loadMilestones()
    loadTodos()
    checkSmartBanner()
    // Pre-fill link URL from current tab
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]?.url) setLinkUrl(tabs[0].url)
    })
  }, [contact.reThinkId])

  async function loadInteractionCount() {
    const { count } = await supabase
      .from('interactions')
      .select('id', { count: 'exact', head: true })
      .eq('contact_id', contact.reThinkId!)
    setInteractionCount(count ?? 0)
  }

  async function loadMilestones() {
    const { data } = await supabase
      .from('contact_milestones')
      .select('id, type, label, date_mm_dd, date_full, show_days_before, notes')
      .eq('contact_id', contact.reThinkId!)
      .order('date_mm_dd', { ascending: true })
    setMilestones((data ?? []) as Milestone[])
  }

  async function loadTodos() {
    const { data } = await supabase
      .from('todos')
      .select('id, text, date, completed')
      .eq('outreach_log_id', contact.reThinkId!)
      .eq('completed', false)
      .order('date', { ascending: true })
    setTodos((data ?? []) as Todo[])
  }

  async function checkSmartBanner() {
    if (!contact.reThinkId) return

    // Check birthday field on contact
    if (contact.birthday) {
      const days = daysUntilMmDd(contact.birthday)
      if (days <= 7) {
        setBannerText(days === 0 ? `🎂 It's ${contact.name?.split(' ')[0]}'s birthday today!` : `🎂 ${contact.name?.split(' ')[0]}'s birthday in ${days} day${days === 1 ? '' : 's'}`)
        return
      }
    }

    // Check milestones
    const { data } = await supabase
      .from('contact_milestones')
      .select('type, label, date_mm_dd, show_days_before')
      .eq('contact_id', contact.reThinkId!)
      .not('date_mm_dd', 'is', null)
    if (data) {
      for (const m of data) {
        if (!m.date_mm_dd) continue
        const days = daysUntilMmDd(m.date_mm_dd)
        const threshold = m.show_days_before ?? 7
        if (days <= threshold) {
          const emoji = milestoneEmoji(m.type)
          setBannerText(days === 0 ? `${emoji} ${m.label} — today!` : `${emoji} ${m.label} in ${days} day${days === 1 ? '' : 's'}`)
          return
        }
      }
    }
  }

  async function handleBackfill() {
    if (!contact.phone || backfilling) return
    setBackfilling(true)
    setBackfillResult(null)
    try {
      const result: any = await chrome.runtime.sendMessage({
        type: 'BACKFILL_WHATSAPP_HISTORY',
        phone: contact.phone,
      })
      if (result?.success) {
        setBackfillResult({ found: result.found, created: result.created })
        if (result.created > 0) {
          setInteractionCount(prev => prev + result.created)
        }
      }
    } catch {
      // ignore
    } finally {
      setBackfilling(false)
    }
  }

  async function handleSaveName() {
    if (!nameValue.trim() || !contact.reThinkId) return
    setNameSaving(true)
    try {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_CONTACT_NAME',
        contactId: contact.reThinkId,
        name: nameValue.trim(),
      })
      setEditingName(false)
    } catch {
      // ignore
    } finally {
      setNameSaving(false)
    }
  }

  async function handleContextBlur() {
    if (contextValue === contextOriginal || !contact.reThinkId) return
    try {
      await chrome.runtime.sendMessage({
        type: 'APPEND_CONTACT_NOTE',
        contactId: contact.reThinkId,
        note: contextValue,
        replace: true,
      })
      setContextOriginal(contextValue)
      setContextSaved(true)
      setTimeout(() => setContextSaved(false), 2000)
    } catch {
      // ignore
    }
  }

  async function handleHeadlineSave() {
    if (!contact.reThinkId) return
    setHeadlineSaving(true)
    try {
      // Replace the first line of personal_context with the new headline value
      const existing = contact.personalContext ?? ''
      const lines = existing.split('\n')
      lines[0] = headlineValue.trim()
      const updated = lines.join('\n').trim()
      await supabase.from('outreach_logs').update({ personal_context: updated }).eq('id', contact.reThinkId)
      setContextValue(updated)
      setContextOriginal(updated)
    } catch {
      // ignore
    } finally {
      setHeadlineSaving(false)
      setHeadlineEditing(false)
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!contact.reThinkId) return
    setStatusSaving(true)
    try {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_CONTACT_STATUS',
        contactId: contact.reThinkId,
        status: newStatus,
      })
      setCurrentStatus(newStatus)
    } catch {
      // ignore
    } finally {
      setStatusSaving(false)
    }
  }

  async function handleLogInteraction(type: string) {
    if (!contact.reThinkId) return
    setLogSaving(true)
    try {
      const result: any = await chrome.runtime.sendMessage({
        type: 'QUICK_LOG_INTERACTION',
        contactId: contact.reThinkId,
        interactionType: type,
        notes: logNote.trim() || null,
      })
      if (result?.success) {
        setLogToast(true)
        setLogTarget(null)
        setLogNote('')
        setInteractionCount(prev => prev + 1)
        setTimeout(() => setLogToast(false), 2000)
        // F14: if PROSPECT, auto-upgrade to INTRO on first interaction
        if (currentStatus === 'PROSPECT' && contact.reThinkId) {
          await supabase.from('outreach_logs').update({ status: 'INTRO' }).eq('id', contact.reThinkId)
          setCurrentStatus('INTRO')
        }
      }
    } catch {
      // ignore
    } finally {
      setLogSaving(false)
    }
  }

  async function handleAddMilestone() {
    if (!contact.reThinkId || mSaving) return
    // Require label and at least one date field
    const finalLabel = mLabel.trim() || (
      mType === 'birthday_contact' ? 'Birthday' :
      mType === 'birthday_child' ? "Child's birthday" :
      mType === 'birthday_partner' ? "Partner's birthday" :
      mType === 'anniversary' ? 'Anniversary' :
      mType === 'anniversary_work' ? 'Work anniversary' : 'Milestone'
    )
    setMSaving(true)
    try {
      const insertData: any = {
        user_id: user.id,
        contact_id: contact.reThinkId,
        type: mType,
        label: finalLabel,
        show_days_before: mShowBefore,
      }
      if (mIsAnnual && mDateMmDd) {
        insertData.date_mm_dd = mDateMmDd
      } else if (!mIsAnnual && mDateFull) {
        insertData.date_full = mDateFull
        // Also store mm-dd
        const parts = mDateFull.split('-')
        insertData.date_mm_dd = `${parts[1]}-${parts[2]}`
      }
      await supabase.from('contact_milestones').insert(insertData)
      setShowMilestoneForm(false)
      setMType('birthday_contact'); setMLabel(''); setMDateMmDd(''); setMDateFull(''); setMShowBefore(7)
      loadMilestones()
    } catch {
      // ignore
    } finally {
      setMSaving(false)
    }
  }

  async function handleCompleteTodo(todoId: string) {
    await supabase.from('todos').update({ completed: true }).eq('id', todoId)
    setTodos(prev => prev.filter(t => t.id !== todoId))
  }

  async function handleAddTodo() {
    if (!todoText.trim() || !todoDate || !contact.reThinkId) return
    setTodoSaving(true)
    try {
      const { data, error } = await supabase.from('todos').insert({
        user_id: user.id,
        text: todoText.trim(),
        date: todoDate,
        outreach_log_id: contact.reThinkId,
        completed: false,
      }).select().single()
      if (error) throw error
      setTodos(prev => [...prev, data as Todo].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')))
      setTodoText(''); setTodoDate(''); setShowTodoForm(false)
    } catch {
      // ignore
    } finally {
      setTodoSaving(false)
    }
  }

  async function handleAddLink() {
    if (!linkUrl.trim() || !linkLabel.trim() || !contact.reThinkId) return
    setLinkSaving(true)
    try {
      const result: any = await chrome.runtime.sendMessage({
        type: 'ADD_CONTACT_LINK',
        contactId: contact.reThinkId,
        url: linkUrl.trim(),
        label: linkLabel.trim(),
        linkType,
      })
      if (result?.success && result.links) {
        setLinks(result.links)
      } else {
        // Optimistic update
        setLinks(prev => [...prev, { url: linkUrl.trim(), label: linkLabel.trim(), type: linkType, created_at: new Date().toISOString() }])
      }
      setLinkUrl(''); setLinkLabel(''); setLinkType('Resource'); setShowLinkForm(false)
    } catch {
      // ignore
    } finally {
      setLinkSaving(false)
    }
  }

  async function handleRemoveLink(url: string) {
    if (!contact.reThinkId) return
    try {
      const result: any = await chrome.runtime.sendMessage({
        type: 'REMOVE_CONTACT_LINK',
        contactId: contact.reThinkId,
        url,
      })
      if (result?.success && result.links) {
        setLinks(result.links)
      } else {
        setLinks(prev => prev.filter(l => l.url !== url))
      }
    } catch {
      // ignore
    }
  }

  async function handleQuickNote() {
    if (!quickNote.trim() || !contact.reThinkId) return
    const dated = `[${formatDatePrefix()}] ${quickNote.trim()}`
    try {
      await chrome.runtime.sendMessage({
        type: 'APPEND_CONTACT_NOTE',
        contactId: contact.reThinkId,
        note: dated,
      })
      setQuickNote('')
      setNoteSaved(true)
      setTimeout(() => setNoteSaved(false), 2000)
    } catch {
      // ignore
    }
  }

  async function handleOpenInReThink() {
    if (!contact.reThinkId) return
    setOpeningReThink(true)
    try {
      await chrome.runtime.sendMessage({
        type: 'OPEN_IN_RETHINK',
        contactId: contact.reThinkId,
      })
    } catch {
      // ignore
    }
    setTimeout(() => setOpeningReThink(false), 2000)
  }

  async function handleAnalyzeMeetingNotes() {
    if (!importNotesText.trim() || !contact.reThinkId) return
    setImportAnalyzing(true)
    setImportSuggestions(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('https://amvezbymrnvrwcypivkf.supabase.co/functions/v1/analyze-meeting-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtdmV6Ynltcm52cndjeXBpdmtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTIxNTgsImV4cCI6MjA4NDU4ODE1OH0.6qgaygMynKaKYB9TlcJAlyLMt87wc7D8PbA5ZeDGDUg',
        },
        body: JSON.stringify({
          contact_name: contact.name,
          notes: importNotesText.trim(),
          meeting_date: importNotesDate,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setImportSuggestions(data)
        setCheckedMilestones((data.milestones ?? []).map(() => true))
        setCheckedContext((data.context_bullets ?? []).map(() => true))
      }
    } catch (e) {
      console.error('analyze-meeting-notes error', e)
    }
    setImportAnalyzing(false)
  }

  async function handleImportNotesSave() {
    if (!importSuggestions || !contact.reThinkId) return
    setImportSaving(true)

    // Get user_id from auth
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const userId = authUser?.id

    // Save checked milestones
    const selectedMilestones = importSuggestions.milestones.filter((_, i) => checkedMilestones[i])
    for (const m of selectedMilestones) {
      const payload: Record<string, unknown> = {
        user_id: userId,
        contact_id: contact.reThinkId,
        type: m.type,
        label: m.label,
        show_days_before: m.show_days_before ?? 7,
        notes: m.notes ?? null,
      }
      if (m.isAnnual) payload.date_mm_dd = m.date_mm_dd ?? null
      else payload.date_full = m.date_full ?? null
      await supabase.from('contact_milestones').insert(payload)
    }

    // Append context bullets to personal_context
    const selectedContext = importSuggestions.context_bullets.filter((_, i) => checkedContext[i])
    if (selectedContext.length > 0) {
      const existing = contact.personalContext?.trim() ?? ''
      const updated = existing ? existing + '\n\n' + selectedContext.join('\n') : selectedContext.join('\n')
      await supabase.from('outreach_logs').update({ personal_context: updated }).eq('id', contact.reThinkId)
    }

    // Log the interaction
    chrome.runtime.sendMessage({
      type: 'QUICK_LOG_INTERACTION',
      payload: {
        contactId: contact.reThinkId,
        interactionType: importSuggestions.interaction_type ?? 'virtual_coffee',
        date: importNotesDate,
        notes: importSuggestions.meeting_summary ?? null,
        category: contact.category,
      }
    })

    // Reload milestones if any were added
    if (selectedMilestones.length > 0) {
      loadMilestones()
    }

    // Reset
    setShowImportNotes(false)
    setImportNotesText('')
    setImportSuggestions(null)
    setCheckedMilestones([])
    setCheckedContext([])
    setImportSaving(false)
  }

  const score = contact.healthScore ?? 0
  const scoreColor = score >= 7 ? '#79D65E' : score >= 4 ? '#F59E0B' : '#EF4444'
  const nameIsSlug = isSlugName(contact.name)
  const lastSeen = formatLastInteraction(contact.lastInteractionAt)

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: '13px',
    border: '1px solid #E5E7EB', borderRadius: '6px', outline: 'none',
    color: '#003720', fontFamily: 'inherit', background: 'white',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ padding: '14px 16px 24px', background: 'white', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <SidebarHeader onSignOut={onSignOut} />

      {/* SmartBanner */}
      {bannerText && !bannerDismissed && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#E5F9BD', borderRadius: '10px', padding: '10px 12px', marginBottom: '10px' }}>
          <span style={{ fontSize: '13px', color: '#003720', fontWeight: 500 }}>{bannerText}</span>
          <button onClick={() => setBannerDismissed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#536471', fontSize: '16px', lineHeight: 1, padding: '0 0 0 8px' }}>×</button>
        </div>
      )}

      {/* Contact Header */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '12px' }}>
        <AvatarWithDot name={contact.name} photoUrl={contact.profilePhotoUrl} size={52} score={score} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingName ? (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '2px' }}>
              <input
                type="text"
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                onBlur={handleSaveName}
                style={{ fontSize: '15px', fontWeight: 700, color: '#003720', border: 'none', borderBottom: '2px solid #79D65E', outline: 'none', padding: '0 2px', background: 'transparent', fontFamily: 'inherit', width: '100%' }}
              />
              {nameSaving && <span style={{ fontSize: '11px', color: '#536471' }}>...</span>}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
              <p style={{ fontSize: '15px', fontWeight: 700, color: '#003720', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {nameValue || contact.name || 'Unknown'}
              </p>
              {nameIsSlug && (
                <button onClick={() => setEditingName(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: '13px', color: '#536471' }} title="Edit name">
                  ✏️
                </button>
              )}
            </div>
          )}
          {/* F02: Last interaction below name */}
          <p style={{ fontSize: '10px', color: '#536471', margin: '0 0 3px 0' }}>{lastSeen}</p>
          {/* F02: Headline — first line of personal_context, editable */}
          {headlineEditing ? (
            <input
              type="text"
              value={headlineValue}
              onChange={e => setHeadlineValue(e.target.value)}
              onBlur={handleHeadlineSave}
              onKeyDown={e => { if (e.key === 'Enter') handleHeadlineSave(); if (e.key === 'Escape') setHeadlineEditing(false) }}
              autoFocus
              maxLength={80}
              placeholder="Add context about this person…"
              style={{ fontSize: '11px', fontStyle: 'italic', color: '#536471', border: 'none', borderBottom: '1px solid #E5E7EB', outline: 'none', padding: '0', background: 'transparent', fontFamily: 'inherit', width: '100%', marginBottom: '4px' }}
            />
          ) : (
            <p
              onClick={() => setHeadlineEditing(true)}
              style={{ fontSize: '11px', fontStyle: 'italic', color: '#536471', margin: '0 0 4px 0', cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {headlineValue || (headlineSaving ? '...' : 'Add context about this person…')}
            </p>
          )}
          {(contact.jobTitle || contact.company) && (
            <p style={{ fontSize: '12px', color: '#536471', margin: '0 0 4px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {[contact.jobTitle, contact.company].filter(Boolean).join(' · ')}
            </p>
          )}
          {/* F02: Score with color + category pill (NO StatusPill here — BUG04) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {currentStatus === 'PROSPECT' && (!contact.healthScore || contact.healthScore === 0) ? (
              <span style={{ fontSize: '11px', color: '#94A3B8', fontStyle: 'italic' }}>No interactions yet</span>
            ) : (
              <span style={{ fontSize: '12px', fontWeight: 600, color: scoreColor }}>{score}</span>
            )}
            {contact.category && (
              <span style={{ background: '#E5E7EB', color: '#536471', borderRadius: '100px', padding: '2px 8px', fontSize: '11px' }}>
                {contact.category}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Personal Context */}
      <div style={{ ...CARD, marginBottom: '10px' }}>
        <p style={SECTION_HEADING}>Context</p>
        <div style={{ position: 'relative' }}>
          <textarea
            value={contextValue}
            onChange={e => setContextValue(e.target.value)}
            onBlur={handleContextBlur}
            placeholder="Who is this person to you? What's the opportunity? What do you know about them?"
            rows={3}
            style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '13px', color: '#003720', fontFamily: 'inherit', resize: 'vertical', outline: 'none', lineHeight: 1.5, boxSizing: 'border-box' }}
          />
          {contextSaved && <span style={{ fontSize: '11px', color: '#79D65E', position: 'absolute', bottom: '2px', right: '4px' }}>✓ Saved</span>}
        </div>
      </div>

      {/* Quick Actions Rail */}
      <div style={{ ...CARD }}>
        <p style={SECTION_HEADING}>Log interaction</p>
        <div style={{ display: 'flex', gap: '8px', marginBottom: logTarget ? '10px' : '0' }}>
          {[
            { type: 'whatsapp', icon: <img src="/whatsapp.png" alt="WhatsApp" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />, label: 'WA' },
            { type: 'linkedin_msg', icon: <img src="/linkedin.jpg" alt="LinkedIn" style={{ width: '20px', height: '20px', objectFit: 'contain', borderRadius: '3px' }} />, label: 'LI' },
            { type: 'call', icon: <span style={{ fontSize: '18px' }}>📞</span>, label: 'Call' },
            { type: 'in_person', icon: <span style={{ fontSize: '18px' }}>🤝</span>, label: 'Met' },
            { type: 'email', icon: <span style={{ fontSize: '18px' }}>✉️</span>, label: 'Email' },
          ].map(item => (
            <button
              key={item.type}
              onClick={() => setLogTarget(logTarget === item.type ? null : item.type)}
              title={item.label}
              style={{
                width: '40px', height: '40px', borderRadius: '10px',
                border: `1px solid ${logTarget === item.type ? '#003720' : '#E5E7EB'}`,
                background: logTarget === item.type ? '#E5F9BD' : 'white',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {item.icon}
            </button>
          ))}
        </div>
        {logTarget && (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              type="text"
              value={logNote}
              onChange={e => setLogNote(e.target.value)}
              placeholder="Optional note..."
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleLogInteraction(logTarget!)}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={() => handleLogInteraction(logTarget!)}
              disabled={logSaving}
              style={{ padding: '7px 12px', borderRadius: '6px', background: '#003720', color: 'white', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap' }}
            >
              {logSaving ? '...' : 'Log'}
            </button>
            <button onClick={() => { setLogTarget(null); setLogNote('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#536471', fontSize: '18px', lineHeight: 1 }}>×</button>
          </div>
        )}
        {logToast && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#003720', fontWeight: 500 }}>✓ Logged</div>
        )}
      </div>

      {/* Rescan button */}
      <button
        onClick={handleBackfill}
        disabled={backfilling}
        style={{
          width: '100%', padding: '9px 12px', marginBottom: '10px',
          background: backfilling ? '#F0F0F0' : 'white',
          color: '#536471',
          border: '1px dashed #D0D8D0', borderRadius: '8px',
          fontSize: '11px', fontWeight: 500,
          cursor: backfilling ? 'wait' : 'pointer', textAlign: 'center',
        }}
      >
        {backfilling ? 'Scanning…' : 'Rescan chat history ⏪'}
      </button>
      {backfillResult && (
        <div style={{ padding: '8px 12px', background: '#F0FAF0', borderRadius: '8px', marginBottom: '10px', fontSize: '12px', color: '#003720' }}>
          {backfillResult.found === 0
            ? 'No messages found — scroll up in the chat and try again'
            : `Found ${backfillResult.found} messages → added ${backfillResult.created} session${backfillResult.created !== 1 ? 's' : ''} to history`}
        </div>
      )}

      {/* Status — BUG04: StatusPill lives here in scrollable content, not in header */}
      <div style={{ ...CARD }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <p style={{ ...SECTION_HEADING, marginBottom: 0 }}>Status</p>
          {currentStatus && <StatusPill status={currentStatus} />}
        </div>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => !statusSaving && handleStatusChange(s)}
              style={{
                padding: '4px 10px', borderRadius: '100px', fontSize: '11px', fontWeight: 500,
                border: '1px solid',
                borderColor: currentStatus === s ? '#003720' : '#E5E7EB',
                background: currentStatus === s ? '#003720' : 'white',
                color: currentStatus === s ? 'white' : '#536471',
                cursor: statusSaving ? 'not-allowed' : 'pointer',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Import Meeting Notes */}
      <div style={{ ...CARD }}>
        <div
          onClick={() => setShowImportNotes(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: '13px' }}>📋</span>
          <span style={{ fontSize: '12px', color: '#536471', fontWeight: 500 }}>Import meeting notes</span>
          <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#536471' }}>{showImportNotes ? '▲' : '▼'}</span>
        </div>

        {showImportNotes && !importSuggestions && (
          <div style={{ paddingTop: '10px' }}>
            <textarea
              value={importNotesText}
              onChange={e => setImportNotesText(e.target.value)}
              placeholder="Paste Granola or meeting notes..."
              rows={5}
              style={{
                width: '100%', boxSizing: 'border-box',
                fontSize: '12px', padding: '8px 10px',
                border: '1px solid #E3E3E3', borderRadius: '8px',
                color: '#003720', background: '#f9f9f9',
                resize: 'none', outline: 'none', fontFamily: 'inherit'
              }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
              <input
                type="date"
                value={importNotesDate}
                onChange={e => setImportNotesDate(e.target.value)}
                style={{
                  flex: 1, fontSize: '11px', padding: '6px 8px',
                  border: '1px solid #E3E3E3', borderRadius: '6px',
                  color: '#003720', outline: 'none'
                }}
              />
              <button
                onClick={handleAnalyzeMeetingNotes}
                disabled={importAnalyzing || !importNotesText.trim()}
                style={{
                  flex: 1, fontSize: '11px', fontWeight: 600,
                  padding: '7px 10px', borderRadius: '8px',
                  background: importAnalyzing || !importNotesText.trim() ? '#E3E3E3' : '#003720',
                  color: importAnalyzing || !importNotesText.trim() ? '#536471' : 'white',
                  border: 'none', cursor: importAnalyzing || !importNotesText.trim() ? 'default' : 'pointer'
                }}
              >
                {importAnalyzing ? 'Analyzing…' : '✨ Analyze'}
              </button>
            </div>
          </div>
        )}

        {showImportNotes && importSuggestions && (
          <div style={{ paddingTop: '10px' }}>
            {importSuggestions.meeting_summary && (
              <div style={{ background: '#E5F9BD', borderRadius: '8px', padding: '8px 10px', marginBottom: '10px' }}>
                <p style={{ fontSize: '10px', color: '#536471', margin: '0 0 3px', textTransform: 'uppercase', fontWeight: 600 }}>Summary</p>
                <p style={{ fontSize: '11px', color: '#003720', margin: 0 }}>{importSuggestions.meeting_summary}</p>
              </div>
            )}

            {importSuggestions.milestones.length > 0 && (
              <div style={{ marginBottom: '10px' }}>
                <p style={{ fontSize: '10px', color: '#536471', margin: '0 0 6px', textTransform: 'uppercase', fontWeight: 600 }}>Milestones</p>
                {importSuggestions.milestones.map((m, i) => (
                  <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #E3E3E3', marginBottom: '4px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={checkedMilestones[i] ?? true}
                      onChange={e => setCheckedMilestones(prev => { const n = [...prev]; n[i] = e.target.checked; return n })}
                      style={{ marginTop: '2px', accentColor: '#003720' }}
                    />
                    <div>
                      <p style={{ fontSize: '11px', fontWeight: 600, color: '#003720', margin: 0 }}>{m.label}</p>
                      <p style={{ fontSize: '10px', color: '#536471', margin: 0 }}>{m.isAnnual ? (m.date_mm_dd || 'Annual') : (m.date_full || 'One-time')}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {importSuggestions.context_bullets.length > 0 && (
              <div style={{ marginBottom: '10px' }}>
                <p style={{ fontSize: '10px', color: '#536471', margin: '0 0 6px', textTransform: 'uppercase', fontWeight: 600 }}>Context insights</p>
                {importSuggestions.context_bullets.map((bullet, i) => (
                  <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #E3E3E3', marginBottom: '4px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={checkedContext[i] ?? true}
                      onChange={e => setCheckedContext(prev => { const n = [...prev]; n[i] = e.target.checked; return n })}
                      style={{ marginTop: '2px', accentColor: '#003720' }}
                    />
                    <p style={{ fontSize: '11px', color: '#003720', margin: 0 }}>{bullet}</p>
                  </label>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setImportSuggestions(null)}
                style={{ flex: 1, fontSize: '11px', padding: '7px', borderRadius: '8px', border: '1px solid #E3E3E3', background: 'white', color: '#536471', cursor: 'pointer' }}
              >
                ← Edit
              </button>
              <button
                onClick={handleImportNotesSave}
                disabled={importSaving}
                style={{ flex: 2, fontSize: '11px', fontWeight: 600, padding: '7px', borderRadius: '8px', background: '#003720', color: 'white', border: 'none', cursor: importSaving ? 'default' : 'pointer' }}
              >
                {importSaving ? 'Saving…' : '✓ Save selected'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Milestones */}
      <div style={{ ...CARD }}>
        <p style={SECTION_HEADING}>Milestones</p>
        {milestones.length === 0 && !showMilestoneForm && (
          <p style={{ fontSize: '12px', color: '#536471', margin: '0 0 8px 0' }}>No milestones yet</p>
        )}
        {milestones.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '16px' }}>{milestoneEmoji(m.type)}</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '13px', color: '#003720' }}>{m.label}</span>
              {m.date_mm_dd && (
                <span style={{ fontSize: '11px', color: '#536471', marginLeft: '6px' }}>{formatMmDd(m.date_mm_dd)}</span>
              )}
              {m.date_full && !m.date_mm_dd && (
                <span style={{ fontSize: '11px', color: '#536471', marginLeft: '6px' }}>{new Date(m.date_full).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              )}
            </div>
          </div>
        ))}

        {showMilestoneForm ? (
          <div style={{ borderTop: milestones.length > 0 ? '1px solid #E5E7EB' : 'none', paddingTop: milestones.length > 0 ? '10px' : '0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <select value={mType} onChange={e => setMType(e.target.value)} style={{ ...inputStyle }}>
              <option value="birthday_contact">Birthday (theirs)</option>
              <option value="birthday_child">Child's birthday</option>
              <option value="birthday_partner">Partner's birthday</option>
              <option value="anniversary">Anniversary</option>
              <option value="anniversary_work">Work anniversary</option>
              <option value="custom">Custom</option>
            </select>
            <input type="text" value={mLabel} onChange={e => setMLabel(e.target.value)} placeholder="Label (e.g. Sarah's birthday)" style={inputStyle} />
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <label style={{ fontSize: '12px', color: '#536471', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input type="checkbox" checked={mIsAnnual} onChange={e => setMIsAnnual(e.target.checked)} />
                Annual
              </label>
              {mIsAnnual ? (
                <input
                  type="text"
                  value={mDateMmDd}
                  onChange={e => setMDateMmDd(e.target.value)}
                  placeholder="MM-DD (e.g. 03-24)"
                  style={{ ...inputStyle, flex: 1 }}
                />
              ) : (
                <input
                  type="date"
                  value={mDateFull}
                  onChange={e => setMDateFull(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                />
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '12px', color: '#536471', whiteSpace: 'nowrap' }}>Show</label>
              <input type="number" value={mShowBefore} onChange={e => setMShowBefore(parseInt(e.target.value) || 7)} min={1} max={30} style={{ ...inputStyle, width: '60px' }} />
              <span style={{ fontSize: '12px', color: '#536471', whiteSpace: 'nowrap' }}>days before</span>
            </div>
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowMilestoneForm(false)} style={{ fontSize: '12px', color: '#536471', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>Cancel</button>
              <button
                onClick={handleAddMilestone}
                disabled={mSaving}
                style={{ padding: '5px 14px', borderRadius: '6px', background: '#003720', color: 'white', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}
              >
                {mSaving ? '...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowMilestoneForm(true)}
            style={{ fontSize: '12px', color: '#003720', background: 'none', border: '1px dashed #E5E7EB', borderRadius: '6px', cursor: 'pointer', padding: '5px 10px', width: '100%', textAlign: 'left' }}
          >
            + Add milestone
          </button>
        )}
      </div>

      {/* Todos */}
      <div style={{ ...CARD }}>
        <p style={SECTION_HEADING}>Follow-ups</p>
        {todos.length === 0 && !showTodoForm && (
          <p style={{ fontSize: '12px', color: '#536471', margin: '0 0 8px 0' }}>No open follow-ups</p>
        )}
        {todos.map(todo => {
          const { text: dateText, overdue } = formatTodoDate(todo.date)
          return (
            <div key={todo.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
              <input
                type="checkbox"
                checked={false}
                onChange={() => handleCompleteTodo(todo.id)}
                style={{ marginTop: '2px', cursor: 'pointer', accentColor: '#003720', flexShrink: 0 }}
              />
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '13px', color: '#003720' }}>{todo.text}</span>
                {dateText && (
                  <span style={{ fontSize: '11px', color: overdue ? '#EF4444' : '#536471', marginLeft: '6px', fontWeight: overdue ? 600 : 400 }}>
                    {dateText}
                  </span>
                )}
              </div>
            </div>
          )
        })}

        {showTodoForm ? (
          <div style={{ borderTop: todos.length > 0 ? '1px solid #E5E7EB' : 'none', paddingTop: todos.length > 0 ? '10px' : '0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input
              type="text"
              value={todoText}
              onChange={e => setTodoText(e.target.value)}
              placeholder="What do you commit to doing?"
              autoFocus
              style={inputStyle}
            />
            <div>
              <label style={{ fontSize: '10px', fontWeight: 600, color: '#536471', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>
                Due date (required)
              </label>
              <input type="date" value={todoDate} onChange={e => setTodoDate(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />
            </div>
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowTodoForm(false); setTodoText(''); setTodoDate('') }} style={{ fontSize: '12px', color: '#536471', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>Cancel</button>
              <button
                onClick={handleAddTodo}
                disabled={!todoText.trim() || !todoDate || todoSaving}
                style={{ padding: '5px 14px', borderRadius: '6px', background: todoText.trim() && todoDate ? '#003720' : '#E5E7EB', color: todoText.trim() && todoDate ? 'white' : '#536471', border: 'none', cursor: todoText.trim() && todoDate ? 'pointer' : 'not-allowed', fontSize: '12px', fontWeight: 500 }}
              >
                {todoSaving ? '...' : 'Add'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowTodoForm(true)}
            style={{ fontSize: '12px', color: '#003720', background: 'none', border: '1px dashed #E5E7EB', borderRadius: '6px', cursor: 'pointer', padding: '5px 10px', width: '100%', textAlign: 'left' }}
          >
            + Add follow-up
          </button>
        )}
      </div>

      {/* Links */}
      <div style={{ ...CARD }}>
        <p style={SECTION_HEADING}>Links</p>
        {links.length === 0 && !showLinkForm && (
          <p style={{ fontSize: '12px', color: '#536471', margin: '0 0 8px 0' }}>No links saved</p>
        )}
        {links.map((link, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '14px' }}>
              {link.type === 'Resource' ? '📄' : link.type === 'Their content' ? '📰' : '🔗'}
            </span>
            <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, fontSize: '13px', color: '#003720', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {link.label} ↗
            </a>
            <button onClick={() => handleRemoveLink(link.url)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#536471', fontSize: '16px', lineHeight: 1, padding: '0 2px' }}>×</button>
          </div>
        ))}

        {showLinkForm ? (
          <div style={{ borderTop: links.length > 0 ? '1px solid #E5E7EB' : 'none', paddingTop: links.length > 0 ? '10px' : '0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input type="url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://..." style={inputStyle} />
            <input type="text" value={linkLabel} onChange={e => setLinkLabel(e.target.value)} placeholder="Label" style={inputStyle} />
            <select value={linkType} onChange={e => setLinkType(e.target.value)} style={inputStyle}>
              <option value="Resource">Resource</option>
              <option value="Their content">Their content</option>
              <option value="Shared doc">Shared doc</option>
            </select>
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowLinkForm(false)} style={{ fontSize: '12px', color: '#536471', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>Cancel</button>
              <button
                onClick={handleAddLink}
                disabled={!linkUrl.trim() || !linkLabel.trim() || linkSaving}
                style={{ padding: '5px 14px', borderRadius: '6px', background: linkUrl.trim() && linkLabel.trim() ? '#003720' : '#E5E7EB', color: linkUrl.trim() && linkLabel.trim() ? 'white' : '#536471', border: 'none', cursor: linkUrl.trim() && linkLabel.trim() ? 'pointer' : 'not-allowed', fontSize: '12px', fontWeight: 500 }}
              >
                {linkSaving ? '...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowLinkForm(true)}
            style={{ fontSize: '12px', color: '#003720', background: 'none', border: '1px dashed #E5E7EB', borderRadius: '6px', cursor: 'pointer', padding: '5px 10px', width: '100%', textAlign: 'left' }}
          >
            + Add link
          </button>
        )}
      </div>

      {/* Quick Note */}
      <div style={{ ...CARD }}>
        <p style={SECTION_HEADING}>Add a note</p>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input
            type="text"
            value={quickNote}
            onChange={e => setQuickNote(e.target.value)}
            placeholder="What happened? What did you learn?"
            onKeyDown={e => e.key === 'Enter' && quickNote.trim() && handleQuickNote()}
            onBlur={() => quickNote.trim() && handleQuickNote()}
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
        {noteSaved && <p style={{ fontSize: '11px', color: '#79D65E', margin: '6px 0 0 0' }}>✓ Saved</p>}
      </div>

      {/* Stats row */}
      <p style={{ fontSize: '12px', color: '#536471', margin: '0 0 10px 0' }}>
        {interactionCount} interaction{interactionCount !== 1 ? 's' : ''} · last {lastSeen.toLowerCase()}
      </p>

      {/* Daily Progress */}
      <DailyProgress userId={user.id} />

      {/* Open in reThink */}
      <button
        onClick={handleOpenInReThink}
        style={{
          width: '100%', padding: '10px', marginTop: '6px',
          background: '#F8FAF8', color: openingReThink ? '#79D65E' : '#003720',
          border: '1px solid #E5E7EB', borderRadius: '10px',
          fontSize: '13px', fontWeight: 500, cursor: 'pointer', textAlign: 'center',
        }}
      >
        {openingReThink ? '✓ Opening…' : 'Open in reThink →'}
      </button>
    </div>
  )
}

// ===== SHARED UI COMPONENTS =====

export function AvatarWithDot({ name, photoUrl, size, score }: { name?: string | null; photoUrl?: string | null; size: number; score: number }) {
  const dotColor = score >= 7 ? '#79D65E' : score >= 4 ? '#F59E0B' : '#EF4444'
  return (
    <div style={{ position: 'relative', flexShrink: 0, width: size, height: size }}>
      <Avatar name={name} photoUrl={photoUrl} size={size} />
      <span style={{ position: 'absolute', bottom: 0, right: 0, width: '10px', height: '10px', borderRadius: '50%', background: dotColor, border: '2px solid white' }} />
    </div>
  )
}

export function Avatar({ name, photoUrl, size }: { name?: string | null; photoUrl?: string | null; size: number }) {
  const initials = name ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?'

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name ?? ''}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
    )
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#79D65E', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: size * 0.33, fontWeight: 600, flexShrink: 0 }}>
      {initials}
    </div>
  )
}

export function StatusPill({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string }> = {
    PROSPECT:  { bg: '#F1F5F9', color: '#94A3B8' },  // slate/grey — clearly "not yet active"
    INTRO:     { bg: '#E5F9BD', color: '#003720' },
    CONNECTED: { bg: '#79D65E', color: '#003720' },
    ENGAGED:   { bg: '#79D65E', color: '#003720' },
    NURTURING: { bg: '#003720', color: 'white' },
    DORMANT:   { bg: '#E3E3E3', color: '#536471' },
    RECONNECT: { bg: '#FEF3C7', color: '#92400E' },
  }
  const s = styles[status] ?? { bg: '#E3E3E3', color: '#536471' }
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: '100px', padding: '2px 8px', fontSize: '11px', fontWeight: 500 }}>
      {status}
    </span>
  )
}
