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
  
  // Specific fields from "Do Less, Better" (L4)
  nextStep?: string; 
  keySupport?: string;

  leverage: Leverage[]; 
  obstacles: Obstacle[]; 
  
  status: GoalStatus;
  milestones: Milestone[];
  createdAt: number;
  
  // Flag to indicate this goal came from a review and needs systemization
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

// --- YEARLY ARCHITECTURE (PDF 2025) ---

export interface InnerCircleMember {
  name: string;
  scores: {
    info: number;    // Information quality
    growth: number;  // Growth catalyst
    energy: number;  // Energy impact
    future: number;  // Future alignment
    values: number;  // Values and ethics
  };
  totalScore: number;
}

export interface WorkbookData {
  year: string;
  
  // Level 1: The Key
  keySuccess: string;

  // Level 2: An Honest Audit
  timeAudit: string; // "If they looked at your calendar..."
  notWorking: string[]; // "What's not working..."
  working: string[]; // "What is working..."
  
  // Level 3 & 4: Horizon & Focus
  topTen: string[];    
  criticalThree: Goal[]; // Stored here for archive, also pushed to AppData.goals
  
  // Level 5: Momentum
  momentum: { id: string; item: string; step: string }[];
  
  // Level 6: Play to strengths (Weakness Workarounds)
  weaknesses: { id: string; weakness: string; workaround: string }[];
  strengths: { id: string; strength: string; application: string }[];
  
  // Level 7: Easy Mode
  easyMode: { id: string; hard: string; easy: string }[];

  // Level 8 & 9: Inner Circle
  innerCircle: InnerCircleMember[];

  // Level 10: Set the rules
  rulesProsper: string[]; // Automate progress
  rulesProtect: string[]; // Guard priorities
  rulesLimit: string[];   // Identify rules to retire

  // Level 11: Commit
  insights: string[];
  oneChange: string;
  revisitDate: string;
  signedAt: number | null;
  signatureName: string;
  
  // Legacy fields kept for compatibility
  stupidestDecision?: string;
  smartestDecision?: string;
  prescriptions?: string[]; // Legacy
  antiGoals?: string[]; // Legacy
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