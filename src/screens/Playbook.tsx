import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowRight, BookOpen, Brain, CaretLeft, CaretRight, Check, CheckCircle, Copy,
  FileText, Flag, FloppyDisk, GridFour, Plus, Quotes, Ranking, Scales, Sparkle,
  Target, Trash, Trophy, Users, Warning, X,
} from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Company, Contact, Opportunity, PlaybookEntry, PlaybookEntryType, StoryFramework } from '@/types'

type PlaybookTab = 'coverage' | 'story' | 'wins' | 'value'
type BrickKind = 'story' | 'win'

type Brick = {
  kind: BrickKind
  id: string
  title: string
  sub: string
  themes: string[]
  topics: string[]
  audiences: string[]
  source: PlaybookEntry
}

const TABS: Array<{ id: PlaybookTab; label: string; icon: ReactNode }> = [
  { id: 'coverage', label: 'Coverage', icon: <GridFour size={13} /> },
  { id: 'story', label: 'Stories', icon: <BookOpen size={13} /> },
  { id: 'wins', label: 'Wins', icon: <Trophy size={13} /> },
  { id: 'value', label: 'Value bank', icon: <Scales size={13} /> },
]

const STORY_TYPES: PlaybookEntryType[] = ['pitch', 'story', 'positioning', 'persona']
const WIN_TYPES: PlaybookEntryType[] = ['story', 'value_prop', 'skill', 'objection']
const VALUE_TYPES: PlaybookEntryType[] = ['value_bank', 'template', 'script']
const FRAMEWORKS: StoryFramework[] = ['car', 'icarq', 'disney', 'clear']
const THEMES = ['Leadership', 'Growth', 'Narrative', 'Operator', 'Network', 'Product']
const TOPICS = ['0 to 1', 'Scale', 'Hiring', 'Partnerships', 'Revenue', 'Career']
const AUDIENCES = ['Everyone', 'Founders', 'Recruiters', 'Operators', 'Investors', 'Customers']

function firstTag(entry: PlaybookEntry, fallback: string) {
  return entry.tags?.find(Boolean) ?? fallback
}

function classifyTags(entry: PlaybookEntry) {
  const raw = entry.tags ?? []
  const lower = raw.map(t => t.toLowerCase())
  const themes = THEMES.filter(theme => lower.some(t => t.includes(theme.toLowerCase())))
  const topics = TOPICS.filter(topic => lower.some(t => t.includes(topic.toLowerCase().replace(/\s/g, '')) || t.includes(topic.toLowerCase())))
  const audiences = AUDIENCES.filter(aud => lower.some(t => t.includes(aud.toLowerCase())))
  return {
    themes: themes.length ? themes : [firstTag(entry, entry.type === 'story' ? 'Narrative' : 'Operator')],
    topics: topics.length ? topics : [entry.framework?.toUpperCase() || (entry.type === 'value_prop' ? 'Revenue' : 'Career')],
    audiences: audiences.length ? audiences : ['Everyone'],
  }
}

function entryToBrick(entry: PlaybookEntry, kind: BrickKind): Brick {
  const tags = classifyTags(entry)
  const sub = entry.framework
    ? `${entry.framework.toUpperCase()} · ${entry.updated_at ? new Date(entry.updated_at).toLocaleDateString() : 'saved'}`
    : `${entry.type.replaceAll('_', ' ')} · ${entry.content ? `${entry.content.length} chars` : 'draft'}`
  return { kind, id: entry.id, title: entry.title, sub, source: entry, ...tags }
}

function markdown(entries: PlaybookEntry[]) {
  return entries.map(entry => [
    `## ${entry.title}`,
    entry.framework ? `Framework: ${entry.framework.toUpperCase()}` : '',
    entry.tags?.length ? `Tags: ${entry.tags.join(', ')}` : '',
    entry.content ?? '',
  ].filter(Boolean).join('\n\n')).join('\n\n---\n\n')
}

function PlaybookTabs({ tab, onTab }: { tab: PlaybookTab; onTab: (tab: PlaybookTab) => void }) {
  return (
    <div className="ppl-tabs">
      {TABS.map(t => (
        <button key={t.id} className={`ppl-tab${tab === t.id ? ' active' : ''}`} onClick={() => onTab(t.id)}>
          {t.icon}<span>{t.label}</span>
        </button>
      ))}
    </div>
  )
}

