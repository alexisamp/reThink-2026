export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface Workbook {
  id: string
  user_id: string
  year: number
  created_at: string
  updated_at: string
}

export interface WorkbookEntry {
  id: string
  workbook_id: string
  user_id: string
  list_order: number | null
  section_key: string
  answer: string | null
  created_at: string
}

export type GoalType = 'ACTIVE' | 'BACKLOG' | 'ARCHIVE'
export type GoalStatus = 'NOT_STARTED' | 'ON_TRACK' | 'AT_RISK' | 'BLOCKED' | 'COMPLETE'

export interface Goal {
  id: string
  workbook_id: string
  user_id: string
  text: string
  metric: string | null
  motivation: string | null
  goal_type: GoalType
  status: GoalStatus
  position: number
  year: number
  next_30_days: string | null
  key_support: string | null
  notes: string | null
  needs_config: boolean
  created_at: string
  updated_at: string
}

export interface Milestone {
  id: string
  goal_id: string
  user_id: string
  text: string
  target_date: string | null
  status: string
  completed_at: string | null
  created_at: string
}

export interface LeadingIndicator {
  id: string
  goal_id: string
  user_id: string
  name: string
  unit: string | null
  target: number | null
  frequency: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Habit {
  id: string
  goal_id: string | null
  user_id: string
  text: string
  type: string | null
  frequency: string
  default_time: string | null
  reward: string | null
  target_value: number | null
  unit: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface HabitLog {
  id: string
  habit_id: string
  user_id: string
  log_date: string
  value: number
  created_at: string
}

export type TodoBlock = 'AM' | 'PM' | null

export interface Todo {
  id: string
  goal_id: string | null
  milestone_id: string | null
  user_id: string
  text: string
  effort: string | null
  block: TodoBlock
  completed: boolean
  completed_at: string | null
  date: string | null
  created_at: string
}

export interface Review {
  id: string
  user_id: string
  review_date: string
  energy_level: number | null
  notes: string | null
  one_thing: string | null
  tomorrow_focus: string | null
  inbox_zero: boolean
  time_logs_updated: boolean
  tomorrow_reviewed: boolean
  created_at: string
  updated_at: string
}

export interface Strategy {
  id: string
  user_id: string
  goal_id: string | null
  type: string | null
  title: string
  tactic: string | null
  created_at: string
  updated_at: string
}

export interface MonthlyPlan {
  id: string
  user_id: string
  goal_id: string | null
  year: number
  month: number
  focus: string | null
  reflection: string | null
  highlights: string | null
  rating: number | null
  created_at: string
  updated_at: string
}

export interface MonthlyKpiEntry {
  id: string
  user_id: string
  leading_indicator_id: string
  year: number
  month: number
  actual_value: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type NavRoute = '/today' | '/monthly' | '/strategy' | '/dashboard'
