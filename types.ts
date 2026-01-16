export enum GoalStatus {
  ACTIVE = 'ACTIVE',
  BACKLOG = 'BACKLOG',
  COMPLETED = 'COMPLETED'
}

export interface Goal {
  id: string;
  text: string;
  status: GoalStatus;
  createdAt: number;
}

// A map of date string "YYYY-MM-DD" to a value.
// 0 = Not done / Skipped
// 1 = Done (Binary) or Level 1 (Scale) or Failed (Non-Negotiable)
// 2-5 = Scale levels
export interface ContributionMap {
  [date: string]: number;
}

export enum HabitType {
  BINARY = 'BINARY',          // Checkbox
  SCALE = 'SCALE',            // 1-5 Rating (e.g., Energy, Confidence)
  NON_NEGOTIABLE = 'NON_NEGOTIABLE' // Inverse: Don't do this (e.g., No Social Media)
}

export interface Habit {
  id: string;
  goalId: string; // Links to a main goal (or 'global' for non-negotiables)
  text: string;
  type: HabitType;
  contributions: ContributionMap;
}

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  date: string; // YYYY-MM-DD
}

export interface ReviewEntry {
  date: string;
  text: string;
}

export interface AppData {
  goals: Goal[];
  habits: Habit[];
  todos: Todo[];
  reviews: ReviewEntry[];
}
