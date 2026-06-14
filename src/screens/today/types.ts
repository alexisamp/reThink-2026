// Shared types for the Today surface (design-faithful rebuild).

export type GroupBy = 'priority' | 'milestone'

export type RailSectionId = 'milestones' | 'thisweek' | 'agenda' | 'journal'

export interface Mention {
  id?: string
  name: string
  kind: 'person' | 'company' | 'opportunity'
  sub?: string | null
  imageUrl?: string | null
  companyId?: string | null
  searchText?: string | null
}

export interface TodoMilestoneOption {
  id: string
  name: string
  goalId: string
  goalLabel: string | null
  color: string
  due: string | null
  urgent: boolean
  done: number
  total: number
}
