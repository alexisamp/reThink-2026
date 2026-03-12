import { useState } from 'react'
import StepLayout from './StepLayout'

interface StepProps {
  onNext: (answers: Record<string, string>) => void
  onBack?: () => void
  saving?: boolean
  initialValues?: Record<string, string>
  progress: number
  step: number
  totalSteps: number
}

export default function L8({ onNext, onBack, saving, progress, step, totalSteps, initialValues }: StepProps) {
  const [values, setValues] = useState<Record<string, string>>(initialValues ?? {})
  return (
    <StepLayout
      step={step} totalSteps={totalSteps} progress={progress}
      tagline="Rethink Workbook — Critical"
      title="1-Year Plan"
      subtitle="These become your 3 active goals for 2026. Choose wisely."
      prompt="This year, my 3 active goals are..."
      fields={[
        { key: 'l8_1', placeholder: 'Goal 1 — your most important' },
        { key: 'l8_2', placeholder: 'Goal 2' },
        { key: 'l8_3', placeholder: 'Goal 3' },
      ]}
      values={values}
      onChange={(k, v) => setValues(p => ({ ...p, [k]: v }))}
      onNext={() => onNext(values)}
      onBack={onBack}
      saving={saving}
    />
  )
}
