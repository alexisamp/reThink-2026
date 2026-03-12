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

export default function L1({ onNext, onBack, saving, isLastStep, progress, step, totalSteps, initialValues }: StepProps) {
  const [values, setValues] = useState<Record<string, string>>(initialValues ?? {})
  return (
    <StepLayout
      step={step} totalSteps={totalSteps} progress={progress}
      tagline="Level 1 of 11 — The Key to Success"
      title="The Key to Success"
      subtitle="Take a moment to write down your most ambitious goals."
      prompt="What I really want is ..."
      fields={[
        { key: 'l1_1', placeholder: 'I want to...' },
        { key: 'l1_2', placeholder: 'I want to...' },
        { key: 'l1_3', placeholder: 'I want to...' },
        { key: 'l1_4', placeholder: 'I want to...' },
        { key: 'l1_5', placeholder: 'I want to...' },
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
