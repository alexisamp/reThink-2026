import { ArrowSquareOut, Newspaper } from '@phosphor-icons/react'
import { useAuth } from '@/hooks/useAuth'
import { useContactFacts } from '@/hooks/useContactFacts'
import { isLinkedSignalFact, parseLinkedSignalFact } from '@/lib/contactSignals'
import { openLink } from '@/lib/openLink'

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ContactLinkedSignals({ contactId, className = '' }: { contactId: string; className?: string }) {
  const { user } = useAuth()
  const { facts } = useContactFacts(user?.id, contactId)
  const signals = facts.filter(isLinkedSignalFact)

  if (signals.length === 0) return null

  return (
    <div className={className}>
      <div className="text-[10px] uppercase tracking-wide text-shuttle/60 mb-2 flex items-center justify-between">
        <span>Linked signals</span>
        <span className="text-[10px] normal-case tracking-normal text-shuttle/40">{signals.length}</span>
      </div>
      <div className="space-y-1.5">
        {signals.map(signal => {
          const parsed = parseLinkedSignalFact(signal)
          return (
            <button
              key={signal.id}
              type="button"
              onClick={() => parsed.url && openLink(parsed.url)}
              className="w-full rounded-lg border border-mercury bg-white px-2.5 py-2 text-left hover:border-shuttle/40 transition-colors"
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border border-mercury bg-canvas text-shuttle">
                  <Newspaper size={12} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-midnight">
                    {parsed.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-[10px] text-shuttle/60">
                    <span className="truncate">{parsed.domain || 'source'}</span>
                    <span>·</span>
                    <span>{formatDate(signal.created_at)}</span>
                    <ArrowSquareOut size={10} className="flex-shrink-0" />
                  </span>
                  {(parsed.sharedText || parsed.note) && (
                    <span className="mt-1 line-clamp-2 block text-[11px] leading-snug text-shuttle/70">
                      {parsed.sharedText || parsed.note}
                    </span>
                  )}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
