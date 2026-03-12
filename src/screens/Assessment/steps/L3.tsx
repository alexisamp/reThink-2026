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

export default function L3({ onNext, onBack, saving, progress, step, totalSteps, initialValues }: StepProps) {
  const [values, setValues] = useState<Record<string, string>>(initialValues ?? {})
  return (
    <StepLayout
      step={step} totalSteps={totalSteps} progress={progress}
      tagline="Rethink Workbook"
      title="The Audience"
      subtitle="Know who you serve, and you'll know what to build."
      prompt="Who I serve and create for..."
      fields={[
        { key: 'l3_1', placeholder: 'e.g. Founders who have outgrown hustle culture' },
        { key: 'l3_2', placeholder: 'e.g. Senior operators who want clarity' },
      ]}
      values={values}
      onChange={(k, v) => setValues(p => ({ ...p, [k]: v }))}
      onNext={() => onNext(values)}
      onBack={onBack}
      saving={saving}
    />
  )
}
