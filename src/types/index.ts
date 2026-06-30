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

export type TierCadenceConfig = Record<'1' | '2' | '3', { days: number; label?: string }>

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  contact_funnel_config: ContactFunnelConfig | null   // DEPRECATED: replaced by lists
  tier_cadence_config: TierCadenceConfig
  feature_flags: Record<string, boolean>
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
  emoji: string | null    // optional per-milestone emoji (falls back to parent goal)
  color: string | null    // optional per-milestone color hex (falls back to parent goal)
  focused: boolean        // user-curated: show in Today's right rail
  position: number | null // manual ordering in the Manage view
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

export type TodoMentionKind = 'person' | 'company' | 'opportunity'

export type TodoContentSegment =
  | { type: 'text'; text: string }
  | {
      type: 'mention'
      kind: TodoMentionKind
      id: string
      label: string
      imageUrl?: string | null
      companyId?: string | null
    }
  | {
      type: 'file'
      id: string
      label: string
      source: 'local' | 'url' | 'google_drive'
      mimeType?: string | null
      path?: string | null
      url?: string | null
      googleFileId?: string | null
      openMode: 'browser' | 'sheets' | 'system'
    }

export interface Todo {
  id: string
  goal_id: string | null
  milestone_id: string | null
  contact_id: string | null
  company_id: string | null
  opportunity_id: string | null
  user_id: string
  text: string
  content_segments?: TodoContentSegment[] | null
  effort: string | null
  block: TodoBlock
  completed: boolean
  waiting?: boolean
  completed_at: string | null
  date: string | null
  backlog_at?: string | null
  return_date?: string | null
  scheduled_start_minutes?: number | null
  scheduled_duration_minutes?: number | null
  sort_order: number
  url: string | null
  outreach_log_id: string | null
  attio_task_id: string | null
  is_featured: boolean
  created_at: string
}

export interface Review {
  id: string
  user_id: string
  date: string
  energy_level: number | null
  notes: string | null
  one_thing: string | null
  one_thing_done?: boolean | null
  tomorrow_focus: string | null
  weekly_one_thing: string | null
  ai_coach_notes: string | null
  inbox_zero: boolean
  time_logs_updated: boolean
  tomorrow_reviewed: boolean
  day_locked_at: string | null
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

export type NavRoute = '/today' | '/review' | '/plan' | '/playbook' | '/people' | '/lists'

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
  angellist_url?: string | null
  facebook_url?: string | null
  instagram_url?: string | null
  twitter_url?: string | null
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
  birthday?: string | null          // MM-DD or ISO date (v2 uses ISO date column)
  links?: Array<{url: string; label: string; type?: string; created_at?: string}> | null
  // v2 new fields
  company_id?: string | null
  interests?: string | null
  looking_for?: string | null
  tier?: 1 | 2 | 3 | null
  referred_by?: string | null
  advisory_role?: string | null
  // v3 — relationship architecture (Jacob framework)
  relationship_domain: RelationshipDomain
  personal_tier?: PersonalTier | null
  custom_cadence_days?: number | null
  connection_strength: number
  connection_strength_computed_at?: string | null
  created_at: string
  updated_at: string
}

// ─── v3: Relationship Architecture ────────────────────────────────────────────

export type RelationshipDomain = 'professional' | 'personal' | 'mixed'
export type PersonalTier = 'inner_circle' | 'close' | 'casual'

export type ConnectionStrengthBucket =
  | 'very_weak' | 'weak' | 'moderate' | 'strong' | 'very_strong'

export interface ListStage {
  key: string
  label: string
  description?: string
  color?: string
}

export type ListRecordKind = 'person' | 'company' | 'opportunity'

export type ListAttributeType = 'text' | 'number' | 'date' | 'select' | 'status' | 'url' | 'checkbox'

export interface ListAttributeOption {
  id: string
  label: string
  color?: string | null
  track_time?: boolean
  confetti?: boolean
}

export interface ListAttribute {
  id: string
  list_id: string
  user_id: string
  name: string
  type: ListAttributeType
  config: {
    options?: ListAttributeOption[]
    [key: string]: unknown
  }
  order_index: number
  created_at: string
  updated_at: string
}

export type ListViewType = 'table' | 'kanban'

