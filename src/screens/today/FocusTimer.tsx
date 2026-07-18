// FocusTimer — setup-only modal. Pick duration + intention + goal + sound, then
// Start: the timer engine lives in useFocusTimer (Today), so the modal closes and
// the countdown takes over the page header. Kept out of the visual flow but present.
import { useEffect, useState } from 'react'
import { X, Play } from '@phosphor-icons/react'
import type { FocusConfig, SoundId } from './useFocusTimer'

const DURATIONS = [
  { label: '15', minutes: 15 },
  { label: '25', minutes: 25 },
  { label: '50', minutes: 50 },
]
const SOUNDS: { id: SoundId; label: string }[] = [
  { id: 'none', label: 'Silent' },
  { id: 'brown', label: 'Brown' },
  { id: 'rain', label: 'Rain' },
]

interface GoalOpt { id: string; text: string; emoji: string | null }

interface Props {
  open: boolean
  onClose: () => void
  goals: GoalOpt[]
  onStart: (config: FocusConfig) => void
}

export default function FocusTimer({ open, onClose, goals, onStart }: Props) {
  const [duration, setDuration] = useState(25)
  const [intention, setIntention] = useState('')
  const [goalId, setGoalId] = useState<string | null>(null)
  const [sound, setSound] = useState<SoundId>('none')

  useEffect(() => {
    if (!open) { setIntention(''); setGoalId(null) }
  }, [open])

  if (!open) return null

  const begin = () => {
    onStart({ duration, intention, goalId, sound })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(28,40,64,0.12)', backdropFilter: 'blur(3px)' }} onClick={onClose}>
      <div className="w-full max-w-[360px] bg-white rounded-lg p-6" style={{ boxShadow: 'var(--shadow-pop)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <span className="text-[18px] font-semibold text-burnham tracking-normal">Focus</span>
          <button onClick={onClose} aria-label="Close focus timer" className="p-1 rounded-md text-shuttle/60 hover:text-burnham hover:bg-mercury/40"><X size={15} /></button>
        </div>

        {/* duration presets */}
        <div className="flex gap-2 mb-5">
          {DURATIONS.map(d => (
            <button
              key={d.minutes}
              onClick={() => setDuration(d.minutes)}
              className={[
                'flex-1 py-3 rounded-lg text-[15px] font-medium transition-all tabular-nums',
                duration === d.minutes ? 'bg-burnham text-white' : 'bg-mercury/30 text-shuttle hover:bg-mercury/50',
              ].join(' ')}
            >
              {d.label}<span className="text-[10px] opacity-50">m</span>
            </button>
          ))}
        </div>

        {/* intention */}
        <input
          value={intention}
          onChange={e => setIntention(e.target.value)}
          placeholder="What's the one thing this session?"
          className="w-full text-[13px] text-burnham bg-mercury/20 border border-mercury/50 rounded-lg px-3 py-2 mb-3 placeholder:text-shuttle/40"
        />

        {/* goal + sound */}
        <div className="flex gap-2 mb-5">
          <select
            value={goalId ?? ''}
            onChange={e => setGoalId(e.target.value || null)}
            className="flex-1 text-[12px] text-shuttle bg-mercury/20 border border-mercury/50 rounded-lg px-2 py-2"
          >
            <option value="">No goal</option>
            {goals.map(g => <option key={g.id} value={g.id}>{g.emoji ? g.emoji + ' ' : ''}{g.text}</option>)}
          </select>
          <select
            value={sound}
            onChange={e => setSound(e.target.value as SoundId)}
            className="text-[12px] text-shuttle bg-mercury/20 border border-mercury/50 rounded-lg px-2 py-2"
          >
            {SOUNDS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>

        {/* start */}
        <button onClick={begin} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-burnham text-white text-[13px] font-medium hover:opacity-90 transition-opacity">
          <Play size={14} weight="fill" /> Start focus
        </button>
      </div>
    </div>
  )
}
