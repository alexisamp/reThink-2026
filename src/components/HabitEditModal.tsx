import { useState, useEffect } from 'react'
import { X } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { Habit, Goal } from '@/types'

interface HabitEditModalProps {
  habit: Habit | null
  goals: Pick<Goal, 'id' | 'text' | 'alias'>[]
  onClose: () => void
  onUpdate: (updated: Habit) => void
}

const DAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S']
const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export default function HabitEditModal({ habit, goals, onClose, onUpdate }: HabitEditModalProps) {
  const [text, setText] = useState('')
  const [alias, setAlias] = useState('')
  const [emoji, setEmoji] = useState('')
  const [habitType, setHabitType] = useState<'BINARY' | 'QUANTIFIED'>('BINARY')
  const [dailyTarget, setDailyTarget] = useState('')
  const [unit, setUnit] = useState('')
  const [goalId, setGoalId] = useState('')
  const [scheduledDays, setScheduledDays] = useState<number[] | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!habit) return
    setText(habit.text)
    setAlias(habit.alias ?? '')
    setEmoji(habit.emoji ?? '')
    setHabitType(habit.habit_type ?? 'BINARY')
    setDailyTarget(habit.daily_target?.toString() ?? '')
    setUnit(habit.unit ?? '')
    setGoalId(habit.goal_id ?? '')
    setScheduledDays(habit.scheduled_days ?? null)
  }, [habit?.id])

  if (!habit) return null

  const toggleDay = (day: number) => {
    setScheduledDays(prev => {
      if (!prev) return [day]
      if (prev.includes(day)) {
        const next = prev.filter(d => d !== day)
        return next.length === 0 ? null : next
      }
      return [...prev, day].sort((a, b) => a - b)
    })
  }

  const handleSave = async () => {
    setSaving(true)
    const patch = {
      text: text.trim(),
      alias: alias.trim() || null,
      emoji: emoji.trim() || null,
      habit_type: habitType,
      daily_target: habitType === 'QUANTIFIED' && dailyTarget ? parseFloat(dailyTarget) : null,
      unit: habitType === 'QUANTIFIED' ? (unit.trim() || null) : null,
      goal_id: goalId || null,
      scheduled_days: scheduledDays,
    }
    const { data } = await supabase.from('habits').update(patch).eq('id', habit.id).select().single()
    if (data) onUpdate(data as Habit)
    setSaving(false)
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-[220] bg-black/15 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed inset-0 z-[225] flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto w-[440px] max-h-[85vh] bg-white rounded-2xl border border-mercury shadow-2xl flex flex-col overflow-hidden">

          <div className="flex items-center justify-between px-6 py-4 border-b border-mercury/50 shrink-0">
            <p className="text-sm font-semibold text-burnham">Editar hábito</p>
            <button onClick={onClose} className="text-shuttle/30 hover:text-shuttle transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="p-6 space-y-4 overflow-y-auto">

            <div>
              <label className="text-[10px] uppercase tracking-widest text-shuttle/40 font-mono block mb-1">Nombre</label>
              <input value={text} onChange={e => setText(e.target.value)}
                className="w-full text-sm text-burnham border border-mercury rounded-lg px-3 py-2 focus:outline-none focus:border-shuttle transition-colors" />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[10px] uppercase tracking-widest text-shuttle/40 font-mono block mb-1">Alias <span className="normal-case text-shuttle/30">≤20 chars</span></label>
                <input value={alias} onChange={e => setAlias(e.target.value.slice(0, 20))} maxLength={20}
                  className="w-full text-sm text-burnham border border-mercury rounded-lg px-3 py-2 focus:outline-none focus:border-shuttle transition-colors"
                  placeholder="gym, leer…" />
              </div>
              <div className="w-24">
                <label className="text-[10px] uppercase tracking-widest text-shuttle/40 font-mono block mb-1">Emoji</label>
                <input value={emoji} onChange={e => setEmoji(e.target.value)}
                  className="w-full text-sm text-center border border-mercury rounded-lg px-3 py-2 focus:outline-none focus:border-shuttle transition-colors"
                  placeholder="🏋️" />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-widest text-shuttle/40 font-mono block mb-2">Tipo</label>
              <div className="flex gap-2">
                {(['BINARY', 'QUANTIFIED'] as const).map(t => (
                  <button key={t} onClick={() => setHabitType(t)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors border ${
                      habitType === t ? 'bg-burnham text-white border-burnham' : 'text-shuttle border-mercury hover:border-shuttle bg-white'
                    }`}>
                    {t === 'BINARY' ? 'Binario (sí/no)' : 'Con unidades'}
                  </button>
                ))}
              </div>
            </div>

            {habitType === 'QUANTIFIED' && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] uppercase tracking-widest text-shuttle/40 font-mono block mb-1">Meta diaria</label>
                  <input type="number" min={0} value={dailyTarget} onChange={e => setDailyTarget(e.target.value)}
                    className="w-full text-sm text-burnham border border-mercury rounded-lg px-3 py-2 focus:outline-none focus:border-shuttle transition-colors"
                    placeholder="8" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] uppercase tracking-widest text-shuttle/40 font-mono block mb-1">Unidad</label>
                  <input value={unit} onChange={e => setUnit(e.target.value)}
                    className="w-full text-sm text-burnham border border-mercury rounded-lg px-3 py-2 focus:outline-none focus:border-shuttle transition-colors"
                    placeholder="vasos, km, págs…" />
                </div>
              </div>
            )}

            <div>
              <label className="text-[10px] uppercase tracking-widest text-shuttle/40 font-mono block mb-1">Objetivo</label>
              <select value={goalId} onChange={e => setGoalId(e.target.value)}
                className="w-full text-sm text-burnham border border-mercury rounded-lg px-3 py-2 focus:outline-none focus:border-shuttle transition-colors bg-white">
                <option value="">Sin objetivo</option>
                {goals.map(g => <option key={g.id} value={g.id}>{g.alias ?? g.text}</option>)}
              </select>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-widest text-shuttle/40 font-mono block mb-2">
                Días de la semana
                <span className="normal-case text-shuttle/30 ml-2">vacío = todos los días</span>
              </label>
              <div className="flex gap-1.5">
                {DAY_LABELS.map((label, day) => (
                  <button key={day} onClick={() => toggleDay(day)}
                    title={DAY_NAMES[day]}
                    className={`w-8 h-8 rounded-full text-[11px] font-semibold transition-colors border ${
                      !scheduledDays || scheduledDays.includes(day)
                        ? 'bg-burnham text-white border-burnham'
                        : 'text-shuttle/50 border-mercury hover:border-shuttle/40 bg-white'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-shuttle/30 mt-1 font-mono">
                {scheduledDays ? `${scheduledDays.length} día${scheduledDays.length !== 1 ? 's' : ''} / semana` : 'Todos los días'}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between px-6 py-4 border-t border-mercury/50 shrink-0">
            <button onClick={onClose} className="text-sm text-shuttle/60 hover:text-shuttle transition-colors">Cancelar</button>
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 bg-burnham text-white text-sm font-semibold rounded-lg hover:bg-burnham/80 transition-colors disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
