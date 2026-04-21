// Avatar components extracted from the (now-removed) WhatsAppMappedScreen.
// Used by both LinkedIn screens for the contact avatar render.

import { useState } from 'react'

function initials(name?: string | null): string {
  const n = (name ?? '').trim()
  if (!n) return '?'
  return n.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}

export function Avatar({
  name,
  photoUrl,
  size = 40,
}: {
  name?: string | null
  photoUrl?: string | null
  size?: number
}) {
  const [failed, setFailed] = useState(false)
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: '#E5EBE7',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
        fontSize: Math.round(size * 0.38),
        fontWeight: 600,
        color: '#536471',
      }}
    >
      {photoUrl && !failed ? (
        <img
          src={photoUrl}
          alt={name ?? ''}
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <span>{initials(name)}</span>
      )}
    </div>
  )
}

/** Avatar with a colored health-score dot in the bottom-right corner. */
export function AvatarWithDot({
  name,
  photoUrl,
  size = 52,
  score,
}: {
  name?: string | null
  photoUrl?: string | null
  size?: number
  score?: number | null
}) {
  const dotColor =
    score == null ? '#CBD5D0'
    : score >= 7 ? '#79D65E'
    : score >= 4 ? '#F5B642'
    : '#E57373'
  const dotSize = Math.max(10, Math.round(size * 0.24))
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <Avatar name={name} photoUrl={photoUrl} size={size} />
      <span
        title={score != null ? `Health ${score}/10` : 'No health score'}
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          background: dotColor,
          border: '2px solid white',
        }}
      />
    </div>
  )
}
