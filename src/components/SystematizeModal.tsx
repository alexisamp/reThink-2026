import { useState, useEffect } from 'react'
import { X, Plus, Trash, Info } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { Goal } from '@/types'

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type Frequency = 'DAILY' | 'WEEKDAYS' | '3X_WEEK' | 'WEEKLY'

interface IndicatorRow {
  name: string
  unit: string
  target: string
}

interface HabitRow {
  text: string
  frequency: Frequency
  default_time: string
  reward: string
}

interface MilestoneRow {
  month: number
  text: string
}

interface Props {
  goal: Goal
  workbookId: string
  userId: string
  onClose: () => void
  onSave: () => void
}

export default function SystematizeModal({ goal, workbookId, userId, onClose, onSave }: Props) {
  // Left panel context (read-only workbook entries)
  const [l1, setL1] = useState('')
  const [l4, setL4] = useState('')
  const [l8, setL8] = useState('')

  // Section A — Refined Goal
  const [refinedText, setRefinedText] = useState(goal.text)
  const [metric, setMetric] = useState(goal.metric ?? '')
  const [motivation, setMotivation] = useState(goal.motivation ?? '')

  // Section B — Leading Indicators
  const [indicators, setIndicators] = useState<IndicatorRow[]>([
    { name: '', unit: '', target: '' },
  ])

  // Section C — Daily System (Habits)
  const [habits, setHabits] = useState<HabitRow[]>([
    { text: '', frequency: 'DAILY', default_time: '', reward: '' },
  ])

  // Section D — Milestones
  const [milestones, setMilestones] = useState<MilestoneRow[]>([
    { month: Math.min(12, new Date().getMonth() + 2), text: '' },
  ])

  const [saving, setSaving] = useState(false)
  const [warning, setWarning] = useState('')

  // Load context + pre-populate from existing data
  useEffect(() => {
    const load = async () => {
      // Workbook context entries (L1, L4, L8)
      const { data: entries } = await supabase
        .from('workbook_entries')
        .select('list_order, answer')
        .eq('workbook_id', workbookId)
        .in('list_order', [1, 4, 8])

      for (const e of entries ?? []) {
        if (e.list_order === 1) setL1(e.answer ?? '')
        if (e.list_order === 4) setL4(e.answer ?? '')
        if (e.list_order === 8) setL8(e.answer ?? '')
      }

      // Existing indicators
      const { data: inds } = await supabase
        .from('leading_indicators')
        .select('*')
        .eq('goal_id', goal.id)
        .eq('is_active', true)
        .order('created_at')

      if (inds && inds.length > 0) {
        setIndicators(inds.map(i => ({
          name: i.name,
          unit: i.unit ?? '',
          target: i.target?.toString() ?? '',
        })))
      }

      // Existing habits
      const { data: habs } = await supabase
        .from('habits')
        .select('*')
        .eq('goal_id', goal.id)
        .eq('is_active', true)
        .order('created_at')

      if (habs && habs.length > 0) {
        setHabits(habs.map(h => ({
          text: h.text,
          frequency: (h.frequency as Frequency) || 'DAILY',
          default_time: h.default_time ?? '',
          reward: h.reward ?? '',
        })))
      }

      // Existing pending milestones
      const { data: mss } = await supabase
        .from('milestones')
        .select('*')
        .eq('goal_id', goal.id)
        .eq('status', 'PENDING')
        .order('target_date', { nullsFirst: false })

      if (mss && mss.length > 0) {
        setMilestones(mss.map(m => {
          const d = m.target_date ? new Date(m.target_date + 'T12:00:00') : new Date()
          return { month: d.getMonth() + 1, text: m.text }
        }))
      }
    }
    load()
  }, [goal.id, workbookId])

  const handleSave = async () => {
    const filledIndicators = indicators.filter(i => i.name.trim())
    const filledHabits = habits.filter(h => h.text.trim())
    const filledMilestones = milestones.filter(m => m.text.trim())

    // Warn if any section is empty, but allow save on second click
    if ((!filledIndicators.length || !filledHabits.length || !filledMilestones.length) && !warning) {
      const missing: string[] = []
      if (!filledIndicators.length) missing.push('leading indicators')
      if (!filledHabits.length) missing.push('daily habits')
      if (!filledMilestones.length) missing.push('milestones')
      setWarning(`Missing: ${missing.join(', ')}. Click again to save anyway.`)
      return
    }

    setSaving(true)

    try {
      const year = new Date().getFullYear()

      // 1. Update goal fields
      await supabase.from('goals').update({
        text: refinedText.trim() || goal.text,
        metric: metric.trim() || null,
        motivation: motivation.trim() || null,
        needs_config: false,
      }).eq('id', goal.id)

      // 2. Replace leading indicators (delete + insert)
      await supabase.from('leading_indicators').delete().eq('goal_id', goal.id)
      if (filledIndicators.length > 0) {
        await supabase.from('leading_indicators').insert(
          filledIndicators.map(i => ({
            goal_id: goal.id,
            user_id: userId,
            name: i.name.trim(),
            unit: i.unit.trim() || null,
            target: i.target ? Number(i.target) : null,
            frequency: 'MONTHLY',
            is_active: true,
          }))
        )
      }

      // 3. Replace habits (deactivate existing + insert new)
      await supabase.from('habits').update({ is_active: false }).eq('goal_id', goal.id)
      if (filledHabits.length > 0) {
        await supabase.from('habits').insert(
          filledHabits.map(h => ({
            goal_id: goal.id,
            user_id: userId,
            text: h.text.trim(),
            frequency: h.frequency,
            default_time: h.default_time || null,
            reward: h.reward.trim() || null,
            is_active: true,
          }))
        )
      }

      // 4. Replace pending milestones (delete PENDING + insert new)
      await supabase.from('milestones').delete().eq('goal_id', goal.id).eq('status', 'PENDING')
      if (filledMilestones.length > 0) {
        await supabase.from('milestones').insert(
          [...filledMilestones]
            .sort((a, b) => a.month - b.month)
            .map(m => ({
              goal_id: goal.id,
              user_id: userId,
              text: m.text.trim(),
              target_date: `${year}-${String(m.month).padStart(2, '0')}-01`,
              status: 'PENDING',
            }))
        )
      }

      onSave()
    } catch (err) {
      console.error('SystematizeModal save error:', err)
      setSaving(false)
      setWarning('Save failed. Please try again.')
    }
  }

  const addMilestone = () => {
    const lastMonth = milestones.length > 0
      ? Math.max(...milestones.map(m => m.month))
      : new Date().getMonth() + 1
    setMilestones(prev => [...prev, { month: Math.min(12, lastMonth + 1), text: '' }])
  }

  return (
    <div
      className="fixed inset-0 bg-black/25 backdrop-blur-sm z-50 flex items-center justify-center p-6"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="h-[90vh] w-full max-w-5xl flex rounded-xl border border-mercury overflow-hidden shadow-2xl">

        {/* ── Left panel: Workbook Context ─────────────────── */}
        <div className="w-[30%] bg-[#F8F9F9] border-r border-mercury flex flex-col shrink-0">
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-mercury/50">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-shuttle">
              Context
            </span>
            <button
              onClick={onClose}
              className="text-shuttle/40 hover:text-burnham transition-colors p-1 rounded"
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-shuttle mb-2">
                L8 · 1-Year Plan
              </p>
              <p className="text-[13px] text-burnham leading-relaxed">
                {l8 || <span className="text-mercury italic text-xs">Not filled yet</span>}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-shuttle mb-2">
                L4 · Critical Three
              </p>
              <p className="text-[13px] text-burnham leading-relaxed">
                {l4 || <span className="text-mercury italic text-xs">Not filled yet</span>}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-shuttle mb-2">
                L1 · The Mission
              </p>
              <p className="text-[13px] text-burnham leading-relaxed">
                {l1 || <span className="text-mercury italic text-xs">Not filled yet</span>}
              </p>
            </div>
          </div>

          {/* Save button */}
          <div className="px-6 pb-6 pt-4 border-t border-mercury">
            {warning && (
              <p className="text-[10px] text-amber-600 mb-3 leading-relaxed bg-amber-50 rounded p-2">
                {warning}
              </p>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 bg-burnham text-white text-[10px] font-bold uppercase tracking-widest rounded hover:bg-[#002817] transition-colors disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Initialize System'}
            </button>
          </div>
        </div>

        {/* ── Right panel: Form ────────────────────────────── */}
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="px-10 py-8 space-y-12">

            {/* Section A — Refined Goal */}
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-shuttle mb-6">
                A · Refined Goal
              </p>
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-widest text-shuttle/60 block mb-1.5">
                    Refined Objective
                  </label>
                  <input
                    type="text"
                    value={refinedText}
                    onChange={e => setRefinedText(e.target.value)}
                    className="w-full text-base font-semibold text-burnham border-b border-mercury pb-2 bg-transparent focus:outline-none focus:border-burnham transition-colors"
                    placeholder="What exactly do you want to achieve this year?"
                  />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-shuttle/60 block mb-1.5">
                      Key Metric
                    </label>
                    <input
                      type="text"
                      value={metric}
                      onChange={e => setMetric(e.target.value)}
                      className="w-full text-sm text-burnham border-b border-mercury pb-2 bg-transparent focus:outline-none focus:border-burnham transition-colors"
                      placeholder="Success looks like…"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-shuttle/60 block mb-1.5">
                      Motivation
                    </label>
                    <input
                      type="text"
                      value={motivation}
                      onChange={e => setMotivation(e.target.value)}
                      className="w-full text-sm text-burnham border-b border-mercury pb-2 bg-transparent focus:outline-none focus:border-burnham transition-colors"
                      placeholder="Why does this matter?"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Section B — Leading Indicators */}
            <section>
              <div className="flex items-center gap-2 mb-6">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-shuttle">
                  B · Leading Indicators
                </p>
                <div className="relative group">
                  <Info size={12} className="text-shuttle/30 cursor-help" />
                  <div className="absolute left-5 top-0 z-20 w-60 p-3 bg-burnham text-white text-[10px] leading-relaxed rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    Inputs you control (calls made, hours coded, demos booked) that predict your outcome metric.
                  </div>
                </div>
              </div>

              <div className="w-full">
                {/* Header row */}
                <div className="grid gap-3 mb-2 text-[9px] font-semibold uppercase tracking-widest text-shuttle/60"
                  style={{ gridTemplateColumns: '1fr 100px 110px 28px' }}>
                  <div>Indicator Name</div>
                  <div>Unit</div>
                  <div>Annual Target</div>
                  <div />
                </div>

                <div className="space-y-1">
                  {indicators.map((ind, i) => (
                    <div
                      key={i}
                      className="grid gap-3 items-center py-2.5 border-b border-mercury/30"
                      style={{ gridTemplateColumns: '1fr 100px 110px 28px' }}
                    >
                      <input
                        className="text-sm text-burnham bg-transparent border-none focus:outline-none"
                        value={ind.name}
                        onChange={e => setIndicators(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                        placeholder="e.g. Sales calls made"
                      />
                      <input
                        className="text-sm text-burnham bg-transparent border-none focus:outline-none"
                        value={ind.unit}
                        onChange={e => setIndicators(prev => prev.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))}
                        placeholder="calls"
                      />
                      <input
                        type="number"
                        min="0"
                        className="text-sm text-burnham bg-transparent border-none focus:outline-none font-mono"
                        value={ind.target}
                        onChange={e => setIndicators(prev => prev.map((x, j) => j === i ? { ...x, target: e.target.value } : x))}
                        placeholder="240"
                      />
                      <button
                        onClick={() => setIndicators(prev => prev.filter((_, j) => j !== i))}
                        className="flex justify-center text-shuttle/20 hover:text-red-400 transition-colors"
                      >
                        <Trash size={12} />
                      </button>
                    </div>
                  ))}
                </div>

                {indicators.length < 5 ? (
                  <button
                    onClick={() => setIndicators(prev => [...prev, { name: '', unit: '', target: '' }])}
                    className="flex items-center gap-2 text-[10px] font-semibold text-shuttle hover:text-burnham transition-colors mt-4"
                  >
                    <Plus size={12} /> Add Indicator
                  </button>
                ) : (
                  <p className="text-[10px] text-shuttle/40 italic mt-3">Max 5 indicators reached</p>
                )}
              </div>
            </section>

            {/* Section C — Daily System / Habits */}
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-shuttle mb-6">
                C · Daily System
              </p>
              <div className="space-y-3">
                {habits.map((h, i) => (
                  <div key={i} className="bg-[#F8F9F9] border-l-2 border-pastel rounded-r p-4">
                    <div className="mb-3">
                      <input
                        type="text"
                        className="w-full text-sm font-medium text-burnham bg-transparent border-b border-mercury/60 pb-1.5 focus:outline-none focus:border-burnham transition-colors"
                        value={h.text}
                        onChange={e => setHabits(prev => prev.map((x, j) => j === i ? { ...x, text: e.target.value } : x))}
                        placeholder="e.g. Make 10 outbound calls before noon"
                      />
                    </div>
                    <div className="grid grid-cols-4 gap-4 items-end">
                      <div>
                        <label className="text-[9px] font-semibold uppercase tracking-widest text-shuttle/60 block mb-1">
                          Frequency
                        </label>
                        <select
                          className="w-full text-xs text-burnham bg-transparent border-b border-mercury/60 pb-1 focus:outline-none"
                          value={h.frequency}
                          onChange={e => setHabits(prev => prev.map((x, j) => j === i ? { ...x, frequency: e.target.value as Frequency } : x))}
                        >
                          <option value="DAILY">Daily</option>
                          <option value="WEEKDAYS">Weekdays</option>
                          <option value="3X_WEEK">3× / Week</option>
                          <option value="WEEKLY">Weekly</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] font-semibold uppercase tracking-widest text-shuttle/60 block mb-1">
                          Time
                        </label>
                        <input
                          type="time"
                          className="w-full text-xs text-burnham bg-transparent border-b border-mercury/60 pb-1 focus:outline-none font-mono"
                          value={h.default_time}
                          onChange={e => setHabits(prev => prev.map((x, j) => j === i ? { ...x, default_time: e.target.value } : x))}
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-semibold uppercase tracking-widest text-shuttle/60 block mb-1">
                          Reward
                        </label>
                        <input
                          type="text"
                          className="w-full text-xs text-burnham bg-transparent border-b border-mercury/60 pb-1 focus:outline-none"
                          value={h.reward}
                          onChange={e => setHabits(prev => prev.map((x, j) => j === i ? { ...x, reward: e.target.value } : x))}
                          placeholder="Optional"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={() => setHabits(prev => prev.filter((_, j) => j !== i))}
                          className="text-shuttle/20 hover:text-red-400 transition-colors p-1"
                        >
                          <Trash size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => setHabits(prev => [...prev, { text: '', frequency: 'DAILY', default_time: '', reward: '' }])}
                  className="flex items-center gap-2 text-[10px] font-semibold text-shuttle hover:text-burnham transition-colors"
                >
                  <Plus size={12} /> Add Habit
                </button>
              </div>
            </section>

            {/* Section D — Milestones */}
            <section className="pb-8">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-shuttle mb-6">
                D · Milestones
              </p>
              <div className="relative pl-5">
                {/* Vertical connector */}
                {milestones.length > 1 && (
                  <div className="absolute left-[7px] top-2 bottom-10 w-px bg-mercury/50" />
                )}

                <div className="space-y-3">
                  {milestones.map((ms, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div className="w-3 h-3 rounded-full border border-mercury bg-white shrink-0 z-10" />
                      <select
                        className="text-[10px] font-mono text-shuttle bg-transparent border-b border-mercury pb-0.5 focus:outline-none min-w-[48px]"
                        value={ms.month}
                        onChange={e => setMilestones(prev =>
                          prev.map((x, j) => j === i ? { ...x, month: Number(e.target.value) } : x)
                        )}
                      >
                        {MONTHS_SHORT.map((m, idx) => (
                          <option key={m} value={idx + 1}>{m}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        className="flex-1 text-sm text-burnham bg-transparent border-b border-mercury/40 pb-0.5 focus:outline-none focus:border-burnham transition-colors"
                        value={ms.text}
                        onChange={e => setMilestones(prev =>
                          prev.map((x, j) => j === i ? { ...x, text: e.target.value } : x)
                        )}
                        placeholder="What will be true by this month?"
                      />
                      <button
                        onClick={() => setMilestones(prev => prev.filter((_, j) => j !== i))}
                        className="text-shuttle/20 hover:text-red-400 transition-colors shrink-0"
                      >
                        <Trash size={12} />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={addMilestone}
                  className="flex items-center gap-2 text-[10px] font-semibold text-shuttle hover:text-burnham transition-colors mt-4"
                >
                  <Plus size={12} /> Add Milestone
                </button>
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  )
}
