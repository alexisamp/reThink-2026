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

export default function L4({ onNext, onBack, saving, isLastStep, progress, step, totalSteps, initialValues }: StepProps) {
  const [values, setValues] = useState<Record<string, string>>(initialValues ?? {})
  const change = (k: string, v: string) => setValues(p => ({ ...p, [k]: v }))

  const goals = [
    initialValues?.l3_1 || 'Goal 1',
    initialValues?.l3_2 || 'Goal 2',
    initialValues?.l3_3 || 'Goal 3',
  ]

  const renderField = (key: string, placeholder: string, autofocus?: boolean) => (
    <div
      key={key}
      className="group relative border-b border-mercury pb-1 flex items-baseline gap-4 transition-all duration-200 focus-within:border-black focus-within:border-b-[1.5px]"
    >
      <input
        type="text"
        autoFocus={autofocus}
        className="w-full text-base text-burnham bg-transparent border-none p-0 focus:ring-0 placeholder-mercury font-normal"
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
              Level 4 of 11 — Do Less, Better
            </span>
            <h1 className="text-2xl md:text-3xl font-semibold text-burnham tracking-[-0.02em] mb-3">
              Do Less, Better
            </h1>
            <p className="text-shuttle italic font-serif text-sm">
              Now it's time to get real. Pick your top 3 goals and go deep on each one.
            </p>
          </div>

          <div className="space-y-14">
            {[1, 2, 3].map(i => (
              <div key={i}>
                <div className="flex items-center gap-3 mb-6">
                  <span className="w-6 h-6 rounded-full bg-gossip flex items-center justify-center text-burnham text-xs font-bold flex-shrink-0">
                    {i}
                  </span>
                  <span className="font-semibold text-burnham truncate">{goals[i - 1]}</span>
                </div>
                <div className="space-y-7 pl-9">

                  {/* Success metric(s) */}
                  <div>
                    <h3 className="text-[11px] text-shuttle uppercase tracking-wider font-medium mb-1">Success metric(s)</h3>
                    <p className="text-xs text-shuttle italic mb-3">How will you measure progress and success?</p>
                    <div className="space-y-4">
                      {renderField(`l4_g${i}_m1`, 'Success looks like...', i === 1)}
                      {renderField(`l4_g${i}_m2`, 'Success looks like...')}
                      {renderField(`l4_g${i}_m3`, 'Success looks like...')}
                    </div>
                  </div>

                  {/* Next 30 days */}
                  <div>
                    <h3 className="text-[11px] text-shuttle uppercase tracking-wider font-medium mb-1">Next 30 days</h3>
                    <p className="text-xs text-shuttle italic mb-3">What are 1–3 action steps you will take?</p>
                    <div className="space-y-4">
                      {renderField(`l4_g${i}_a1`, 'I will...')}
                      {renderField(`l4_g${i}_a2`, 'I will...')}
                      {renderField(`l4_g${i}_a3`, 'I will...')}
                    </div>
                  </div>

                  {/* Key support */}
                  <div>
                    <h3 className="text-[11px] text-shuttle uppercase tracking-wider font-medium mb-1">Key support</h3>
                    <p className="text-xs text-shuttle italic mb-3">Who or what do you need to succeed?</p>
                    <div className="space-y-4">
                      {renderField(`l4_g${i}_s1`, 'The support I need is...')}
                      {renderField(`l4_g${i}_s2`, 'The support I need is...')}
                      {renderField(`l4_g${i}_s3`, 'The support I need is...')}
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
