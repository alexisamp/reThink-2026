import { useState, useEffect } from 'react'
import { House, PencilSimple, Plus, GearSix } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { Goal, Milestone, Habit, WorkbookEntry } from '@/types'
import SystematizeModal from '@/components/SystematizeModal'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const LEVEL_LABELS: Record<number, string> = {
  1: 'L1 • The Mission',
  2: 'L2 • Core Values',
  3: 'L3 • The Audience',
  4: 'L4 • The Critical Three',
  5: 'L5 • Brand Promise',
  6: 'L6 • 10-Year Vision',
  7: 'L7 • 3-Year Picture',
  8: 'L8 • 1-Year Plan',
  9: 'L9 • Key Resources',
  10: 'L10 • Risks',
}

export default function Strategy() {
  const navigate = useNavigate()
  const [goals, setGoals] = useState<Goal[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [entries, setEntries] = useState<WorkbookEntry[]>([])
  const [editingEntry, setEditingEntry] = useState<string | null>(null)
  const [entryValues, setEntryValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [workbookId, setWorkbookId] = useState<string>('')
  const [userId, setUserId] = useState<string>('')
  const [systematizeGoal, setSystematizeGoal] = useState<Goal | null>(null)
  const [showManifesto, setShowManifesto] = useState(false)
  const [addingMilestoneFor, setAddingMilestoneFor] = useState<string | null>(null)
  const [newMilestoneText, setNewMilestoneText] = useState('')
  const [addingHabitFor, setAddingHabitFor] = useState<string | null>(null)
  const [newHabitText, setNewHabitText] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const year = new Date().getFullYear()

      const { data: wb } = await supabase
        .from('workbooks').select('id')
        .eq('user_id', user.id).eq('year', year).maybeSingle()
      if (!wb) { setLoading(false); return }
      setWorkbookId(wb.id)

      const [goalsRes, milestonesRes, habitsRes, entriesRes] = await Promise.all([
        supabase.from('goals').select('*').eq('workbook_id', wb.id).order('position'),
        supabase.from('milestones').select('*').eq('user_id', user.id).order('target_date', { nullsFirst: false }),
        supabase.from('habits').select('*').eq('user_id', user.id).eq('is_active', true).order('created_at'),
        supabase.from('workbook_entries').select('*').eq('workbook_id', wb.id),
      ])
      setGoals(goalsRes.data ?? [])
      setMilestones(milestonesRes.data ?? [])
      setHabits(habitsRes.data ?? [])
      setEntries(entriesRes.data ?? [])
      const vals: Record<string, string> = {}
      for (const e of entriesRes.data ?? []) {
        vals[`${e.list_order}_${e.section_key}`] = e.answer ?? ''
      }
      setEntryValues(vals)
      setLoading(false)
    }
    load()
  }, [])

  const activeGoals = goals.filter(g => g.goal_type === 'ACTIVE')
  const backlogGoals = goals.filter(g => g.goal_type === 'BACKLOG')

  const getGoalMilestones = (goalId: string) =>
    milestones.filter(m => m.goal_id === goalId).slice(0, 3)
  const getGoalHabits = (goalId: string) =>
    habits.filter(h => h.goal_id === goalId).slice(0, 3)
  const getExtra = (goalId: string) =>
    Math.max(0, milestones.filter(m => m.goal_id === goalId).length - 3)

  const saveEntry = async (level: number, field: string, value: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const year = new Date().getFullYear()
    const { data: wb } = await supabase
      .from('workbooks').select('id').eq('user_id', user.id).eq('year', year).maybeSingle()
    if (!wb) return
    await supabase.from('workbook_entries').upsert({
      workbook_id: wb.id, user_id: user.id, list_order: level, section_key: field, answer: value
    }, { onConflict: 'workbook_id,list_order,section_key' })
    setEntryValues(prev => ({ ...prev, [`${level}_${field}`]: value }))
    setEditingEntry(null)
  }

  const statusBadge = (status: string, goalType: string) => {
    if (goalType === 'ACTIVE') return 'bg-gossip text-burnham'
    if (goalType === 'BACKLOG') return 'bg-gray-50 border border-mercury text-shuttle'
    return 'bg-gray-50 border border-mercury text-shuttle'
  }

  const needsSetup = (goal: Goal) =>
    goal.needs_config ||
    habits.filter(h => h.goal_id === goal.id).length === 0

  const handleModalSave = () => {
    setSystematizeGoal(null)
    // Refresh goals, habits, milestones
    const reload = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const year = new Date().getFullYear()
      const { data: wb } = await supabase
        .from('workbooks').select('id').eq('user_id', user.id).eq('year', year).maybeSingle()
      if (!wb) return
      const [goalsRes, milestonesRes, habitsRes] = await Promise.all([
        supabase.from('goals').select('*').eq('workbook_id', wb.id).order('position'),
        supabase.from('milestones').select('*').eq('user_id', user.id).order('target_date', { nullsFirst: false }),
        supabase.from('habits').select('*').eq('user_id', user.id).eq('is_active', true).order('created_at'),
      ])
      setGoals(goalsRes.data ?? [])
      setMilestones(milestonesRes.data ?? [])
      setHabits(habitsRes.data ?? [])
    }
    reload()
  }

  const saveInlineMilestone = async (goalId: string) => {
    if (!newMilestoneText.trim() || !userId) return
    const year = new Date().getFullYear()
    const { data } = await supabase.from('milestones').insert({
      goal_id: goalId,
      user_id: userId,
      text: newMilestoneText.trim(),
      target_date: `${year}-12-31`,
      status: 'PENDING',
    }).select().single()
    if (data) setMilestones(prev => [...prev, data])
    setAddingMilestoneFor(null)
    setNewMilestoneText('')
  }

  const saveInlineHabit = async (goalId: string) => {
    if (!newHabitText.trim() || !userId) return
    const { data } = await supabase.from('habits').insert({
      goal_id: goalId,
      user_id: userId,
      text: newHabitText.trim(),
      frequency: 'DAILY',
      is_active: true,
    }).select().single()
    if (data) setHabits(prev => [...prev, data])
    setAddingHabitFor(null)
    setNewHabitText('')
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-mercury border-t-burnham rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-white text-burnham font-sans antialiased pb-40">
      <main className="w-full max-w-[1400px] mx-auto px-6 md:px-12 lg:px-16 py-12">

        {/* Header */}
        <header className="mb-10">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2 text-xs font-medium text-shuttle">
              <button onClick={() => navigate('/today')} className="hover:text-burnham transition-colors">
                <House size={14} />
              </button>
              <span className="text-mercury">/</span>
              <span className="text-burnham font-semibold">Strategy</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-mercury rounded text-sm font-medium text-shuttle cursor-pointer hover:bg-gray-100">
              <span>{new Date().getFullYear()}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-burnham tracking-tight">Strategy War Map</h1>
            <PencilSimple size={20} className="text-shuttle/40 hover:text-burnham transition-colors cursor-pointer mt-1" />
          </div>
        </header>

        {/* Goals Grid */}
        <div className="border-t border-mercury pt-4 pb-12">
          {/* Column headers */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 mb-6">
            <div className="lg:col-span-2">
              <div className="grid grid-cols-12 gap-6 items-center">
                <div className="col-span-3">
                  <span className="text-[10px] font-bold text-shuttle uppercase tracking-widest pl-1">ACTIVE GOALS</span>
                </div>
                <div className="col-span-4">
                  <span className="text-[10px] font-bold text-shuttle uppercase tracking-widest pl-2">MILESTONES</span>
                </div>
                <div className="col-span-3 pl-6">
                  <span className="text-[10px] font-bold text-shuttle uppercase tracking-widest">HABITS</span>
                </div>
                <div className="col-span-2" />
              </div>
            </div>
            <div className="lg:col-span-1 pl-8 hidden lg:block">
              <span className="text-[10px] font-bold text-shuttle uppercase tracking-widest">NOT DOING / BACKLOG</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Left: Active Goals */}
            <div className="lg:col-span-2">
              <div className="flex flex-col gap-8">
                {activeGoals.length === 0 && (
                  <p className="text-shuttle text-sm">No active goals yet. Complete the assessment to add goals.</p>
                )}
                {activeGoals.map(goal => (
                  <div key={goal.id} className="w-full bg-white group/card">
                    <div className="grid grid-cols-12 gap-6 items-start">
                      <div className="col-span-3 flex flex-col gap-1 pr-2">
                        <div className="flex items-start justify-between">
                          <h2
                            className="text-burnham text-lg font-semibold tracking-[-0.02em] leading-snug cursor-pointer hover:underline"
                            onClick={() => navigate(`/dashboard/goal/${goal.id}`)}
                          >
                            {goal.text}
                          </h2>
                          <PencilSimple size={14} className="text-shuttle opacity-0 group-hover/card:opacity-100 transition-opacity cursor-pointer mt-1" onClick={() => setSystematizeGoal(goal)} />
                        </div>
                        {goal.metric && <p className="text-shuttle text-xs">{goal.metric}</p>}
                      </div>
                      <div className="col-span-4">
                        <div className="flex flex-col gap-3">
                          <ul className="space-y-2">
                            {getGoalMilestones(goal.id).map(m => (
                              <li key={m.id} className="flex items-center gap-3">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.status === 'COMPLETE' ? 'bg-pastel' : 'bg-mercury'}`} />
                                <span className="text-sm text-burnham truncate flex-1">{m.text}</span>
                                {m.target_date && (
                                  <span className="text-[9px] font-mono text-shuttle/50 shrink-0">
                                    {MONTHS[new Date(m.target_date + 'T12:00:00').getMonth()]}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                          {getExtra(goal.id) > 0 && (
                            <p className="text-[10px] text-shuttle pl-4">+ {getExtra(goal.id)} more</p>
                          )}
                          {/* Inline add milestone */}
                          {addingMilestoneFor === goal.id ? (
                            <input
                              autoFocus
                              className="text-xs text-burnham border-b border-mercury bg-transparent focus:outline-none focus:border-burnham pl-4 pb-0.5 transition-colors"
                              placeholder="Milestone text, then Enter…"
                              value={newMilestoneText}
                              onChange={e => setNewMilestoneText(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveInlineMilestone(goal.id)
                                if (e.key === 'Escape') { setAddingMilestoneFor(null); setNewMilestoneText('') }
                              }}
                              onBlur={() => { if (!newMilestoneText.trim()) setAddingMilestoneFor(null) }}
                            />
                          ) : (
                            <button
                              onClick={() => setAddingMilestoneFor(goal.id)}
                              className="flex items-center gap-2 text-[10px] text-shuttle hover:text-burnham transition-colors pl-4"
                            >
                              <Plus size={10} /> Add milestone
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="col-span-3 border-l border-mercury/30 pl-6">
                        <div className="space-y-3">
                          {getGoalHabits(goal.id).map(h => (
                            <div key={h.id} className="flex flex-col">
                              <span className="text-sm font-medium text-burnham">{h.text}</span>
                              <span className="text-shuttle text-[9px] uppercase tracking-wider">{h.frequency.replace('_', '×').replace('3×WEEK','3×/wk').replace('WEEKDAYS','Wkdays')}</span>
                            </div>
                          ))}
                          {/* Inline add habit */}
                          {addingHabitFor === goal.id ? (
                            <input
                              autoFocus
                              className="text-xs text-burnham border-b border-mercury bg-transparent focus:outline-none focus:border-burnham pb-0.5 transition-colors w-full"
                              placeholder="Habit, then Enter…"
                              value={newHabitText}
                              onChange={e => setNewHabitText(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveInlineHabit(goal.id)
                                if (e.key === 'Escape') { setAddingHabitFor(null); setNewHabitText('') }
                              }}
                              onBlur={() => { if (!newHabitText.trim()) setAddingHabitFor(null) }}
                            />
                          ) : (
                            <button
                              onClick={() => setAddingHabitFor(goal.id)}
                              className="flex items-center gap-2 text-[10px] text-shuttle hover:text-burnham transition-colors"
                            >
                              <Plus size={10} /> Add habit
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="col-span-2 flex flex-col items-end gap-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider h-fit ${statusBadge(goal.status, goal.goal_type)}`}>
                          {goal.goal_type === 'ACTIVE' ? 'Active' : 'Planned'}
                        </span>
                        {needsSetup(goal) && (
                          <button
                            onClick={() => setSystematizeGoal(goal)}
                            className="flex items-center gap-1.5 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                          >
                            <GearSix size={10} weight="fill" />
                            Needs Setup
                          </button>
                        )}
                        {!needsSetup(goal) && (
                          <button
                            onClick={() => setSystematizeGoal(goal)}
                            className="opacity-0 group-hover/card:opacity-100 flex items-center gap-1.5 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider text-shuttle hover:text-burnham transition-all"
                          >
                            <GearSix size={10} />
                            Edit System
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="w-full h-px bg-mercury mt-8" />
                  </div>
                ))}

                {/* Add goal button */}
                <button
                  className="w-full flex items-center justify-center gap-2 py-4 border border-dashed border-mercury rounded-lg text-shuttle hover:text-burnham hover:border-burnham/30 transition-all"
                  onClick={() => navigate('/assessment')}
                >
                  <Plus size={16} className="opacity-60" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Add Goal</span>
                </button>
              </div>
            </div>

            {/* Right: Backlog */}
            <div className="lg:col-span-1 border-l border-mercury pl-8 hidden lg:block h-full">
              <div className="space-y-5">
                {backlogGoals.map(g => (
                  <div key={g.id} className="flex flex-col gap-1">
                    <span className="text-sm text-shuttle line-through decoration-mercury">{g.text}</span>
                    <span className="text-[10px] text-shuttle/60">Backlog</span>
                  </div>
                ))}
                {backlogGoals.length === 0 && (
                  <p className="text-xs text-shuttle/40 italic">No backlog items</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Manifesto */}
        <section className="mt-8 border-t border-mercury pt-8">
          <div className="max-w-4xl mx-auto">
            <button
              onClick={() => setShowManifesto(v => !v)}
              className="flex items-center gap-3 group mb-4 pl-14"
            >
              <span className="text-[10px] font-semibold text-shuttle uppercase tracking-widest group-hover:text-burnham transition-colors">
                Manifesto 2026
              </span>
              <span className="text-[10px] text-shuttle/50 group-hover:text-shuttle transition-colors">
                {showManifesto ? '— hide' : '+ show'}
              </span>
            </button>

            {showManifesto && (
              <div className="relative pl-4 pt-4">
                <div className="absolute left-[27px] top-7 bottom-8 w-px bg-mercury/40" />
                <div className="space-y-12">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map(level => {
                    const key = `${level}_l${level}_1`
                    const val = entryValues[`${level}_l${level}_1`] ?? ''
                    const isEditing = editingEntry === key
                    return (
                      <div key={level} className="relative flex gap-8 items-start group">
                        <div className="relative z-10 flex-shrink-0 w-6 h-6 rounded-full bg-white border border-mercury text-pastel text-[10px] flex items-center justify-center font-bold mt-1">
                          {level}
                        </div>
                        <div className="flex-1 pt-1">
                          <div className="text-[10px] font-semibold text-shuttle uppercase tracking-widest mb-2.5">
                            {LEVEL_LABELS[level]}
                          </div>
                          <div className="relative">
                            {isEditing ? (
                              <textarea
                                autoFocus
                                className="w-full text-sm leading-relaxed text-burnham border-b border-mercury pb-4 pr-8 bg-transparent resize-none focus:outline-none focus:border-black"
                                value={val}
                                rows={3}
                                onChange={e => setEntryValues(prev => ({ ...prev, [key]: e.target.value }))}
                                onBlur={() => saveEntry(level, `l${level}_1`, val)}
                              />
                            ) : (
                              <p
                                className="font-sans text-sm leading-relaxed text-burnham border-b border-mercury/50 pb-4 pr-8 cursor-text min-h-[2.5rem]"
                                onClick={() => setEditingEntry(key)}
                              >
                                {val || <span className="text-mercury">Click to add...</span>}
                              </p>
                            )}
                            <button
                              className="absolute bottom-4 right-0 text-shuttle opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => setEditingEntry(key)}
                            >
                              <PencilSimple size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Systematize Goal Modal */}
      {systematizeGoal && workbookId && userId && (
        <SystematizeModal
          goal={systematizeGoal}
          workbookId={workbookId}
          userId={userId}
          onClose={() => setSystematizeGoal(null)}
          onSave={handleModalSave}
        />
      )}
    </div>
  )
}
