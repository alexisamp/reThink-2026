import type { CSSProperties } from 'react'

export const ICON_PATHS = {
  'caret-down': 'M4 6l4 4 4-4',
  'caret-up': 'M4 10l4-4 4 4',
  'caret-right': 'M6 4l4 4-4 4',
  'caret-left': 'M10 4L6 8l4 4',
  'chevron-right': 'M6 3l5 5-5 5',
  activity: 'M1.5 8h3l2-5 3 10 2-5h3',
  arrowRight: 'M3 8h9M9 5l3 3-3 3',
  arrowUpRight: 'M5 11l6-6M6.5 5H11v4.5',
  article: 'M3.5 2.5h9v11h-9zM5.5 5.5h5M5.5 8h5M5.5 10.5h3',
  bell: 'M8 2.4a3.4 3.4 0 0 0-3.4 3.4c0 3.4-1.4 4.4-1.4 4.4h9.6s-1.4-1-1.4-4.4A3.4 3.4 0 0 0 8 2.4zM6.6 12.6a1.5 1.5 0 0 0 2.8 0',
  bolt: 'M8.8 1.7L3.6 9.1h3.6l-.8 5.2 5.2-7.4H8l.8-5.2z',
  braces: 'M6 2.5C4.5 2.5 4.5 4 4.5 5.2S4.5 7.5 3 8c1.5.5 1.5 1.6 1.5 2.8s0 2.7 1.5 2.7M10 2.5c1.5 0 1.5 1.5 1.5 2.7S11.5 7.5 13 8c-1.5.5-1.5 1.6-1.5 2.8s0 2.7-1.5 2.7',
  brackets: 'M6 3H4.5A1 1 0 0 0 3.5 4v3l-1 1 1 1v3a1 1 0 0 0 1 1H6M10 3h1.5a1 1 0 0 1 1 1v3l1 1-1 1v3a1 1 0 0 1-1 1H10',
  calendar: 'M3 4.5h10v9H3zM3 7h10M5.5 2.8v2.4M10.5 2.8v2.4',
  caretDown: 'M4 6l4 4 4-4',
  caretLeft: 'M10 4L6 8l4 4',
  caretUp: 'M4 10l4-4 4 4',
  caretRight: 'M6 4l4 4-4 4',
  chat: 'M2.8 3.5h10.4v7H6.5L3.5 13v-2.5H2.8z',
  check: 'M3.5 8.5l3 3 6-7',
  checkcircle: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM5.5 8l1.7 1.7L10.5 6',
  columns: 'M2.5 3.5h11v9h-11zM6.2 3.5v9M9.8 3.5v9',
  contact: 'M2.5 3.5h11v9h-11zM5.5 7.2a1.4 1.4 0 1 0 0-2.7 1.4 1.4 0 0 0 0 2.7zM3.6 11c.2-1.3 1-2 1.9-2s1.7.7 1.9 2M9.5 6h3M9.5 8.5h3M9.5 11h2',
  copy: 'M5.5 5.5V3.4a.9.9 0 0 1 .9-.9h6.2a.9.9 0 0 1 .9.9v6.2a.9.9 0 0 1-.9.9h-2.1M2.5 6.4a.9.9 0 0 1 .9-.9h6.2a.9.9 0 0 1 .9.9v6.2a.9.9 0 0 1-.9.9H3.4a.9.9 0 0 1-.9-.9z',
  clock: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 5v3.2l2 1.3',
  dollar: 'M8 2.5v11M10.3 4.8C10 3.7 9 3.3 8 3.3c-1.3 0-2.3.7-2.3 1.8 0 2.6 4.8 1.4 4.8 4 0 1.2-1.1 1.9-2.5 1.9-1.2 0-2.2-.5-2.5-1.6',
  dots: 'M4 8h.01M8 8h.01M12 8h.01',
  eye: 'M1.5 8S3.8 3.8 8 3.8 14.5 8 14.5 8 12.2 12.2 8 12.2 1.5 8 1.5 8zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  eyeOff: 'M6.3 4.1A6.4 6.4 0 0 1 8 3.8c4.2 0 6.5 4.2 6.5 4.2a11 11 0 0 1-1.8 2.3M3.4 5.2A11 11 0 0 0 1.5 8S3.8 12.2 8 12.2c.9 0 1.7-.2 2.4-.5M2 2l12 12',
  enter: 'M13 3v4.5a2 2 0 0 1-2 2H3.5M6 7L3.2 9.5 6 12',
  export: 'M8 10.5V3M8 3L5.5 5.5M8 3l2.5 2.5M3 9.5v2a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5v-2',
  file: 'M4 2.5h5l3 3v8H4zM9 2.5v3h3',
  funnel: 'M2.5 3.5h11l-4.2 5v4l-2.6 1.3v-5.3z',
  gear: 'M8 6.1a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8zM8 1.7v1.7M8 12.6v1.7M14.3 8h-1.7M3.4 8H1.7M12.45 3.55l-1.2 1.2M4.75 11.25l-1.2 1.2M12.45 12.45l-1.2-1.2M4.75 4.75l-1.2-1.2',
  globe: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM2.2 8h11.6M8 2.2c1.7 1.6 2.6 3.7 2.6 5.8S9.7 12.2 8 13.8C6.3 12.2 5.4 10.1 5.4 8S6.3 3.8 8 2.2z',
  gmail: 'M2.5 4.2h11v7.6h-11zM2.8 4.6L8 8.5l5.2-3.9M5.2 6.3v5.1M10.8 6.3v5.1',
  grid: 'M2.5 2.5h4.3v4.3H2.5zM9.2 2.5h4.3v4.3H9.2zM2.5 9.2h4.3v4.3H2.5zM9.2 9.2h4.3v4.3H9.2z',
  hash: 'M6 2.5L4.5 13.5M11.5 2.5L10 13.5M2.8 5.5h10.4M2.2 10.5h10.4',
  folder: 'M2.5 4.5h3.5l1 1.3h6v6.7h-10.5zM2.5 4.5v7.5',
  grip: 'M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01',
  home: 'M2.7 7L8 2.8 13.3 7M4 6v7h8V6',
  heart: 'M8 13.2S2.7 10 2.7 6.2A2.9 2.9 0 0 1 8 4.5a2.9 2.9 0 0 1 5.3 1.7C13.3 10 8 13.2 8 13.2z',
  image: 'M2.5 3.5h11v9h-11zM2.5 10l3-3 3 2.7M9 8.7l2-1.7 2.5 2.3M11 6.2a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8z',
  kanban: 'M2.8 3h3v10h-3zM6.6 3h3v6.5h-3zM10.4 3h3v8.5h-3z',
  link: 'M6.5 9.5l3-3M6 4.5l1.2-1.2a2.6 2.6 0 0 1 3.7 3.7L9.5 8.2M10 11.5l-1.2 1.2a2.6 2.6 0 0 1-3.7-3.7L6.5 7.8',
  linkedin: 'M4.5 2.8h7a1.7 1.7 0 0 1 1.7 1.7v7a1.7 1.7 0 0 1-1.7 1.7h-7a1.7 1.7 0 0 1-1.7-1.7v-7A1.7 1.7 0 0 1 4.5 2.8zM5.4 6.8v4M5.4 5.1h.01M7.6 10.8v-4M7.6 8c0-1 2.8-1.2 2.8.6v2.2',
  list: 'M5.5 4.5h8M5.5 8h8M5.5 11.5h8M2.6 4.5h.01M2.6 8h.01M2.6 11.5h.01',
  listadd: 'M2.5 4.5h6M2.5 8h6M2.5 11.5h4M10.5 9.5v4M8.5 11.5h4',
  lock: 'M4.2 7V5.4a2.8 2.8 0 0 1 5.6 0V7M3.5 7h7v5.5h-7z',
  dumbbell: 'M2.5 8h1.5M12 8h1.5M4 5.5v5M12 5.5v5M4 8h8M2 6.5v3M14 6.5v3',
  mailPlus: 'M2.5 4h8v4.5M2.5 4l4 3.2L10.5 4M2.5 4v7h5M11 9.5v4M9 11.5h4',
  minus: 'M3.5 8h9',
  pencil: 'M10.5 2.8l2.7 2.7L6 12.7 3 13.4l.7-3z',
  pin: 'M8 14s4.5-4 4.5-7.5a4.5 4.5 0 1 0-9 0C3.5 10 8 14 8 14zM8 7.5v.01',
  panel: 'M2.8 3h10.4v10H2.8zM6.5 3v10',
  plus: 'M8 3.5v9M3.5 8h9',
  record: 'M3 2.5h10v11H3zM5.4 5.5h5.2M5.4 8h5.2M5.4 10.5h3',
  relation: 'M5.2 3.2a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8zM5.2 6v4M5.2 12.2a1.4 1.4 0 1 0 0-.01M10.8 6a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8zM10.8 6c0 3-2.5 3.8-4.2 4.2',
  repeat: 'M11.6 4.4H5.7a2.7 2.7 0 0 0-2.7 2.7v.6M4.4 11.6h5.9a2.7 2.7 0 0 0 2.7-2.7v-.6M9.3 2.1l2.3 2.3-2.3 2.3M6.7 13.9l-2.3-2.3 2.3-2.3',
  rows: 'M2.5 4.5h11M2.5 8h11M2.5 11.5h11',
  search: 'M7.2 12a4.8 4.8 0 1 0 0-9.6 4.8 4.8 0 0 0 0 9.6zM11 11l2.5 2.5',
  sort: 'M4 3v10M4 13l-2-2M4 13l2-2M12 13V3M12 3l-2 2M12 3l2 2',
  star: 'M8 2.5l1.6 3.6 3.9.4-2.9 2.6.8 3.8L8 11.6 4.6 13.5l.8-3.8L2.5 7l3.9-.4z',
  status: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 10.2A2.2 2.2 0 1 0 8 5.8a2.2 2.2 0 0 0 0 4.4z',
  sparkle: 'M8 2l1.3 3.4L13 6.7 9.6 8 8 11.5 6.4 8 3 6.7l3.7-1.3z',
  sliders: 'M3 5h6M11 5h2M3 11h2M7 11h6M9 3.5v3M5 9.5v3',
  target: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 10.5A2.5 2.5 0 1 0 8 5.5a2.5 2.5 0 0 0 0 5z',
  table: 'M2.5 3.5h11v9h-11zM2.5 7h11M6.2 3.5v9',
  tag: 'M2.8 8.2l5 5 5.4-5.4V2.8H7.8zM10.8 5.2h.01',
  text: 'M4 4.5h8M4 4.5V4M8 4.5v7M6.5 11.5h3',
  users: 'M6 8a2.4 2.4 0 1 0 0-4.8A2.4 2.4 0 0 0 6 8zM1.8 13c0-2.3 1.9-3.6 4.2-3.6s4.2 1.3 4.2 3.6M11 3.4a2.2 2.2 0 0 1 0 4.3M12 9.5c1.5.4 2.4 1.4 2.4 3',
  trash: 'M3 4.5h10M6 4.5V3.2A1 1 0 0 1 7 2.2h2a1 1 0 0 1 1 1v1.3M4.3 4.5l.6 8a1 1 0 0 0 1 .9h4.2a1 1 0 0 0 1-.9l.6-8',
  x: 'M4 4l8 8M12 4l-8 8',
} as const

