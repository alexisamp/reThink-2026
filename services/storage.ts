import { supabase } from './supabase';
import { AppData, Goal, Habit, WorkbookData, Todo, ReviewEntry, GlobalRules, StrategicItem, Milestone, HabitType, DailyContextEntry } from '../types';

export const INITIAL_DATA: AppData = {
  goals: [],
  habits: [],
  todos: [],
  reviews: [],
  strategy: [],
  globalRules: { prescriptions: [], antiGoals: [] },
  workbookReviews: {} 
};

// --- HELPER: GET USER ---
const getUserId = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id;
};

// --- 1. DATA LOADING ---

export const loadData = async (userId: string): Promise<AppData> => {
  try {
    const [
      { data: goalsData },
      { data: milestonesData },
      { data: habitsData },
      { data: habitLogsData },
      { data: workbooksData },
      { data: workbookEntriesData },
      { data: todosData },
      { data: reviewsData },
      { data: strategiesData }
    ] = await Promise.all([
      supabase.from('goals').select('*').eq('user_id', userId),
      supabase.from('milestones').select('*').eq('user_id', userId),
      supabase.from('habits').select('*').eq('user_id', userId),
      supabase.from('habit_logs').select('*').eq('user_id', userId),
      supabase.from('workbooks').select('*').eq('user_id', userId),
      supabase.from('workbook_entries').select('*').eq('user_id', userId),
      supabase.from('todos').select('*').eq('user_id', userId),
      supabase.from('reviews').select('*').eq('user_id', userId),
      supabase.from('strategies').select('*').eq('user_id', userId)
    ]);

    // Process Milestones
    const milestonesByGoal: Record<string, Milestone[]> = {};
    (milestonesData || []).forEach((m: any) => {
        const ms: Milestone = {
            id: m.id,
            goalId: m.goal_id,
            text: m.text,
            targetMonth: m.target_date,
            completed: m.status === 'COMPLETED',
            completedAt: m.completed_at ? new Date(m.completed_at).getTime() : undefined
        };
        if (!milestonesByGoal[m.goal_id]) milestonesByGoal[m.goal_id] = [];
        milestonesByGoal[m.goal_id].push(ms);
    });

    // Process Goals
    const goals = (goalsData || []).map((g: any) => ({
        ...g,
        createdAt: g.created_at ? new Date(g.created_at).getTime() : Date.now(),
        needsConfig: g.needs_config,
        milestones: milestonesByGoal[g.id] || [],
        leverage: typeof g.leverage === 'string' ? JSON.parse(g.leverage) : (g.leverage || []),
        obstacles: typeof g.obstacles === 'string' ? JSON.parse(g.obstacles) : (g.obstacles || []),
        workbookId: g.workbook_id
    })) as Goal[];

    // Process Habit Logs
    const contributionsByHabit: Record<string, Record<string, number>> = {};
    (habitLogsData || []).forEach((log: any) => {
        if (!contributionsByHabit[log.habit_id]) contributionsByHabit[log.habit_id] = {};
        contributionsByHabit[log.habit_id][log.log_date] = log.value;
    });

    // Process Habits
    const habits = (habitsData || []).map((h: any) => ({
        ...h,
        goalId: h.goal_id, 
        defaultTime: h.default_time,
        lastScheduledAt: h.last_scheduled_at,
        targetValue: h.target_value,
        unit: h.unit,
        contributions: contributionsByHabit[h.id] || {}
    })) as Habit[];

    // Process Workbook Entries (Reconstructing the WorkbookData object)
    const workbookReviews: Record<string, WorkbookData> = {};
    const entriesByWorkbookId: Record<string, any[]> = {};
    
    (workbookEntriesData || []).forEach((e: any) => {
        if (!entriesByWorkbookId[e.workbook_id]) entriesByWorkbookId[e.workbook_id] = [];
        entriesByWorkbookId[e.workbook_id].push(e);
    });

    (workbooksData || []).forEach((wb: any) => {
        const entries = entriesByWorkbookId[wb.id] || [];
        const data: Partial<WorkbookData> = { year: wb.year, signedAt: null, signatureName: '' };
        
        const getVal = (key: string) => entries.find(e => e.section_key === key)?.answer || '';
        const getList = (key: string) => entries.filter(e => e.section_key === key).sort((a, b) => a.list_order - b.list_order).map(e => e.answer);
        const getObjList = (key: string) => entries.filter(e => e.section_key === key).sort((a, b) => a.list_order - b.list_order).map(e => {
            try { return JSON.parse(e.answer); } catch { return {}; }
        });

        data.keySuccess = getVal('L1_KEY_SUCCESS');
        data.timeAudit = getVal('L2_TIME_AUDIT');
        data.notWorking = getList('L2_NOT_WORKING');
        data.working = getList('L2_WORKING');
        data.topTen = getList('L3_TOP_TEN');
        
        // Critical Three and Backlog are stored as JSON in entries for historical record, 
        // but live goals are loaded from 'goals' table. 
        // We use the JSON here just for the "Review" view display if needed.
        data.criticalThree = getObjList('L4_CRITICAL_THREE');
        data.backlogGoals = getObjList('L4_BACKLOG');
        
        data.momentum = getObjList('L5_MOMENTUM');
        data.weaknesses = getObjList('L6_WEAKNESSES');
        data.strengths = []; 
        data.easyMode = getObjList('L7_EASY_MODE');
        data.innerCircle = getObjList('L8_INNER_CIRCLE');
        data.rulesProsper = getList('L10_RULES_PROSPER');
        data.rulesProtect = getList('L10_RULES_PROTECT');
        data.rulesLimit = getList('L10_RULES_LIMIT');
        data.insights = getList('L11_INSIGHTS');
        data.oneChange = getVal('L11_ONE_CHANGE');
        data.revisitDate = getVal('L11_REVISIT_DATE');
        data.signatureName = getVal('L11_SIGNATURE');
        
        const signedAtStr = getVal('L11_SIGNED_AT');
        data.signedAt = signedAtStr ? parseInt(signedAtStr) : null;

        workbookReviews[wb.year] = data as WorkbookData;
    });

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
    
    // Strategy derivation (Latest workbook rules)
    const years = Object.keys(workbookReviews).sort().reverse();
    let globalRules: GlobalRules = { prescriptions: [], antiGoals: [] };
    let strategy: StrategicItem[] = [];

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

export const fetchDailyContext = async (startDate: string, endDate: string): Promise<DailyContextEntry[]> => {
    const { data, error } = await supabase.from('view_daily_context').select('*').gte('log_date', startDate).lte('log_date', endDate);
    return (data as DailyContextEntry[]) || [];
};

// --- 2. WORKBOOK SAVING (STRICT ORDER) ---

export const saveWorkbook = async (workbook: WorkbookData): Promise<string> => {
  const userId = await getUserId();
  if (!userId) throw new Error("User not logged in");

  // A. UPSERT WORKBOOK PARENT -> GET ID
  const { data: wbRows, error: wbError } = await supabase
      .from('workbooks')
      .upsert({ user_id: userId, year: workbook.year }, { onConflict: 'user_id, year' })
      .select('id');
  
  if (wbError || !wbRows || wbRows.length === 0) {
      throw new Error(`Workbook Save Error: ${wbError?.message}`);
  }
  const workbookId = wbRows[0].id;

  // B. PREPARE ENTRIES (NO AI, NO EMBEDDINGS)
  const entries: any[] = [];
  const add = (key: string, val: any, order = 0) => {
      if (val === undefined || val === null) return;
      // Convert objects/arrays to string for the 'answer' column
      const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
      
      entries.push({
          user_id: userId,
          workbook_id: workbookId,
          section_key: key, 
          answer: valStr,
          list_order: order,
          embedding: null // Explicitly null
      });
  };
  
  const addList = (key: string, list: any[]) => {
      if (!Array.isArray(list)) return;
      list.forEach((item, i) => add(key, item, i));
  };

  // Map WorkbookData fields to DB entries
  add('L1_KEY_SUCCESS', workbook.keySuccess);
  add('L2_TIME_AUDIT', workbook.timeAudit);
  addList('L2_NOT_WORKING', workbook.notWorking);
  addList('L2_WORKING', workbook.working);
  addList('L3_TOP_TEN', workbook.topTen);
  addList('L4_CRITICAL_THREE', workbook.criticalThree); // Snapshot of goals at time of review
  addList('L4_BACKLOG', workbook.backlogGoals || []);
  addList('L5_MOMENTUM', workbook.momentum);
  addList('L6_WEAKNESSES', workbook.weaknesses);
  addList('L7_EASY_MODE', workbook.easyMode);
  addList('L8_INNER_CIRCLE', workbook.innerCircle);
  addList('L10_RULES_PROSPER', workbook.rulesProsper);
  addList('L10_RULES_PROTECT', workbook.rulesProtect);
  addList('L10_RULES_LIMIT', workbook.rulesLimit);
  addList('L11_INSIGHTS', workbook.insights);
  add('L11_ONE_CHANGE', workbook.oneChange);
  add('L11_REVISIT_DATE', workbook.revisitDate);
  add('L11_SIGNATURE', workbook.signatureName);
  add('L11_SIGNED_AT', workbook.signedAt);

  // C. DELETE OLD ENTRIES FOR THIS WORKBOOK
  const { error: delError } = await supabase.from('workbook_entries').delete().eq('workbook_id', workbookId);
  if (delError) {
      console.error("Error clearing old entries:", delError);
      // We continue anyway, hoping upsert might handle it or just append
  }

  // D. INSERT NEW ENTRIES
  const { error: insertError } = await supabase.from('workbook_entries').insert(entries);
  if (insertError) {
      throw new Error(`Entries Save Error: ${insertError.message}`);
  }

  // E. RETURN ID (Synchronous success)
  return workbookId;
};

// --- 3. GOAL SAVING ---

export const saveGoal = async (goal: Goal, workbookId?: string) => {
  const userId = await getUserId();
  if (!userId) return;

  const payload: any = {
    id: goal.id,
    user_id: userId,
    text: goal.text,
    metric: goal.metric,
    motivation: goal.motivation,
    status: goal.status,
    leverage: JSON.stringify(goal.leverage),
    obstacles: JSON.stringify(goal.obstacles),
    created_at: new Date(goal.createdAt).toISOString(),
    needs_config: goal.needsConfig
  };

  // CRITICAL: Attach Workbook ID if provided
  if (workbookId) {
      payload.workbook_id = workbookId;
  } else if (goal.workbookId) {
      payload.workbook_id = goal.workbookId;
  }

  const { error } = await supabase.from('goals').upsert(payload);
  if (error) console.error("Error saving goal:", error);

  // Save Milestones associated with this goal
  if (goal.milestones && goal.milestones.length > 0) {
      const milestoneRows = goal.milestones.map(m => ({
          id: m.id,
          user_id: userId,
          goal_id: goal.id,
          text: m.text,
          target_date: m.targetMonth || null,
          status: m.completed ? 'COMPLETED' : 'PENDING',
          completed_at: m.completedAt ? new Date(m.completedAt).toISOString() : null
      }));
      const { error: mError } = await supabase.from('milestones').upsert(milestoneRows);
      if (mError) console.error("Error saving milestones:", mError);
  }
};

export const deleteGoal = async (id: string) => {
  await supabase.from('goals').delete().eq('id', id);
};

// --- 4. HABIT & TODO SAVING ---

export const saveHabit = async (habit: Habit) => {
  const userId = await getUserId();
  if (!userId) return;

  const { error } = await supabase.from('habits').upsert({
    id: habit.id,
    user_id: userId,
    goal_id: habit.goalId,
    text: habit.text,
    type: habit.type,
    frequency: habit.frequency || 'DAILY',
    default_time: habit.defaultTime || null,
    reward: habit.reward || null,
    last_scheduled_at: habit.lastScheduledAt ? new Date(habit.lastScheduledAt).toISOString() : null,
    target_value: habit.targetValue || 1,
    unit: habit.unit || 'rep'
  });
  if (error) console.error("Error saving habit:", error);
};

export const saveHabitLog = async (habitId: string, date: string, value: number) => {
    const userId = await getUserId();
    if (!userId) return;

    if (value === 0) {
        await supabase.from('habit_logs').delete().eq('habit_id', habitId).eq('log_date', date);
    } else {
        await supabase.from('habit_logs').upsert({
            user_id: userId,
            habit_id: habitId,
            log_date: date,
            value: value
        }, { onConflict: 'habit_id, log_date' });
    }
};

export const deleteHabit = async (id: string) => {
  await supabase.from('habits').delete().eq('id', id);
};

export const saveTodo = async (todo: Todo) => {
    const userId = await getUserId();
    if (!userId) return;

    const payload = {
        id: todo.id,
        user_id: userId,
        goal_id: todo.goalId,
        milestone_id: (todo.milestoneId && todo.milestoneId.trim() !== "") ? todo.milestoneId : null,
        text: todo.text,
        effort: todo.effort || 'SHALLOW',
        block: todo.block || null,
        completed: todo.completed,
        completed_at: todo.completedAt ? new Date(todo.completedAt).toISOString() : null,
        date: todo.date
    };

    const { error } = await supabase.from('todos').upsert(payload);
    if (error) console.error("Error saving todo:", error);

    if (todo.milestoneId && todo.completed) {
         await supabase.from('milestones').update({
             status: 'COMPLETED',
             completed_at: new Date().toISOString()
         }).eq('id', todo.milestoneId);
    }
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

export const deleteWorkbook = async (year: string, deleteGoals: boolean, deleteHabits: boolean) => {
  const userId = await getUserId();
  if (!userId) return;

  const { data: entries } = await supabase.from('workbook_entries')
      .select('answer')
      .eq('user_id', userId)
      .in('section_key', ['L4_CRITICAL_THREE', 'L4_BACKLOG']);
  
  const goalIds: string[] = [];
  if (entries) {
      entries.forEach((e: any) => {
          try {
              const g = JSON.parse(e.answer);
              if (g.id) goalIds.push(g.id);
          } catch {}
      });
  }

  if (goalIds.length > 0) {
      if (deleteGoals) {
           await supabase.from('todos').delete().in('goal_id', goalIds);
           await supabase.from('habits').delete().in('goal_id', goalIds);
           await supabase.from('milestones').delete().in('goal_id', goalIds);
           await supabase.from('goals').delete().in('id', goalIds);
      } else if (deleteHabits) {
           await supabase.from('todos').delete().in('goal_id', goalIds);
           await supabase.from('habits').delete().in('goal_id', goalIds);
      }
  }

  await supabase.from('workbooks').delete().eq('user_id', userId).eq('year', year);
};

export const updateMilestoneStatus = async (milestoneId: string, completed: boolean) => {
    const userId = await getUserId();
    if (!userId) return;
    await supabase.from('milestones').update({
        status: completed ? 'COMPLETED' : 'PENDING',
        completed_at: completed ? new Date().toISOString() : null
    }).eq('id', milestoneId);
};

export const getTodayKey = (): string => new Date().toISOString().split('T')[0];
export const saveAiMemory = async () => {}; // Stub
