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
      subtitle="You are the average of the five people you spend the most time with. Choose them wisely."
      prompt="The 5 people who most influence my thinking are..."
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
