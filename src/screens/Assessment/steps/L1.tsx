import { useState } from 'react'
import StepLayout from './StepLayout'

interface StepProps {
  onNext: (answers: Record<string, string>) => void
  onBack?: () => void
  saving?: boolean
  progress: number
  step: number
  totalSteps: number
}

export default function L1({ onNext, onBack, saving, progress, step, totalSteps }: StepProps) {
  const [values, setValues] = useState<Record<string, string>>({})
  return (
    <StepLayout
      step={step} totalSteps={totalSteps} progress={progress}
      tagline="Rethink Workbook"
      title="The Key to Success"
      subtitle="Every breakthrough starts from knowing what you want to achieve."
      prompt="What I really want is..."
      fields={[
        { key: 'l1_1', placeholder: 'I want to...' },
        { key: 'l1_2', placeholder: 'I want to...' },
        { key: 'l1_3', placeholder: 'I want to...' },
      ]}
      values={values}
      onChange={(k, v) => setValues(p => ({ ...p, [k]: v }))}
      onNext={() => onNext(values)}
      onBack={onBack}
      saving={saving}
    />
  )
}
