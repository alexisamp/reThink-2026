import {
  ArrowSquareOut,
  ArrowBendUpRight,
  CaretLeft,
  CaretDown,
  CaretUp,
  CheckSquare,
  DotsThree,
  EnvelopeSimple,
  FileText,
  LinkSimple,
  NotePencil,
  Paperclip,
  Star,
  X,
} from '@phosphor-icons/react'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

export interface PeekField {
  label: string
  value: ReactNode
  icon?: ReactNode
  wide?: boolean
  accent?: string
}

export interface PeekMove {
  verb: ReactNode
  detail: ReactNode
  action?: ReactNode
  accent?: string
}

export interface PeekActivity {
  text: ReactNode
  when?: ReactNode
  source?: ReactNode
}

export interface PeekDoc {
  name: string
  url?: string | null
  type?: string | null
  when?: string | null
}

type RecordPeekTab = { id: string; label: string; count?: number; content?: ReactNode }
type RecordPeekSideSection = {
  title: string
  items?: ReactNode[]
  empty?: ReactNode
  actionLabel?: string
  onAction?: () => void
}

interface RecordPeekProps {
  open: boolean
  title: string
  subtitle?: string | null
  eyebrow?: string
  avatar?: ReactNode
  fields?: PeekField[]
  highlights?: PeekField[]
  recommendedMove?: PeekMove | null
  activity?: PeekActivity[]
  docs?: PeekDoc[]
  listItems?: ReactNode[]
  whyNow?: ReactNode[]
  overviewBeforeHighlights?: boolean
  activityTitle?: string
  children?: ReactNode
  belowHighlights?: ReactNode
  tabs?: RecordPeekTab[]
  sideSections?: RecordPeekSideSection[]
  actions?: ReactNode
  onAddToList?: () => void
  onBack?: () => void
  backLabel?: string
  index?: number | null
  total?: number
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
}

const defaultTabs: RecordPeekTab[] = [
  { id: 'Overview', label: 'Overview' },
  { id: 'Activity', label: 'Activity' },
  { id: 'Docs', label: 'Docs' },
]

function EmptyValue() {
  return <span className="spk-empty">--</span>
}

function FieldRow({ field }: { field: PeekField }) {
  return (
    <div className={`peek-field${field.wide ? ' wide' : ''}`}>
      <span className="pf-label">{field.icon}{field.label}</span>
      <span className="pf-value">{field.value || <EmptyValue />}</span>
    </div>
  )
}

function Highlight({ field }: { field: PeekField }) {
  return (
    <div className="peek-hl" style={field.accent ? { '--hl': field.accent } as CSSProperties : undefined}>
      <span className="hl-hd"><span>{field.label}</span>{field.icon}</span>
      <span className="hl-body">{field.value || <EmptyValue />}</span>
    </div>
  )
}

function FallbackAvatar({ title }: { title: string }) {
  const initials = title
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || '?'
  return <span className="peek-avatar-fallback">{initials}</span>
}

