// Phase 5: Full implementation
import type { User } from '@supabase/supabase-js'
import type { CurrentContact } from '../App'
import { SidebarHeader } from '../App'
import { Avatar, StatusPill } from './WhatsAppMappedScreen'
import { DailyProgress } from '../components/DailyProgress'
import { TodoForm } from '../components/TodoForm'

interface Props {
  contact: CurrentContact
  user: User
  onSignOut: () => void
}

export function LinkedInKnownScreen({ contact, user, onSignOut }: Props) {
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
        <Avatar name={contact.name} photoUrl={contact.profilePhotoUrl} size={64} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '15px', fontWeight: 600, color: '#003720', margin: '0 0 2px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {contact.name ?? 'Unknown'}
          </p>
          {(contact.jobTitle || contact.company) && (
            <p style={{ fontSize: '12px', color: '#536471', margin: '0 0 6px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {[contact.jobTitle, contact.company].filter(Boolean).join(' · ')}
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {contact.status && <StatusPill status={contact.status} />}
            <span style={{ fontSize: '12px', color: scoreColor, fontWeight: 600 }}>● {score}/10</span>
          </div>
        </div>
      </div>

      <DailyProgress userId={user.id} />

      {/* Last interaction */}
      <div style={{ padding: '10px 12px', background: '#F8FAF8', borderRadius: '8px', marginBottom: '12px' }}>
        <p style={{ fontSize: '11px', color: '#536471', margin: 0 }}>Last interaction: {formatLastInteraction(contact.lastInteractionAt)}</p>
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
