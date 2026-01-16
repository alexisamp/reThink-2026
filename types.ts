export enum GoalStatus {
  ACTIVE = 'ACTIVE',
  BACKLOG = 'BACKLOG',
  COMPLETED = 'COMPLETED'
}

export interface Goal {
  id: string;
  text: string;
  motivation?: string; // The "Why" behind the goal
  status: GoalStatus;
  createdAt: number;
}

// A map of date string "YYYY-MM-DD" to a value.
// 0 = Not done / Skipped / Rule Broken
// 1 = Done (Binary) / Rule Kept
// 2-5 = Scale levels
export interface ContributionMap {
  [date: string]: number;
}

export enum HabitType {
  BINARY = 'BINARY',          // Checkbox
  SCALE = 'SCALE',            // 1-5 Rating
  NON_NEGOTIABLE = 'NON_NEGOTIABLE' // Rules (e.g., No Sugar). 1 = Success, 0 = Fail.
}

export interface Habit {
  id: string;
  goalId: string; 
  text: string;
  type: HabitType;
  contributions: ContributionMap;
}

export interface Todo {
  id: string;
  goalId: string; // Now Mandatory: Tasks must belong to a goal
  text: string;
  completed: boolean;
  externalLink?: string; // Optional URL for resources
  date: string; 
}

export type DayRating = 'GOLD' | 'GREEN' | 'GRAY';

export interface ReviewEntry {
  date: string;
  text: string;
  easyMode: boolean; // Did you prep for tomorrow?
  energyLevel: number; // 1-5
  dayRating: DayRating;
}

export interface AppData {
  goals: Goal[];
  habits: Habit[];
  todos: Todo[];
  reviews: ReviewEntry[];
}
