// FocusTimer — clean, self-contained focus session modal.
// Durations + intention + optional goal link + ambient sound; saves to focus_sessions.
// Kept reachable from a discreet header button (and ⌘. ) per the redesign scope —
// out of the visual flow, but preserved.
import { useEffect, useRef, useState } from 'react'
import { X, Play, Pause, ArrowCounterClockwise, Check } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'

const DURATIONS = [
  { label: '15', minutes: 15 },
  { label: '25', minutes: 25, desc: 'Pomodoro' },
  { label: '50', minutes: 50 },
]
const SOUNDS = [
  { id: 'none', label: 'Silent' },
  { id: 'brown', label: 'Brown' },
  { id: 'rain', label: 'Rain' },
] as const
type SoundId = typeof SOUNDS[number]['id']

interface GoalOpt { id: string; text: string; emoji: string | null }

interface Props {
  open: boolean
  onClose: () => void
  userId: string
  goals: GoalOpt[]
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60), s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function FocusTimer({ open, onClose, userId, goals }: Props) {
  const [duration, setDuration] = useState(25)
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const [complete, setComplete] = useState(false)
  const [intention, setIntention] = useState('')
  const [goalId, setGoalId] = useState<string | null>(null)
  const [sound, setSound] = useState<SoundId>('none')
  const [startedAt, setStartedAt] = useState<string | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // reset when closed
  useEffect(() => {
    if (!open) {
      setRunning(false); setElapsed(0); setComplete(false); setIntention(''); setStartedAt(null)
    }
  }, [open])

  // tick
  useEffect(() => {
    if (running) {
      tickRef.current = setInterval(() => {
        setElapsed(e => {
          const next = e + 1
          if (next >= duration * 60) {
            setRunning(false)
            setComplete(true)
            if (tickRef.current) clearInterval(tickRef.current)
            return duration * 60
          }
          return next
        })
      }, 1000)
    } else if (tickRef.current) {
      clearInterval(tickRef.current)
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [running, duration])

  // ambient sound
  useEffect(() => {
    if (running && sound !== 'none') {
      const audio = new Audio(`/sounds/${sound}-noise.mp3`)
      audio.loop = true
      audio.volume = 0.25
      audio.play().catch(() => {})
      audioRef.current = audio
    }
    return () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null } }
  }, [running, sound])

  // persist session on completion
  useEffect(() => {
    if (!complete || !startedAt) return
    supabase.from('focus_sessions').insert({
      user_id: userId,
      goal_id: goalId,
      started_at: startedAt,
      ended_at: new Date().toISOString(),
      duration_minutes: duration,
      session_type: 'FOCUS',
      intention: intention.trim() || null,
      completion_status: 'COMPLETE',
    }).then(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete])

  if (!open) return null

  const start = () => { if (!startedAt) setStartedAt(new Date().toISOString()); setRunning(true) }
  const reset = () => { setRunning(false); setElapsed(0); setComplete(false); setStartedAt(null) }
  const remaining = duration * 60 - elapsed
  const pct = (elapsed / (duration * 60)) * 100

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" style={{ background: 'rgba(0,55,32,0.12)', backdropFilter: 'blur(3px)' }} onClick={onClose}>
      <div
        className="w-full max-w-[360px] bg-white rounded-2xl p-6"
        style={{ boxShadow: 'var(--shadow-pop)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <span className="font-serif text-[18px] text-burnham" style={{ letterSpacing: '-0.02em' }}>
            {complete ? 'Nice work.' : 'Focus'}
          </span>
          <button onClick={onClose} className="p-1 rounded-md text-shuttle/60 hover:text-burnham hover:bg-mercury/40"><X size={15} /></button>
        </div>

        {!complete && (
          <>
            {/* duration presets */}
            <div className="flex gap-2 mb-4">
              {DURATIONS.map(d => (
                <button
                  key={d.minutes}
                  onClick={() => { setDuration(d.minutes); if (!running) setElapsed(0) }}
                  className={[
                    'flex-1 py-2 rounded-lg text-[13px] font-medium transition-all',
                    duration === d.minutes ? 'bg-burnham text-white' : 'bg-mercury/30 text-shuttle hover:bg-mercury/50',
                  ].join(' ')}
                >
                  {d.label}<span className="text-[9px] opacity-50">m</span>
                </button>
              ))}
            </div>

            {/* countdown */}
            <div className="text-center mb-1">
              <div className="font-mono text-[52px] leading-none text-burnham tabular-nums">{fmt(remaining)}</div>
            </div>
            <div className="h-[3px] bg-mercury/40 rounded-full overflow-hidden mb-5 mt-3">
              <div className="h-full bg-moss rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
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

            {/* controls */}
            <div className="flex items-center justify-center gap-3">
              {!running ? (
                <button onClick={start} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-burnham text-white text-[13px] font-medium hover:opacity-90">
                  <Play size={14} weight="fill" /> {elapsed > 0 ? 'Resume' : 'Start'}
                </button>
              ) : (
                <button onClick={() => setRunning(false)} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-mercury/40 text-burnham text-[13px] font-medium hover:bg-mercury/60">
                  <Pause size={14} weight="fill" /> Pause
                </button>
              )}
              {elapsed > 0 && (
                <button onClick={reset} title="Reset" className="p-2.5 rounded-lg text-shuttle hover:bg-mercury/40">
                  <ArrowCounterClockwise size={15} />
                </button>
              )}
            </div>
          </>
        )}

        {complete && (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-moss/15 text-moss flex items-center justify-center mx-auto mb-4">
              <Check size={22} weight="bold" />
            </div>
            <p className="text-[13px] text-shuttle mb-1">{duration} focused minutes logged.</p>
            {intention.trim() && <p className="text-[13px] text-burnham font-medium mb-5">“{intention.trim()}”</p>}
            <div className="flex gap-2 justify-center">
              <button onClick={reset} className="px-4 py-2 rounded-lg bg-mercury/30 text-burnham text-[12px] font-medium hover:bg-mercury/50">Another</button>
              <button onClick={onClose} className="px-4 py-2 rounded-lg bg-burnham text-white text-[12px] font-medium hover:opacity-90">Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
