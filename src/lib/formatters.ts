export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function parseCurrency(value: string): number | null {
  const clean = value.replace(/[^0-9.-]/g, '').trim()
  if (!clean) return null
  const parsed = Number(clean)
  return Number.isFinite(parsed) ? parsed : null
}
