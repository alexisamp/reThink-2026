/**
 * /milestone-plan — planning view for all unscheduled milestone todos.
 * Group by milestone, assign dates inline. Once dated → appears in Today.
 */
import { useState, useEffect, useCallback } from 'react'
import { CalendarBlank, Check, Flag, ArrowLeft } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Milestone, MilestoneTodo } from '@/types'
import { useNavigate } from 'react-router-dom'

interface GroupedMilestone {
  milestone: Milestone
  todos: MilestoneTodo[]
}

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysUntil(date: string) {
  const today = new Date(localDate() + 'T12:00:00')
  const target = new Date(date + 'T12:00:00')
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

export default function MilestonePlan() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [groups, setGroups] = useState<GroupedMilestone[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    const { data } = await supabase
      .from('milestone_todos')
      .select('*, milestone:milestone_id(*)')
      .eq('user_id', user.id)
      .eq('completed', false)
      .is('date', null)
      .order('created_at', { ascending: true })

    if (!data) { setLoading(false); return }

    const map = new Map<string, GroupedMilestone>()
    data.forEach((row: Record<string, unknown>) => {
      const ms = row.milestone as Milestone
      if (!ms) return
      if (!map.has(ms.id)) map.set(ms.id, { milestone: ms, todos: [] })
      const todo = { ...(row as object), milestone: undefined } as unknown as MilestoneTodo
      map.get(ms.id)!.todos.push(todo)
    })
    setGroups([...map.values()])
    setLoading(false)
  }, [user?.id])

  useEffect(() => { load() }, [load])

  const assignDate = async (todoId: string, date: string) => {
    setUpdatingId(todoId)
    await supabase.from('milestone_todos').update({ date }).eq('id', todoId)
    setUpdatingId(null)
    load()
  }

  const markDone = async (todoId: string) => {
    setUpdatingId(todoId)
    await supabase.from('milestone_todos').update({ completed: true }).eq('id', todoId)
    setUpdatingId(null)
    load()
  }

  const totalTodos = groups.reduce((s, g) => s + g.todos.length, 0)

  return (
    <div className="h-screen bg-[#F7F7F5] font-sans flex flex-col">
      <div className="bg-white border-b border-mercury/40 px-8 py-5 flex items-center gap-4 shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="text-shuttle/40 hover:text-burnham transition-colors p-1 rounded"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-shuttle/40 font-mono mb-0.5">Milestones</p>
          <h1 className="text-[15px] font-semibold text-burnham">Plan unscheduled tasks</h1>
        </div>
        {!loading && totalTodos > 0 && (
          <span className="ml-auto text-[11px] font-mono text-shuttle/40">
            {totalTodos} tasks · {groups.length} milestones
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pb-24">
        <div className="max-w-2xl mx-auto px-8 py-10">
          {loading ? (
            <p className="text-[13px] text-shuttle/40">Loading...</p>
          ) : groups.length === 0 ? (
            <div className="text-center py-20">
              <Check size={32} className="text-pastel mx-auto mb-4" />
              <p className="text-[15px] font-medium text-burnham mb-1">All tasks are scheduled</p>
              <p className="text-[13px] text-shuttle/50">Nothing unplanned.</p>
              <button
                onClick={() => navigate('/today')}
                className="mt-6 text-[12px] text-shuttle/40 hover:text-burnham transition-colors underline underline-offset-2"
              >
                Back to Today
              </button>
            </div>
          ) : (
            <div className="space-y-10">
              <p className="text-[12px] text-shuttle/40">
                Assign a date to each task — it will appear in Today on that day.
              </p>
              {groups.map(({ milestone, todos }) => {
                const days = milestone.target_date ? daysUntil(milestone.target_date) : null
                return (
                  <div key={milestone.id}>
                    <div className="flex items-start gap-2 mb-4">
                      <Flag size={14} className="text-shuttle/40 mt-0.5 shrink-0" />
                      <div>
                        <h2 className="text-[15px] font-semibold text-burnham">{milestone.text}</h2>
                        {milestone.target_date && (
                          <p className={`text-[11px] font-mono mt-0.5 ${
                            days !== null && days < 0 ? 'text-red-400/70' : 'text-shuttle/40'
                          }`}>
                            {new Date(milestone.target_date + 'T12:00:00').toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric', year: 'numeric',
                            })}
                            {days !== null && (
                              <span className="ml-1.5">
                                {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? '· today' : `· ${days}d left`}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-px border border-mercury/50 rounded-xl overflow-hidden bg-white shadow-sm">
                      {todos.map((todo, i) => (
                        <div
                          key={todo.id}
                          className={[
                            'flex items-center gap-3 px-4 py-3.5 group transition-colors hover:bg-gossip/5',
                            i < todos.length - 1 ? 'border-b border-mercury/30' : '',
                            updatingId === todo.id ? 'opacity-50 pointer-events-none' : '',
                          ].join(' ')}
                        >
                          <button
                            onClick={() => markDone(todo.id)}
                            className="w-4 h-4 rounded border border-mercury hover:border-pastel hover:bg-pastel/10 shrink-0 flex items-center justify-center transition-all"
                          />
                          <span className="flex-1 text-[13px] text-burnham">{todo.text}</span>
                          <div className="flex items-center gap-1.5 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
                            <CalendarBlank size={11} className="text-shuttle/50" />
                            <input
                              type="date"
                              className="text-[11px] text-shuttle bg-transparent border-0 focus:outline-none focus:text-burnham cursor-pointer"
                              onChange={e => e.target.value && assignDate(todo.id, e.target.value)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
