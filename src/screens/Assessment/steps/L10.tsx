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

export default function L10({ onNext, onBack, saving, progress, step, totalSteps, initialValues }: StepProps) {
  const [values, setValues] = useState<Record<string, string>>(initialValues ?? {})
  return (
    <StepLayout
      step={step} totalSteps={totalSteps} progress={progress}
      tagline="Rethink Workbook — Final"
      title="Risks"
      subtitle="What could derail your plans? Name it to defuse it."
      prompt="The risks I must mitigate are..."
      fields={[
        { key: 'l10_1', placeholder: 'e.g. Platform dependency' },
        { key: 'l10_2', placeholder: 'e.g. Key person risk' },
        { key: 'l10_3', placeholder: 'e.g. Market timing' },
      ]}
      values={values}
      onChange={(k, v) => setValues(p => ({ ...p, [k]: v }))}
      onNext={() => onNext(values)}
      onBack={onBack}
      saving={saving}
      isLastStep={true}
    />
  )
}