export type TodayIconName = keyof typeof ICON_PATHS

export function Icon({
  name,
  size = 14,
  sw = 1.5,
  fill = false,
  style,
}: {
  name: TodayIconName
  size?: number
  sw?: number
  fill?: boolean
  style?: CSSProperties
}) {
  const d = ICON_PATHS[name]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

const LOGO_STYLES: Record<string, { bg: string; fg: string; ch: string }> = {
  attio: { bg: '#111', fg: '#fff', ch: 'A' },
  ramp: { bg: '#f7d417', fg: '#111', ch: 'R' },
  granola: { bg: '#e8542a', fg: '#fff', ch: 'G' },
  wander: { bg: '#1f6feb', fg: '#fff', ch: 'W' },
}

export function Logo({ id, size = 22, sq = true }: { id?: string | null; size?: number; sq?: boolean }) {
  const imageUrl = id && /^(https?:\/\/|data:image\/)/i.test(id) ? id : null
  const s = id && LOGO_STYLES[id]
    ? LOGO_STYLES[id]
    : { bg: 'color-mix(in oklab, var(--mercury) 55%, transparent)', fg: 'var(--shuttle)', ch: (id || '?')[0].toUpperCase() }
  return (
    <span
      className={`avatar${sq ? ' sq' : ''}`}
      style={{ width: size, height: size, background: s.bg, color: s.fg, fontSize: size * 0.44 }}
    >
      {s.ch}
      {imageUrl && <img src={imageUrl} alt="" referrerPolicy="no-referrer" onError={event => { event.currentTarget.style.display = 'none' }} />}
    </span>
  )
}
