import { useEffect, useRef, useState } from 'react'
import { CaretDown, Check, MagnifyingGlass } from '@phosphor-icons/react'

interface EditablePeekSelectProps<T extends string> {
  value: T
  options: Array<{ value: T; label: string }>
  onSave: (value: T) => Promise<void> | void
  searchPlaceholder?: string
  showDot?: boolean
  variant?: 'default' | 'relation'
}

export default function EditablePeekSelect<T extends string>({
  value,
  options,
  onSave,
  searchPlaceholder = 'Search values...',
  showDot = false,
  variant = 'default',
}: EditablePeekSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const selected = options.find(option => option.value === value)
  const filteredOptions = options.filter(option => option.label.toLowerCase().includes(query.trim().toLowerCase()))

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  async function choose(nextValue: T) {
    setOpen(false)
    setQuery('')
    if (nextValue !== value) await onSave(nextValue)
  }

  return (
    <div className="peek-select-wrap" ref={rootRef}>
      <button
        type="button"
        className={`peek-select-control ${variant}${open ? ' open' : ''}`}
        onClick={() => setOpen(current => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="peek-select-control-main">
          {showDot && <span className={`peek-select-control-dot stage-${value}`} />}
          <span>{selected?.label ?? value}</span>
        </span>
        <CaretDown size={11} weight="bold" />
      </button>
      {open && (
        <div className="peek-select-menu" role="listbox">
          <div className="peek-select-search">
            <MagnifyingGlass size={13} />
            <input
              autoFocus
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
            />
          </div>
          {filteredOptions.map(option => (
            <button
              type="button"
              key={option.value}
              className={`peek-select-option stage-${option.value}${option.value === value ? ' selected' : ''}`}
              onClick={() => void choose(option.value)}
              role="option"
              aria-selected={option.value === value}
            >
              <span className="peek-select-main"><span className="peek-select-dot" />{option.label}</span>
              {option.value === value && <Check size={11} weight="bold" />}
            </button>
          ))}
          {filteredOptions.length === 0 && <div className="peek-select-empty">No matching values</div>}
        </div>
      )}
    </div>
  )
}
