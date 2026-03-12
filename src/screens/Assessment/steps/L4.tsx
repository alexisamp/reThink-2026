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

export default function L4({ onNext, onBack, saving, progress, step, totalSteps, initialValues }: StepProps) {
  const [values, setValues] = useState<Record<string, string>>(initialValues ?? {})
  return (
    <StepLayout
      step={step} totalSteps={totalSteps} progress={progress}
      tagline="Rethink Workbook"
      title="The Critical Three"
      subtitle="The three things that must go right for everything else to follow."
      prompt="My 3 most critical success factors are..."
      fields={[
        { key: 'l4_1', placeholder: 'e.g. System Stability (99.9% Uptime)' },
        { key: 'l4_2', placeholder: 'e.g. User Retention (>45% D30)' },
        { key: 'l4_3', placeholder: 'e.g. Viral Loops (k > 1.1)' },
      ]}
      values={values}
      onChange={(k, v) => setValues(p => ({ ...p, [k]: v }))}
      onNext={() => onNext(values)}
      onBack={onBack}
      saving={saving}
    />
  )
}
