import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

interface Props {
  userId: string
}

interface HabitProgress {
  habitId: string
  label: string
  value: number
  target: number
}

export function DailyProgress({ userId }: Props) {
  const [progress, setProgress] = useState<HabitProgress[]>([])

  useEffect(() => {
    loadProgress()
  }, [userId])

  async function loadProgress() {
    try {
      const { data: habits } = await supabase
        .from('habits')
        .select('id, text, tracks_outreach, target_value')
        .eq('user_id', userId)
        .eq('is_active', true)
        .in('tracks_outreach', ['networking', 'prospecting'])

      if (!habits || habits.length === 0) return

      const today = new Date().toISOString().split('T')[0]
      const { data: logs } = await supabase
        .from('habit_logs')
        .select('habit_id, value')
        .eq('user_id', userId)
        .eq('log_date', today)
        .in('habit_id', habits.map((h: any) => h.id))

      const logsMap = new Map((logs ?? []).map((l: any) => [l.habit_id, l.value]))

      const items: HabitProgress[] = habits.map((h: any) => ({
        habitId: h.id,
        label: h.tracks_outreach === 'networking' ? 'people' : 'mapped',
        value: logsMap.get(h.id) ?? 0,
        target: h.target_value ?? (h.tracks_outreach === 'networking' ? 5 : 10),
      }))

      setProgress(items)
    } catch {
      // Fail silently — progress is non-critical
    }
  }

  if (progress.length === 0) return null

  return (
    <div style={{
      background: '#F8FAF8',
      borderRadius: '8px',
      padding: '10px 12px',
      marginBottom: '12px',
    }}>
      <p style={{ fontSize: '11px', fontWeight: 600, color: '#536471', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Today</p>
      {progress.map(item => (
        <ProgressRow key={item.habitId} item={item} />
      ))}
    </div>
  )
}

function ProgressRow({ item }: { item: HabitProgress }) {
  const done = item.value >= item.target
  const dots = Math.min(item.target, 20) // cap at 20 dots

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
      <span style={{ fontSize: '12px', color: done ? '#79D65E' : '#536471', fontWeight: done ? 600 : 400, minWidth: '60px' }}>
        {item.value}/{item.target} {item.label}
      </span>
      <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
        {Array.from({ length: dots }).map((_, i) => (
          <span
            key={i}
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: i < item.value ? '#79D65E' : '#E3E3E3',
              display: 'inline-block',
            }}
          />
        ))}
      </div>
    </div>
  )
}
