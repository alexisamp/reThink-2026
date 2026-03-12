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
      if (!wb) return
      setWorkbookId(wb.id)
      // Load existing entries to restore answers on Back navigation
      const { data: entries } = await supabase
        .from('workbook_entries')
        .select('section_key, answer')
        .eq('workbook_id', wb.id)
      if (entries && entries.length > 0) {
        const restored: Record<string, string> = {}
        entries.forEach(e => { restored[e.section_key] = e.answer ?? '' })
        setAnswers(restored)
      }
    }
    init()
  }, [])

  const getOrCreateWorkbookId = async (userId: string): Promise<string | null> => {
    if (workbookId) return workbookId
    const year = new Date().getFullYear()
    let { data: wb } = await supabase
      .from('workbooks')
      .select('id')
      .eq('user_id', userId)
      .eq('year', year)
      .maybeSingle()
    if (!wb) {
      const { data: newWb } = await supabase
        .from('workbooks')
        .insert({ user_id: userId, year })
        .select('id')
        .single()
      wb = newWb
    }
    if (wb) setWorkbookId(wb.id)
    return wb?.id ?? null
  }

  const saveEntry = async (wbId: string, userId: string, level: number, field: string, value: string) => {
    const { error } = await supabase.from('workbook_entries').upsert({
      workbook_id: wbId,
      user_id: userId,
      list_order: level,
      section_key: field,
      answer: value,
    }, { onConflict: 'workbook_id,list_order,section_key' })
    if (error) console.error('[Assessment] saveEntry error:', error)
  }

  const handleNext = async (levelAnswers: Record<string, string>) => {
    setSaving(true)
    try {
      const updated = { ...answers, ...levelAnswers }
      setAnswers(updated)

      // Ensure workbook exists before saving (guards against race condition on first step)
      const { data: { user } } = await supabase.auth.getUser()
      const wbId = user ? await getOrCreateWorkbookId(user.id) : null

      // Save each answer to Supabase
      if (wbId && user) {
        await Promise.all(
          Object.entries(levelAnswers).map(([field, value]) =>
            saveEntry(wbId, user.id, step, field, value)
          )
        )
      }

      if (step === TOTAL_STEPS) {
        await finalize(updated)
      } else {
        setStep(s => s + 1)
      }
    } catch (err) {
      console.error('[Assessment] handleNext error:', err)
    } finally {
      setSaving(false)
    }
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

    const year = new Date().getFullYear()
    const goalInserts = [
      ...activeGoalTitles.map((text, i) => ({
        workbook_id: workbookId,
        user_id: user.id,
        text,
        year,
        goal_type: 'ACTIVE' as const,
        status: 'NOT_STARTED' as const,
        position: i,
        needs_config: true,
      })),
      ...allWants
        .filter(t => !activeGoalTitles.includes(t))
        .map((text, i) => ({
          workbook_id: workbookId,
          user_id: user.id,
          text,
          year,
          goal_type: 'BACKLOG' as const,
          status: 'NOT_STARTED' as const,
          position: i + 10,
          needs_config: true,
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
    initialValues: answers,
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
