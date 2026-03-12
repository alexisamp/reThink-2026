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

export default function L10({ onNext, onBack, saving, isLastStep, progress, step, totalSteps, initialValues }: StepProps) {
  const [values, setValues] = useState<Record<string, string>>(initialValues ?? {})
  return (
    <StepLayout
      step={step} totalSteps={totalSteps} progress={progress}
      tagline="Level 10 of 11 — Set the Rules"
      title="Set the Rules"
      subtitle="Automatic rules turn desired behaviors into default behaviors."
      sections={[
        {
          prompt: 'Rules that propel — Automate progress toward your goals',
          fields: [
            { key: 'l10_propel_1', placeholder: 'e.g. I always protect my best hours for deep work' },
            { key: 'l10_propel_2', placeholder: 'e.g. I always complete what I start' },
            { key: 'l10_propel_3', placeholder: 'e.g. I always ask: is this the best use of my time?' },
          ],
        },
        {
          prompt: 'Rules that protect — Guard your priorities and energy',
          fields: [
            { key: 'l10_protect_1', placeholder: 'e.g. I never say yes when I mean no' },
            { key: 'l10_protect_2', placeholder: 'e.g. I never skip my morning routine' },
            { key: 'l10_protect_3', placeholder: 'e.g. I never let email drive my day' },
          ],
        },
        {
          prompt: 'Rules that limit — Identify rules ready for retirement',
          fields: [
            { key: 'l10_limit_1', placeholder: 'e.g. Saying yes to everything that sounds interesting' },
            { key: 'l10_limit_2', placeholder: 'e.g. Perfectionism on things that only need 80%' },
            { key: 'l10_limit_3', placeholder: 'e.g. Checking my phone first thing in the morning' },
          ],
        },
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
