export enum GoalStatus {
  ACTIVE = 'ACTIVE',
  BACKLOG = 'BACKLOG',
  COMPLETED = 'COMPLETED'
}

export interface Milestone {
  id: string;
  text: string;
  completed: boolean;
  completedAt?: number;
}

export interface Obstacle {
  id: string;
  obstacle: string; // The "What"
  workaround: string; // The "Fix"
}

export interface Leverage {
  id: string;
  strength: string; // The "What"
  application: string; // The "How to use"
}

export interface Goal {
  id: string;
  text: string;
  metric: string;
  motivation?: string;
  
  leverage: Leverage[]; 
  obstacles: Obstacle[]; 
  
  status: GoalStatus;
  milestones: Milestone[];
  createdAt: number;
  
  // Deprecated legacy fields
  type?: 'STRENGTH' | 'WEAKNESS'; 
  workaround?: string;
}

export interface StrategicItem {
  id: string;
  type: 'STRENGTH' | 'WEAKNESS';
  title: string;
  tactic: string; 
}

export interface ContributionMap {
  [date: string]: number;
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
  defaultTime?: string;
  lastScheduledAt?: number;
  reward?: string;
  contributions: ContributionMap;
}

export interface Todo {
  id: string;
  goalId: string;
  milestoneId?: string;
  text: string;
  effort?: 'DEEP' | 'SHALLOW';
  block?: 'AM' | 'PM';
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

export interface GlobalRules {
  prescriptions: string[];
  antiGoals: string[];
}

// New Workbook Data Structure
export interface WorkbookData {
  // Level 1 & 2: The Review
  keySuccess: string;
  stupidestDecision: string;
  smartestDecision: string;
  timeAudit: string;
  
  // Level 5: Momentum
  procrastinationList: { id: string; item: string; smallStep: string }[];
  
  // Level 7: Easy Mode
  easyModeReflection: string;
  
  // Level 8: Inversion
  failurePreMortem: string;

  // Level 11: Contract
  signedAt: number | null;
  signatureName: string;
}

export interface AppData {
  goals: Goal[];
  habits: Habit[];
  todos: Todo[];
  reviews: ReviewEntry[];
  strategy: StrategicItem[];
  globalRules: GlobalRules;
  workbook: WorkbookData; // New field
}