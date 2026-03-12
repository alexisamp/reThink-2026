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

export default function L3({ onNext, onBack, saving, isLastStep, progress, step, totalSteps, initialValues }: StepProps) {
  const [values, setValues] = useState<Record<string, string>>(initialValues ?? {})
  return (
    <StepLayout
      step={step} totalSteps={totalSteps} progress={progress}
      tagline="Level 3 of 11 — Map Your Horizon"
      title="Map Your Horizon"
      subtitle="Dream big. Constraint comes later — for now, list everything you want to achieve this year."
      prompt="My top 10 goals for 2026 are..."
      fields={Array.from({ length: 10 }, (_, i) => ({
        key: `l3_${i + 1}`,
        placeholder: 'I want to...',
      }))}
      values={values}
      onChange={(k, v) => setValues(p => ({ ...p, [k]: v }))}
      onNext={() => onNext(values)}
      onBack={onBack}
      saving={saving}
      isLastStep={isLastStep}
    />
  )
}
