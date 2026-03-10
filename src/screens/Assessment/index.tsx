import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import L1 from './steps/L1'
import L2 from './steps/L2'
import L3 from './steps/L3'
import L4 from './steps/L4'
import L5 from './steps/L5'
import L6 from './steps/L6'
import L7 from './steps/L7'
import L8 from './steps/L8'
import L9 from './steps/L9'
import L10 from './steps/L10'

const TOTAL_STEPS = 10

interface AssessmentProps {
  onComplete: () => void
}

export default function Assessment({ onComplete }: AssessmentProps) {
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [workbookId, setWorkbookId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const navigate = useNavigate()

  useEffect(() => {
    // Create or get workbook
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const year = new Date().getFullYear()
      let { data: wb } = await supabase
        .from('workbooks')
        .select('id')
        .eq('user_id', user.id)
        .eq('year', year)
        .maybeSingle()
      if (!wb) {
        const { data: newWb } = await supabase
          .from('workbooks')
          .insert({ user_id: user.id, year })
          .select('id')
          .single()
        wb = newWb
      }
      if (wb) setWorkbookId(wb.id)
    }
    init()
  }, [])

  const saveEntry = async (level: number, field: string, value: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !workbookId) return
    await supabase.from('workbook_entries').upsert({
      workbook_id: workbookId,
      user_id: user.id,
      list_order: level,
      section_key: field,
      answer: value,
    }, { onConflict: 'workbook_id,list_order,section_key' })
  }

  const handleNext = async (levelAnswers: Record<string, string>) => {
    setSaving(true)
    const updated = { ...answers, ...levelAnswers }
    setAnswers(updated)

    // Save each answer to Supabase
    await Promise.all(
      Object.entries(levelAnswers).map(([field, value]) =>
        saveEntry(step, field, value)
      )
    )

    if (step === TOTAL_STEPS) {
      // Create goals from L8 answers (the 1-Year Plan)
      await finalize(updated)
    } else {
      setStep(s => s + 1)
    }
    setSaving(false)
  }

  const finalize = async (allAnswers: Record<string, string>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !workbookId) return

    // Create active goals from L8 (up to 3 items)
    const activeGoalTitles = [
      allAnswers['l8_1'],
      allAnswers['l8_2'],
      allAnswers['l8_3'],
    ].filter(Boolean)

    // Backlog goals from L1 (what they really want) - anything beyond first 3 active ones
    const allWants = [
      allAnswers['l1_1'],
      allAnswers['l1_2'],
      allAnswers['l1_3'],
    ].filter(Boolean)

    const goalInserts = [
      ...activeGoalTitles.map((text, i) => ({
        workbook_id: workbookId,
        user_id: user.id,
        text,
        goal_type: 'ACTIVE' as const,
        status: 'NOT_STARTED' as const,
        position: i,
      })),
      ...allWants
        .filter(t => !activeGoalTitles.includes(t))
        .map((text, i) => ({
          workbook_id: workbookId,
          user_id: user.id,
          text,
          goal_type: 'BACKLOG' as const,
          status: 'NOT_STARTED' as const,
          position: i + 10,
        })),
    ]

    if (goalInserts.length > 0) {
      await supabase.from('goals').insert(goalInserts)
    }

    onComplete()
    navigate('/strategy')
  }

  const progress = ((step - 1) / TOTAL_STEPS) * 100

  const stepProps = {
    onNext: handleNext,
    onBack: step > 1 ? () => setStep(s => s - 1) : undefined,
    saving,
    progress,
    step,
    totalSteps: TOTAL_STEPS,
  }

  const steps: Record<number, React.ReactElement> = {
    1: <L1 {...stepProps} />,
    2: <L2 {...stepProps} />,
    3: <L3 {...stepProps} />,
    4: <L4 {...stepProps} />,
    5: <L5 {...stepProps} />,
    6: <L6 {...stepProps} />,
    7: <L7 {...stepProps} />,
    8: <L8 {...stepProps} />,
    9: <L9 {...stepProps} />,
    10: <L10 {...stepProps} />,
  }

  return steps[step] ?? null
}
