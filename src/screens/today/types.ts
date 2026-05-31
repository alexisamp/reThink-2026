// Shared types for the Today surface (design-faithful rebuild).

export type GroupBy = 'priority' | 'milestone'

export type RailSectionId = 'milestones' | 'thisweek' | 'nextsteps' | 'journal'

export interface Mention {
  name: string
  kind: 'person' | 'company' | 'opportunity'
  imageUrl?: string | null
}