export default function RecordPeek({
  open,
  title,
  subtitle,
  eyebrow = 'Record',
  avatar,
  fields = [],
  highlights = [],
  recommendedMove,
  activity = [],
  docs = [],
  listItems,
  whyNow = [],
  overviewBeforeHighlights = false,
  activityTitle = 'Activity',
  children,
  belowHighlights,
  tabs,
  sideSections = [],
  actions,
  onAddToList,
  onBack,
  backLabel,
  index,
  total,
  onClose,
  onPrev,
  onNext,
}: RecordPeekProps) {
  const activeTabs = tabs?.length ? tabs : defaultTabs
  const tabsKey = activeTabs.map(item => item.id).join('|')
  const [tab, setTab] = useState(activeTabs[0]?.id ?? 'Overview')
  const [showAllFields, setShowAllFields] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(true)
  const [notice, setNotice] = useState('')
  const noticeRef = useRef<number | null>(null)
  const visibleFields = showAllFields ? fields : fields.slice(0, 5)

  const showNotice = (message: string) => {
    setNotice(message)
    if (noticeRef.current) window.clearTimeout(noticeRef.current)
    noticeRef.current = window.setTimeout(() => setNotice(''), 2200)
  }

  useEffect(() => {
    setTab((tabs?.length ? tabs : defaultTabs)[0]?.id ?? 'Overview')
    setShowAllFields(false)
    setDetailsOpen(true)
  }, [title, tabsKey])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!open) return
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowUp' && onPrev) onPrev()
      if (event.key === 'ArrowDown' && onNext) onNext()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, onNext, onPrev, open])

  useEffect(() => {
    const onNotice = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail
      if (typeof detail === 'string' && detail.trim()) showNotice(detail)
    }
    window.addEventListener('rethink:peek-notice', onNotice)
    return () => window.removeEventListener('rethink:peek-notice', onNotice)
  }, [])

  if (!open) return null

  return (
    <>
      <div className="peek-bg" onClick={onClose} />
      <aside className="peek" role="dialog" aria-label={title || eyebrow}>
        <div className="peek-topbar">
          {onBack && <button className="peek-x peek-back" onClick={onBack} aria-label={backLabel ?? 'Back'}><CaretLeft size={13} /><CaretLeft size={13} /></button>}
          <button className="peek-x" onClick={onClose} aria-label="Close record peek"><X size={14} /></button>
          <div className="peek-nav">
            <button onClick={onPrev} disabled={!onPrev} aria-label="Previous record"><CaretUp size={12} /></button>
            <button onClick={onNext} disabled={!onNext} aria-label="Next record"><CaretDown size={12} /></button>
          </div>
          {total && index != null ? <span className="peek-pos">{index + 1} of {total} in {eyebrow}</span> : <span className="peek-pos">{eyebrow}</span>}
          <span className="spk-top-grow" />
          <span className="peek-top-avatar" aria-hidden="true">A</span>
          <button className="peek-top-icon" aria-label="Comments" onClick={() => showNotice('Comments are not connected yet')}><NotePencil size={13} /></button>
          <button className="peek-top-icon" aria-label="Help" onClick={() => showNotice('Edit fields directly; relation rows open linked records')}>?</button>
          <button className="peek-top-icon" aria-label="More" onClick={() => showNotice('More actions are not connected yet')}><DotsThree size={15} /></button>
          <button className="peek-ask" onClick={() => showNotice('AI record assistant is not connected yet')}>Ask Attio</button>
        </div>

        <div className="peek-split">
          <aside className="peek-left">
            <div className="peek-id">
              <div className="peek-avatar">{avatar || <FallbackAvatar title={title} />}</div>
              <div className="peek-id-txt">
                <span className="peek-name">{title}</span>
                {subtitle && <p className="peek-sub">{subtitle}</p>}
              </div>
              <button className="peek-icn" title="Favorite" aria-label="Favorite" onClick={() => showNotice('Favorite is not connected yet')}><Star size={14} /></button>
            </div>

            <div className="peek-actions">
              {actions ?? (
                <>
                  <button className="peek-primary" onClick={() => showNotice('Composer is not connected yet')}><EnvelopeSimple size={13} /> Compose email</button>
                  {onAddToList && <button className="peek-primary" onClick={onAddToList}><FileText size={13} /> Add to list</button>}
                  <button
                    className="peek-primary"
                    aria-label="Note"
                    onClick={() => activeTabs.some(item => item.id === 'Notes') ? setTab('Notes') : showNotice('Notes are not available on this record')}
                  >
                    <NotePencil size={13} /> New note
                  </button>
                  <button className="peek-icn sq" aria-label="Copy record link" onClick={() => showNotice('Record link is not connected yet')}><LinkSimple size={13} /></button>
                  <button className="peek-icn sq" aria-label="Create task" onClick={() => showNotice('Tasks are not connected yet')}><CheckSquare size={13} /></button>
                </>
              )}
            </div>

            {fields.length > 0 && (
              <div className="peek-section">
                <div className="peek-section-hd">
                  <span>Record Details</span>
                  <button className={`peek-icn${detailsOpen ? ' open' : ''}`} onClick={() => setDetailsOpen(prev => !prev)} aria-label="Collapse details"><CaretDown size={12} /></button>
                </div>
                {detailsOpen && (
                  <>
                    <div className="peek-fields">
                      {visibleFields.map(field => <FieldRow key={field.label} field={field} />)}
                    </div>
                    {fields.length > visibleFields.length && (
                      <button className="peek-show-values" onClick={() => setShowAllFields(true)}>Show all values</button>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="peek-section">
              <div className="peek-section-hd">
                <span>Lists</span>
                {onAddToList && <button className="peek-addlist" onClick={onAddToList}>Add to list</button>}
              </div>
              <div className="peek-lists">
                {listItems?.length
                  ? listItems.map((item, i) => <span key={i}>{item}</span>)
                  : <span className="peek-empty-lists">Not in any list yet.</span>}
              </div>
            </div>

            {sideSections.map(section => (
              <div className="peek-section" key={section.title}>
                <div className="peek-section-hd">
                  <span>{section.title}</span>
                  {section.actionLabel && <button className="peek-addlist" onClick={section.onAction}>{section.actionLabel}</button>}
                </div>
                <div className="peek-side-list">
                  {section.items?.length
                    ? section.items.map((item, i) => <div key={i}>{item}</div>)
                    : <span className="peek-empty-lists">{section.empty ?? 'Set a value...'}</span>}
                </div>
              </div>
            ))}
          </aside>

          <section className="peek-main">
            <div className="peek-tabs">
              {activeTabs.map(item => (
                <button key={item.id} className={`peek-tab${tab === item.id ? ' active' : ''}`} onClick={() => setTab(item.id)}>
                  {item.label}{item.count !== undefined ? <span className="peek-tab-ct">{item.count}</span> : null}
                </button>
              ))}
            </div>
            <div className="peek-scroll">
              {activeTabs.find(item => item.id === tab)?.content ?? null}
              {tab === 'Overview' && !activeTabs.find(item => item.id === tab)?.content && (
                <>
                  {recommendedMove && (
                    <div className="peek-move" style={{ '--rc': recommendedMove.accent ?? 'var(--moss)' } as CSSProperties}>
                      <div className="pm-top">
                        <span className="pm-eyebrow">Recommended next move</span>
                      </div>
                      <div className="pm-verb">{recommendedMove.verb}</div>
                      <p className="pm-detail">{recommendedMove.detail}</p>
                      <div className="pm-cta">
                        <button className="peek-primary sm"><ArrowBendUpRight size={13} /> {recommendedMove.action ?? recommendedMove.verb}</button>
                        <button className="peek-ghost">Snooze</button>
                      </div>
                    </div>
                  )}
                  {whyNow.length > 0 && (
                    <>
                      <div className="peek-block-label">Why now</div>
                      <ul className="peek-why">
                        {whyNow.map((item, i) => <li key={i}><span className="why-dot" /> {item}</li>)}
                      </ul>
                    </>
                  )}
                  {overviewBeforeHighlights && children && <div className="peek-body">{children}</div>}
                  {highlights.length > 0 && (
                    <>
                      <div className="peek-block-label spaced">Highlights</div>
                    <div className="peek-hl-grid">
                      {highlights.map(field => <Highlight key={field.label} field={field} />)}
                    </div>
                    </>
                  )}
                  {!overviewBeforeHighlights && children && <div className="peek-body">{children}</div>}
                  {belowHighlights && <div className="peek-body">{belowHighlights}</div>}
                </>
              )}
              {tab === 'Activity' && !activeTabs.find(item => item.id === tab)?.content && (
                <div>
                  <div className="peek-block-label spaced">{activityTitle} <a className="peek-viewall" href="#">View all</a></div>
                  {activity.length > 0 ? (
                    <div className="peek-activity">
                      {activity.map((item, i) => (
                        <div className="peek-act-row" key={i}>
                          <span className="dot" />
                          <span className="act-txt">{item.text}{item.source ? <span className="act-src"> · {item.source}</span> : null}</span>
                          <span className="act-when">{item.when || '--'}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="peek-docs-empty"><FileText size={16} /><span>No activity captured yet.</span></div>
                  )}
                </div>
              )}
              {tab === 'Docs' && !activeTabs.find(item => item.id === tab)?.content && (
                <div className="peek-docs">
                  <div className="peek-block-label">Linked documents <span className="peek-count">{docs.length}</span></div>
                  <p className="peek-docs-hint">Proposals, decks, briefs, contracts and file pills tied to this record.</p>
                  <div className="peek-docs-list">
                    {docs.length === 0 ? (
                      <div className="peek-docs-empty"><Paperclip size={16} /><span>No documents linked yet.</span></div>
                    ) : docs.map((doc, i) => (
                      <div className="peek-doc" key={`${doc.name}-${i}`}>
                        <span className="peek-doc-ic"><FileText size={15} /></span>
                        <div className="peek-doc-meta">
                          {doc.url
                            ? <a className="peek-doc-name" href={doc.url} target="_blank" rel="noreferrer">{doc.name}</a>
                            : <span className="peek-doc-name">{doc.name}</span>}
                          <span className="peek-doc-sub">{doc.type || 'Doc'}{doc.when ? ` · ${doc.when}` : ''}</span>
                        </div>
                        {doc.url && <a className="peek-doc-open" href={doc.url} target="_blank" rel="noreferrer" title="Open"><ArrowSquareOut size={13} /></a>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </aside>
      <div className={`rp-toast${notice ? ' on' : ''}`}>{notice}</div>
    </>
  )
}
