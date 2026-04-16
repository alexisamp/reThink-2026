/**
 * MilestoneOverviewPanel — right-side slide-in roadmap view
 *
 * Design: editorial timeline. Goals as section headers with vertical
 * spine lines connecting milestone nodes. Click a node → detail panel.
 * Milestones ordered by target_date ASC within each goal.
 */
import { useState } from 'react'
import { X, Plus, Trash, Flag, Circle, CheckCircle } from '@phosphor-icons/react'
import type { Milestone, Goal } from '@/types'
import { supabase } from '@/lib/supabase'

interface MilestoneOverviewPanelProps {
  open: boolean
  milestones: Milestone[]
  goals: Pick<Goal, 'id' | 'text' | 'alias' | 'emoji' | 'color'>[]
  onClose: () => void
  onSelectMilestone: (ms: Milestone) => void
  onNewMilestone: () => void
  onMilestoneDeleted: (id: string) => void
  onMilestoneStatusToggle: (ms: Milestone) => void
}

function daysLabel(dateStr: string | null | undefined): { text: string; color: string } | null {
  if (!dateStr) return null
  const diff = Math.ceil(
    (new Date(dateStr + 'T12:00:00').getTime() - Date.now()) / 86400000
  )
  if (diff < 0)  return { text: `${Math.abs(diff)}d over`, color: 'text-red-400/70' }
  if (diff === 0) return { text: 'today', color: 'text-amber-500/80' }
  if (diff <= 7)  return { text: `${diff}d`, color: 'text-amber-500/60' }
  return { text: `${diff}d`, color: 'text-shuttle/30' }
}

