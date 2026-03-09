interface ProgressBarProps {
  value: number // 0-100
  className?: string
  color?: string
}

export default function ProgressBar({ value, className = '', color = 'bg-pastel' }: ProgressBarProps) {
  return (
    <div className={`h-[1px] w-full bg-mercury rounded-full overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full ${color} transition-all duration-500`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}
