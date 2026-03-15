import { useState, useEffect, useCallback } from 'react'
import { Tray, ArrowSquareOut } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'

async function openLink(url: string) {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

interface NewsletterItem {
  id: string
  newsletter: string
  subject: string
  received_at: string
  gmail_link: string
  read_at: string | null
}

const SENDER_STYLES: Record<string, { initials: string; bgClass: string; textClass: string }> = {
  'Exit Five':           { initials: 'EF', bgClass: 'bg-burnham',    textClass: 'text-white' },
  "Lenny's Newsletter":  { initials: 'LN', bgClass: 'bg-pastel',     textClass: 'text-burnham' },
  'Ruben Hassid':        { initials: 'RH', bgClass: 'bg-shuttle/20', textClass: 'text-shuttle' },
  'Kieran Flanagan':     { initials: 'KF', bgClass: 'bg-gossip',     textClass: 'text-burnham' },
}

function getSenderStyle(newsletter: string) {
  return SENDER_STYLES[newsletter] ?? {
    initials: newsletter.slice(0, 2).toUpperCase(),
    bgClass: 'bg-mercury',
    textClass: 'text-shuttle',
  }
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffH = (now.getTime() - d.getTime()) / 3600000
  const hhmm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  if (diffH < 24) return `hoy ${hhmm}`
  if (diffH < 48) return `ayer ${hhmm}`
  const days = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`
}

function formatSyncTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffH = (now.getTime() - d.getTime()) / 3600000
  const hhmm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  if (diffH < 24) return `last sync · today at ${hhmm}`
  if (diffH < 48) return `last sync · yesterday at ${hhmm}`
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  return `last sync · ${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`
}

export default function NewsletterPill() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NewsletterItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [dismissing, setDismissing] = useState<Set<string>>(new Set())
  const [lastSync, setLastSync] = useState<string | null>(null)

  const fetchCount = useCallback(async () => {
    const { count } = await supabase
      .from('newsletter_items')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null)
      .gt('received_at', new Date(Date.now() - 7 * 86400000).toISOString())
    setUnreadCount(count ?? 0)
  }, [])

  useEffect(() => { fetchCount() }, [fetchCount])

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('newsletter_items')
      .select('id, newsletter, subject, received_at, gmail_link, read_at')
      .gt('received_at', new Date(Date.now() - 7 * 86400000).toISOString())
      .order('received_at', { ascending: false })
    const result = data ?? []
    setItems(result)
    if (result.length > 0) setLastSync(result[0].received_at)
    setLoading(false)
  }, [])

  const handleOpen = () => {
    setOpen(true)
    fetchItems()
  }

  const markRead = async (item: NewsletterItem) => {
    if (item.read_at || dismissing.has(item.id)) return
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, read_at: new Date().toISOString() } : i))
    setUnreadCount(c => Math.max(0, c - 1))
    setTimeout(() => {
      setDismissing(prev => new Set([...prev, item.id]))
    }, 400)
    setTimeout(() => {
      setItems(prev => prev.filter(i => i.id !== item.id))
      setDismissing(prev => { const s = new Set(prev); s.delete(item.id); return s })
    }, 1800)
    await supabase
      .from('newsletter_items')
      .update({ read_at: new Date().toISOString() })
      .eq('id', item.id)
  }

  // Hide completely when nothing to show
  if (unreadCount === 0 && !open) return null

  const unread = items.filter(i => !i.read_at)
  const read = items.filter(i => i.read_at)

  return (
    <>
      {/* Pill */}
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 bg-white border border-mercury rounded-full px-3 py-1.5 shadow-md text-[11px] text-shuttle hover:border-shuttle/40 transition-colors"
      >
        <Tray size={12} className="text-shuttle/60" />
        <span>Feed</span>
        <span className="bg-burnham text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      </button>

      {/* Centered modal */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-[190] bg-black/10 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-0 z-[195] flex items-center justify-center pointer-events-none">
            <div className="pointer-events-auto w-96 max-h-[70vh] bg-white rounded-2xl border border-mercury shadow-2xl flex flex-col">

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-mercury/60">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-shuttle/50 mb-0.5">Últimos 7 días</p>
                  <p className="text-sm font-semibold text-burnham flex items-center gap-1.5">
                    <Tray size={14} />
                    Feed
                  </p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="text-shuttle/40 hover:text-shuttle transition-colors text-lg leading-none"
                >
                  ×
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-32">
                    <span className="text-[11px] text-shuttle/30 animate-pulse">Cargando…</span>
                  </div>
                ) : items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40">
                    <p className="text-[12px] text-shuttle/40">Todo al día</p>
                  </div>
                ) : (
                  <div className="py-2">
                    {unread.length > 0 && (
                      <div>
                        <p className="text-[9px] uppercase tracking-widest text-shuttle/30 font-mono px-5 py-2">Sin leer</p>
                        {unread.map(item => (
                          <FeedRow
                            key={item.id}
                            item={item}
                            dismissing={dismissing.has(item.id)}
                            onMark={() => markRead(item)}
                          />
                        ))}
                      </div>
                    )}
                    {read.length > 0 && (
                      <div>
                        <p className="text-[9px] uppercase tracking-widest text-shuttle/30 font-mono px-5 py-2 mt-2">Leídos</p>
                        {read.map(item => (
                          <FeedRow
                            key={item.id}
                            item={item}
                            dismissing={false}
                            onMark={() => {}}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-mercury/60">
                <p className="text-[9px] text-shuttle/25 font-mono">
                  {lastSync ? formatSyncTime(lastSync) : '—'}
                </p>
              </div>

            </div>
          </div>
        </>
      )}
    </>
  )
}

function FeedRow({
  item,
  dismissing,
  onMark,
}: {
  item: NewsletterItem
  dismissing: boolean
  onMark: () => void
}) {
  const isRead = !!item.read_at
  const style = getSenderStyle(item.newsletter)

  return (
    <div
      className={`group flex items-start gap-3 px-5 py-3 hover:bg-mercury/10 transition-all duration-500 cursor-pointer ${
        dismissing ? 'opacity-0 scale-95 -translate-x-2' : 'opacity-100'
      } ${isRead ? 'opacity-40' : ''}`}
      onClick={() => { openLink(item.gmail_link); onMark() }}
    >
      {/* Sender avatar */}
      <div className={`shrink-0 w-6 h-6 rounded-full ${style.bgClass} ${style.textClass} flex items-center justify-center text-[8px] font-bold mt-0.5`}>
        {style.initials}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[10px] text-shuttle/50 font-medium truncate">{item.newsletter}</span>
          <span className="text-[9px] text-shuttle/30 ml-auto shrink-0">{formatRelative(item.received_at)}</span>
        </div>
        <div className="flex items-start gap-1">
          <span className={`text-[12px] leading-snug flex-1 min-w-0 ${
            isRead ? 'line-through text-shuttle/40' : 'text-burnham'
          }`}>
            {item.subject}
          </span>
          <ArrowSquareOut
            size={11}
            className="shrink-0 mt-0.5 text-shuttle/20 group-hover:text-shuttle/50 transition-colors"
          />
        </div>
      </div>

      {/* Checkbox */}
      <div onClick={e => e.stopPropagation()}>
        {!isRead && (
          <button
            onClick={onMark}
            className="shrink-0 mt-0.5 w-4 h-4 rounded border border-mercury hover:border-pastel transition-colors flex items-center justify-center group/check"
          >
            <span className="text-[8px] text-pastel opacity-0 group-hover/check:opacity-100 transition-opacity">✓</span>
          </button>
        )}
        {isRead && (
          <span className="shrink-0 mt-0.5 w-4 h-4 rounded bg-gossip/40 border border-pastel/40 flex items-center justify-center">
            <span className="text-[8px] text-pastel">✓</span>
          </span>
        )}
      </div>
    </div>
  )
}
