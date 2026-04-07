import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Trash, BookOpen, Copy, Check,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { PlaybookEntry, PlaybookEntryType, StoryFramework } from '@/types'

// ── section config ────────────────────────────────────────────────────────────

interface SectionConfig {
  key: PlaybookEntryType
  label: string
  description: string
  allowFramework?: boolean
}

const BLOCKS: Array<{ title: string; sections: SectionConfig[] }> = [
  {
    title: 'Block 1 — Who I Am',
    sections: [
      { key: 'pitch', label: 'My Story', description: 'Your narrative in 3 versions: CEO/hiring manager, recruiter, networking contact.' },
      { key: 'value_prop', label: 'Value Proposition', description: 'Executive Value Pyramid: Table Stakes / Operational Excellence / Strategic Impact / X Factors.' },
      { key: 'positioning', label: 'Key Positioning', description: 'Mission, Core Values, Brand Promise, Critical Three.' },
      { key: 'boundary', label: 'My Boundaries', description: 'Decision Filter, Integrity Boundaries, Career Statement.' },
    ],
  },
  {
    title: 'Block 2 — How I Engage',
    sections: [
      { key: 'story', label: 'Story Bank', description: 'Stories using CAR/ICARQ/Disney/CLEAR frameworks.', allowFramework: true },
      { key: 'objection', label: 'Objection Bank', description: '3-5 background concerns + proactive narratives.' },
      { key: 'skill', label: 'Skills & Expertise', description: 'Structured skill list with evidence.' },
      { key: 'persona', label: 'Audience Personas', description: 'Decision-maker profiles and what matters to them.' },
    ],
  },
  {
    title: 'Block 3 — How I Close',
    sections: [
      { key: 'value_bank', label: 'Value Bank', description: 'Introductions you can make / Content / Insights / Expertise offers.' },
      { key: 'template', label: 'Conversation Starters', description: 'Industry Trend / Career Journey / Value-Add / Panel openers.' },
      { key: 'script', label: 'Negotiation Scripts', description: 'Comp deflection / EQ scenarios / Objection reframes.' },
    ],
  },
]

const FRAMEWORKS: StoryFramework[] = ['car', 'icarq', 'disney', 'clear']
const FRAMEWORK_LABELS: Record<StoryFramework, string> = {
  car: 'CAR', icarq: 'iCARQ', disney: 'Disney', clear: 'CLEAR',
}

// ── entry editor ──────────────────────────────────────────────────────────────

function EntryEditor({
  entry,
  onSave,
  onDelete,
  allowFramework,
}: {
  entry: PlaybookEntry
  onSave: (updates: Partial<PlaybookEntry>) => Promise<void>
  onDelete: () => Promise<void>
  allowFramework?: boolean
}) {
  const [title, setTitle] = useState(entry.title)
  const [content, setContent] = useState(entry.content ?? '')
  const [framework, setFramework] = useState<StoryFramework | null>(entry.framework)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    await onSave({ title: title.trim() || entry.title, content: content.trim() || null, framework })
    setDirty(false)
    setSaving(false)
  }

  return (
    <div className="border border-mercury rounded-lg bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-mercury bg-[#FAFAFA]">
        <input
          value={title}
          onChange={e => { setTitle(e.target.value); setDirty(true) }}
          className="flex-1 text-sm font-medium text-midnight bg-transparent focus:outline-none"
          placeholder="Entry title..."
        />
        {allowFramework && (
          <select
            value={framework ?? ''}
            onChange={e => { setFramework((e.target.value as StoryFramework) || null); setDirty(true) }}
            className="text-xs border border-mercury rounded px-1.5 py-0.5 focus:outline-none focus:border-burnham bg-white text-shuttle"
          >
            <option value="">— Framework</option>
            {FRAMEWORKS.map(f => <option key={f} value={f}>{FRAMEWORK_LABELS[f]}</option>)}
          </select>
        )}
        {dirty && (
          <button
            onClick={save}
            disabled={saving}
            className="text-xs px-2 py-0.5 bg-burnham text-gossip rounded disabled:opacity-50"
          >
            {saving ? '...' : 'Save'}
          </button>
        )}
        <button onClick={onDelete} className="text-mercury hover:text-red-400 transition-colors">
          <Trash size={14} />
        </button>
      </div>
      <textarea
        value={content}
        onChange={e => { setContent(e.target.value); setDirty(true) }}
        placeholder="Write your content here... (markdown supported)"
        rows={5}
        className="w-full px-3 py-2 text-sm text-midnight focus:outline-none resize-y font-mono"
      />
    </div>
  )
}

