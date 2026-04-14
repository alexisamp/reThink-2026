/**
 * SuggestionsPanel — non-invasive collapsible section below Today's todos.
 * Two sources:
 *   1. FROM YOUR NETWORK — contacts with overdue/pending next steps or stale contact
 *   2. FROM MILESTONES  — milestone_todos without a date (unplanned)
 * Clicking + on any item adds it as a todo for today.
 */
import { useState, useEffect, useCallback } from 'react'
import { Plus, ArrowRight, Flag, Users } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import type { MilestoneTodo, Milestone } from '@/types'

interface NetworkSuggestion {
  contactId: string
  name: string
  reason: string
  nextStep: string | null
  daysOverdue?: number
}

interface MilestoneSuggestion {
  todo: MilestoneTodo
  milestone: Milestone
}

interface SuggestionsPanelProps {
  userId: string
  today: string
  onAddTodo: (text: string, milestoneId?: string) => Promise<void>
  onSeeAllMilestones?: () => void
}

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function SuggestionsPanel({ userId, today, onAddTodo, onSeeAllMilestones }: SuggestionsPanelProps) {
  const [open, setOpen] = useState(false)
  const [networkSuggs, setNetworkSuggs] = useState<NetworkSuggestion[]>([])
  const [milestoneSuggs, setMilestoneSuggs] = useState<MilestoneSuggestion[]>([])
  const [adding, setAdding] = useState<string | null>(null)
  const [schedulingTodoId, setSchedulingTodoId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!userId) return

    // Network: contacts with next_step_owner='me' and next_step_date <= today
    // or contacts not contacted in > 14 days
    const twoWeeksAgo = (() => {
      const d = new Date()
      d.setDate(d.getDate() - 14)
      return localDate(d)
    })()

    const [nextStepsRes, staleRes, milestoneTodosRes] = await Promise.all([
      supabase
        .from('interactions')
        .select('contact_id, next_step, next_step_date, outreach_logs:outreach_log_id(name)')
        .eq('user_id', userId)
        .eq('next_step_owner', 'me')
        .lte('next_step_date', today)
        .not('next_step', 'is', null)
        .order('next_step_date', { ascending: true })
        .limit(5),
      supabase
        .from('outreach_logs')
        .select('id, name, last_interaction_at')
        .eq('user_id', userId)
        .not('status', 'eq', 'DORMANT')
        .or(`last_interaction_at.lte.${twoWeeksAgo},last_interaction_at.is.null`)
        .order('last_interaction_at', { ascending: true, nullsFirst: true })
        .limit(5),
      supabase
        .from('milestone_todos')
        .select('*, milestone:milestone_id(*)')
        .eq('user_id', userId)
        .eq('completed', false)
        .is('date', null)
        .order('created_at', { ascending: true })
        .limit(8),
    ])

    // Build network suggestions — next steps first
    const seen = new Set<string>()
    const network: NetworkSuggestion[] = []

    ;(nextStepsRes.data ?? []).forEach((row: Record<string, unknown>) => {
      const contactId = row.contact_id as string
      if (seen.has(contactId)) return
      seen.add(contactId)
      const nextStepDate = row.next_step_date as string
      const daysOverdue = Math.round((new Date(today).getTime() - new Date(nextStepDate).getTime()) / 86400000)
      const nameObj = row.outreach_logs as Record<string, string> | null
      network.push({
        contactId,
        name: nameObj?.name ?? 'Unknown',
        reason: daysOverdue > 0 ? `${daysOverdue}d overdue` : 'due today',
        nextStep: row.next_step as string | null,
        daysOverdue,
      })
    })

    ;(staleRes.data ?? []).forEach((c: Record<string, unknown>) => {
      if (seen.has(c.id as string)) return
      if (network.length >= 5) return
      seen.add(c.id as string)
      const lastAt = c.last_interaction_at as string | null
      const days = lastAt
        ? Math.round((Date.now() - new Date(lastAt).getTime()) / 86400000)
        : null
      network.push({
        contactId: c.id as string,
        name: c.name as string,
        reason: days ? `${days}d since last contact` : 'never contacted',
        nextStep: null,
      })
    })

    setNetworkSuggs(network.slice(0, 5))

    // Build milestone suggestions
    const msTodos: MilestoneSuggestion[] = (milestoneTodosRes.data ?? [])
      .filter((row: Record<string, unknown>) => row.milestone)
      .map((row: Record<string, unknown>) => ({
        todo: row as unknown as MilestoneTodo,
        milestone: row.milestone as unknown as Milestone,
      }))
    setMilestoneSuggs(msTodos.slice(0, 5))
  }, [userId, today])

  useEffect(() => { load() }, [load])

  const totalCount = networkSuggs.length + milestoneSuggs.length
  if (totalCount === 0) return null

  const handleAddNetwork = async (s: NetworkSuggestion) => {
    setAdding(s.contactId)
    const text = s.nextStep ? s.nextStep : `Follow up with ${s.name}`
    await onAddTodo(text)
    setNetworkSuggs(prev => prev.filter(x => x.contactId !== s.contactId))
    setAdding(null)
  }

  const handleAddMilestone = async (s: MilestoneSuggestion) => {
    setAdding(s.todo.id)
    await onAddTodo(s.todo.text, s.todo.milestone_id)
    // Schedule the milestone_todo for today too
    await supabase.from('milestone_todos').update({ date: today }).eq('id', s.todo.id)
    setMilestoneSuggs(prev => prev.filter(x => x.todo.id !== s.todo.id))
    setAdding(null)
  }

  const handleScheduleMilestoneTodo = async (s: MilestoneSuggestion, date: string) => {
    await supabase.from('milestone_todos').update({ date }).eq('id', s.todo.id)
    setSchedulingTodoId(null)
    // Remove from list if scheduled for today
    if (date === today) {
      setMilestoneSuggs(prev => prev.filter(x => x.todo.id !== s.todo.id))
    } else {
      load()
    }
  }

  return (
    <div className="mt-2 border-t border-dashed border-mercury/50 pt-4">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-[11px] text-shuttle/40 hover:text-shuttle/70 transition-colors mb-3 group"
      >
        <span className={`text-[8px] transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>▶</span>
        <span className="uppercase tracking-widest font-semibold">Suggestions</span>
        <span className="bg-mercury/60 text-shuttle/50 text-[9px] font-mono px-1.5 py-0.5 rounded-full">
          {totalCount}
        </span>
      </button>

      {open && (
        <div className="space-y-5">
          {/* Network suggestions */}
          {networkSuggs.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Users size={11} className="text-shuttle/30" />
                <span className="text-[10px] font-semibold text-shuttle/40 uppercase tracking-widest">
                  From your network
                </span>
              </div>
              <div className="space-y-1">
                {networkSuggs.map(s => (
                  <div
                    key={s.contactId}
                    className="group flex items-start gap-2 py-1.5 px-2 -mx-2 rounded-lg hover:bg-gossip/10 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-burnham truncate">{s.name}</span>
                        <span className={`text-[9px] font-mono shrink-0 ${
                          s.daysOverdue && s.daysOverdue > 0 ? 'text-red-400/70' : 'text-shuttle/40'
                        }`}>
                          {s.reason}
                        </span>
                      </div>
                      {s.nextStep && (
                        <p className="text-[11px] text-shuttle/50 truncate mt-0.5">{s.nextStep}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleAddNetwork(s)}
                      disabled={adding === s.contactId}
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-burnham/10 text-shuttle/50 hover:text-burnham disabled:opacity-30"
                      title="Add to today"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Milestone suggestions */}
          {milestoneSuggs.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Flag size={11} className="text-shuttle/30" />
                  <span className="text-[10px] font-semibold text-shuttle/40 uppercase tracking-widest">
                    From milestones
                  </span>
                </div>
                {onSeeAllMilestones && (
                  <button
                    onClick={onSeeAllMilestones}
                    className="flex items-center gap-1 text-[10px] text-shuttle/30 hover:text-shuttle/60 transition-colors"
                  >
                    Plan all <ArrowRight size={10} />
                  </button>
                )}
              </div>
              <div className="space-y-1">
                {milestoneSuggs.map(s => (
                  <div
                    key={s.todo.id}
                    className="group flex items-start gap-2 py-1.5 px-2 -mx-2 rounded-lg hover:bg-gossip/10 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-burnham truncate">{s.todo.text}</p>
                      <p className="text-[10px] text-shuttle/40 truncate mt-0.5">
                        {s.milestone.text}
                        {s.milestone.target_date && (
                          <span className="ml-1 font-mono">
                            · {new Date(s.milestone.target_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {schedulingTodoId === s.todo.id ? (
                        <input
                          type="date"
                          autoFocus
                          className="text-[10px] text-shuttle border border-mercury rounded px-1.5 py-0.5 focus:outline-none focus:border-burnham/40 bg-white"
                          onBlur={() => setSchedulingTodoId(null)}
                          onChange={e => e.target.value && handleScheduleMilestoneTodo(s, e.target.value)}
                        />
                      ) : (
                        <button
                          onClick={() => setSchedulingTodoId(s.todo.id)}
                          className="text-[10px] text-shuttle/40 hover:text-shuttle/70 font-mono px-1.5 py-0.5 rounded border border-mercury/50 hover:border-shuttle/30 transition-colors"
                          title="Schedule for a date"
                        >
                          date
                        </button>
                      )}
                      <button
                        onClick={() => handleAddMilestone(s)}
                        disabled={adding === s.todo.id}
                        className="p-1 rounded hover:bg-burnham/10 text-shuttle/50 hover:text-burnham disabled:opacity-30 transition-colors"
                        title="Add to today"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
