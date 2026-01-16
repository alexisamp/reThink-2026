export enum GoalStatus {
  ACTIVE = 'ACTIVE',
  BACKLOG = 'BACKLOG',
  COMPLETED = 'COMPLETED'
}

export interface Milestone {
  id: string;
  text: string;
  completed: boolean;
}

export interface Goal {
  id: string;
  text: string;
  motivation?: string;
  status: GoalStatus;
  milestones: Milestone[];
  createdAt: number;
  completedAt?: number;
}

export interface StrategicItem {
  id: string;
  type: 'STRENGTH' | 'WEAKNESS';
  title: string;
  tactic: string; 
}

export interface ContributionMap {
  [date: string]: number; // 0/1 for Binary, 1-5 for Scale, 0/1 for Non-Negotiable
}

export enum HabitType {
  BINARY = 'BINARY',
  SCALE = 'SCALE',
  NON_NEGOTIABLE = 'NON_NEGOTIABLE'
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
  goalId: string;
  milestoneId?: string;
  text: string;
  completed: boolean;
  completedAt?: number;
  date: string; 
}

export type DayRating = 'GOLD' | 'GREEN' | 'GRAY';

export interface ReviewEntry {
  date: string;
  text: string;
  easyMode: boolean;
  energyLevel: number;
  dayRating: DayRating;
}

export interface AppData {
  goals: Goal[];
  habits: Habit[];
  todos: Todo[];
  reviews: ReviewEntry[];
  strategy: StrategicItem[];
  globalRules?: string;
}