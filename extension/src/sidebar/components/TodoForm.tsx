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
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    if (!text.trim() || !dueDate) return
    setSaving(true)
    try {
      const { error } = await supabase.from('todos').insert({
        user_id: userId,
        text: text.trim(),
        date: dueDate,
        outreach_log_id: contactId,
      })
      if (error) throw error
      setText('')
      setDueDate('')
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
        Follow-up added for {contactName} ✓
      </div>
    )
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{ width: '100%', padding: '8px 12px', border: '1px dashed #E3E3E3', borderRadius: '8px', background: 'none', color: '#536471', fontSize: '13px', cursor: 'pointer', textAlign: 'left' }}
      >
        + Add follow-up for {contactName}
      </button>
    )
  }

  const canSave = text.trim() && dueDate && !saving

  return (
    <div style={{ border: '1px solid #E5E7EB', borderRadius: '10px', padding: '12px', background: '#F8FAF8' }}>
      <input
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="What do you commit to doing?"
        autoFocus
        onKeyDown={e => e.key === 'Enter' && canSave && handleSave()}
        style={{ width: '100%', padding: '6px 0', fontSize: '13px', border: 'none', borderBottom: '1px solid #E5E7EB', outline: 'none', color: '#003720', boxSizing: 'border-box', background: 'transparent', marginBottom: '10px' }}
      />
      <div style={{ marginBottom: '10px' }}>
        <label style={{ fontSize: '10px', fontWeight: 600, color: '#536471', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>
          Due date (required)
        </label>
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          style={{ padding: '6px 8px', fontSize: '13px', border: '1px solid #E5E7EB', borderRadius: '6px', outline: 'none', color: '#003720', fontFamily: 'inherit', background: 'white' }}
        />
      </div>
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
        <button
          onClick={() => { setExpanded(false); setText(''); setDueDate('') }}
          style={{ fontSize: '12px', color: '#536471', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave}
          style={{
            padding: '5px 14px',
            borderRadius: '6px',
            background: canSave ? '#003720' : '#E5E7EB',
            color: canSave ? 'white' : '#536471',
            fontSize: '12px',
            fontWeight: 500,
            border: 'none',
            cursor: canSave ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? '...' : 'Add'}
        </button>
      </div>
    </div>
  )
}
