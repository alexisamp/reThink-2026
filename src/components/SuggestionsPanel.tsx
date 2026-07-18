/**
 * SuggestionsPanel — flat list of actionable suggestions, styled like backlog.
 * Two sources: overdue network next-steps + unscheduled milestone todos.
 * No internal toggle — parent controls visibility via ⌘S.
 */
import { useState, useEffect, useCallback } from 'react'
import { Plus, TrashSimple } from '@phosphor-icons/react'
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

export function SuggestionsPanel({ userId, today, onAddTodo }: SuggestionsPanelProps) {
  const [networkSuggs, setNetworkSuggs] = useState<NetworkSuggestion[]>([])
  const [milestoneSuggs, setMilestoneSuggs] = useState<MilestoneSuggestion[]>([])
  const [adding, setAdding] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!userId) return

    const [nextStepsRes, milestoneTodosRes] = await Promise.all([
      supabase
        .from('interactions')
        .select('contact_id, next_step, next_step_date')
        .eq('user_id', userId)
        .eq('next_step_owner', 'me')
        .lte('next_step_date', today)
        .not('next_step', 'is', null)
        .order('next_step_date', { ascending: true })
        .limit(5),
      supabase
        .from('milestone_todos')
        .select('*, milestone:milestone_id(*)')
        .eq('user_id', userId)
        .eq('completed', false)
        .is('date', null)
        .order('created_at', { ascending: true })
        .limit(6),
    ])

    // Network suggestions
    const seen = new Set<string>()
    const network: NetworkSuggestion[] = []
    const nextStepRows = nextStepsRes.data ?? []
    if (nextStepRows.length > 0) {
      const contactIds = [...new Set(nextStepRows.map((r: Record<string, unknown>) => r.contact_id as string))]
      const { data: contactsData } = await supabase
        .from('outreach_logs').select('id, name').in('id', contactIds)
      const nameMap = new Map<string, string>(
        (contactsData ?? []).map((c: Record<string, unknown>) => [c.id as string, c.name as string])
      )
      nextStepRows.forEach((row: Record<string, unknown>) => {
        const contactId = row.contact_id as string
        if (seen.has(contactId)) return
        seen.add(contactId)
        const daysOverdue = Math.round(
          (new Date(today).getTime() - new Date(row.next_step_date as string).getTime()) / 86400000
        )
        network.push({
          contactId,
          name: nameMap.get(contactId) ?? 'Unknown',
          reason: daysOverdue > 0 ? `${daysOverdue}d overdue` : 'due today',
          nextStep: row.next_step as string | null,
          daysOverdue,
        })
      })
    }
    setNetworkSuggs(network.slice(0, 5))

    // Milestone suggestions
    const msTodos: MilestoneSuggestion[] = (milestoneTodosRes.data ?? [])
      .filter((row: Record<string, unknown>) => row.milestone)
      .map((row: Record<string, unknown>) => ({
        todo: row as unknown as MilestoneTodo,
        milestone: row.milestone as unknown as Milestone,
      }))
    setMilestoneSuggs(msTodos.slice(0, 5))
  }, [userId, today])

  useEffect(() => { load() }, [load])

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
    await supabase.from('milestone_todos').update({ date: today }).eq('id', s.todo.id)
    setMilestoneSuggs(prev => prev.filter(x => x.todo.id !== s.todo.id))
    setAdding(null)
  }

  const handleDismissNetwork = (contactId: string) =>
    setNetworkSuggs(prev => prev.filter(x => x.contactId !== contactId))

  const handleDismissMilestone = (todoId: string) =>
    setMilestoneSuggs(prev => prev.filter(x => x.todo.id !== todoId))

  if (networkSuggs.length === 0 && milestoneSuggs.length === 0) return null

  return (
    <div className="space-y-0.5">
      {/* Network next-steps */}
      {networkSuggs.map(s => (
        <div
          key={s.contactId}
          className="group flex items-center gap-3 py-1.5 px-2 -mx-2 rounded hover:bg-mercury/20 transition-colors"
        >
          <div className="w-[18px] h-[18px] shrink-0 flex items-center justify-center opacity-20">
            <div className="w-3 h-3 rounded-full border border-dashed border-shuttle/60" />
          </div>
          <span className="flex-1 text-[13px] text-shuttle/35 min-w-0 truncate">
            {s.nextStep ?? `Follow up with ${s.name}`}
          </span>
          <span className={`text-[10px] font-mono shrink-0 ${
            s.daysOverdue && s.daysOverdue > 0 ? 'text-red-400/50' : 'text-shuttle/25'
          }`}>{s.reason}</span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={() => handleAddNetwork(s)}
              disabled={adding === s.contactId}
              className="text-shuttle/50 hover:text-burnham transition-colors disabled:opacity-30 p-0.5"
              title="Add to today"
            >
              <Plus size={12} />
            </button>
            <button
              onClick={() => handleDismissNetwork(s.contactId)}
              className="text-shuttle/30 hover:text-red-400 transition-colors p-0.5"
              title="Dismiss"
            >
              <TrashSimple size={12} />
            </button>
          </div>
        </div>
      ))}

      {/* Unscheduled milestone todos */}
      {milestoneSuggs.map(s => (
        <div
          key={s.todo.id}
          className="group flex items-center gap-3 py-1.5 px-2 -mx-2 rounded hover:bg-mercury/20 transition-colors"
        >
          <div className="w-[18px] h-[18px] shrink-0 flex items-center justify-center opacity-20">
            <div className="w-3 h-3 rounded-[2px] border border-dashed border-shuttle/60" />
          </div>
          <span className="flex-1 text-[13px] text-shuttle/35 min-w-0 truncate">
            {s.todo.text}
          </span>
          <span className="text-[10px] font-mono text-shuttle/20 shrink-0 truncate max-w-[80px]">
            {s.milestone.text.length > 16 ? s.milestone.text.slice(0, 16) + '...' : s.milestone.text}
          </span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={() => handleAddMilestone(s)}
              disabled={adding === s.todo.id}
              className="text-shuttle/50 hover:text-burnham transition-colors disabled:opacity-30 p-0.5"
              title="Add to today"
            >
              <Plus size={12} />
            </button>
            <button
              onClick={() => handleDismissMilestone(s.todo.id)}
              className="text-shuttle/30 hover:text-red-400 transition-colors p-0.5"
              title="Dismiss"
            >
              <TrashSimple size={12} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
