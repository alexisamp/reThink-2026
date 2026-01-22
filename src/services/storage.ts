
import { supabase } from './supabase';
import { AppData, Goal, Habit, WorkbookData, Todo, ReviewEntry, GlobalRules, StrategicItem, Milestone, HabitType, DailyContextEntry } from '../types';
import { embedText } from './ai';

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
      { data: milestonesData },
      { data: habitsData },
      { data: habitLogsData },
      { data: workbooksData },        // Parent table (stores year)
      { data: workbookEntriesData },  // Normalized answers
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

    // 1. Reconstruct Milestones
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

    // 2. Reconstruct Goals (Join Milestones)
    const goals = (goalsData || []).map((g: any) => ({
        ...g,
        createdAt: g.created_at ? new Date(g.created_at).getTime() : Date.now(),
        needsConfig: g.needs_config,
        milestones: milestonesByGoal[g.id] || [], // Attach normalized milestones
        leverage: typeof g.leverage === 'string' ? JSON.parse(g.leverage) : (g.leverage || []),
        obstacles: typeof g.obstacles === 'string' ? JSON.parse(g.obstacles) : (g.obstacles || []),
    })) as Goal[];

    // 3. Reconstruct Habits (Join Logs)
    const contributionsByHabit: Record<string, Record<string, number>> = {};
    (habitLogsData || []).forEach((log: any) => {
        if (!contributionsByHabit[log.habit_id]) contributionsByHabit[log.habit_id] = {};
        contributionsByHabit[log.habit_id][log.log_date] = log.value;
    });

    const habits = (habitsData || []).map((h: any) => ({
        ...h,
        goalId: h.goal_id, 
        defaultTime: h.default_time,
        lastScheduledAt: h.last_scheduled_at ? new Date(h.last_scheduled_at).getTime() : undefined,
        contributions: contributionsByHabit[h.id] || {} 
    })) as Habit[];

    // 4. Reconstruct Workbooks (Flattened Rows -> Object)
    const workbookReviews: Record<string, WorkbookData> = {};
    const entriesByWorkbookId: Record<string, any[]> = {};
    
    (workbookEntriesData || []).forEach((e: any) => {
        if (!entriesByWorkbookId[e.workbook_id]) entriesByWorkbookId[e.workbook_id] = [];
        entriesByWorkbookId[e.workbook_id].push(e);
    });

    (workbooksData || []).forEach((wb: any) => {
        const entries = entriesByWorkbookId[wb.id] || [];
        const data: Partial<WorkbookData> = { year: wb.year, signedAt: null, signatureName: '' };
        
        // Helper: Get single value
        const getVal = (key: string) => {
            const entry = entries.find(e => e.section_key === key);
            return entry?.answer || '';
        };
        // Helper: Get array of strings
        const getList = (key: string) => {
            return entries
                .filter(e => e.section_key === key)
                .sort((a, b) => a.list_order - b.list_order)
                .map(e => e.answer);
        };
        // Helper: Get array of JSON objects
        const getObjList = (key: string) => {
            return entries
                .filter(e => e.section_key === key)
                .sort((a, b) => a.list_order - b.list_order)
                .map(e => {
                    try { return JSON.parse(e.answer); } catch { return null; }
                })
                .filter(x => x !== null);
        };

        // Hydrate Application Model
        data.keySuccess = getVal('L1_KEY_SUCCESS');
        data.timeAudit = getVal('L2_TIME_AUDIT');
        data.notWorking = getList('L2_NOT_WORKING');
        data.working = getList('L2_WORKING');
        data.topTen = getList('L3_TOP_TEN');
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

// --- FETCH VIEW (For AI Context) ---

export const fetchDailyContext = async (startDate: string, endDate: string): Promise<DailyContextEntry[]> => {
    const { data, error } = await supabase
        .from('view_daily_context')
        .select('*')
        .gte('log_date', startDate)
        .lte('log_date', endDate);
    
    if (error) {
        console.error("Error fetching context:", error);
        return [];
    }
    return data as DailyContextEntry[];
};


// --- SAVING FUNCTIONS ---

const getUserId = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id;
};

export const saveGoal = async (goal: Goal) => {
  const userId = await getUserId();
  if (!userId) return;

  // 1. Save Goal Core (omit milestones array)
  const { error } = await supabase.from('goals').upsert({
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
  });
  if (error) console.error("Error saving goal:", error);

  // 2. Save Milestones (Normalized into 'milestones' table)
  if (goal.milestones && goal.milestones.length > 0) {
      const milestoneRows = goal.milestones.map(m => ({
          id: m.id,
          user_id: userId,
          goal_id: goal.id,
          text: m.text,
          target_date: m.targetMonth,
          status: m.completed ? 'COMPLETED' : 'PENDING',
          completed_at: m.completedAt ? new Date(m.completedAt).toISOString() : null
      }));
      const { error: mError } = await supabase.from('milestones').upsert(milestoneRows);
      if (mError) console.error("Error saving milestones:", mError);
  }
};

export const deleteGoal = async (id: string) => {
  // Database Cascade should handle children, but we delete explicit for safety
  await supabase.from('goals').delete().eq('id', id);
};

export const saveHabit = async (habit: Habit) => {
  const userId = await getUserId();
  if (!userId) return;

  // Save definition only (contributions are in habit_logs)
  const { error } = await supabase.from('habits').upsert({
    id: habit.id,
    user_id: userId,
    goal_id: habit.goalId,
    text: habit.text,
    type: habit.type,
    frequency: habit.frequency,
    default_time: habit.defaultTime,
    reward: habit.reward,
    last_scheduled_at: habit.lastScheduledAt ? new Date(habit.lastScheduledAt).toISOString() : null
  });
  if (error) console.error("Error saving habit:", error);
};

export const saveHabitLog = async (habitId: string, date: string, value: number) => {
    const userId = await getUserId();
    if (!userId) return;

    if (value === 0) {
        // Delete log if value is 0 (uncheck)
        await supabase.from('habit_logs').delete()
            .eq('habit_id', habitId)
            .eq('log_date', date);
    } else {
        // Upsert log
        await supabase.from('habit_logs').upsert({
            user_id: userId,
            habit_id: habitId,
            log_date: date,
            value: value
        }, { onConflict: 'habit_id, log_date' });
    }
};

export const deleteHabit = async (id: string) => {
  const { error } = await supabase.from('habits').delete().eq('id', id);
  if (error) console.error("Error deleting habit:", error);
};

export const saveWorkbook = async (workbook: WorkbookData) => {
  const userId = await getUserId();
  if (!userId) return;

  // 1. Upsert Parent Workbook
  const { data: wbRows, error: wbError } = await supabase
      .from('workbooks')
      .upsert({ user_id: userId, year: workbook.year }, { onConflict: 'user_id, year' })
      .select('id');
  
  if (wbError || !wbRows || wbRows.length === 0) {
      console.error("Error saving parent workbook:", wbError);
      return;
  }
  const workbookId = wbRows[0].id;

  // 2. Prepare Flattened Entries
  const entries: any[] = [];
  
  const add = (key: string, val: any, order = 0) => {
      if (val === undefined || val === null) return;
      // Convert objects to JSON strings
      const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
      
      entries.push({
          user_id: userId,
          workbook_id: workbookId,
          year: workbook.year,
          section_key: key,
          answer: valStr,
          list_order: order,
          embedding: null // Will be populated
      });
  };
  const addList = (key: string, list: any[]) => {
      list.forEach((item, i) => add(key, item, i));
  };

  // Map Flattened Fields
  add('L1_KEY_SUCCESS', workbook.keySuccess);
  add('L2_TIME_AUDIT', workbook.timeAudit);
  addList('L2_NOT_WORKING', workbook.notWorking);
  addList('L2_WORKING', workbook.working);
  addList('L3_TOP_TEN', workbook.topTen);
  addList('L4_CRITICAL_THREE', workbook.criticalThree); 
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

  // 3. Generate Embeddings for Rich Text (Parallel)
  const embeddingPromises = entries.map(async (entry) => {
     const keysToEmbed = [
         'L1_KEY_SUCCESS', 
         'L2_TIME_AUDIT', 
         'L3_TOP_TEN', 
         'L11_INSIGHTS'
     ];
     // Only embed if key matches AND text is substantial
     if (keysToEmbed.includes(entry.section_key) && entry.answer.length > 10) {
         entry.embedding = await embedText(entry.answer);
     }
  });
  await Promise.all(embeddingPromises);

  // 4. Atomic Replace: Delete old entries -> Insert new
  await supabase.from('workbook_entries').delete().eq('workbook_id', workbookId);
  
  const { error: eError } = await supabase.from('workbook_entries').insert(entries);
  if (eError) console.error("Error saving entries:", eError);
};

export const deleteWorkbook = async (year: string, deleteGoals: boolean, deleteHabits: boolean) => {
  const userId = await getUserId();
  if (!userId) return;

  // Retrieve goals linked to this workbook to delete them if requested
  const { data: entries } = await supabase.from('workbook_entries')
      .select('answer')
      .eq('user_id', userId)
      .eq('year', year)
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
           await supabase.from('habit_logs').delete().in('habit_id', 
                (await supabase.from('habits').select('id').in('goal_id', goalIds)).data?.map(h => h.id) || []
           );
           await supabase.from('habits').delete().in('goal_id', goalIds);
           await supabase.from('milestones').delete().in('goal_id', goalIds);
           await supabase.from('goals').delete().in('id', goalIds);
      } else if (deleteHabits) {
           await supabase.from('todos').delete().in('goal_id', goalIds);
           await supabase.from('habit_logs').delete().in('habit_id', 
                (await supabase.from('habits').select('id').in('goal_id', goalIds)).data?.map(h => h.id) || []
           );
           await supabase.from('habits').delete().in('goal_id', goalIds);
      }
  }

  // Delete Workbook (Cascades to entries usually, but safe to delete parent)
  await supabase.from('workbooks').delete().eq('user_id', userId).eq('year', year);
};

// --- AUXILIARY SAVES ---

export const saveTodo = async (todo: Todo) => {
    const userId = await getUserId();
    if (!userId) return;

    // 1. Save Todo
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

    // 2. Check Milestone Completion Side Effect
    if (todo.milestoneId && todo.completed) {
         // Auto-complete the milestone in the DB
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

export const getTodayKey = (): string => new Date().toISOString().split('T')[0];
