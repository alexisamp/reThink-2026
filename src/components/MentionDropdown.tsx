export interface MentionItem {
  label: string
  insert: string
  sub?: string
}

export interface MentionSection {
  header: string
  type: 'goal' | 'milestone' | 'todo' | 'command'
  items: MentionItem[]
}

interface MentionDropdownProps {
  sections: MentionSection[]
  selectedIdx: number
  onSelect: (item: MentionItem) => void
}

export default function MentionDropdown({ sections, selectedIdx, onSelect }: MentionDropdownProps) {
  const activeSections = sections.filter(s => s.items.length > 0)
  if (activeSections.length === 0) return null

  const sectionsWithStart = activeSections.reduce<Array<{ section: typeof activeSections[0]; startIdx: number }>>(
    (acc, section) => {
      const startIdx = acc.length === 0 ? 0 : acc[acc.length - 1].startIdx + acc[acc.length - 1].section.items.length
      return [...acc, { section, startIdx }]
    },
    []
  )

  const showHeaders = activeSections.length > 1

  return (
    <div className="bg-white border border-mercury rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
      {sectionsWithStart.map(({ section, startIdx }, si) => (
        <div key={si}>
          {showHeaders && (
            <p className={`text-[9px] uppercase tracking-widest text-shuttle/30 font-mono px-4 py-1.5 bg-mercury/10 ${si > 0 ? 'border-t border-mercury/30' : ''}`}>
              {section.header}
            </p>
          )}
          {section.items.map((item, ii) => {
            const idx = startIdx + ii
            return (
              <button
                key={`${si}-${ii}`}
                onMouseDown={e => { e.preventDefault(); onSelect(item) }}
                className={`w-full flex items-center justify-between px-4 py-2 text-left transition-colors ${
                  idx === selectedIdx ? 'bg-gossip/30 text-burnham' : 'text-burnham hover:bg-mercury/20'
                }`}
              >
                <span className="text-[13px] font-medium truncate">{item.label}</span>
                {item.sub && (
                  <span className="text-[10px] text-shuttle/40 ml-3 truncate max-w-[140px] shrink-0">{item.sub}</span>
                )}
              </button>
            )
          })}
        </div>
      ))}
      <div className="px-3 py-1 border-t border-mercury/40 bg-mercury/5">
        <span className="text-[9px] text-shuttle/25 font-mono">↑↓ navegar · Tab seleccionar · Esc cerrar</span>
      </div>
    </div>
  )
}
