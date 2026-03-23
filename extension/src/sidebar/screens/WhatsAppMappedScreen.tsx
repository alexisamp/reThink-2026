// Phase 3: Full implementation
import type { User } from '@supabase/supabase-js'
import type { CurrentContact } from '../App'
import { SidebarHeader } from '../App'
import { DailyProgress } from '../components/DailyProgress'
import { TodoForm } from '../components/TodoForm'

interface Props {
  contact: CurrentContact
  user: User
  onSignOut: () => void
}

export function WhatsAppMappedScreen({ contact, user, onSignOut }: Props) {
  const score = contact.healthScore ?? 1
  const scoreColor = score >= 7 ? '#79D65E' : score >= 4 ? '#F59E0B' : '#EF4444'

  function formatLastInteraction(ts: string | null | undefined): string {
    if (!ts) return 'No interactions yet'
    const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    return `${days} days ago`
  }

  function copyDeepLink() {
    if (contact.reThinkId) {
      navigator.clipboard.writeText(`rethink://people/${contact.reThinkId}`)
        .then(() => alert('Link copied — open reThink'))
        .catch(() => {})
    }
  }

  return (
    <div style={{ padding: '16px', background: 'white', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <SidebarHeader onSignOut={onSignOut} />

      {/* Contact card */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '12px' }}>
        <Avatar name={contact.name} photoUrl={contact.profilePhotoUrl} size={48} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '15px', fontWeight: 600, color: '#003720', margin: '0 0 2px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {contact.name ?? 'Unknown'}
          </p>
          {(contact.jobTitle || contact.company) && (
            <p style={{ fontSize: '12px', color: '#536471', margin: '0 0 6px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {[contact.jobTitle, contact.company].filter(Boolean).join(' · ')}
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {contact.status && <StatusPill status={contact.status} />}
            <span style={{ fontSize: '12px', color: scoreColor, fontWeight: 600 }}>● {score}/10</span>
          </div>
        </div>
      </div>

      <DailyProgress userId={user.id} />

      {/* Interaction status */}
      <div style={{ padding: '10px 12px', background: '#F8FAF8', borderRadius: '8px', marginBottom: '12px' }}>
        <p style={{ fontSize: '12px', color: '#003720', margin: '0 0 2px 0', fontStyle: 'italic' }}>Interaction logged ✓</p>
        <p style={{ fontSize: '11px', color: '#536471', margin: 0 }}>Last: {formatLastInteraction(contact.lastInteractionAt)}</p>
      </div>

      <TodoForm contactId={contact.reThinkId!} contactName={contact.name ?? 'Contact'} userId={user.id} />

      <button
        onClick={copyDeepLink}
        style={{ width: '100%', marginTop: '12px', fontSize: '13px', color: '#536471', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textAlign: 'center' }}
      >
        Open in reThink ↗
      </button>
    </div>
  )
}

// ===== SHARED UI =====

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
    PROSPECT:  { bg: '#E5F9BD', color: '#003720' },
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
