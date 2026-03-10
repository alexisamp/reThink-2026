import { useEffect } from 'react'
import { Flame } from '@phosphor-icons/react'

const MILESTONE_STREAKS = [7, 30, 100, 365]

interface StreakCelebrationProps {
  streak: number
  habitName: string
  onDismiss: () => void
}

export default function StreakCelebration({ streak, habitName, onDismiss }: StreakCelebrationProps) {
  const isMilestone = MILESTONE_STREAKS.includes(streak)

  // Hooks must always be called — guard is inside, not before
  useEffect(() => {
    if (!isMilestone) return
    const timer = setTimeout(onDismiss, 3000)
    const handleKey = () => onDismiss()
    window.addEventListener('keydown', handleKey)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', handleKey)
    }
  }, [onDismiss, isMilestone])

  if (!isMilestone) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-white/95 backdrop-blur-sm cursor-pointer"
      onClick={onDismiss}
    >
      <div className="text-center space-y-4">
        <div className="text-8xl select-none flex items-center justify-center"><Flame size={96} weight="fill" className="text-pastel" /></div>
        <div className="text-7xl font-bold text-burnham tracking-tight">{streak}</div>
        <div className="text-2xl font-semibold text-burnham">Day Streak</div>
        <div className="text-base text-shuttle">{habitName}</div>
        <div className="text-xs text-shuttle/60 mt-4">Click anywhere to continue</div>
      </div>
    </div>
  )
}
