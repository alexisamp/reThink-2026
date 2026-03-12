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

export default function L8({ onNext, onBack, saving, isLastStep, progress, step, totalSteps, initialValues }: StepProps) {
  const [values, setValues] = useState<Record<string, string>>(initialValues ?? {})
  return (
    <StepLayout
      step={step} totalSteps={totalSteps} progress={progress}
      tagline="Level 8 of 11 — The Inner Circle"
      title="The Inner Circle"
      subtitle="Research consistently shows little correlation between happiness and money accumulation, but strong correlation between happiness and relationship quality."
      prompt="List the five people who have the most presence in your daily life:"
      fields={[
        { key: 'l8_1', placeholder: 'Name + relationship (e.g. Alex — mentor)' },
        { key: 'l8_2', placeholder: 'Name + relationship' },
        { key: 'l8_3', placeholder: 'Name + relationship' },
        { key: 'l8_4', placeholder: 'Name + relationship' },
        { key: 'l8_5', placeholder: 'Name + relationship' },
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