export default function MilestoneOverviewPanel({
  open,
  milestones,
  goals,
  onClose,
  onSelectMilestone,
  onNewMilestone,
  onMilestoneDeleted,
  onMilestoneStatusToggle,
}: MilestoneOverviewPanelProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (ms: Milestone) => {
    if (confirmDeleteId !== ms.id) {
      setConfirmDeleteId(ms.id)
      return
    }
    setDeletingId(ms.id)
    await supabase.from('todos').delete().eq('milestone_id', ms.id)
    await supabase.from('milestones').delete().eq('id', ms.id)
    onMilestoneDeleted(ms.id)
    setConfirmDeleteId(null)
    setDeletingId(null)
  }

  // Group milestones by goal, sorted by target_date
  const grouped = goals
    .map(goal => ({
      goal,
      items: milestones
        .filter(m => m.goal_id === goal.id)
        .sort((a, b) => {
          if (!a.target_date && !b.target_date) return 0
          if (!a.target_date) return 1
          if (!b.target_date) return -1
          return a.target_date.localeCompare(b.target_date)
        }),
    }))
    .filter(g => g.items.length > 0)

  const noDateMilestones = milestones
    .filter(m => !m.goal_id)
    .sort((a, b) => a.text.localeCompare(b.text))

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[200] bg-black/8 backdrop-blur-[0.5px] transition-opacity duration-300"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 bottom-0 z-[205] flex flex-col bg-white border-l border-mercury/50 shadow-2xl"
        style={{
          width: 380,
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* ── Header ────────────────────────────────────────────────── */}
        <div className="shrink-0 bg-burnham px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flag size={13} className="text-gossip/60" />
            <span className="text-[13px] font-semibold text-white tracking-tight">Milestones</span>
            <span className="text-[10px] font-mono text-gossip/30 ml-1">{milestones.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onNewMilestone}
              className="flex items-center gap-1 text-[10px] font-mono text-gossip/50 hover:text-gossip transition-colors px-2 py-1 rounded border border-gossip/15 hover:border-gossip/35"
            >
              <Plus size={10} />
              New
            </button>
            <button
              onClick={onClose}
              className="text-white/30 hover:text-white/70 transition-colors p-0.5"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* ── Body — goal timelines ──────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto py-5 px-5 space-y-8">
          {grouped.length === 0 && noDateMilestones.length === 0 && (
            <div className="text-center py-16">
              <p className="text-[12px] text-shuttle/35">No milestones yet.</p>
              <button
                onClick={onNewMilestone}
                className="mt-3 text-[11px] text-burnham/50 hover:text-burnham transition-colors font-mono"
              >
                + Create your first milestone
              </button>
            </div>
          )}

          {grouped.map(({ goal, items }) => (
            <div key={goal.id}>
              {/* Goal section header */}
              <div className="flex items-center gap-2 mb-3">
                {goal.emoji && (
                  <span className="text-[13px] leading-none">{goal.emoji}</span>
                )}
                <span className="text-[9px] uppercase tracking-widest text-shuttle/40 font-mono">
                  {goal.alias ?? goal.text.slice(0, 28)}
                </span>
              </div>

              {/* Timeline */}
              <div className="relative">
                {/* Vertical spine */}
                {items.length > 1 && (
                  <div className="absolute left-[5px] top-3.5 bottom-3.5 w-px bg-mercury/60" />
                )}

                {items.map((ms, idx) => {
                  const dl = daysLabel(ms.target_date)
                  const isDone = ms.status === 'COMPLETE'
                  const isConfirming = confirmDeleteId === ms.id
                  const isDeleting = deletingId === ms.id

                  return (
                    <div key={ms.id} className="flex gap-3 group/ms mb-1">
                      {/* Node */}
                      <div className="shrink-0 flex flex-col items-center pt-1">
                        <div
                          className={`w-2.5 h-2.5 rounded-full border-[1.5px] z-10 transition-all ${
                            isDone
                              ? 'bg-pastel border-pastel'
                              : 'bg-white border-mercury group-hover/ms:border-burnham/40'
                          }`}
                        />
                      </div>

                      {/* Content */}
                      <div
                        className={`flex-1 min-w-0 pb-4 ${idx === items.length - 1 ? 'pb-0' : ''}`}
                      >
                        <div className="flex items-start gap-2">
                          <button
                            className="flex-1 min-w-0 text-left group/inner"
                            onClick={() => {
                              setConfirmDeleteId(null)
                              onSelectMilestone(ms)
                            }}
                          >
                            <span
                              className={`text-[12.5px] leading-snug block transition-colors ${
                                isDone
                                  ? 'line-through text-shuttle/35'
                                  : 'text-burnham/80 group-hover/inner:text-burnham'
                              }`}
                            >
                              {ms.text}
                            </span>
                            {ms.target_date && (
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[9px] font-mono text-shuttle/30">
                                  {ms.target_date}
                                </span>
                                {dl && (
                                  <span className={`text-[9px] font-mono ${dl.color}`}>
                                    {dl.text}
                                  </span>
                                )}
                              </div>
                            )}
                          </button>

                          {/* Actions — show on hover */}
                          <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover/ms:opacity-100 transition-opacity pt-0.5">
                            {/* Toggle done */}
                            <button
                              onClick={() => onMilestoneStatusToggle(ms)}
                              title={isDone ? 'Mark pending' : 'Mark complete'}
                              className="text-shuttle/25 hover:text-pastel p-0.5 transition-colors"
                            >
                              {isDone
                                ? <CheckCircle size={13} weight="fill" className="text-pastel/60" />
                                : <Circle size={13} />}
                            </button>

                            {/* Delete */}
                            {isConfirming ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleDelete(ms)}
                                  disabled={!!isDeleting}
                                  className="text-[9px] font-mono text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded border border-red-200 hover:border-red-400 transition-colors"
                                >
                                  {isDeleting ? '…' : 'delete'}
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="text-shuttle/30 hover:text-shuttle p-0.5"
                                >
                                  <X size={10} />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleDelete(ms)}
                                className="text-shuttle/20 hover:text-red-400 p-0.5 transition-colors"
                                title="Delete milestone"
                              >
                                <Trash size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* No-goal milestones */}
          {noDateMilestones.length > 0 && (
            <div>
              <div className="text-[9px] uppercase tracking-widest text-shuttle/25 font-mono mb-3">
                Unassigned
              </div>
              <div className="space-y-2">
                {noDateMilestones.map(ms => {
                  const isConfirming = confirmDeleteId === ms.id
                  const isDeleting = deletingId === ms.id
                  return (
                    <div key={ms.id} className="flex items-center gap-2 group/ms">
                      <div className="w-2 h-2 rounded-full border border-mercury/60 shrink-0" />
                      <button
                        className="flex-1 text-left text-[12px] text-shuttle/50 hover:text-burnham transition-colors truncate"
                        onClick={() => onSelectMilestone(ms)}
                      >
                        {ms.text}
                      </button>
                      <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover/ms:opacity-100 transition-opacity">
                        <button
                          onClick={() => onMilestoneStatusToggle(ms)}
                          className="text-shuttle/25 hover:text-pastel p-0.5"
                        >
                          <Circle size={12} />
                        </button>
                        {isConfirming ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(ms)}
                              disabled={!!isDeleting}
                              className="text-[9px] font-mono text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded border border-red-200"
                            >
                              {isDeleting ? '…' : 'confirm'}
                            </button>
                            <button onClick={() => setConfirmDeleteId(null)} className="text-shuttle/30 p-0.5">
                              <X size={9} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleDelete(ms)}
                            className="text-shuttle/20 hover:text-red-400 p-0.5"
                          >
                            <Trash size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────── */}
        <div className="shrink-0 px-5 py-2.5 border-t border-mercury/30">
          <span className="text-[9px] font-mono text-shuttle/20">M · ⌘⇧M to toggle · Esc to close</span>
        </div>
      </div>
    </>
  )
}
