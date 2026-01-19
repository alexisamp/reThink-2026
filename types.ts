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
  
  // Flag to indicate this goal came from a review and might need detailing
  needsConfig?: boolean; 
  
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

// --- YEARLY ARCHITECTURE ---

export interface WorkbookData {
  year: string;
  
  // Level 1 & 2: The Audit
  keySuccess: string;
  stupidestDecision: string;
  smartestDecision: string;
  timeAudit: string;
  
  // Level 5: Momentum
  momentum: { id: string; item: string; step: string }[];
  
  // Level 6: Identity Snapshot
  strengths: { id: string; strength: string; application: string }[];
  weaknesses: { id: string; weakness: string; workaround: string }[];
  
  // Level 7 & 8: Deep Work
  easyModeReflection: string;
  failurePreMortem: string;

  // Level 10: Rules Snapshot
  prescriptions: string[];
  antiGoals: string[];

  // Level 11: Contract
  signedAt: number | null;
  signatureName: string;
}

export interface AppData {
  // Global Active State (Driven by latest review)
  goals: Goal[];
  habits: Habit[];
  todos: Todo[];
  reviews: ReviewEntry[]; // Daily logs
  strategy: StrategicItem[]; // Global identity
  globalRules: GlobalRules; // Global rules
  
  // The Archive
  workbookReviews: Record<string, WorkbookData>; // Keyed by Year "2025", "2026"
  
  // Deprecated but kept for safe migration if needed
  workbook?: any; 
}