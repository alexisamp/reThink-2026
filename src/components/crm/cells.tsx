// cells.tsx — presentational CRM cells + ABM chips, ported from the design handoff
// (crm-cells.jsx + AbmHub.jsx). Icons use the Phosphor web font via <Icon/>.

import { useState, type CSSProperties, type ReactNode } from 'react'
import {
  TIER_CFG, STRENGTH_CFG, REL_CFG, STATUS_CFG, STAGE_CFG, LIST_CFG,
  CHANNEL_CFG, SOURCE_CFG, ICP_CFG, ACCOUNT_SOURCE_CFG, MOTION_CFG,
  ACCOUNT_STAGE_CFG, SEAT_STATE_CFG, type CfgEntry,
} from '@/lib/crmConfig'
import type { Coverage } from '@/lib/abm'

type Vars = CSSProperties & Record<string, string | number>

export function Icon({ name, size = 14, weight }: { name: string; size?: number; weight?: 'fill' | 'bold' }) {
  const isFill = name.endsWith('-fill')
  const base = isFill ? name.slice(0, -5) : name
  const w = weight ?? (isFill ? 'fill' : undefined)
  const fam = w === 'fill' ? 'ph-fill' : w === 'bold' ? 'ph-bold' : 'ph'
  return <i className={`${fam} ph-${base}`} style={{ fontSize: size, lineHeight: 1 }} />
}

export function Avatar({ src, name, sq, size = 22 }: { src?: string | null; name?: string; sq?: boolean; size?: number }) {
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('')
  return (
    <span className={`crm-av${sq ? ' sq' : ''}`} style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {src ? <img src={src} alt="" /> : initials}
    </span>
  )
}

export function NameCell({ name, src, sq }: { name: string; src?: string | null; sq?: boolean }) {
  return (
    <span className="crm-name">
      <Avatar src={src} name={name} sq={sq} />
      <span className="link">{name}</span>
    </span>
  )
}

export function TierChip({ tier }: { tier?: number | null }) {
  const c = tier ? TIER_CFG[tier] : null
  if (!c) return <span className="crm-empty">—</span>
  return (
    <span className={`crm-chip tier t${tier}`} style={{ '--chip': c.color } as Vars}>
      <span className="em">{c.emoji}</span>{c.label}
    </span>
  )
}

export function StrengthCell({ value }: { value?: string }) {
  const c = STRENGTH_CFG[value ?? 'none'] || STRENGTH_CFG.none
  return (
    <span className="crm-strength">
      <span className="dots">
        {[0, 1, 2, 3].map(i => (
          <span key={i} className="d" style={{ background: i < (c.dots ?? 0) ? c.color : 'color-mix(in oklab, var(--mercury) 90%, transparent)' }} />
        ))}
      </span>
      <span className="lbl" style={{ color: c.dots ? 'var(--burnham)' : 'var(--fg-3)' }}>{c.label}</span>
    </span>
  )
}

export function StatusPill({ status }: { status?: string }) {
  const c = STATUS_CFG[status ?? 'prospect'] || STATUS_CFG.prospect
  return <span className="crm-pill" style={{ background: c.bg, color: c.fg }}>{status}</span>
}

export function StageChip({ stage }: { stage?: string }) {
  const c = STAGE_CFG[stage ?? 'prospect'] || STAGE_CFG.prospect
  return (
    <span className="crm-chip stage" style={{ '--chip': c.color } as Vars}>
      <span className="seg" style={{ background: c.color }} />{c.label}
    </span>
  )
}

export function CompanyCell({ name, mark }: { name?: string | null; mark?: string | null }) {
  if (!name) return <span className="crm-empty">No company</span>
  return (
    <span className="crm-name">
      <span className="crm-av sq logo">{mark || name[0]?.toUpperCase()}</span>
      <span className="link">{name}</span>
    </span>
  )
}

export interface StackPerson { id: string; name: string; avatar?: string | null }
export function PeopleStack({ people, max = 4, size = 22 }: { people?: StackPerson[]; max?: number; size?: number }) {
  if (!people || !people.length) return <span className="crm-empty">—</span>
  const shown = people.slice(0, max)
  const extra = people.length - shown.length
  return (
    <span className="crm-stack">
      {shown.map((p, i) => (
        <span className="crm-stack-av" key={p.id || i} style={{ zIndex: max - i }} title={p.name}>
          <Avatar src={p.avatar} name={p.name} size={size} />
        </span>
      ))}
      {extra > 0 && <span className="crm-stack-more" style={{ width: size, height: size }}>+{extra}</span>}
    </span>
  )
}

export function ListChips({ lists }: { lists?: string[] }) {
  if (!lists || !lists.length) return <span className="crm-empty">—</span>
  return (
    <span className="crm-listchips">
      {lists.map(k => (
        <span key={k} className="crm-listchip"><Icon name={LIST_CFG[k]?.icon || 'rows'} size={10} />{LIST_CFG[k]?.short || k}</span>
      ))}
    </span>
  )
}

export function Mono({ children, dim }: { children: ReactNode; dim?: boolean }) {
  return <span className="crm-mono" style={dim ? { color: 'var(--fg-3)' } : undefined}>{children}</span>
}

