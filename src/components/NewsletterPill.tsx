import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface NewsletterItem {
  id: string
  newsletter: string
  subject: string
  received_at: string
  gmail_link: string
  read_at: string | null
}

const NEWSLETTER_EMOJIS: Record<string, string> = {
  'Exit Five': '📘',
  "Lenny's Newsletter": '📗',
  'Ruben Hassid': '🤖',
  'Kieran Flanagan': '⚡',
}

function getEmoji(newsletter: string): string {
  return NEWSLETTER_EMOJIS[newsletter] ?? '📧'
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffH = diffMs / 3600000
  const diffD = diffMs / 86400000

  if (diffH < 1) return 'hace un momento'
  if (diffH < 24) {
    const h = Math.floor(diffH)
    return `hoy ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  if (diffD < 2) return `ayer ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  const days = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`
}

export default function NewsletterPill() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NewsletterItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [dismissing, setDismissing] = useState<Set<string>>(new Set())

  // Fetch unread count on mount
  const fetchCount = useCallback(async () => {
    const { data } = await supabase
      .from('newsletter_items')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null)
      .gt('received_at', new Date(Date.now() - 7 * 86400000).toISOString())
    setUnreadCount(data ?? 0)
  }, [])

  useEffect(() => { fetchCount() }, [fetchCount])

  // Fetch full list when drawer opens
  const fetchItems = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('newsletter_items')
      .select('id, newsletter, subject, received_at, gmail_link, read_at')
      .gt('received_at', new Date(Date.now() - 7 * 86400000).toISOString())
      .order('received_at', { ascending: false })
    setItems(data ?? [])
    setLoading(false)
  }, [])

  const handleOpen = () => {
    setOpen(true)
    fetchItems()
  }

  const markRead = async (item: NewsletterItem) => {
    if (item.read_at || dismissing.has(item.id)) return

    // Optimistic update
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, read_at: new Date().toISOString() } : i))
    setUnreadCount(c => Math.max(0, c - 1))

    // Start dismiss animation after short delay
    setTimeout(() => {
      setDismissing(prev => new Set([...prev, item.id]))
    }, 400)

    // Remove from list after animation
    setTimeout(() => {
      setItems(prev => prev.filter(i => i.id !== item.id))
      setDismissing(prev => { const s = new Set(prev); s.delete(item.id); return s })
    }, 1800)

    // Persist
    await supabase
      .from('newsletter_items')
      .update({ read_at: new Date().toISOString() })
      .eq('id', item.id)
  }

  const unread = items.filter(i => !i.read_at)
  const read = items.filter(i => i.read_at)

  return (
    <>
      {/* Pill button */}
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 bg-white border border-mercury rounded-full px-3 py-1.5 shadow-md text-[11px] text-shuttle hover:border-shuttle/40 transition-colors"
      >
        <span>📬</span>
        <span>Newsletters</span>
        {unreadCount > 0 && (
          <span className="bg-burnham text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Drawer */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[190] bg-black/10 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div className="fixed right-0 top-0 bottom-0 z-[195] w-80 bg-white border-l border-mercury shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-mercury/60">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-shuttle/50 mb-0.5">Últimos 7 días</p>
                <p className="text-sm font-semibold text-burnham">📬 Newsletters</p>
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
                <div className="flex flex-col items-center justify-center h-40 gap-2">
                  <span className="text-2xl">✓</span>
                  <p className="text-[12px] text-shuttle/40">Todo al día</p>
                </div>
              ) : (
                <div className="py-2">
                  {/* Unread */}
                  {unread.length > 0 && (
                    <div>
                      <p className="text-[9px] uppercase tracking-widest text-shuttle/30 font-mono px-5 py-2">Sin leer</p>
                      {unread.map(item => (
                        <NewsletterRow
                          key={item.id}
                          item={item}
                          dismissing={dismissing.has(item.id)}
                          onMark={() => markRead(item)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Read (if any exist before being removed) */}
                  {read.length > 0 && (
                    <div>
                      <p className="text-[9px] uppercase tracking-widest text-shuttle/30 font-mono px-5 py-2 mt-2">Leídos</p>
                      {read.map(item => (
                        <NewsletterRow
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
              <p className="text-[9px] text-shuttle/25 font-mono">Actualizado cada mañana via Claude Desktop</p>
            </div>
          </div>
        </>
      )}
    </>
  )
}

function NewsletterRow({
  item,
  dismissing,
  onMark,
}: {
  item: NewsletterItem
  dismissing: boolean
  onMark: () => void
}) {
  const isRead = !!item.read_at

  return (
    <div
      className={`flex items-start gap-3 px-5 py-3 hover:bg-mercury/10 transition-all duration-500 ${
        dismissing ? 'opacity-0 scale-95 -translate-x-2' : 'opacity-100'
      } ${isRead ? 'opacity-40' : ''}`}
    >
      {/* Newsletter icon + info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[11px]">{getEmoji(item.newsletter)}</span>
          <span className="text-[10px] text-shuttle/50 font-medium truncate">{item.newsletter}</span>
          <span className="text-[9px] text-shuttle/30 ml-auto shrink-0">{formatDate(item.received_at)}</span>
        </div>
        <a
          href={item.gmail_link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onMark}
          className={`text-[12px] leading-snug block hover:text-burnham transition-colors ${
            isRead ? 'line-through text-shuttle/40' : 'text-burnham'
          }`}
        >
          {item.subject}
        </a>
      </div>

      {/* Checkbox */}
      {!isRead && (
        <button
          onClick={onMark}
          className="shrink-0 mt-0.5 w-4 h-4 rounded border border-mercury hover:border-pastel transition-colors flex items-center justify-center group"
        >
          <span className="text-[8px] text-pastel opacity-0 group-hover:opacity-100 transition-opacity">✓</span>
        </button>
      )}
      {isRead && (
        <span className="shrink-0 mt-0.5 w-4 h-4 rounded bg-gossip/40 border border-pastel/40 flex items-center justify-center">
          <span className="text-[8px] text-pastel">✓</span>
        </span>
      )}
    </div>
  )
}
