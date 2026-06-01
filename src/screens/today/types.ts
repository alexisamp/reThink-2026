// Shared types for the Today surface (design-faithful rebuild).

export type GroupBy = 'priority' | 'milestone'

export type RailSectionId = 'milestones' | 'thisweek' | 'nextsteps' | 'journal'

export interface Mention {
  id?: string
  name: string
  kind: 'person' | 'company' | 'opportunity'
  sub?: string | null
  imageUrl?: string | null
  companyId?: string | null
}