export function NextStepCell({ value }: { value?: string | null }) {
  if (!value) return <span className="crm-empty italic">Jacob wouldn't approve.</span>
  return <span className="crm-next">{value}</span>
}

export function FilterCell({ pass }: { pass?: boolean }) {
  return (
    <span className={`crm-filter ${pass ? 'pass' : 'fail'}`}>
      <Icon name={pass ? 'check' : 'x'} size={10} />{pass ? 'pass' : 'fail'}
    </span>
  )
}

export function CloserCell({ score = 0 }: { score?: number }) {
  return (
    <span className="crm-closer" title={`${score}/6 CLOSER`}>
      {['C', 'L', 'O', 'S', 'E', 'R'].map((ch, i) => (
        <span key={i} className={`c${i < score ? ' on' : ''}`}>{ch}</span>
      ))}
    </span>
  )
}

export function RelStatus({ value, label = true }: { value?: string; label?: boolean }) {
  const c = REL_CFG[value ?? 'dormant'] || REL_CFG.dormant
  return (
    <span className="rel-status">
      <span className="rel-dot" style={{ background: c.dot }} />
      {label && <span className="rel-lbl" style={{ color: c.color }}>{c.label}</span>}
    </span>
  )
}

export function ValueBar({ ledger, compact }: { ledger?: { given: number; received: number } | null; compact?: boolean }) {
  if (!ledger) return <span className="crm-empty">—</span>
  const net = (ledger.given || 0) - (ledger.received || 0)
  const tone = net > 0 ? 'give' : net < 0 ? 'owe' : 'even'
  const sign = net > 0 ? `+${net}` : net < 0 ? `${net}` : '0'
  const label = net > 0 ? 'you can ask' : net < 0 ? 'you owe' : 'even'
  return (
    <span className={`val-bar ${tone}`} title={`Given ${ledger.given} · Received ${ledger.received}`}>
      <span className="val-num">{sign}</span>
      {!compact && <span className="val-lbl">{label}</span>}
    </span>
  )
}

export function ChannelDots({ channels }: { channels?: string[] }) {
  if (!channels || !channels.length) return <span className="crm-empty">—</span>
  return (
    <span className="chan-dots">
      {channels.map(ch => {
        const c = CHANNEL_CFG[ch]
        return c ? <span key={ch} className="chan" title={c.label}><Icon name={c.icon!} size={12} /></span> : null
      })}
    </span>
  )
}

export function SourceTag({ source, when }: { source?: string; when?: string }) {
  const c = SOURCE_CFG[source ?? 'manual'] || SOURCE_CFG.manual
  return (
    <span className="src-tag" title={c.label}>
      <Icon name={c.icon!} size={10} /><span>{c.label}</span>
      {when && <span className="src-when">· {when}</span>}
    </span>
  )
}

export function MovementCell({ moved }: { moved?: { text: string } | null }) {
  if (!moved) return <span className="crm-empty quiet">no movement</span>
  return (
    <span className="mv-cell">
      <span className="mv-dot" />
      <span className="mv-txt">{moved.text}</span>
    </span>
  )
}

