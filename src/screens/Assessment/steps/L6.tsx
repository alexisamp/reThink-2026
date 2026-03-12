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

export default function L6({ onNext, onBack, saving, isLastStep, progress, step, totalSteps, initialValues }: StepProps) {
  const [values, setValues] = useState<Record<string, string>>(initialValues ?? {})
  const change = (k: string, v: string) => setValues(p => ({ ...p, [k]: v }))

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
          <div className="mb-10">
            <span className="text-[10px] uppercase tracking-[0.1em] text-shuttle block mb-4 font-medium">
              Level 6 of 11 — Play to Your Strengths
            </span>
            <h1 className="text-2xl md:text-3xl font-semibold text-burnham tracking-[-0.02em] mb-3">
              Play to Your Strengths
            </h1>
            <p className="text-shuttle italic font-serif text-sm">
              You don't need to fix every weakness. You need a workaround for each one.
            </p>
          </div>

          <div className="space-y-10">
            {[1, 2, 3].map(i => (
              <div key={i}>
                <span className="text-mercury font-mono text-xs block mb-4">{String(i).padStart(2, '0')}</span>
                <div className="space-y-5">
                  <div className="group border-b border-mercury pb-1 transition-all duration-200 focus-within:border-black focus-within:border-b-[1.5px]">
                    <label className="block text-[11px] text-shuttle uppercase tracking-wider mb-1.5 font-medium">
                      A weakness I have is...
                    </label>
                    <input
                      type="text"
                      autoFocus={i === 1}
                      className="w-full text-base text-burnham bg-transparent border-none p-0 focus:ring-0 placeholder-mercury font-normal"
                      placeholder="Be honest about a real weakness"
                      value={values[`l6_w${i}`] ?? ''}
                      onChange={e => change(`l6_w${i}`, e.target.value)}
                    />
                  </div>
                  <div className="group border-b border-mercury pb-1 transition-all duration-200 focus-within:border-black focus-within:border-b-[1.5px]">
                    <label className="block text-[11px] text-shuttle uppercase tracking-wider mb-1.5 font-medium">
                      My workaround is...
                    </label>
                    <input
                      type="text"
                      className="w-full text-base text-burnham bg-transparent border-none p-0 focus:ring-0 placeholder-mercury font-normal"
                      placeholder="How do you navigate around it?"
                      value={values[`l6_ww${i}`] ?? ''}
                      onChange={e => change(`l6_ww${i}`, e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
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