export interface ListView {
  id: string
  list_id: string
  user_id: string
  name: string
  type: ListViewType
  config: {
    columns?: string[]
    sort?: unknown
    filters?: unknown[]
    kanbanStatusAttributeId?: string
    favorite?: boolean
    [key: string]: unknown
  }
  order_index: number
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface List {
  id: string
  user_id: string
  name: string
  parent_object: ListRecordKind
  purpose: string | null
  stages: ListStage[]
  color: string | null
  icon: string | null
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface ListMembership {
  id: string
  list_id: string
  contact_id: string | null
  company_id?: string | null
  opportunity_id?: string | null
  user_id: string
  current_stage: string | null
  entered_at: string
  stage_changed_at: string
  notes: string | null
  attributes?: Record<string, unknown> | null
  created_at: string
}

export type ContactFactCategory =
  | 'family' | 'career_intel' | 'compensation' | 'obsession'
  | 'hot_button' | 'life_phase' | 'pet_peeve' | 'origin_story'
  | 'health' | 'preference' | 'other'

export type ContactFactSource = 'manual' | 'ai_extract' | 'chat_capture' | 'import'

export interface ContactFact {
  id: string
  contact_id: string
  user_id: string
  category: ContactFactCategory
  label: string | null
  value: string
  importance: 1 | 2 | 3
  expires_at: string | null    // ISO date
  source: ContactFactSource
  created_at: string
  updated_at: string
}

export interface ContactCadence {
  contact_id: string
  user_id: string
  tier: 1 | 2 | 3 | null
  relationship_domain: RelationshipDomain
  custom_cadence_days: number | null
  effective_cadence_days: number | null
  last_interaction_at: string | null
  days_since_last_interaction: number | null
}

export interface ContactMilestone {
  id: string
  user_id: string
  contact_id: string
  type: 'birthday_contact' | 'birthday_child' | 'birthday_partner' | 'anniversary' | 'anniversary_work' | 'custom'
  label: string
  date_mm_dd?: string | null   // "MM-DD"
  date_full?: string | null    // ISO date
  show_days_before: number
  notes?: string | null
  recurrence?: string | null   // 'annual' | 'semi_annual' | 'biweekly' | 'one_time'
  created_at: string
}

export interface Interaction {
  id: string
  user_id: string
  contact_id: string
  type: 'whatsapp' | 'linkedin_msg' | 'email' | 'call' | 'virtual_coffee' | 'in_person'
  direction: 'outbound' | 'inbound'
  notes: string | null
  interaction_date: string
  external_id?: string | null
  // v2 new fields
  opportunity_id?: string | null
  value_log_id?: string | null
  next_step?: string | null
  next_step_date?: string | null
  next_step_owner?: 'me' | 'them' | null
  channel?: 'whatsapp' | 'linkedin' | 'exit5' | 'x' | 'email' | 'call' | 'in_person' | 'other' | null
  created_at: string
}

export interface InteractionExcerpt {
  timestamp?: string
  speaker?: string
  direction?: 'inbound' | 'outbound'
  text: string
}

export interface InteractionDetail {
  id: string
  user_id: string
  interaction_id: string
  channel: 'whatsapp' | 'linkedin' | 'email'
  source_external_id: string
  window_start: string | null
  window_end: string | null
  message_count: number
  participants: Array<{ name?: string; role?: string; channel_identifier?: string }>
  summary: string | null
  excerpts: InteractionExcerpt[]
  created_at: string
  updated_at: string
}

export type InteractionSuggestionTarget =
  | 'todo'
  | 'contact_fact'
  | 'key_date'
  | 'value_log'
  | 'intro'
  | 'next_step'

export interface InteractionSuggestion {
  id: string
  user_id: string
  interaction_id: string | null
  contact_id: string | null
  source_external_id: string
  target: InteractionSuggestionTarget
  title: string
  body: string | null
  payload: Record<string, unknown>
  confidence: 'low' | 'medium' | 'high'
  status: 'pending' | 'approved' | 'dismissed'
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface ContactKeyDate {
  id: string
  user_id: string
  contact_id: string
  event_type: string
  subject: string
  relation: string | null
  date_value: string | null
  date_precision: 'exact' | 'month_day' | 'month' | 'year' | 'unknown'
  description: string | null
  source: string
  source_interaction_date: string | null
  source_external_id: string | null
  created_at: string
  updated_at: string
}

// ─── Review Queue ────────────────────────────────────────────────────────────

export type ReviewSource = 'notion' | 'conversations' | 'manual'
export type ReviewStatus = 'pending' | 'accepted' | 'dismissed'
export type ReviewTarget =
  | 'contact_fact'
  | 'interaction'
  | 'next_step'
  | 'todo'
  | 'value_log'
  | 'playbook_entry'

export interface ReviewItem {
  id: string
  user_id: string
  source: ReviewSource
  source_external_id: string | null
  source_url: string | null
  title: string
  body: string | null
  proposed_target: ReviewTarget
  proposed_payload: Record<string, unknown>
  contact_id: string | null
  status: ReviewStatus
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

// Backward compat alias — remove after all callers migrated to Contact
export type OutreachLog = Contact
export type OutreachStatus = ContactStatus
export type OutreachType = ContactCategory

// ─── v2 New Types ─────────────────────────────────────────────────────────────

export interface Company {
  id: string
  user_id: string
  name: string
  domain: string | null
  sector: string | null
  size: string | null              // bucket text ("11-50 employees")
  notes: string | null
  key_insight: string | null
  logo_url: string | null
  created_at: string
  // LI-enriched fields (populated by the Conversations company deep-scrape)
  headline: string | null
  description: string | null
  website_url: string | null
  linkedin_url: string | null
  primary_location?: string | null
  angellist_url?: string | null
  facebook_url?: string | null
  instagram_url?: string | null
  twitter_url?: string | null
  employees_count: number | null   // canonical — real if associated members captured, else bucket ceiling
  members_on_linkedin: number | null  // raw "N associated members" from LI
  followers_count: number | null   // external followers of the company page
  founded_year: number | null
  hq_location: string | null
  last_enriched_at: string | null
  icp?: string | null
  account_stage?: string | null
  source?: string | null
  motion?: string | null
  next_step?: string | null
}

export type OpportunityType = 'job' | 'consulting' | 'business' | 'partnership' | 'other'
export type OpportunityStage =
  | 'exploring'
  | 'applied'
  | 'abm_strategy'
  | 'interviews'
  | 'negotiating'
  | 'won'
  | 'closed'
  | 'active'
  | 'lost'

export interface Opportunity {
  id: string
  user_id: string
  company_id: string | null
  title: string
  type: OpportunityType
  stage: OpportunityStage
  estimated_value: number | null
  target_date: string | null
  close_date: string | null
  owner_contact_id: string | null
  application_source_url?: string | null
  application_source_domain?: string | null
  application_source_name?: string | null
  notes: string | null
  decision_filter_pass: boolean | null
  interview_prep: Record<string, unknown> | null
  interview_map: Record<string, unknown> | null
  negotiation_prep: Record<string, unknown> | null
  created_at: string
  // Joined fields
  company?: Company | null
}

export interface ContactChannel {
  id: string
  outreach_log_id: string
  channel: 'whatsapp' | 'wa' | 'linkedin' | 'exit5' | 'x' | 'email'
  channel_identifier: string
  channel_name: string | null
  verified: boolean
  created_at: string
}

export interface OpportunityContact {
  opportunity_id: string
  outreach_log_id: string
  role: 'champion' | 'contact' | 'decision_maker' | 'blocker' | null
}

export interface ContactIntroduction {
  id: string
  user_id: string
  source_contact_id: string
  connector_contact_id: string | null
  introduced_contact_id: string | null
  introduced_to_contact_id: string | null
  connector_name: string | null
  introduced_person_name: string | null
  introduced_person_company: string | null
  introduced_to_name: string | null
  introduced_to_company: string | null
  relationship_context: string | null
  status: 'requested' | 'offered' | 'made' | 'received'
  direction: 'given' | 'received'
  confidence: 'low' | 'medium' | 'high'
  source_channel: string
  source_interaction_date: string
  source_external_id: string
  source_value_log_id: string | null
  created_at: string
  updated_at: string
}

export type ValueLogType =
  | 'introduction' | 'content' | 'referral' | 'advice'
  | 'endorsement' | 'opportunity' | 'candor' | 'other'

export type ValueDirection = 'given' | 'received'

export interface ValueLog {
  id: string
  user_id: string
  outreach_log_id: string
  type: ValueLogType
  description: string | null
  date: string
  direction: ValueDirection
  created_at: string
}

export type PlaybookEntryType =
  | 'pitch' | 'story' | 'value_prop' | 'positioning' | 'skill'
  | 'objection' | 'value_bank' | 'template' | 'persona' | 'script' | 'boundary'

export type StoryFramework = 'car' | 'icarq' | 'disney' | 'clear'

export interface PlaybookEntry {
  id: string
  user_id: string
  type: PlaybookEntryType
  title: string
  content: string | null
  tags: string[]
  framework: StoryFramework | null
  list_order: number
  updated_at: string
  created_at: string
}

export interface EnglishSession {
  id: string
  user_id: string
  type: 'reading' | 'ai_conversation' | 'podcast' | 'real_conversation' | 'other'
  minutes: number
  source: 'manual' | 'jacob_app'
  date: string
  created_at: string
}

export interface WeeklyKpi {
  id: string
  user_id: string
  week_start: string
  conversations_count: number
  english_minutes: number
  created_at: string
}

export interface WeeklyHabit {
  id: string
  user_id: string
  name: string
  emoji: string | null
  type: 'count' | 'hours' | 'minutes'
  weekly_target: number
  unit: string | null
  integration_source: 'manual' | 'interactions' | 'english_sessions' | 'cowork' | 'networkhub_tier_touches' | 'networkhub_expansion'
  color: string | null
  position: number
  is_active: boolean
  created_at: string
}

export interface WeeklyHabitLog {
  id: string
  user_id: string
  habit_id: string
  log_date: string
  quantity: number
  note: string | null
  person_id: string | null
  created_at: string
}

export interface MilestoneTodo {
  id: string
  user_id: string
  milestone_id: string
  text: string
  completed: boolean
  position: number
  date: string | null
  created_at: string
}

export interface MilestoneContact {
  id: string
  milestone_id: string
  person_id: string
  user_id: string
  created_at: string
}