// ── ABM ────────────────────────────────────────────────────────────────────
export function AbmChip({ cfg, value, kind, accent, editable, onRename }: {
  cfg: Record<string, CfgEntry>; value?: string | null; kind: string; accent?: boolean; editable?: boolean
  onRename?: (key: string, label: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  if (!value || !cfg[value]) return <span className="crm-empty">—</span>
  const c = cfg[value]
  const commit = () => { if (text.trim() && onRename) onRename(value, text.trim()); setEditing(false) }
  const style = accent ? ({ '--ac': c.color } as Vars) : undefined
  if (editing) {
    return (
      <span className={`abm-chip ${kind} editing`} style={style}>
        <input autoFocus value={text} onChange={e => setText(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }} />
      </span>
    )
  }
  return (
    <span className={`abm-chip ${kind}`} style={style}
      onClick={editable ? e => { e.stopPropagation(); setText(c.label || ''); setEditing(true) } : undefined}
      title={editable ? 'Click to rename' : c.tag || ''}>
      {c.icon && <i className={`ph ph-${c.icon}`} />}
      <span className="abm-chip-tx">{c.label}</span>
      {c.tag && kind === 'icp' && <span className="abm-chip-tag">{c.tag}</span>}
    </span>
  )
}

export function AccountStageChip({ stage }: { stage?: string | null }) {
  const c = stage ? ACCOUNT_STAGE_CFG[stage] : null
  if (!c) return stage ? <span className="acct-stage" style={{ '--sc': 'var(--shuttle)' } as Vars}><span className="acct-stage-dot" />{stage}</span> : <span className="crm-empty">—</span>
  return <span className="acct-stage" style={{ '--sc': c.color } as Vars}><span className="acct-stage-dot" />{c.label}</span>
}

export function CoverageMini({ cov, icp }: { cov: Coverage | null; icp: string | null }) {
  if (!cov) return <span className="crm-empty">—</span>
  return (
    <span className="cov-mini" title={cov.headline}>
      <span className="cov-mini-dots">
        {cov.seats.map((s, i) => <span key={i} className="cov-mini-dot" style={{ background: SEAT_STATE_CFG[s.state].dot }} />)}
      </span>
      <span className={`cov-mini-lbl${cov.penetrated ? ' ok' : ''}`}>
        {icp === 'icp1' || icp === 'icp3' ? (cov.penetrated ? '●' : '○') : `${cov.talking}`}
      </span>
    </span>
  )
}

export interface StrategyCompany {
  icp?: string | null
  source?: string | null
  motion?: string | null
  stage?: string | null
  reason?: string | null
  gtm?: string | null
  nextStep?: string | null
}
export function AbmStrategyBlock({ company, onRename }: {
  company: StrategyCompany
  onRename?: (cfgKey: 'icp' | 'source' | 'motion', key: string, label: string) => void
}) {
  return (
    <div className="abm-strat">
      <div className="abm-strat-row">
        {company.icp && <div className="abm-strat-cell"><span className="abm-k">ICP</span><AbmChip cfg={ICP_CFG} value={company.icp} kind="icp" accent editable onRename={onRename ? (k, l) => onRename('icp', k, l) : undefined} /></div>}
        <div className="abm-strat-cell"><span className="abm-k">Source</span><AbmChip cfg={ACCOUNT_SOURCE_CFG} value={company.source} kind="src" editable onRename={onRename ? (k, l) => onRename('source', k, l) : undefined} /></div>
        {company.motion && <div className="abm-strat-cell"><span className="abm-k">Motion</span><AbmChip cfg={MOTION_CFG} value={company.motion} kind="mot" editable onRename={onRename ? (k, l) => onRename('motion', k, l) : undefined} /></div>}
        <div className="abm-strat-cell"><span className="abm-k">Stage</span><AccountStageChip stage={company.stage} /></div>
      </div>
      {company.reason && <div className="abm-reason"><span className="abm-k">Reason to target</span><p>{company.reason}</p></div>}
      {company.gtm && <div className="abm-gtm"><span className="abm-k">GTM hypothesis</span><p>{company.gtm}</p></div>}
      {company.nextStep && <div className="abm-next"><Icon name="arrow-bend-up-right" size={13} /><span>{company.nextStep}</span></div>}
    </div>
  )
}

export function CoverageStrip({ cov, icp, onOpenPerson }: {
  cov: Coverage | null; icp: string | null; onOpenPerson?: (id: string) => void
}) {
  if (!cov) {
    return (
      <div className="cov-strip investor">
        <div className="cov-invest"><Icon name="arrows-merge" size={13} /> Connector account — a source of intros, not a target seat to fill.</div>
      </div>
    )
  }
  return (
    <div className="cov-strip">
      <div className="cov-head">
        <div className="cov-head-l">
          <span className="cov-play">{cov.play.name}</span>
          <span className={`cov-headline${cov.penetrated ? ' ok' : ''}`}>{cov.headline}</span>
        </div>
        <div className="cov-meter" title={`${cov.filled} of ${cov.total} seats filled`}>
          {cov.seats.map((s, i) => <span key={i} className="cov-seg" style={{ background: SEAT_STATE_CFG[s.state].dot }} />)}
        </div>
      </div>
      <p className="cov-readout">{cov.play.readout}</p>
      <div className="cov-seats">
        {cov.seats.map(s => (
          <div key={s.key} className={`cov-seat ${s.state}${s.primary ? ' primary' : ''}${s.person ? ' clickable' : ''}`} style={{ '--ss': SEAT_STATE_CFG[s.state].color } as Vars}
            onClick={s.person && onOpenPerson ? () => onOpenPerson(s.person!.id) : undefined}>
            <span className="cov-seat-dot" />
            <span className="cov-seat-label">{s.label}{s.primary && <span className="cov-seat-star" title="The seat that decides this account">★</span>}</span>
            {s.person ? (
              <span className="cov-seat-person">
                <Avatar src={s.person.avatar} name={s.person.name} size={20} />
                <span className="cov-seat-name">{s.person.name}</span>
              </span>
            ) : (
              <span className="cov-seat-empty">open</span>
            )}
            <span className="cov-seat-state">{s.person ? `${SEAT_STATE_CFG[s.state].label} · ${s.person.last}` : 'gap'}</span>
          </div>
        ))}
      </div>
      {cov.others.length > 0 && (
        <div className="cov-others">
          <span className="cov-others-lbl">Also inside</span>
          {cov.others.map(p => (
            <span className="cov-other clickable" key={p.id} onClick={onOpenPerson ? () => onOpenPerson(p.id) : undefined}><Avatar src={p.avatar} name={p.name} size={18} />{p.name} · {p.role}</span>
          ))}
        </div>
      )}
      {cov.gaps.length > 0 && (
        <div className="cov-gap"><Icon name="warning-circle" size={12} /> Gap: {cov.gaps.join(' · ')} — {icp === 'icp1' ? 'fine here, the founder is the play.' : 'this account isn’t penetrated.'}</div>
      )}
    </div>
  )
}
