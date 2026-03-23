interface Props {
  value: string
  onChange: (v: string) => void
}

const CATEGORIES = ['Peer', 'Investor', 'Mentor', 'Customer', 'Collaborator', 'Recruiter', 'Other']

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
      }}
    >
      {CATEGORIES.map(c => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  )
}
