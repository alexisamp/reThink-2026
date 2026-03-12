import { useState } from 'react'
import StepLayout from './StepLayout'

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

export default function L11({ onNext, onBack, saving, isLastStep, progress, step, totalSteps, initialValues }: StepProps) {
  const [values, setValues] = useState<Record<string, string>>(initialValues ?? {})
  return (
    <StepLayout
      step={step} totalSteps={totalSteps} progress={progress}
      tagline="Level 11 of 11 — Commit to Your Path"
      title="Commit to Your Path"
      subtitle="Clear thinking leads to better decisions. Better decisions compound into extraordinary results."
      sections={[
        {
          prompt: 'What three insights from this review will most transform your next year?',
          fields: [
            { key: 'l11_insight_1', placeholder: 'Insight 1...' },
            { key: 'l11_insight_2', placeholder: 'Insight 2...' },
            { key: 'l11_insight_3', placeholder: 'Insight 3...' },
          ],
        },
        {
          prompt: 'What one change will you implement immediately?',
          fields: [
            { key: 'l11_change', placeholder: 'The one thing I am changing is...' },
          ],
        },
        {
          prompt: 'When will you revisit these exercises to check your progress?',
          fields: [
            { key: 'l11_revisit', placeholder: 'I will revisit this on... (e.g. June 1st)' },
          ],
        },
        {
          prompt: 'Place, date, and signature',
          fields: [
            { key: 'l11_commitment', placeholder: 'I commit to pursuing my chosen priorities with focused attention...' },
          ],
        },
      ]}
      values={values}
      onChange={(k, v) => setValues(p => ({ ...p, [k]: v }))}
      onNext={() => onNext(values)}
      onBack={onBack}
      saving={saving}
      isLastStep={isLastStep}
    />
  )
}
