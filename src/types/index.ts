// ─── People / CRM ────────────────────────────────────────────────────────────

export type ContactStatus =
  | 'PROSPECT' | 'INTRO' | 'CONNECTED' | 'RECONNECT'
  | 'ENGAGED'  | 'NURTURING' | 'DORMANT'

export type ContactCategory =
  | 'business_dev' | 'partner' | 'client' | 'mentor'
  | 'job_us' | 'peer' | 'friend' | 'family'

export interface FunnelStageConfig {
  label: string
  description: string
  entry_criteria: string
  exit_criteria: string
}

export type ContactFunnelConfig = Record<ContactStatus, FunnelStageConfig>

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  contact_funnel_config: ContactFunnelConfig | null
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

export type GoalType = 'ACTIVE' | 'BACKLOG' | 'ARCHIVE' | 'NOT_DOING'
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
  alias: string | null   // short label ≤6 chars shown as pill on todos
  color: string | null   // hex color for the pill e.g. '#79D65E'
  emoji: string | null   // optional emoji icon
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
  habit_id: string | null  // if set, auto-fed from habit logs
  created_at: string
  updated_at: string
}

export interface IndicatorDailyLog {
  id: string
  user_id: string
  leading_indicator_id: string
  log_date: string
  value: number
  created_at: string
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
  calendar_event_id: string | null
  alias: string | null            // short label ≤20 chars shown in habit chip strip
  emoji: string | null            // optional emoji icon for habit chip
  habit_type: 'BINARY' | 'QUANTIFIED'  // default 'BINARY'
  daily_target: number | null     // target value per day (QUANTIFIED only)
  scheduled_days: number[] | null
  linked_indicator_id: string | null   // optional link to leading indicator
  tracks_outreach: 'networking' | 'prospecting' | null
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
  waiting?: boolean
  completed_at: string | null
  date: string | null
  sort_order: number
  url: string | null
  outreach_log_id: string | null
  attio_task_id: string | null
  created_at: string
}

export interface Review {
  id: string
  user_id: string
  date: string
  energy_level: number | null
  notes: string | null
  one_thing: string | null
  tomorrow_focus: string | null
  weekly_one_thing: string | null
  ai_coach_notes: string | null
  inbox_zero: boolean
  time_logs_updated: boolean
  tomorrow_reviewed: boolean
  created_at: string
  updated_at: string
}

export interface FrictionLog {
  id: string
  habit_id: string
  user_id: string
  log_date: string
  reason: string | null
  created_at: string
}

export interface FocusSession {
  id: string
  user_id: string
  goal_id: string | null
  habit_id: string | null
  todo_id: string | null
  started_at: string
  ended_at: string | null
  duration_minutes: number | null
  session_type: string
  intention: string | null
  completion_status: string | null
  created_at: string
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

export type NavRoute = '/today' | '/monthly' | '/strategy' | '/dashboard' | '/weekly-review' | '/library' | '/people'

export type CaptureType = 'idea' | 'learning' | 'reflection' | 'decision' | 'win' | 'question'

export interface Capture {
  id: string
  user_id: string
  type: CaptureType
  title: string
  body: string | null
  url: string | null
  linked_goal_id: string | null
  linked_milestone_id: string | null
  linked_todo_id: string | null
  captured_date: string
  created_at: string
  updated_at: string
}

export interface Contact {
  id: string
  user_id: string
  goal_id: string | null
  name: string
  linkedin_url: string | null
  category: ContactCategory | null
  status: ContactStatus
  personal_context: string | null
  skills: string | null
  notes: string | null
  job_title: string | null
  company: string | null
  location: string | null
  connections_count: number | null
  followers_count: number | null
  email: string | null
  phone: string | null
  website: string | null
  about: string | null
  health_score: number
  last_interaction_at: string | null
  log_date: string
  attio_record_id: string | null
  attio_synced_at: string | null
  company_domain?: string | null
  company_linkedin_url?: string | null
  attio_company_id?: string | null
  ai_enriched_at?: string | null
  profile_photo_url?: string | null
  created_at: string
  updated_at: string
}

export interface Interaction {
  id: string
  user_id: string
  contact_id: string
  type: 'whatsapp' | 'linkedin_msg' | 'email' | 'call' | 'virtual_coffee' | 'in_person'
  direction: 'outbound' | 'inbound'
  notes: string | null
  interaction_date: string
  created_at: string
}

// Backward compat alias — remove after all callers migrated to Contact
export type OutreachLog = Contact
export type OutreachStatus = ContactStatus
export type OutreachType = ContactCategory
