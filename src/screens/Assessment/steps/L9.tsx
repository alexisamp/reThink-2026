import { useState } from 'react'
import { House } from '@phosphor-icons/react'

interface StepProps {
  onNext: (answers: Record<string, string>) => void
  onBack?: () => void
  saving?: boolean
  isLastStep?: boolean
  initialValues?: Record<string, string>
  progress: number
  step: number
  totalSteps: number
}

const DIMENSIONS = [
  { key: 'info',   short: 'Information',  label: 'Information quality',  desc: 'Do they expand your thinking with valuable insights?' },
  { key: 'growth', short: 'Growth',        label: 'Growth catalyst',       desc: 'Do they challenge you to reach higher standards?' },
  { key: 'energy', short: 'Energy',        label: 'Energy impact',         desc: 'Do interactions leave you energized or drained?' },
  { key: 'future', short: 'Future',        label: 'Future alignment',      desc: 'Are they heading where you want to go?' },
  { key: 'values', short: 'Values',        label: 'Values and ethics',     desc: 'Do their principles align with your aspirations?' },
] as const

type Score = '1' | '0' | '-1'

const SCORE_OPTIONS: { value: Score; label: string }[] = [
  { value: '1', label: '+' },
  { value: '0', label: '~' },
  { value: '-1', label: '−' },
]

export default function L9({ onNext, onBack, saving, isLastStep, progress, step, totalSteps, initialValues }: StepProps) {
  const [values, setValues] = useState<Record<string, string>>(initialValues ?? {})
  const change = (k: string, v: string) => setValues(p => ({ ...p, [k]: v }))

  const people = [
    initialValues?.l8_1?.split(' —')[0]?.split(' -')[0] || 'Person 1',
    initialValues?.l8_2?.split(' —')[0]?.split(' -')[0] || 'Person 2',
    initialValues?.l8_3?.split(' —')[0]?.split(' -')[0] || 'Person 3',
    initialValues?.l8_4?.split(' —')[0]?.split(' -')[0] || 'Person 4',
    initialValues?.l8_5?.split(' —')[0]?.split(' -')[0] || 'Person 5',
  ]

  const getKey = (personIdx: number, dimKey: string) => `l9_p${personIdx + 1}_${dimKey}`

  const totalScore = (personIdx: number) =>
    DIMENSIONS.reduce((sum, dim) => {
      const val = parseInt(values[getKey(personIdx, dim.key)] ?? '0', 10)
      return sum + val
    }, 0)

  return (
    <div className="min-h-screen bg-white text-burnham font-sans">
      <main className="w-full max-w-2xl mx-auto px-8 pt-12 md:pt-20 pb-12 flex flex-col min-h-screen">

        <header className="mb-12">
          <div className="flex justify-between items-center text-xs font-medium mb-4">
            <div className="flex items-center gap-2 text-shuttle">
              <House size={14} />
              <span>/</span>
              <span>Annual Review 2026</span>
            </div>
            <span className="text-mercury font-mono text-[10px]">{step} / {totalSteps}</span>
          </div>
          <div className="h-px w-full bg-mercury relative">
            <div className="absolute left-0 top-0 h-full bg-pastel transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </header>

        <div className="flex-1">
          <div className="mb-8">
            <span className="text-[10px] uppercase tracking-[0.1em] text-shuttle block mb-4 font-medium">
              Level 9 of 11 — Score Your Circle
            </span>
            <h1 className="text-2xl md:text-3xl font-semibold text-burnham tracking-[-0.02em] mb-3">
              Score Your Circle
            </h1>
            <p className="text-shuttle italic font-serif text-sm">
              Rate each person: + positive, ~ neutral, − negative. Be honest — this is for your eyes only.
            </p>
          </div>

          {/* Legend */}
          <div className="mb-6 space-y-1">
            {DIMENSIONS.map(d => (
              <div key={d.key} className="flex gap-2 text-xs text-shuttle">
                <span className="font-medium min-w-[80px]">{d.label}</span>
                <span className="italic">{d.desc}</span>
              </div>
            ))}
          </div>

          {/* Header row */}
          <div className="grid grid-cols-[1fr_repeat(5,_44px)] gap-2 items-center mb-2">
            <div />
            {DIMENSIONS.map(d => (
              <div key={d.key} className="text-center text-[10px] text-shuttle font-medium uppercase tracking-wide leading-tight">
                {d.short}
              </div>
            ))}
          </div>

          {/* People rows */}
          <div className="space-y-3">
            {people.map((name, pi) => (
              <div key={pi} className="grid grid-cols-[1fr_repeat(5,_44px)] gap-2 items-center py-3 border-b border-mercury">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 h-5 rounded-full bg-gossip flex items-center justify-center text-burnham text-[10px] font-bold flex-shrink-0">
                    {pi + 1}
                  </span>
                  <span className="text-sm text-burnham font-medium truncate">{name}</span>
                </div>
                {DIMENSIONS.map(dim => {
                  const key = getKey(pi, dim.key)
                  const current = values[key]
                  return (
                    <div key={dim.key} className="flex flex-col items-center gap-0.5">
                      {SCORE_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => change(key, opt.value)}
                          className={`w-8 h-6 rounded text-xs font-bold transition-all ${
                            current === opt.value
                              ? opt.value === '1'
                                ? 'bg-gossip text-burnham'
                                : 'bg-mercury text-shuttle'
                              : 'text-mercury hover:text-shuttle'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Score totals */}
          <div className="mt-6 flex flex-wrap gap-3">
            {people.map((name, pi) => {
              const score = totalScore(pi)
              return (
                <div key={pi} className="flex items-center gap-1.5 text-xs text-shuttle">
                  <span className="truncate max-w-[80px]">{name}</span>
                  <span className={`font-bold ${score > 2 ? 'text-pastel' : score < 0 ? 'text-shuttle' : 'text-burnham'}`}>
                    {score > 0 ? '+' : ''}{score}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <footer className="mt-16 pt-6 flex justify-between items-center">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-shuttle hover:text-burnham transition-colors font-medium"
            style={{ opacity: onBack ? 1 : 0, pointerEvents: onBack ? 'auto' : 'none' }}
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => onNext(values)}
            disabled={saving}
            className="text-sm font-bold text-burnham flex items-center gap-2 hover:opacity-80 transition-opacity disabled:opacity-50"
          >
            {saving ? 'Saving...' : isLastStep ? 'Finish' : 'Next'}
            {!saving && <span className="text-pastel text-lg leading-none">→</span>}
          </button>
        </footer>
      </main>
    </div>
  )
}
