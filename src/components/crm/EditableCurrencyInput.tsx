import { useEffect, useRef, useState } from 'react'
import { formatCurrency, parseCurrency } from '@/lib/formatters'

interface EditableCurrencyInputProps {
  value: number | null | undefined
  placeholder?: string
  onSave: (value: number | null) => Promise<void> | void
}

export default function EditableCurrencyInput({
  value,
  placeholder = 'Set Deal value...',
  onSave,
}: EditableCurrencyInputProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!editing) setDraft(value == null ? '' : String(value))
  }, [editing, value])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  async function commit() {
    const next = parseCurrency(draft)
    const current = value == null ? null : Number(value)
    setEditing(false)
    if (next === current) return
    await onSave(next)
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={`peek-inline-input peek-currency-display${value == null ? ' empty' : ''}`}
        onClick={() => setEditing(true)}
      >
        {value == null ? placeholder : formatCurrency(value)}
      </button>
    )
  }

  return (
    <input
      ref={inputRef}
      className="peek-inline-input"
      inputMode="decimal"
      value={draft}
      placeholder="0.00"
      onChange={event => setDraft(event.target.value)}
      onBlur={() => { void commit() }}
      onKeyDown={event => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(value == null ? '' : String(value))
          setEditing(false)
        }
      }}
    />
  )
}