// ── section component ─────────────────────────────────────────────────────────

function PlaybookSection({
  config,
  entries,
  onAdd,
  onSave,
  onDelete,
}: {
  config: SectionConfig
  entries: PlaybookEntry[]
  onAdd: (type: PlaybookEntryType) => Promise<void>
  onSave: (id: string, updates: Partial<PlaybookEntry>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between py-2 group"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-midnight">{config.label}</span>
          <span className="text-xs text-mercury">({entries.length})</span>
        </div>
        <span className="text-shuttle text-lg leading-none">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="mt-1 pl-2 border-l-2 border-mercury">
          <p className="text-xs text-shuttle mb-3">{config.description}</p>
          <div className="flex flex-col gap-2">
            {entries.map(e => (
              <EntryEditor
                key={e.id}
                entry={e}
                onSave={updates => onSave(e.id, updates)}
                onDelete={() => onDelete(e.id)}
                allowFramework={config.allowFramework}
              />
            ))}
          </div>
          <button
            onClick={() => onAdd(config.key)}
            className="mt-2 flex items-center gap-1 text-xs text-burnham hover:underline"
          >
            <Plus size={12} /> Add entry
          </button>
        </div>
      )}
    </div>
  )
}

// ── main screen ───────────────────────────────────────────────────────────────

export default function Playbook() {
  const { user } = useAuth()
  const [entries, setEntries] = useState<PlaybookEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('playbook_entries')
      .select('*')
      .eq('user_id', user.id)
      .order('list_order')
    setEntries(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  const addEntry = async (type: PlaybookEntryType) => {
    if (!user) return
    const maxOrder = entries.filter(e => e.type === type).length
    const { data, error } = await supabase
      .from('playbook_entries')
      .insert({
        user_id: user.id,
        type,
        title: 'New entry',
        content: null,
        tags: [],
        framework: null,
        list_order: maxOrder,
      })
      .select()
      .single()
    if (!error && data) {
      setEntries(prev => [...prev, data as PlaybookEntry])
    }
  }

  const saveEntry = async (id: string, updates: Partial<PlaybookEntry>) => {
    await supabase.from('playbook_entries').update(updates).eq('id', id)
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e))
  }

  const deleteEntry = async (id: string) => {
    await supabase.from('playbook_entries').delete().eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const exportMarkdown = () => {
    const lines: string[] = ['# Personal Playbook\n']
    for (const block of BLOCKS) {
      lines.push(`## ${block.title}\n`)
      for (const section of block.sections) {
        const sectionEntries = entries.filter(e => e.type === section.key)
        lines.push(`### ${section.label}\n`)
        if (sectionEntries.length === 0) {
          lines.push('*No entries yet.*\n')
        } else {
          for (const e of sectionEntries) {
            lines.push(`#### ${e.title}${e.framework ? ` (${FRAMEWORK_LABELS[e.framework as StoryFramework]})` : ''}\n`)
            if (e.content) lines.push(`${e.content}\n`)
          }
        }
      }
    }
    const md = lines.join('\n')
    navigator.clipboard.writeText(md)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <div className="flex items-center justify-center h-full text-shuttle text-sm">Loading...</div>

  return (
    <div className="flex flex-col h-full bg-[#FAFAFA]">
      {/* header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-mercury">
        <div className="flex items-center gap-2">
          <BookOpen size={20} className="text-shuttle" />
          <h1 className="text-lg font-semibold text-midnight">Playbook</h1>
          <span className="text-xs text-shuttle bg-mercury px-1.5 py-0.5 rounded-full ml-1">{entries.length} entries</span>
        </div>
        <button
          onClick={exportMarkdown}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-mercury text-sm text-shuttle rounded-lg hover:border-burnham hover:text-burnham transition-colors"
        >
          {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Export Markdown</>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-5">
          {BLOCKS.map(block => (
            <div key={block.title} className="mb-8">
              <h2 className="text-xs font-bold uppercase tracking-widest text-burnham mb-4 pb-2 border-b border-mercury">
                {block.title}
              </h2>
              {block.sections.map(section => (
                <PlaybookSection
                  key={section.key}
                  config={section}
                  entries={entries.filter(e => e.type === section.key)}
                  onAdd={addEntry}
                  onSave={saveEntry}
                  onDelete={deleteEntry}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
