interface Props {
  value: string
  onChange: (v: string) => void
}

// Values must match outreach_logs category CHECK constraint in DB
const CATEGORIES: { value: string; label: string }[] = [
  { value: 'peer',         label: 'Peer' },
  { value: 'mentor',       label: 'Mentor' },
  { value: 'client',       label: 'Client' },
  { value: 'partner',      label: 'Partner' },
  { value: 'business_dev', label: 'Business Dev' },
  { value: 'job_us',       label: 'Job / Recruiter' },
  { value: 'friend',       label: 'Friend' },
  { value: 'family',       label: 'Family' },
]

export function CategoryPicker({ value, onChange }: Props) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%',
        padding: '8px 12px',
        fontSize: '13px',
        border: '1px solid #E3E3E3',
        borderRadius: '8px',
        outline: 'none',
        color: '#003720',
        background: 'white',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {CATEGORIES.map(c => (
        <option key={c.value} value={c.value}>{c.label}</option>
      ))}
    </select>
  )
}
