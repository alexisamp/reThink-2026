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

export default function L2({ onNext, onBack, saving, isLastStep, progress, step, totalSteps, initialValues }: StepProps) {
  const [values, setValues] = useState<Record<string, string>>(initialValues ?? {})
  return (
    <StepLayout
      step={step} totalSteps={totalSteps} progress={progress}
      tagline="Level 2 of 11 — An Honest Audit"
      title="An Honest Audit"
      subtitle="Success is simple but not easy: do more of what works and less of what doesn't."
      sections={[
        {
          prompt: 'Time — If they looked at your calendar, where are you spending your time?',
          fields: [
            { key: 'l2_time_1', placeholder: 'I am spending my time on...' },
            { key: 'l2_time_2', placeholder: 'I am spending my time on...' },
            { key: 'l2_time_3', placeholder: 'I am spending my time on...' },
          ],
        },
        {
          prompt: "What's not working for you that needs to be eliminated?",
          fields: [
            { key: 'l2_elim_1', placeholder: 'I should stop...' },
            { key: 'l2_elim_2', placeholder: 'I should stop...' },
            { key: 'l2_elim_3', placeholder: 'I should stop...' },
            { key: 'l2_elim_4', placeholder: 'I should stop...' },
          ],
        },
        {
          prompt: 'What is working and needs more energy and focus?',
          fields: [
            { key: 'l2_keep_1', placeholder: 'I should do more of...' },
            { key: 'l2_keep_2', placeholder: 'I should do more of...' },
            { key: 'l2_keep_3', placeholder: 'I should do more of...' },
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
