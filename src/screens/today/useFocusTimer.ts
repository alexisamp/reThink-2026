// useFocusTimer — focus session engine, lifted out of the modal so the countdown
// keeps running in the page header after the setup modal closes.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type SoundId = 'none' | 'brown' | 'rain'

export interface FocusConfig {
  duration: number          // minutes
  intention: string
  goalId: string | null
  sound: SoundId
}

export function useFocusTimer(userId: string | null) {
  const [config, setConfig] = useState<FocusConfig | null>(null)   // null = inactive
  const [elapsed, setElapsed] = useState(0)                         // seconds
  const [running, setRunning] = useState(false)
  const [complete, setComplete] = useState(false)
  const [startedAt, setStartedAt] = useState<string | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const savedRef = useRef(false)

  const active = config !== null
  const total = config ? config.duration * 60 : 0
  const remaining = Math.max(0, total - elapsed)

  const stopAudio = () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null } }

  // ── tick ──────────────────────────────────────────────────────
  useEffect(() => {
    if (running && config) {
      tickRef.current = setInterval(() => {
        setElapsed(e => {
          const next = e + 1
          if (next >= config.duration * 60) {
            setRunning(false)
            setComplete(true)
            if (tickRef.current) clearInterval(tickRef.current)
            return config.duration * 60
          }
          return next
        })
      }, 1000)
    } else if (tickRef.current) {
      clearInterval(tickRef.current)
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [running, config])

  // ── ambient sound ─────────────────────────────────────────────
  useEffect(() => {
    if (running && config && config.sound !== 'none') {
      const audio = new Audio(`/sounds/${config.sound}-noise.mp3`)
      audio.loop = true
      audio.volume = 0.25
      audio.play().catch(() => {})
      audioRef.current = audio
    }
    return () => stopAudio()
  }, [running, config])

  // ── persist on completion ─────────────────────────────────────
  useEffect(() => {
    if (!complete || !startedAt || !config || !userId || savedRef.current) return
    savedRef.current = true
    supabase.from('focus_sessions').insert({
      user_id: userId,
      goal_id: config.goalId,
      started_at: startedAt,
      ended_at: new Date().toISOString(),
      duration_minutes: config.duration,
      session_type: 'FOCUS',
      intention: config.intention.trim() || null,
      completion_status: 'COMPLETE',
    }).then(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete])

  const start = useCallback((c: FocusConfig) => {
    savedRef.current = false
    setConfig(c)
    setElapsed(0)
    setComplete(false)
    setStartedAt(new Date().toISOString())
    setRunning(true)
  }, [])

  const pause = useCallback(() => setRunning(false), [])
  const resume = useCallback(() => setRunning(true), [])

  const reset = () => {
    stopAudio()
    setRunning(false)
    setConfig(null)
    setElapsed(0)
    setComplete(false)
    setStartedAt(null)
  }

  // cancel mid-session — log INCOMPLETE if it ran a meaningful while
  const cancel = useCallback(() => {
    if (config && startedAt && userId && elapsed >= 60 && !complete) {
      supabase.from('focus_sessions').insert({
        user_id: userId,
        goal_id: config.goalId,
        started_at: startedAt,
        ended_at: new Date().toISOString(),
        duration_minutes: Math.round(elapsed / 60),
        session_type: 'FOCUS',
        intention: config.intention.trim() || null,
        completion_status: 'INCOMPLETE',
      }).then(() => {})
    }
    reset()
  }, [config, startedAt, userId, elapsed, complete])

  // dismiss the completed chip (session already saved)
  const dismiss = useCallback(() => reset(), [])

  return {
    active, running, complete, remaining,
    intention: config?.intention ?? '',
    durationMin: config?.duration ?? 0,
    start, pause, resume, cancel, dismiss,
  }
}
