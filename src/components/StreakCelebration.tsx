import { useEffect } from 'react'

const MILESTONE_STREAKS = [7, 30, 100, 365]

interface StreakCelebrationProps {
  streak: number
  habitName: string
  onDismiss: () => void
}

export default function StreakCelebration({ streak, habitName, onDismiss }: StreakCelebrationProps) {
  if (!MILESTONE_STREAKS.includes(streak)) return null

  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000)
    const handleKey = () => onDismiss()
    window.addEventListener('keydown', handleKey)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', handleKey)
    }
  }, [onDismiss])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-white/95 backdrop-blur-sm cursor-pointer"
      onClick={onDismiss}
    >
      <div className="text-center space-y-4">
        <div className="text-8xl select-none">🔥</div>
        <div className="text-7xl font-bold text-burnham tracking-tight">{streak}</div>
        <div className="text-2xl font-semibold text-burnham">Day Streak</div>
        <div className="text-base text-shuttle">{habitName}</div>
        <div className="text-xs text-shuttle/60 mt-4">Click anywhere to continue</div>
      </div>
    </div>
  )
}
