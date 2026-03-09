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

export default function L2({ onNext, onBack, saving, progress, step, totalSteps }: StepProps) {
  const [values, setValues] = useState<Record<string, string>>({})
  return (
    <StepLayout
      step={step} totalSteps={totalSteps} progress={progress}
      tagline="Rethink Workbook"
      title="Core Values"
      subtitle="The principles that define how you operate at your best."
      prompt="The values that guide me are..."
      fields={[
        { key: 'l2_1', placeholder: 'e.g. Radical Transparency' },
        { key: 'l2_2', placeholder: 'e.g. Essentialism in Action' },
        { key: 'l2_3', placeholder: 'e.g. Speed through Clarity' },
      ]}
      values={values}
      onChange={(k, v) => setValues(p => ({ ...p, [k]: v }))}
      onNext={() => onNext(values)}
      onBack={onBack}
      saving={saving}
    />
  )
}