function PbFilterChips({ label, options, value, onChange }: {
  label: string
  options: Array<{ id: string; label: string; icon?: ReactNode }>
  value: string | null
  onChange: (value: string | null) => void
}) {
  return (
    <div className="pbf-group">
      <span className="pbf-lbl">{label}</span>
      <div className="pbf-chips">
        {options.map(option => (
          <button key={option.id} className={`pbf-chip${value === option.id ? ' on' : ''}`} onClick={() => onChange(value === option.id ? null : option.id)}>
            {option.icon}{option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function covLevel(n: number) {
  return n === 0 ? 'z' : n === 1 ? 'a' : n === 2 ? 'b' : 'c'
}

function CoverageMatrix({
  bricks,
  onOpen,
  onDraftGap,
}: {
  bricks: Brick[]
  onOpen: (brick: Brick) => void
  onDraftGap: (theme?: string | null, topic?: string | null) => void
}) {
  const themes = Array.from(new Set([...THEMES.slice(0, 5), ...bricks.flatMap(b => b.themes)])).slice(0, 8)
  const topics = Array.from(new Set([...TOPICS.slice(0, 6), ...bricks.flatMap(b => b.topics)])).slice(0, 8)
  const [sel, setSel] = useState<{ theme: string | null; topic: string | null }>({ theme: null, topic: null })
  const cell = (theme: string, topic: string) => bricks.filter(b => b.themes.includes(theme) && b.topics.includes(topic)).length
  const rowTotal = (theme: string) => bricks.filter(b => b.themes.includes(theme)).length
  const colTotal = (topic: string) => bricks.filter(b => b.topics.includes(topic)).length
  const gaps = themes.flatMap(theme => topics.map(topic => ({ theme, topic, count: cell(theme, topic) }))).filter(x => x.count === 0)
  const filtered = bricks.filter(b => (!sel.theme || b.themes.includes(sel.theme)) && (!sel.topic || b.topics.includes(sel.topic)))
  const active = sel.theme || sel.topic
  const label = [sel.theme, sel.topic].filter(Boolean).join(' x ')

  return (
    <div className="cov-wrap">
      <div className="cov-summary">
        <span className="cov-sum-l"><GridFour size={13} /> Coverage — Marketing Leader</span>
        {gaps.length
          ? <span className="cov-sum-gap"><b>{gaps.length}</b> empty cells · no story yet for <em>{gaps[0].theme} x {gaps[0].topic}</em></span>
          : <span className="cov-sum-ok"><CheckCircle size={12} /> Every cell covered</span>}
      </div>

      <div className="cov-scroll">
        <div className="cov-matrix" style={{ gridTemplateColumns: `168px repeat(${topics.length}, minmax(36px, 1fr)) 50px` }}>
          <div className="cov-corner" />
          {topics.map(topic => (
            <button key={topic} className={`cov-colh${sel.topic === topic && !sel.theme ? ' on' : ''}`} onClick={() => setSel(sel.topic === topic && !sel.theme ? { theme: null, topic: null } : { theme: null, topic })}>
              <span className="cov-coltxt">{topic}</span>
            </button>
          ))}
          <div className="cov-colh tot">Σ</div>
          {themes.map(theme => (
            <>
              <button key={`${theme}:row`} className={`cov-rowh${sel.theme === theme && !sel.topic ? ' on' : ''}`} onClick={() => setSel(sel.theme === theme && !sel.topic ? { theme: null, topic: null } : { theme, topic: null })}>{theme}</button>
              {topics.map(topic => {
                const n = cell(theme, topic)
                const on = sel.theme === theme && sel.topic === topic
                const dim = active && !((sel.theme && sel.topic) ? on : sel.theme ? sel.theme === theme : sel.topic === topic)
                return (
                  <button key={`${theme}:${topic}`} className={`cov-cell lv-${covLevel(n)}${on ? ' on' : ''}${dim ? ' dim' : ''}`} onClick={() => setSel(on ? { theme: null, topic: null } : { theme, topic })}>
                    {n || ''}
                  </button>
                )
              })}
              <div key={`${theme}:total`} className="cov-rowtot">{rowTotal(theme)}</div>
            </>
          ))}
          <div className="cov-rowh tot">Σ</div>
          {topics.map(topic => <div key={`${topic}:total`} className="cov-coltot">{colTotal(topic)}</div>)}
          <div className="cov-corner tot" />
        </div>
      </div>

      <div className="cov-list-hd">
        <span>{active ? <>Showing <b>{label}</b></> : <>All bricks</>}</span>
        {active && <button className="cov-clear" onClick={() => setSel({ theme: null, topic: null })}>Clear</button>}
      </div>

      {filtered.length > 0 ? (
        <div className="cov-list">
          {filtered.map(brick => (
            <button key={`${brick.kind}:${brick.id}`} className="cov-item" onClick={() => onOpen(brick)}>
              <span className={`cov-kind ${brick.kind}`}>{brick.kind === 'win' ? <Trophy size={11} /> : <BookOpen size={11} />}</span>
              <div className="cov-item-txt">
                <span className="cov-item-title">{brick.title}</span>
                <span className="cov-item-sub">{brick.sub}</span>
              </div>
              <div className="cov-item-tags">{brick.themes.map(t => <span key={t} className="cov-tag theme">{t}</span>)}</div>
              <span className="cov-item-open"><ArrowRight size={12} /></span>
            </button>
          ))}
        </div>
      ) : (
        <div className="cov-empty">
          <Sparkle size={18} />
          <p>No story or win yet for <b>{label || 'this slot'}</b>.</p>
          <button className="cov-draft" onClick={() => onDraftGap(sel.theme, sel.topic)}><Sparkle size={13} /> Draft this story</button>
        </div>
      )}
    </div>
  )
}

function StoryList({ stories, onOpen, onAdd }: { stories: PlaybookEntry[]; onOpen: (entry: PlaybookEntry) => void; onAdd: () => void }) {
  const [theme, setTheme] = useState<string | null>(null)
  const [aud, setAud] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const rows = stories.map(entry => ({ entry, brick: entryToBrick(entry, 'story') }))
  const filtered = rows.filter(({ brick, entry }) =>
    (!theme || brick.themes.includes(theme)) &&
    (!aud || brick.audiences.includes(aud)) &&
    (!status || (entry.content ? 'ready' : 'draft') === status))

  return (
    <div className="sl-wrap">
      <div className="pb-bank-note">
        <span><b>{filtered.length}</b>{filtered.length !== stories.length ? ` / ${stories.length}` : ''} stories</span>
        <span className="pb-bank-sep" />
        <span className="pb-bank-rule"><BookOpen size={12} /> Click a story to open the full structured view.</span>
      </div>
      <div className="pbf-bar">
        <PbFilterChips label="Theme" options={THEMES.map(t => ({ id: t, label: t }))} value={theme} onChange={setTheme} />
        <PbFilterChips label="Audience" options={AUDIENCES.filter(a => a !== 'Everyone').map(a => ({ id: a, label: a }))} value={aud} onChange={setAud} />
        <PbFilterChips label="Status" options={[{ id: 'ready', label: 'Ready' }, { id: 'draft', label: 'Draft' }]} value={status} onChange={setStatus} />
        {(theme || aud || status) && <button className="pbf-clear" onClick={() => { setTheme(null); setAud(null); setStatus(null) }}>Clear</button>}
      </div>
      <div className="sl-table">
        <div className="sl-head">
          <span className="sl-cell title">Story</span>
          <span className="sl-cell signal">Primary signal</span>
          <span className="sl-cell tags">Coverage</span>
          <span className="sl-cell proof">Proof</span>
          <span className="sl-cell uses">Uses</span>
          <span className="sl-open" />
        </div>
        {filtered.map(({ entry, brick }) => (
          <button className="sl-row" key={entry.id} onClick={() => onOpen(entry)}>
            <span className="sl-cell title">
              <span className="sl-ic"><BookOpen size={13} /></span>
              <span className="sl-title-tx">{entry.title}</span>
              <span className={`sl-status ${entry.content ? 'moss' : 'grey'}`}>{entry.content ? 'Ready' : 'Draft'}</span>
            </span>
            <span className="sl-cell signal">{entry.framework?.toUpperCase() || firstTag(entry, 'Positioning')}</span>
            <span className="sl-cell tags">{brick.themes.slice(0, 3).map(t => <span key={t} className="cov-tag theme">{t}</span>)}</span>
            <span className="sl-cell proof">{entry.tags?.includes('win') ? <><Trophy size={11} /> 1</> : <span className="sl-dim">—</span>}</span>
            <span className="sl-cell uses">{entry.list_order ?? 0}x</span>
            <span className="sl-open"><ArrowRight size={13} /></span>
          </button>
        ))}
        {filtered.length === 0 && <div className="wl-empty">No stories match these filters.</div>}
      </div>
      <button className="pb-add" onClick={onAdd}><Plus size={13} /> Add a story</button>
    </div>
  )
}

function WinsBank({ wins, onOpen, onAdd }: { wins: PlaybookEntry[]; onOpen: (entry: PlaybookEntry) => void; onAdd: () => void }) {
  const [cat, setCat] = useState<string | null>(null)
  const [aud, setAud] = useState<string | null>(null)
  const rows = wins.map(entry => ({ entry, brick: entryToBrick(entry, 'win') }))
  const filtered = rows.filter(({ brick }) => (!cat || brick.topics.includes(cat)) && (!aud || brick.audiences.includes(aud)))
  const groups = TOPICS.map(topic => ({ topic, rows: filtered.filter(r => r.brick.topics.includes(topic)) })).filter(g => g.rows.length)

  return (
    <div className="pb-winswrap">
      <div className="pb-bank-note">
        <span><b>{wins.length}</b> signature achievements</span>
        <span className="pb-bank-sep" />
        <span className="pb-bank-rule"><Trophy size={12} /> Grouped by what they prove.</span>
      </div>
      <div className="pbf-bar">
        <PbFilterChips label="Metric" options={TOPICS.map(t => ({ id: t, label: t }))} value={cat} onChange={setCat} />
        <PbFilterChips label="Audience" options={AUDIENCES.filter(a => a !== 'Everyone').map(a => ({ id: a, label: a }))} value={aud} onChange={setAud} />
        {(cat || aud) && <button className="pbf-clear" onClick={() => { setCat(null); setAud(null) }}>Clear</button>}
      </div>
      <div className="wl-groups">
        {groups.map(group => (
          <div className="wl-group" key={group.topic}>
            <div className="wl-group-hd moss"><Trophy size={13} /> {group.topic} <span className="wl-group-ct">{group.rows.length}</span></div>
            <div className="wl-table">
              {group.rows.map(({ entry, brick }) => (
                <button className="wl-row" key={entry.id} onClick={() => onOpen(entry)}>
                  <span className="wl-cell metric"><span className="wl-metric moss">{entry.framework?.toUpperCase() || 'proof'}</span></span>
                  <span className="wl-cell head"><span className="wl-head-tx">{entry.title}</span>{entry.tags?.includes('review') && <span className="wl-src">Review</span>}</span>
                  <span className="wl-cell auds">{brick.audiences.slice(0, 2).map(a => <span key={a} className="cov-tag theme">{a}</span>)}</span>
                  <span className="wl-cell stories"><BookOpen size={11} /> {brick.themes.length}</span>
                  <span className="wl-cell when">{new Date(entry.updated_at).toLocaleDateString()}</span>
                  <span className="sl-open"><ArrowRight size={13} /></span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && <div className="wl-empty">No wins match these filters.</div>}
      </div>
      <button className="pb-add" onClick={onAdd} style={{ marginTop: 16 }}><Plus size={13} /> Add a win</button>
    </div>
  )
}

function ValueBank({ values, onOpen, onAdd }: { values: PlaybookEntry[]; onOpen: (entry: PlaybookEntry) => void; onAdd: () => void }) {
  const ready = values.filter(v => Boolean(v.content)).length
  return (
    <div className="pb-valuewrap">
      <div className="pb-bank-note">
        <span><b>{ready}</b> assets ready to give</span>
        <span className="pb-bank-sep" />
        <span><b>{values.length}</b> total assets</span>
        <span className="pb-bank-sep" />
        <span className="pb-bank-rule"><Scales size={12} /> Give before you ask.</span>
      </div>
      <div className="pb-values">
        {values.map(entry => (
          <article className="pb-value" key={entry.id} onClick={() => onOpen(entry)}>
            <div className="pb-value-hd">
              <span className="pb-value-ic"><FileText size={15} /></span>
              <div className="pb-value-meta">
                <h3 className="pb-value-name">{entry.title}{entry.tags?.includes('assembled') && <span className="pb-value-ai"><Sparkle size={9} /> AI</span>}</h3>
                <span className="pb-value-type">{entry.type.replaceAll('_', ' ')}</span>
              </div>
              <span className={`pb-status ${entry.content ? 'moss' : 'amber'}`}><span className="dot" />{entry.content ? 'ready' : 'pending'}</span>
            </div>
            <p className="pb-value-desc">{entry.content || 'Describe this asset before you deploy it.'}</p>
            <div className="pb-deploys">
              {entry.tags?.filter(t => t.startsWith('@')).length ? (
                <>
                  <span className="pb-deploys-lbl">Given {entry.tags.filter(t => t.startsWith('@')).length}x</span>
                  <div className="pb-deploys-row">{entry.tags.filter(t => t.startsWith('@')).map(t => <span className="pb-deploy" key={t}>{t}<span className="pb-deploy-when">linked</span></span>)}</div>
                </>
              ) : (
                <span className="pb-deploys-empty">Never deployed — Jacob wouldn't approve</span>
              )}
            </div>
          </article>
        ))}
        <button className="pb-add value" onClick={onAdd}><Plus size={13} /> Add value</button>
      </div>
    </div>
  )
}

function EntryPeek({
  entry,
  kind,
  index,
  total,
  onClose,
  onPrev,
  onNext,
  onSave,
  onDelete,
}: {
  entry: PlaybookEntry
  kind: 'Story bank' | 'Wins' | 'Value bank'
  index: number
  total: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onSave: (updates: Partial<PlaybookEntry>) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [title, setTitle] = useState(entry.title)
  const [content, setContent] = useState(entry.content ?? '')
  const [tags, setTags] = useState((entry.tags ?? []).join(', '))
  const [framework, setFramework] = useState<StoryFramework | ''>(entry.framework ?? '')
  const [version, setVersion] = useState<'tldr' | 'arc' | 'talk' | 'raw'>('tldr')
  const dirty = title !== entry.title || content !== (entry.content ?? '') || tags !== (entry.tags ?? []).join(', ') || framework !== (entry.framework ?? '')
  const meta = classifyTags({ ...entry, tags: tags.split(',').map(t => t.trim()).filter(Boolean), framework: framework || null })
  const tagList = tags.split(',').map(t => t.trim()).filter(Boolean)
  const contentLines = content.split('\n').map(line => line.trim()).filter(Boolean)
  const save = () => onSave({
    title: title.trim() || entry.title,
    content: content.trim() || null,
    tags: tagList,
    framework: framework || null,
  })

  useEffect(() => {
    setTitle(entry.title)
    setContent(entry.content ?? '')
    setTags((entry.tags ?? []).join(', '))
    setFramework(entry.framework ?? '')
    setVersion('tldr')
  }, [entry])

  const topbar = (
    <div className="spk-topbar">
      <button className="peek-x" onClick={onClose} aria-label="Close"><X size={14} /></button>
      <div className="peek-nav">
        <button onClick={onPrev} aria-label="Previous"><CaretLeft size={14} /></button>
        <button onClick={onNext} aria-label="Next"><CaretRight size={14} /></button>
      </div>
      <span className="peek-pos">{index + 1} of {total} in {kind}</span>
      <span className="spk-top-grow" />
      {kind === 'Wins' && <button className="wpk-del" onClick={() => void onDelete()} title="Remove win"><Trash size={13} /></button>}
      {kind !== 'Wins' && <button className="spk-use" onClick={() => setVersion('talk')}><Sparkle size={12} /> Use in a draft</button>}
    </div>
  )

  if (kind === 'Wins') {
    const metric = tagList.find(t => /\d|%|\$|x/i.test(t)) ?? (framework ? framework.toUpperCase() : 'Proof')
    const [situation = content || 'Context to capture', action = 'Action to capture', result = 'Result to capture'] = contentLines.length ? contentLines : []

    return (
      <>
        <div className="peek-bg wpk-bg" onClick={onClose} />
        <aside className="spk wpk" role="dialog" aria-label={title}>
          {topbar}
          <div className="spk-scroll">
            <div className="spk-doc">
              <div className="spk-eyebrow">
                <span className="wpk-cat amber"><Trophy size={11} /> Win</span>
                {meta.audiences.map(audience => <span key={audience} className="spk-aud"><Users size={10} /> {audience}</span>)}
                <span className="spk-eyebrow-grow" />
                <span className="spk-uses">{new Date(entry.updated_at).toLocaleDateString()}</span>
              </div>

              <div className="wpk-metric-row">
                <span className="wpk-metric amber">{metric}</span>
                <h1 className="spk-title wpk-headline">
                  <input className="spk-inline-input" value={title} onChange={e => setTitle(e.target.value)} />
                </h1>
              </div>

              <div className="spk-arc wpk-car">
                {[
                  ['Situation', situation],
                  ['Action', action],
                  ['Result', result],
                ].map(([label, value]) => (
                  <div className="spk-arc-row" key={label}>
                    <span className="spk-arc-key">{label}</span>
                    <p className="spk-arc-val">{value}</p>
                  </div>
                ))}
              </div>

              <div className="spk-divider" />
              <div className="spk-props">
                <SpkProp icon={<Flag size={13} />} label="Category"><SpkChips items={meta.themes} kind="theme" /></SpkProp>
                <SpkProp icon={<Target size={13} />} label="Metric / topic"><SpkChips items={meta.topics} kind="topic" /></SpkProp>
                <SpkProp icon={<BookOpen size={13} />} label="Linked stories"><span className="spk-empty">Link this win from a story in the Story bank.</span></SpkProp>
                <SpkProp icon={<FileText size={13} />} label="Tags" alignTop>
                  <input className="spk-prop-input" value={tags} onChange={e => setTags(e.target.value)} placeholder="win, Revenue, Founders" />
                </SpkProp>
              </div>

              <div className="spk-divider" />
              <div className="spk-body">
                <textarea className="spk-edit-textarea" value={content} onChange={e => setContent(e.target.value)} placeholder="Situation&#10;Action&#10;Result" />
              </div>
              <div className="spk-actions">
                <button className="crm-tool ghost" onClick={() => void onDelete()}><Trash size={13} /> Delete</button>
                <button className="crm-tool primary" disabled={!dirty} onClick={() => void save()}><FloppyDisk size={13} /> Save</button>
              </div>
            </div>
          </div>
        </aside>
      </>
    )
  }

  const statusClass = content.trim() ? 'moss' : 'amber'
  const statusLabel = content.trim() ? 'Ready' : 'Draft'
  const tldr = contentLines[0] ?? 'One-line summary...'
  const versionText = version === 'tldr'
    ? tldr
    : version === 'arc'
      ? ['Context', 'Tension', 'Move', 'Proof'].map((label, i) => `${label}: ${contentLines[i] ?? ''}`).join('\n\n')
      : version === 'talk'
        ? content || 'Draft this story from the bricks.'
        : content || 'Raw source is empty.'
  const storyVersions: Array<{ key: typeof version; label: string; icon: ReactNode }> = [
    { key: 'tldr', label: 'TL;DR', icon: <Sparkle size={12} /> },
    { key: 'arc', label: 'Arc', icon: <Target size={12} /> },
    { key: 'talk', label: 'Talk track', icon: <BookOpen size={12} /> },
    { key: 'raw', label: 'Raw', icon: <FileText size={12} /> },
  ]

  return (
    <>
      <div className="peek-bg" onClick={onClose} />
      <aside className="spk" role="dialog" aria-label={title}>
        {topbar}
        <div className="spk-scroll">
          <div className="spk-doc">
            <div className="spk-eyebrow">
              <span className={`spk-status ${statusClass}`}><CheckCircle size={11} /> {statusLabel}</span>
              {meta.audiences.map(audience => <span key={audience} className="spk-aud"><Users size={10} /> {audience}</span>)}
              <span className="spk-eyebrow-grow" />
              <span className="spk-uses"><b>{entry.type.replaceAll('_', ' ')}</b> · {new Date(entry.updated_at).toLocaleDateString()}</span>
            </div>

            <h1 className="spk-title"><input className="spk-inline-input" value={title} onChange={e => setTitle(e.target.value)} /></h1>
            <p className="spk-lead">{tldr}</p>

            <div className="spk-props">
              <SpkProp icon={<Flag size={13} />} label="Primary signal"><span className="spk-signal">{firstTag({ ...entry, tags: tagList }, 'Narrative')}</span></SpkProp>
              <SpkProp icon={<Target size={13} />} label="Theme"><SpkChips items={meta.themes} kind="theme" /></SpkProp>
              <SpkProp icon={<Quotes size={13} />} label="Questions answered" alignTop>
                <ul className="spk-qs">
                  {contentLines.slice(0, 3).map(line => <li key={line}><Quotes size={10} /> {line}</li>)}
                  {!contentLines.length && <li><Quotes size={10} /> Add the question this story answers.</li>}
                </ul>
              </SpkProp>
              <SpkProp icon={<Scales size={13} />} label="Proof metrics"><span className="spk-metrics"><span className="spk-metric"><b>{tagList.length}</b> tags</span><span className="spk-metric"><b>{content.length}</b> chars</span></span></SpkProp>
              <SpkProp icon={<BookOpen size={13} />} label="Framework">
                <select value={framework} onChange={e => setFramework(e.target.value as StoryFramework | '')} className="spk-select">
                  <option value="">No framework</option>
                  {FRAMEWORKS.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                </select>
              </SpkProp>
              <SpkProp icon={<FileText size={13} />} label="Coverage tags" alignTop>
                <input className="spk-prop-input" value={tags} onChange={e => setTags(e.target.value)} placeholder="Leadership, Founders, Revenue" />
              </SpkProp>
            </div>

            <div className="spk-divider" />

            <div className="spk-vtabs">
              {storyVersions.map(({ key, label, icon }) => (
                <button key={key} className={`spk-vtab${version === key ? ' on' : ''}`} onClick={() => setVersion(key)}>
                  {icon}<span className="spk-vtab-lbl">{label}</span>
                </button>
              ))}
            </div>
            <div className="spk-vhint">{version === 'tldr' ? 'The clean one-line version.' : version === 'arc' ? 'The story shape and proof.' : version === 'talk' ? 'Use this version in a draft.' : 'Original editable source.'}</div>
            <div className="spk-body">
              {version === 'raw' ? (
                <textarea className="spk-edit-textarea" value={content} onChange={e => setContent(e.target.value)} />
              ) : (
                <div className="spk-version"><p className="spk-version-text">{versionText}</p></div>
              )}
            </div>

            <div className="spk-divider" />
            <div className="spk-coach">
              <div className="spk-coach-block">
                <div className="spk-coach-hd memory"><Brain size={13} /> Remember to say</div>
                <ul className="spk-memory">
                  {(contentLines.slice(0, 3).length ? contentLines.slice(0, 3) : ['Tie the story to the specific audience.']).map(line => <li key={line}><span className="spk-mem-dot" /> {line}</li>)}
                </ul>
              </div>
              <div className="spk-coach-block">
                <div className="spk-coach-hd risk"><Warning size={13} /> Risk to avoid</div>
                <p className="spk-risk">Do not let this become generic. Keep one concrete proof point attached.</p>
              </div>
            </div>

            <div className="spk-actions">
              <button className="crm-tool ghost" onClick={() => void onDelete()}><Trash size={13} /> Delete</button>
              <button className="crm-tool primary" disabled={!dirty} onClick={() => void save()}><FloppyDisk size={13} /> Save</button>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

function SpkProp({ icon, label, children, alignTop }: { icon: ReactNode; label: string; children: ReactNode; alignTop?: boolean }) {
  return (
    <div className={`spk-prop${alignTop ? ' top' : ''}`}>
      <span className="spk-prop-key">{icon} {label}</span>
      <span className="spk-prop-val">{children}</span>
    </div>
  )
}

function SpkChips({ items, kind }: { items: string[]; kind?: string }) {
  if (!items.length) return <span className="spk-empty">--</span>
  return <span className="spk-chips">{items.map(item => <span key={item} className={`spk-chip ${kind ?? ''}`}>{item}</span>)}</span>
}

function AssembleOverlay({
  entries,
  opportunities,
  seed,
  onClose,
  onSave,
}: {
  entries: PlaybookEntry[]
  opportunities: Opportunity[]
  seed: { theme?: string | null; topic?: string | null } | null
  onClose: () => void
  onSave: (title: string, content: string, type: PlaybookEntryType, tags: string[]) => Promise<void>
}) {
  const [output, setOutput] = useState<'pitch' | 'application' | 'proposal' | 'cv'>('pitch')
  const [target, setTarget] = useState(seed?.theme && seed?.topic ? `${seed.theme} x ${seed.topic}` : '')
  const [result, setResult] = useState('')
  const [copied, setCopied] = useState(false)
  const bricks = entries.filter(e => e.content).slice(0, 8)

  const generate = () => {
    const proof = bricks.slice(0, 4).map(e => `- ${e.title}: ${e.content}`).join('\n')
    const title = target || 'this audience'
    const text = output === 'cv'
      ? `HEADLINE\nGo-to-market operator for ${title}.\n\nPROFESSIONAL SUMMARY\nI build the system behind relationship-led growth: narrative, proof, and useful follow-through.\n\nSELECTED ACHIEVEMENTS\n${proof || '- Add proof to the Playbook first.'}`
      : output === 'application'
        ? `HEADLINE\n${title} — one useful, specific reason to talk.\n\nSIGNATURE ACHIEVEMENTS\n${proof || '- Add wins to the Playbook first.'}\n\nOUTREACH NOTE\nI saw the shape of what you are building. I can be useful before I ask for anything: here is the clearest proof I would bring to the conversation.`
        : output === 'proposal'
          ? `THEIR PAIN\n${title} needs fewer vague conversations and more useful momentum.\n\nTHE VACATION\nNinety days from now, the next move is obvious and the proof is easy to reuse.\n\nWHAT I BRING\n${proof || '- Add value assets first.'}`
          : `I'm a go-to-market operator best known for turning relationship work into a system.\n\nThe useful question is not whether I can talk about ${title}; it is what would make this conversation valuable for you right now.`
    setResult(text)
  }

  return (
    <>
      <div className="asm-bg" onClick={onClose} />
      <section className="asm">
        <header className="asm-hd">
          <div><span className="asm-kicker"><Sparkle size={12} /> Assemble</span><h2>Build from your Playbook bricks</h2></div>
          <button className="peek-x" onClick={onClose} aria-label="Close playbook detail"><X size={14} /></button>
        </header>
        <div className="asm-grid">
          <div className="asm-form">
            <div className="pbf-bar">
              {(['pitch', 'application', 'proposal', 'cv'] as const).map(kind => (
                <button key={kind} className={`pbf-chip${output === kind ? ' on' : ''}`} onClick={() => setOutput(kind)}>{kind}</button>
              ))}
            </div>
            <textarea value={target} onChange={e => setTarget(e.target.value)} className="asm-target" placeholder="Audience, role, client, JD, or missing coverage cell..." />
            <div className="asm-rank">
              <span className="asm-rank-lbl"><Ranking size={12} /> Best-matched proof</span>
              {bricks.slice(0, 6).map((entry, i) => (
                <div className="asm-rank-row story" key={entry.id}>
                  <span className="asm-rank-ic"><BookOpen size={11} /></span>
                  <span className="asm-rank-title">{entry.title}</span>
                  <span className="asm-rank-bar"><span className="asm-rank-fill" style={{ width: `${100 - i * 12}%` }} /></span>
                  <span className="asm-rank-score">{Math.max(1, 6 - i)}</span>
                </div>
              ))}
            </div>
            <button className="pb-assemble-btn" onClick={generate}><Sparkle size={14} /> Generate</button>
          </div>
          <div className="asm-out">
            <textarea value={result} onChange={e => setResult(e.target.value)} className="asm-out-text" placeholder="Generated output appears here." />
            <div className="asm-actions">
              <select className="rounded-md border border-mercury bg-white px-2 py-2 text-[12px] text-burnham" defaultValue="">
                <option value="">No opportunity link</option>
                {opportunities.map(opp => <option key={opp.id} value={opp.id}>{opp.title}</option>)}
              </select>
              <button className="crm-tool ghost" onClick={() => { navigator.clipboard.writeText(result); setCopied(true) }}>{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}</button>
              <button className="crm-tool primary" disabled={!result.trim()} onClick={() => onSave(`Assembled ${output} ${new Date().toLocaleDateString()}`, result, output === 'cv' ? 'value_bank' : 'template', ['assembled', output, target].filter(Boolean))}><FloppyDisk size={13} /> Save</button>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

export default function Playbook() {
  const { user } = useAuth()
  const [entries, setEntries] = useState<PlaybookEntry[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<PlaybookTab>('coverage')
  const [peekId, setPeekId] = useState<string | null>(null)
  const [assembleSeed, setAssembleSeed] = useState<{ theme?: string | null; topic?: string | null } | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [entriesRes, contactsRes, companiesRes, oppsRes] = await Promise.all([
      supabase.from('playbook_entries').select('*').eq('user_id', user.id).order('list_order'),
      supabase.from('outreach_logs').select('*').eq('user_id', user.id).order('name'),
      supabase.from('companies').select('*').eq('user_id', user.id).order('name'),
      supabase.from('opportunities').select('*, company:companies(*)').eq('user_id', user.id).order('created_at', { ascending: false }),
    ])
    setEntries((entriesRes.data ?? []) as PlaybookEntry[])
    setContacts((contactsRes.data ?? []) as Contact[])
    setCompanies((companiesRes.data ?? []) as Company[])
    setOpportunities((oppsRes.data ?? []) as Opportunity[])
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  const stories = entries.filter(e => STORY_TYPES.includes(e.type))
  const wins = entries.filter(e => WIN_TYPES.includes(e.type) && (e.tags?.includes('win') || e.type !== 'story'))
  const values = entries.filter(e => VALUE_TYPES.includes(e.type))
  const bricks = useMemo(() => [
    ...stories.map(e => entryToBrick(e, 'story')),
    ...wins.map(e => entryToBrick(e, 'win')),
  ], [stories, wins])
  const peekEntries = tab === 'wins' ? wins : tab === 'value' ? values : stories
  const peekIndex = peekEntries.findIndex(e => e.id === peekId)
  const peekEntry = peekIndex >= 0 ? peekEntries[peekIndex] : null

  const addEntry = async (type: PlaybookEntryType, seed?: Partial<PlaybookEntry>) => {
    if (!user) return null
    const order = entries.filter(e => e.type === type).length
    const { data, error } = await supabase.from('playbook_entries').insert({
      user_id: user.id,
      type,
      title: seed?.title ?? 'New entry',
      content: seed?.content ?? null,
      tags: seed?.tags ?? [],
      framework: seed?.framework ?? null,
      list_order: order,
    }).select('*').single()
    if (!error && data) {
      const entry = data as PlaybookEntry
      setEntries(prev => [...prev, entry])
      setPeekId(entry.id)
      return entry
    }
    return null
  }

  const saveEntry = async (id: string, updates: Partial<PlaybookEntry>) => {
    const patch = { ...updates, updated_at: new Date().toISOString() }
    await supabase.from('playbook_entries').update(patch).eq('id', id)
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
  }

  const deleteEntry = async (id: string) => {
    await supabase.from('playbook_entries').delete().eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
    setPeekId(null)
  }

  const copyAll = () => navigator.clipboard.writeText(markdown(entries))

  if (loading) return <div className="flex h-full items-center justify-center text-sm text-shuttle">Loading...</div>

  return (
    <div className={`ppl-page pb-page${tab === 'coverage' ? ' cov-active' : ''}`}>
      <header className="ppl-hd">
        <div className="ppl-hd-l">
          <h1 className="ppl-title">Playbook</h1>
          <p className="ppl-sub">Your stories, wins, value and filters — the bricks. See your gaps, then assemble a pitch, an application, or a proposal.</p>
        </div>
        <div className="pb-hd-r">
          <button className="pb-assemble-btn" onClick={() => setAssembleSeed({})}><Sparkle size={14} /> Assemble</button>
          <button className="crm-tool ghost" onClick={copyAll}><Copy size={13} /> Copy</button>
          <PlaybookTabs tab={tab} onTab={setTab} />
        </div>
      </header>

      <div className="pb-cadence">
        <span className="pb-cad-q"><BookOpen size={12} /> Q2 Playbook</span>
        <span className="pb-cad-meta">Last reviewed {entries[0] ? new Date(entries[0].updated_at).toLocaleDateString() : 'never'}</span>
        <span className="pb-cad-grow" />
        <span className="pb-cad-next"><CheckCircle size={12} /> {stories.length} stories · {wins.length} wins · {values.length} assets</span>
        <button className="pb-cad-btn" onClick={() => setTab('coverage')}>Start quarterly review</button>
      </div>

      {tab === 'coverage' && (
        <CoverageMatrix
          bricks={bricks}
          onOpen={brick => { setTab(brick.kind === 'win' ? 'wins' : 'story'); setPeekId(brick.id) }}
          onDraftGap={(theme, topic) => setAssembleSeed({ theme, topic })}
        />
      )}
      {tab === 'story' && <StoryList stories={stories} onOpen={entry => setPeekId(entry.id)} onAdd={() => void addEntry('story', { tags: ['Narrative', 'Everyone'], framework: 'car' })} />}
      {tab === 'wins' && <WinsBank wins={wins} onOpen={entry => setPeekId(entry.id)} onAdd={() => void addEntry('value_prop', { title: 'New win', tags: ['win', 'Revenue'], framework: 'car' })} />}
      {tab === 'value' && <ValueBank values={values} onOpen={entry => setPeekId(entry.id)} onAdd={() => void addEntry('value_bank', { title: 'New value asset', tags: ['Everyone'] })} />}

      {peekEntry && (
        <EntryPeek
          entry={peekEntry}
          kind={tab === 'wins' ? 'Wins' : tab === 'value' ? 'Value bank' : 'Story bank'}
          index={peekIndex}
          total={peekEntries.length}
          onClose={() => setPeekId(null)}
          onPrev={() => setPeekId(peekEntries[(peekIndex - 1 + peekEntries.length) % peekEntries.length].id)}
          onNext={() => setPeekId(peekEntries[(peekIndex + 1) % peekEntries.length].id)}
          onSave={updates => saveEntry(peekEntry.id, updates)}
          onDelete={() => deleteEntry(peekEntry.id)}
        />
      )}

      {assembleSeed && (
        <AssembleOverlay
          entries={entries}
          opportunities={opportunities}
          seed={assembleSeed}
          onClose={() => setAssembleSeed(null)}
          onSave={async (title, content, type, tags) => {
            await addEntry(type, { title, content, tags })
            setAssembleSeed(null)
          }}
        />
      )}

      <span className="hidden">{contacts.length + companies.length}</span>
    </div>
  )
}
