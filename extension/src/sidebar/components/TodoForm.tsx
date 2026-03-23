import { useState } from 'react'
import { supabase } from '../../lib/supabase'

interface Props {
  contactId: string
  contactName: string
  userId: string
}

export function TodoForm({ contactId, contactName, userId }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [text, setText] = useState('')
  const [effort, setEffort] = useState<'LOW' | 'MED' | 'HIGH'>('LOW')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    if (!text.trim()) return
    setSaving(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const { error } = await supabase.from('todos').insert({
        user_id: userId,
        text: text.trim(),
        date: today,
        effort,
        outreach_log_id: contactId,
      })
      if (error) throw error
      setText('')
      setSaved(true)
      setExpanded(false)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('Failed to create todo:', err)
      alert('Failed to save todo. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <div style={{ padding: '8px 12px', background: '#E5F9BD', borderRadius: '8px', fontSize: '12px', color: '#003720' }}>
        Todo added for {contactName} ✓
      </div>
    )
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{ width: '100%', padding: '8px 12px', border: '1px dashed #E3E3E3', borderRadius: '8px', background: 'none', color: '#536471', fontSize: '13px', cursor: 'pointer', textAlign: 'left' }}
      >
        + Add todo for {contactName}
      </button>
    )
  }

  return (
    <div style={{ border: '1px solid #E3E3E3', borderRadius: '8px', padding: '12px' }}>
      <input
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="What do you need to do?"
        autoFocus
        onKeyDown={e => e.key === 'Enter' && handleSave()}
        style={{ width: '100%', padding: '6px 0', fontSize: '13px', border: 'none', outline: 'none', color: '#003720', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', gap: '6px', marginTop: '8px', alignItems: 'center' }}>
        {(['LOW', 'MED', 'HIGH'] as const).map(e => (
          <button
            key={e}
            onClick={() => setEffort(e)}
            style={{
              padding: '3px 8px',
              borderRadius: '6px',
              border: '1px solid',
              borderColor: effort === e ? '#003720' : '#E3E3E3',
              background: effort === e ? '#003720' : 'white',
              color: effort === e ? 'white' : '#536471',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            {e}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => { setExpanded(false); setText('') }}
          style={{ fontSize: '12px', color: '#536471', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!text.trim() || saving}
          style={{
            padding: '4px 12px',
            borderRadius: '6px',
            background: text.trim() ? '#003720' : '#E3E3E3',
            color: text.trim() ? 'white' : '#536471',
            fontSize: '12px',
            fontWeight: 500,
            border: 'none',
            cursor: text.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? '...' : 'Add'}
        </button>
      </div>
    </div>
  )
}
