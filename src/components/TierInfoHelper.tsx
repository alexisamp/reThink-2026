import { useState } from 'react'
import { Info, X } from '@phosphor-icons/react'

/**
 * Small (ⓘ) icon that expands an inline helper explaining the tier
 * classification. Based on Jacob Warwick's Airport Test framework.
 *
 * Use inline next to a "Tier" label in any UI that lets the user tag contacts.
 * Self-contained: manages its own open/close state, no portal/popover
 * positioning — just a collapsible block below the trigger.
 */
export function TierInfoHelper({ align = 'left' }: { align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v) }}
        className="text-shuttle/40 hover:text-burnham transition-colors inline-flex items-center"
        title="What do Tier 1, 2, 3 mean?"
        aria-label="Tier definitions"
      >
        <Info size={11} weight="regular" />
      </button>

      {open && (
        <div
          className={`absolute top-5 ${align === 'right' ? 'right-0' : 'left-0'} z-20 w-72 bg-white border border-mercury rounded-xl shadow-lg p-3 text-left`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between mb-2">
            <span className="text-[9px] font-semibold uppercase tracking-widest text-shuttle">
              Airport Test — Jacob Warwick
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-shuttle/40 hover:text-burnham transition-colors -mr-1 -mt-0.5"
              aria-label="Close"
            >
              <X size={10} />
            </button>
          </div>

          <div className="space-y-2">
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] font-semibold bg-burnham text-white px-1.5 py-0.5 rounded-full">T1</span>
                <span className="text-[11px] font-semibold text-burnham">Airport pickup</span>
              </div>
              <p className="text-[10.5px] text-shuttle leading-snug">
                Close trust — if you flew into their city and called, they'd come get you. Launch pad for your daisy chain. Even one person here is enough to start.
              </p>
            </div>

            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] font-semibold bg-burnham text-white px-1.5 py-0.5 rounded-full">T2</span>
                <span className="text-[11px] font-semibold text-burnham">Shared identity</span>
              </div>
              <p className="text-[10.5px] text-shuttle leading-snug">
                Ex-colleagues, same school or company or industry. Foundation of mutual context but not deep personal connection. Aim for 10–15 here.
              </p>
            </div>

            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] font-semibold bg-burnham text-white px-1.5 py-0.5 rounded-full">T3</span>
                <span className="text-[11px] font-semibold text-burnham">Loose connections</span>
              </div>
              <p className="text-[10.5px] text-shuttle leading-snug">
                Friends of friends, met once or twice, LinkedIn connections you've never spoken to. Don't start outreach here — come back after momentum.
              </p>
            </div>
          </div>

          <p className="text-[9.5px] text-shuttle/50 mt-3 italic">
            Start the daisy chain at T1, work outward. Starting at T3 kills momentum.
          </p>
        </div>
      )}
    </span>
  )
}
