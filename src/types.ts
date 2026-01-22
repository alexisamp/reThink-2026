
export enum GoalStatus {
  ACTIVE = 'ACTIVE',
  BACKLOG = 'BACKLOG',
  COMPLETED = 'COMPLETED'
}

export interface Milestone {
  id: string;
  goalId?: string; // Foreign Key to Goal
  text: string;
  targetMonth?: string; 
  completed: boolean;
  completedAt?: number;
}

export interface Obstacle {
  id: string;
  obstacle: string; 
  workaround: string; 
}

export interface Leverage {
  id: string;
  strength: string; 
  application: string; 
}

export interface Goal {
  id: string;
  text: string;
  metric: string;
  motivation?: string;
  
  nextStep?: string; 
  keySupport?: string;

  // Stored as JSON columns in 'goals' table
  leverage: Leverage[]; 
  obstacles: Obstacle[]; 
  
  status: GoalStatus;
  
  // JOINED: Loaded from 'milestones' table in AppData
  milestones: Milestone[];
  
  createdAt: number;
  needsConfig?: boolean; 
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
  frequency?: 'DAILY' | 'WEEKLY'; 
  defaultTime?: string;
  lastScheduledAt?: number;
  reward?: string;
  
  // COMPUTED: Constructed from 'habit_logs' table
  contributions: ContributionMap;
}

export interface Todo {
  id: string;
  goalId: string;
  milestoneId?: string; // Links Todo to a specific Milestone
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

// Database View Mapping
export interface DailyContextEntry {
  user_id: string;
  log_date: string;
  habit_name: string;
  intensity: number;
  journal_entry?: string;
  day_rating?: string;
  energy_level?: number;
}

export interface GlobalRules {
  prescriptions: string[];
  antiGoals: string[];
}

export interface InnerCircleMember {
  name: string;
  scores: {
    info: number;    
    growth: number;  
    energy: number;  
    future: number;  
    values: number;  
  };
  totalScore: number;
}

// Application Model (Reconstructed from workbook_entries)
export interface WorkbookData {
  year: string;
  
  keySuccess: string;
  timeAudit: string; 
  notWorking: string[]; 
  working: string[]; 
  
  topTen: string[];    
  criticalThree: Goal[]; 
  backlogGoals?: Goal[]; 
  
  momentum: { id: string; item: string; step: string }[];
  weaknesses: { id: string; weakness: string; workaround: string }[];
  strengths: { id: string; strength: string; application: string }[];
  easyMode: { id: string; hard: string; easy: string }[];

  innerCircle: InnerCircleMember[];

  rulesProsper: string[]; 
  rulesProtect: string[]; 
  rulesLimit: string[];   

  insights: string[];
  oneChange: string;
  revisitDate: string;
  signedAt: number | null;
  signatureName: string;
  
  // Legacy fields
  antiGoals?: string[];
}

export interface AppData {
  goals: Goal[];
  habits: Habit[];
  todos: Todo[];
  reviews: ReviewEntry[];
  strategy: StrategicItem[]; 
  globalRules: GlobalRules; 
  workbookReviews: Record<string, WorkbookData>; 
}
