import {
  ArrowSquareOut,
  ArrowBendUpRight,
  CaretDown,
  CaretUp,
  DotsThree,
  EnvelopeSimple,
  FileText,
  NotePencil,
  Paperclip,
  Phone,
  Star,
  X,
} from '@phosphor-icons/react'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'

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
  index?: number | null
  total?: number
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
}

type PeekTab = 'Overview' | 'Activity' | 'Docs'

const tabs: PeekTab[] = ['Overview', 'Activity', 'Docs']

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
  index,
  total,
  onClose,
  onPrev,
  onNext,
}: RecordPeekProps) {
  const [tab, setTab] = useState<PeekTab>('Overview')

  useEffect(() => {
    setTab('Overview')
  }, [title])

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

  if (!open) return null

  return (
    <>
      <div className="peek-bg" onClick={onClose} />
      <aside className="peek" role="dialog" aria-label={title || eyebrow}>
        <div className="peek-topbar">
          <button className="peek-x" onClick={onClose} aria-label="Close record peek"><X size={14} /></button>
          <div className="peek-nav">
            <button onClick={onPrev} disabled={!onPrev} aria-label="Previous record"><CaretUp size={12} /></button>
            <button onClick={onNext} disabled={!onNext} aria-label="Next record"><CaretDown size={12} /></button>
          </div>
          {total && index != null ? <span className="peek-pos">{index + 1} of {total} in {eyebrow}</span> : <span className="peek-pos">{eyebrow}</span>}
          <span className="spk-top-grow" />
        </div>

        <div className="peek-split">
          <aside className="peek-left">
            <div className="peek-id">
              <div className="peek-avatar">{avatar || <FallbackAvatar title={title} />}</div>
              <div className="peek-id-txt">
                <span className="peek-name">{title}</span>
                {subtitle && <p className="peek-sub">{subtitle}</p>}
              </div>
              <button className="peek-icn" title="Favorite" aria-label="Favorite"><Star size={14} /></button>
            </div>

            <div className="peek-actions">
              <button className="peek-primary"><EnvelopeSimple size={13} /> Compose email</button>
              <button className="peek-icn sq" aria-label="Call"><Phone size={13} /></button>
              <button className="peek-icn sq" aria-label="Note"><NotePencil size={13} /></button>
              <button className="peek-icn sq" aria-label="More actions"><DotsThree size={15} /></button>
            </div>

            {fields.length > 0 && (
              <div className="peek-section">
                <div className="peek-section-hd">
                  <span>Record details</span>
                  <button className="peek-icn" aria-label="Collapse details"><CaretDown size={12} /></button>
                </div>
                <div className="peek-fields">
                  {fields.map(field => <FieldRow key={field.label} field={field} />)}
                </div>
              </div>
            )}

            <div className="peek-section">
              <div className="peek-section-hd">
                <span>Lists</span>
                <a className="peek-addlist" href="#">Add to list</a>
              </div>
              <div className="peek-lists">
                {listItems?.length
                  ? listItems.map((item, i) => <span key={i}>{item}</span>)
                  : <span className="peek-empty-lists">Not in any list yet.</span>}
              </div>
            </div>
          </aside>

          <section className="peek-main">
            <div className="peek-tabs">
              {tabs.map(item => (
                <button key={item} className={`peek-tab${tab === item ? ' active' : ''}`} onClick={() => setTab(item)}>
                  {item}{item === 'Docs' && docs.length > 0 ? <span className="peek-tab-ct">{docs.length}</span> : null}
                </button>
              ))}
            </div>
            <div className="peek-scroll">
              {tab === 'Overview' && (
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
              {tab === 'Activity' && (
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
              {tab === 'Docs' && (
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
    </>
  )
}
