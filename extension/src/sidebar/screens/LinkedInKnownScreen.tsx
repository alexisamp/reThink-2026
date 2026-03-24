// Phase 5: Full implementation
import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import type { CurrentContact } from '../App'
import { SidebarHeader } from '../App'
import { Avatar, StatusPill } from './WhatsAppMappedScreen'
import { DailyProgress } from '../components/DailyProgress'
import { TodoForm } from '../components/TodoForm'
import { supabase } from '../../lib/supabase'

interface Props {
  contact: CurrentContact
  user: User
  onSignOut: () => void
}

export function LinkedInKnownScreen({ contact, user, onSignOut }: Props) {
  const [interactionCount, setInteractionCount] = useState<number>(0)

  useEffect(() => {
    supabase.from('interactions').select('id', { count: 'exact', head: true })
      .eq('contact_id', contact.reThinkId!)
      .then(({ count }) => setInteractionCount(count ?? 0))
  }, [contact.reThinkId])

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
        <Avatar name={contact.name} photoUrl={contact.profilePhotoUrl} size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '15px', fontWeight: 700, color: '#003720', margin: '0 0 2px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

      {/* Personal context */}
      {contact.personalContext && (
        <div style={{ padding: '8px 12px', background: '#F3F4F6', borderRadius: '8px', marginBottom: '12px' }}>
          <p style={{ fontSize: '12px', color: '#536471', margin: 0, fontStyle: 'italic', lineHeight: 1.5 }}>
            {contact.personalContext}
          </p>
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <div style={{ flex: 1, padding: '8px 10px', background: '#F8FAF8', borderRadius: '8px', textAlign: 'center' }}>
          <p style={{ fontSize: '16px', fontWeight: 700, color: '#003720', margin: '0 0 2px 0' }}>{interactionCount}</p>
          <p style={{ fontSize: '11px', color: '#536471', margin: 0 }}>interactions</p>
        </div>
        <div style={{ flex: 1, padding: '8px 10px', background: '#F8FAF8', borderRadius: '8px', textAlign: 'center' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#003720', margin: '0 0 2px 0' }}>{formatLastInteraction(contact.lastInteractionAt)}</p>
          <p style={{ fontSize: '11px', color: '#536471', margin: 0 }}>last contact</p>
        </div>
      </div>

      <DailyProgress userId={user.id} />

      <TodoForm contactId={contact.reThinkId!} contactName={contact.name ?? 'Contact'} userId={user.id} />

      <button
        onClick={copyDeepLink}
        style={{ width: '100%', marginTop: '12px', fontSize: '13px', color: '#536471', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textAlign: 'center' }}
      >
        Open in reThink →
      </button>
    </div>
  )
}
