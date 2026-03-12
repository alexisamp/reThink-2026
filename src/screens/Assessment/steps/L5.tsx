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

export default function L5({ onNext, onBack, saving, isLastStep, progress, step, totalSteps, initialValues }: StepProps) {
  const [values, setValues] = useState<Record<string, string>>(initialValues ?? {})
  const change = (k: string, v: string) => setValues(p => ({ ...p, [k]: v }))

  const goals = [
    initialValues?.l3_1 || 'Goal 1',
    initialValues?.l3_2 || 'Goal 2',
    initialValues?.l3_3 || 'Goal 3',
  ]

  const renderField = (key: string, placeholder: string) => (
    <div
      key={key}
      className="group relative border-b border-mercury pb-1 flex items-baseline gap-4 transition-all duration-200 focus-within:border-black focus-within:border-b-[1.5px]"
    >
      <input
        type="text"
        className="w-full text-sm text-burnham bg-transparent border-none p-0 focus:ring-0 placeholder-mercury font-normal"
        placeholder={placeholder}
        value={values[key] ?? ''}
        onChange={e => change(key, e.target.value)}
      />
      <div className={`absolute right-0 bottom-3 w-1.5 h-1.5 rounded-full bg-gossip transition-all duration-300 ${values[key] ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} />
    </div>
  )

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
              Level 5 of 11 — Small Steps for Momentum
            </span>
            <h1 className="text-2xl md:text-3xl font-semibold text-burnham tracking-[-0.02em] mb-3">
              Small Steps for Momentum
            </h1>
            <p className="text-shuttle italic font-serif text-sm">
              Procrastination lives in vagueness. The smallest possible step is always doable.
            </p>
          </div>

          <div className="space-y-12">
            {[1, 2, 3].map(i => (
              <div key={i}>
                <div className="flex items-center gap-3 mb-5">
                  <span className="w-6 h-6 rounded-full bg-gossip flex items-center justify-center text-burnham text-xs font-bold flex-shrink-0">
                    {i}
                  </span>
                  <span className="font-semibold text-burnham truncate">{goals[i - 1]}</span>
                </div>

                <div className="pl-9 grid grid-cols-2 gap-x-6 gap-y-4">
                  <div>
                    <p className="text-[11px] text-shuttle uppercase tracking-wider font-medium mb-3">I'm putting off...</p>
                    <div className="space-y-4">
                      {renderField(`l5_g${i}_off1`, "What I'm avoiding...")}
                      {renderField(`l5_g${i}_off2`, "What I'm avoiding...")}
                      {renderField(`l5_g${i}_off3`, "What I'm avoiding...")}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] text-shuttle uppercase tracking-wider font-medium mb-3">Smallest first step</p>
                    <div className="space-y-4">
                      {renderField(`l5_g${i}_step1`, 'So small it takes 2 min...')}
                      {renderField(`l5_g${i}_step2`, 'So small it takes 2 min...')}
                      {renderField(`l5_g${i}_step3`, 'So small it takes 2 min...')}
                    </div>
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
