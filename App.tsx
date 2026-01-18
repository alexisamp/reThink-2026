import React, { useState, useEffect } from 'react';
import { loadData, saveData, getTodayKey } from './services/storage';
import { AppData, Goal, Habit, Todo, GoalStatus, HabitType, StrategicItem, Milestone, ReviewEntry, DayRating, GlobalRules } from './types';
import { Target, Mic, BarChart2, Sun, Target as StrategyIcon, PenTool, Layout } from './components/Icon'; 
import StrategyTab from './views/StrategyTab';
import TodayTab from './views/TodayTab';
import DashboardTab from './views/DashboardTab';

const MAX_ACTIVE_GOALS = 3;
type Tab = 'STRATEGY' | 'TODAY' | 'DASHBOARD';

const App: React.FC = () => {
  const [data, setData] = useState<AppData>(() => {
    const loaded = loadData() as any; // Cast to allow migration checks

    // 1. Ensure Strategy Array exists
    if (!loaded.strategy) loaded.strategy = [];

    // 2. Goal Migration (V2 Fields)
    loaded.goals = (loaded.goals || []).map((g: any) => ({
        ...g, 
        milestones: g.milestones || [],
        type: g.type || 'STRENGTH', // Keep for legacy
        metric: g.metric || 'Define success metric',
        leverage: g.leverage || [],
        obstacles: g.obstacles || []
    }));

    // 3. Global Rules Migration (String -> Object)
    let migratedRules: GlobalRules = { prescriptions: [], antiGoals: [] };
    if (typeof loaded.globalRules === 'string') {
        // Attempt to parse old text blob into prescriptions
        if (loaded.globalRules.trim()) {
            migratedRules.prescriptions = loaded.globalRules.split('\n').filter((r: string) => r.trim().length > 0);
        }
    } else if (loaded.globalRules) {
        migratedRules = loaded.globalRules;
    }
    loaded.globalRules = migratedRules;

    return loaded as AppData;
  });
  
  const [activeTab, setActiveTab] = useState<Tab>('TODAY');

  useEffect(() => {
    saveData(data);
  }, [data]);

  const todayKey = getTodayKey();

  // --- Actions passed to Tabs ---

  const updateGoal = (updatedGoal: Goal) => {
    setData(prev => ({
        ...prev,
        goals: prev.goals.map(g => g.id === updatedGoal.id ? updatedGoal : g)
    }));
  };

  const addGoal = (goal: Goal) => {
    setData(prev => ({ ...prev, goals: [...prev.goals, goal] }));
  };

  const deleteGoal = (id: string) => {
    if(!window.confirm("Delete goal permanently?")) return;
    setData(prev => ({
      ...prev,
      goals: prev.goals.filter(g => g.id !== id),
      habits: prev.habits.filter(h => h.goalId !== id),
      todos: prev.todos.filter(t => t.goalId !== id)
    }));
  };

  const addStrategicItem = (item: StrategicItem) => {
      setData(prev => ({ ...prev, strategy: [...prev.strategy, item] }));
  };

  const deleteStrategicItem = (id: string) => {
      setData(prev => ({ ...prev, strategy: prev.strategy.filter(s => s.id !== id) }));
  };

  const updateGlobalRules = (rules: GlobalRules) => {
      setData(prev => ({ ...prev, globalRules: rules }));
  };

  const addHabit = (habit: Habit) => {
    setData(prev => ({ ...prev, habits: [...prev.habits, habit] }));
  };

  const toggleHabit = (id: string, value: number) => {
    setData(prev => ({
      ...prev,
      habits: prev.habits.map(h => {
        if (h.id === id) {
          const newContrib = { ...h.contributions };
          if (value === 0) {
            delete newContrib[todayKey];
          } else {
            newContrib[todayKey] = value;
          }
          return { ...h, contributions: newContrib };
        }
        return h;
      })
    }));
  };

  const deleteHabit = (id: string) => {
    setData(prev => ({ ...prev, habits: prev.habits.filter(h => h.id !== id) }));
  };

  const addTodo = (text: string, goalId: string, milestoneId?: string) => {
    if (!text.trim()) return;
    const newTodo: Todo = { 
      id: crypto.randomUUID(), 
      goalId, 
      milestoneId,
      text, 
      completed: false, 
      date: todayKey 
    };
    setData(prev => ({ ...prev, todos: [...prev.todos, newTodo] }));
  };
  
  const toggleTodo = (id: string) => {
    setData(prev => ({
      ...prev,
      todos: prev.todos.map(t => {
          if (t.id === id) {
              const nowCompleted = !t.completed;
              // Save exact timestamp when completing
              return { 
                ...t, 
                completed: nowCompleted, 
                completedAt: nowCompleted ? Date.now() : undefined 
              };
          }
          return t;
      })
    }));
  };

  const editTodo = (id: string, newText: string) => {
    setData(prev => ({
      ...prev,
      todos: prev.todos.map(t => t.id === id ? { ...t, text: newText } : t)
    }));
  };

  const updateTodo = (id: string, updates: Partial<Todo>) => {
    setData(prev => ({
      ...prev,
      todos: prev.todos.map(t => t.id === id ? { ...t, ...updates } : t)
    }));
  };

  const deleteTodo = (id: string) => {
    setData(prev => ({ ...prev, todos: prev.todos.filter(t => t.id !== id) }));
  };

  return (
    <div className="min-h-screen bg-notion-bg text-notion-text font-sans selection:bg-gray-200 flex">
      <style>{`
        @media print {
            aside, .no-print, header { display: none !important; }
            main { padding: 0 !important; margin: 0 !important; width: 100% !important; }
        }
      `}</style>

      {/* Sidebar */}
      <aside className="w-64 border-r border-notion-border h-screen sticky top-0 bg-notion-sidebar flex flex-col hidden md:flex z-50">
        <div className="p-8">
           <div className="w-10 h-10 bg-black text-white flex items-center justify-center rounded font-serif font-bold text-xl mb-8">OS</div>
           
           <nav className="flex flex-col gap-2">
             <button onClick={() => setActiveTab('STRATEGY')} className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors ${activeTab === 'STRATEGY' ? 'bg-white text-black shadow-sm ring-1 ring-black/5' : 'text-notion-dim hover:bg-notion-hover'}`}>
                <StrategyIcon className="w-4 h-4" /> Strategy
             </button>
             <button onClick={() => setActiveTab('TODAY')} className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors ${activeTab === 'TODAY' ? 'bg-white text-black shadow-sm ring-1 ring-black/5' : 'text-notion-dim hover:bg-notion-hover'}`}>
                <Sun className="w-4 h-4" /> Today
             </button>
             <button onClick={() => setActiveTab('DASHBOARD')} className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors ${activeTab === 'DASHBOARD' ? 'bg-white text-black shadow-sm ring-1 ring-black/5' : 'text-notion-dim hover:bg-notion-hover'}`}>
                <BarChart2 className="w-4 h-4" /> Dashboard
             </button>
           </nav>
        </div>

        <div className="mt-auto p-8 border-t border-notion-border">
           <div className="text-[10px] uppercase tracking-widest text-notion-dim font-medium">
              reThink v7.1
           </div>
           <div className="text-xs font-serif italic text-notion-dim mt-1">
              "Identity determines behavior."
           </div>
        </div>
      </aside>

      {/* Mobile Tab Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-notion-border flex justify-around p-3 z-50 no-print safe-area-bottom">
        <button onClick={() => setActiveTab('STRATEGY')} className={`p-2 ${activeTab === 'STRATEGY' ? 'text-black' : 'text-notion-dim'}`}><StrategyIcon /></button>
        <button onClick={() => setActiveTab('TODAY')} className={`p-2 ${activeTab === 'TODAY' ? 'text-black' : 'text-notion-dim'}`}><Sun /></button>
        <button onClick={() => setActiveTab('DASHBOARD')} className={`p-2 ${activeTab === 'DASHBOARD' ? 'text-black' : 'text-notion-dim'}`}><BarChart2 /></button>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-16 overflow-y-auto max-h-screen">
        <div className="max-w-6xl mx-auto h-full pb-24">
            {activeTab === 'STRATEGY' && (
                <StrategyTab 
                    data={data}
                    onAddStrategicItem={addStrategicItem}
                    onDeleteStrategicItem={deleteStrategicItem}
                    onAddGoal={addGoal}
                    onUpdateGoal={updateGoal}
                    onDeleteGoal={deleteGoal}
                    onAddHabit={addHabit}
                    onDeleteHabit={deleteHabit}
                    onUpdateGlobalRules={updateGlobalRules}
                />
            )}
            {activeTab === 'TODAY' && (
                <TodayTab 
                    data={data}
                    todayKey={todayKey}
                    onToggleHabit={toggleHabit}
                    onAddTodo={addTodo}
                    onToggleTodo={toggleTodo}
                    onEditTodo={editTodo}
                    onUpdateTodo={updateTodo}
                    onDeleteTodo={deleteTodo}
                />
            )}
            {activeTab === 'DASHBOARD' && (
                <DashboardTab data={data} />
            )}
        </div>
      </main>
    </div>
  );
};

export default App;