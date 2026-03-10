import { supabase } from './supabase'

export interface CoachInsight {
  content: string
}

export async function getCoachInsight(prompt: string): Promise<CoachInsight> {
  const { data, error } = await supabase.functions.invoke('ai-coach', {
    body: { prompt },
  })
  if (error) throw error
  return data as CoachInsight
}

export function buildCoachPrompt(opts: {
  goals: { text: string; status: string; metric: string | null }[]
  habitAdherence: { habitName: string; adherence: number }[]  // 0-1
  energyAvg: number
  milestonesCompleted: number
  milestonesTotal: number
  frictionReasons: string[]
}): string {
  const goalLines = opts.goals.map(g =>
    `- "${g.text}" (Status: ${g.status}${g.metric ? `, Metric: ${g.metric}` : ''})`
  ).join('\n')

  const habitLines = opts.habitAdherence.map(h =>
    `- ${h.habitName}: ${Math.round(h.adherence * 100)}% adherence last 30 days`
  ).join('\n')

  const frictionStr = opts.frictionReasons.length > 0
    ? opts.frictionReasons.join(', ')
    : 'None logged'

  return `You are a performance coach reviewing a user's last 30 days of goal execution data.

GOALS:
${goalLines}

HABIT SYSTEM (last 30 days):
${habitLines}

MILESTONES: ${opts.milestonesCompleted} of ${opts.milestonesTotal} completed

ENERGY AVERAGE: ${opts.energyAvg.toFixed(1)}/10

FRICTION REASONS NOTED: ${frictionStr}

Provide a focused coaching insight in 3-4 sentences. Be direct and specific. Identify the biggest leverage point for improvement. Do not use bullet points. Do not be generic.`
}
