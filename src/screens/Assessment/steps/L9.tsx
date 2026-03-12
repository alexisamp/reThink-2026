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

export default function L9({ onNext, onBack, saving, progress, step, totalSteps, initialValues }: StepProps) {
  const [values, setValues] = useState<Record<string, string>>(initialValues ?? {})
  return (
    <StepLayout
      step={step} totalSteps={totalSteps} progress={progress}
      tagline="Rethink Workbook"
      title="Key Resources"
      subtitle="What gives you an unfair advantage?"
      prompt="My key resources and assets are..."
      fields={[
        { key: 'l9_1', placeholder: 'e.g. Proprietary data model' },
        { key: 'l9_2', placeholder: 'e.g. Exclusive partnerships' },
        { key: 'l9_3', placeholder: 'e.g. Network of 500+ decision-makers' },
      ]}
      values={values}
      onChange={(k, v) => setValues(p => ({ ...p, [k]: v }))}
      onNext={() => onNext(values)}
      onBack={onBack}
      saving={saving}
    />
  )
}
