import { supabase } from './supabase';
import { AppData, Goal, Habit, WorkbookData, Todo, ReviewEntry, GlobalRules, StrategicItem } from '../types';

export const INITIAL_DATA: AppData = {
  goals: [],
  habits: [],
  todos: [],
  reviews: [],
  strategy: [],
  globalRules: { prescriptions: [], antiGoals: [] },
  workbookReviews: {} 
};

// --- DATA LOADING ---

export const loadData = async (userId: string): Promise<AppData> => {
  try {
    const [
      { data: goalsData },
      { data: habitsData },
      { data: workbooksData },
      { data: todosData },
      { data: reviewsData },
      { data: strategiesData }
    ] = await Promise.all([
      supabase.from('goals').select('*').eq('user_id', userId),
      supabase.from('habits').select('*').eq('user_id', userId),
      supabase.from('workbooks').select('*').eq('user_id', userId),
      supabase.from('todos').select('*').eq('user_id', userId),
      supabase.from('reviews').select('*').eq('user_id', userId),
      supabase.from('strategies').select('*').eq('user_id', userId)
    ]);

    // Parse JSON columns and map to types
    const workbookReviews: Record<string, WorkbookData> = {};
    workbooksData?.forEach((row: any) => {
        if (row.data) workbookReviews[row.year] = row.data;
    });

    const goals = (goalsData || []).map((g: any) => ({
        ...g,
        createdAt: g.created_at ? new Date(g.created_at).getTime() : Date.now(),
        needsConfig: g.needs_config,
        milestones: typeof g.milestones === 'string' ? JSON.parse(g.milestones) : (g.milestones || []),
        leverage: typeof g.leverage === 'string' ? JSON.parse(g.leverage) : (g.leverage || []),
        obstacles: typeof g.obstacles === 'string' ? JSON.parse(g.obstacles) : (g.obstacles || []),
    })) as Goal[];

    const habits = (habitsData || []).map((h: any) => ({
        ...h,
        goalId: h.goal_id, 
        defaultTime: h.default_time,
        lastScheduledAt: h.last_scheduled_at,
        contributions: typeof h.contributions === 'string' ? JSON.parse(h.contributions) : (h.contributions || {})
    })) as Habit[];

    const todos = (todosData || []).map((t: any) => ({
        ...t,
        goalId: t.goal_id,
        milestoneId: t.milestone_id,
        completedAt: t.completed_at ? new Date(t.completed_at).getTime() : undefined
    })) as Todo[];

    const reviews = (reviewsData || []).map((r: any) => ({
        date: r.date,
        text: r.text,
        easyMode: r.easy_mode,
        energyLevel: r.energy_level,
        dayRating: r.day_rating
    })) as ReviewEntry[];
    
    const strategy = (strategiesData || []) as StrategicItem[];

    // Extract Global Rules from latest workbook
    const years = Object.keys(workbookReviews).sort().reverse();
    let globalRules: GlobalRules = { prescriptions: [], antiGoals: [] };
    if (years.length > 0) {
        const latest = workbookReviews[years[0]];
        globalRules = {
            prescriptions: [...(latest.rulesProsper || []), ...(latest.rulesProtect || []), ...(latest.rulesLimit || [])],
            antiGoals: latest.antiGoals || []
        };
    }

    return { goals, habits, todos, reviews, strategy, globalRules, workbookReviews };

  } catch (e) {
    console.error("Failed to load data:", e);
    return INITIAL_DATA;
  }
};

// --- SAVING FUNCTIONS ---

const getUserId = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id;
};

export const saveGoal = async (goal: Goal) => {
  const userId = await getUserId();
  if (!userId) return;

  const { error } = await supabase.from('goals').upsert({
    id: goal.id,
    user_id: userId,
    text: goal.text,
    metric: goal.metric,
    motivation: goal.motivation,
    status: goal.status,
    milestones: goal.milestones,
    leverage: goal.leverage,
    obstacles: goal.obstacles,
    created_at: new Date(goal.createdAt).toISOString(),
    needs_config: goal.needsConfig
  });
  if (error) console.error("Error saving goal:", error);
};

export const deleteGoal = async (id: string) => {
  const { error } = await supabase.from('goals').delete().eq('id', id);
  if (error) console.error("Error deleting goal:", error);
};

export const saveHabit = async (habit: Habit) => {
  const userId = await getUserId();
  if (!userId) return;

  const { error } = await supabase.from('habits').upsert({
    id: habit.id,
    user_id: userId,
    goal_id: habit.goalId,
    text: habit.text,
    type: habit.type,
    frequency: habit.frequency,
    default_time: habit.defaultTime,
    reward: habit.reward,
    contributions: habit.contributions,
    last_scheduled_at: habit.lastScheduledAt
  });
  if (error) console.error("Error saving habit:", error);
};

export const deleteHabit = async (id: string) => {
  const { error } = await supabase.from('habits').delete().eq('id', id);
  if (error) console.error("Error deleting habit:", error);
};

export const saveWorkbook = async (workbook: WorkbookData) => {
  const userId = await getUserId();
  if (!userId) return;

  const { error } = await supabase.from('workbooks').upsert({
      user_id: userId,
      year: workbook.year,
      data: workbook 
  }, { onConflict: 'user_id, year' });
  if (error) console.error("Error saving workbook:", error);
};

// --- AUXILIARY SAVES ---

export const saveTodo = async (todo: Todo) => {
    const userId = await getUserId();
    if (!userId) return;
    await supabase.from('todos').upsert({
        id: todo.id,
        user_id: userId,
        goal_id: todo.goalId,
        milestone_id: todo.milestoneId,
        text: todo.text,
        effort: todo.effort,
        block: todo.block,
        completed: todo.completed,
        completed_at: todo.completedAt ? new Date(todo.completedAt).toISOString() : null,
        date: todo.date
    });
};

export const deleteTodo = async (id: string) => {
    await supabase.from('todos').delete().eq('id', id);
};

export const saveReview = async (review: ReviewEntry) => {
    const userId = await getUserId();
    if (!userId) return;
    await supabase.from('reviews').upsert({
        date: review.date,
        user_id: userId,
        text: review.text,
        easy_mode: review.easyMode,
        energy_level: review.energyLevel,
        day_rating: review.dayRating
    });
};

export const getTodayKey = (): string => new Date().toISOString().split('T')[0];