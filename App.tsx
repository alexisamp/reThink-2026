import React, { useState, useEffect } from 'react';
import { loadData, saveData, getTodayKey } from './services/storage';
import { AppData, Goal, Habit, Todo, GoalStatus, HabitType, DayRating, StrategicItem } from './types';
import { Target, Mic, BarChart2, Sun, Target as StrategyIcon } from './components/Icon'; // Reusing icons
import StrategyTab from './views/StrategyTab';
import TodayTab from './views/TodayTab';
import DashboardTab from './views/DashboardTab';
import CoachTab from './views/CoachTab';

const MAX_ACTIVE_GOALS = 3;
type Tab = 'STRATEGY' | 'TODAY' | 'DASHBOARD' | 'COACH';

const App: React.FC = () => {
  const [data, setData] = useState<AppData>(() => {
    const loaded = loadData();
    // Ensure strategy array exists (migration)
    if (!loaded.strategy) loaded.strategy = [];
    return loaded;
  });
  
  const [activeTab, setActiveTab] = useState<Tab>('TODAY');

  // Persist on change
  useEffect(() => {
    saveData(data);
  }, [data]);

  const todayKey = getTodayKey();

  // --- Actions ---

  const addGoal = (text: string, motivation?: string) => {
    const activeCount = data.goals.filter(g => g.status === GoalStatus.ACTIVE).length;
    const isFull = activeCount >= MAX_ACTIVE_GOALS;
    
    const newGoal: Goal = {
      id: crypto.randomUUID(),
      text,
      motivation: motivation || '',
      status: isFull ? GoalStatus.BACKLOG : GoalStatus.ACTIVE,
      createdAt: Date.now()
    };
    setData(prev => ({ ...prev, goals: [...prev.goals, newGoal] }));
  };

  const completeGoal = (id: string) => {
    if(!window.confirm("Archive this goal?")) return;
    setData(prev => ({
      ...prev,
      goals: prev.goals.map(g => g.id === id ? { ...g, status: GoalStatus.COMPLETED, completedAt: Date.now() } : g)
    }));
  };

  const addStrategicItem = (item: StrategicItem) => {
      setData(prev => ({ ...prev, strategy: [...prev.strategy, item] }));
  };

  const deleteStrategicItem = (id: string) => {
      setData(prev => ({ ...prev, strategy: prev.strategy.filter(s => s.id !== id) }));
  };

  const addHabit = (text: string, goalId: string, type: HabitType) => {
    const newHabit: Habit = {
      id: crypto.randomUUID(),
      goalId,
      text,
      type,
      contributions: {}
    };
    setData(prev => ({ ...prev, habits: [...prev.habits, newHabit] }));
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

  // Todo Logic with Timestamp
  const addTodo = (text: string, goalId: string) => {
    if (!text.trim()) return;
    const newTodo: Todo = { 
      id: crypto.randomUUID(), 
      goalId, 
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
              return { ...t, completed: nowCompleted, completedAt: nowCompleted ? Date.now() : undefined };
          }
          return t;
      })
    }));
  };

  const deleteTodo = (id: string) => {
    setData(prev => ({ ...prev, todos: prev.todos.filter(t => t.id !== id) }));
  };

  return (
    <div className="min-h-screen bg-notion-bg text-notion-text font-sans selection:bg-gray-200 flex">
      
      {/* Print Styles */}
      <style>{`
        @media print {
            aside, .no-print, header { display: none !important; }
            main { padding: 0 !important; margin: 0 !important; width: 100% !important; }
        }
      `}</style>

      {/* Sidebar (Left, Fixed) */}
      <aside className="w-64 border-r border-notion-border h-screen sticky top-0 bg-notion-sidebar flex flex-col hidden md:flex z-50">
        <div className="p-6">
           <div className="w-8 h-8 bg-black text-white flex items-center justify-center rounded-sm font-serif font-bold text-lg mb-6">OS</div>
           
           <nav className="flex flex-col gap-1">
             <button onClick={() => setActiveTab('STRATEGY')} className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors ${activeTab === 'STRATEGY' ? 'bg-white text-black shadow-sm' : 'text-notion-dim hover:bg-notion-hover'}`}>
                <StrategyIcon className="w-4 h-4" /> Strategy
             </button>
             <button onClick={() => setActiveTab('TODAY')} className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors ${activeTab === 'TODAY' ? 'bg-white text-black shadow-sm' : 'text-notion-dim hover:bg-notion-hover'}`}>
                <Sun className="w-4 h-4" /> Today
             </button>
             <button onClick={() => setActiveTab('DASHBOARD')} className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors ${activeTab === 'DASHBOARD' ? 'bg-white text-black shadow-sm' : 'text-notion-dim hover:bg-notion-hover'}`}>
                <BarChart2 className="w-4 h-4" /> Dashboard
             </button>
             <button onClick={() => setActiveTab('COACH')} className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors ${activeTab === 'COACH' ? 'bg-white text-black shadow-sm' : 'text-notion-dim hover:bg-notion-hover'}`}>
                <Mic className="w-4 h-4" /> Coach
             </button>
           </nav>
        </div>

        <div className="mt-auto p-6 border-t border-notion-border">
           <div className="text-xs font-serif italic text-notion-dim">
              "Personal Operating System v3.0"
           </div>
        </div>
      </aside>

      {/* Mobile Tab Bar (Bottom) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-notion-border flex justify-around p-3 z-50 no-print">
        <button onClick={() => setActiveTab('STRATEGY')} className={`p-2 ${activeTab === 'STRATEGY' ? 'text-black' : 'text-notion-dim'}`}><StrategyIcon /></button>
        <button onClick={() => setActiveTab('TODAY')} className={`p-2 ${activeTab === 'TODAY' ? 'text-black' : 'text-notion-dim'}`}><Sun /></button>
        <button onClick={() => setActiveTab('DASHBOARD')} className={`p-2 ${activeTab === 'DASHBOARD' ? 'text-black' : 'text-notion-dim'}`}><BarChart2 /></button>
        <button onClick={() => setActiveTab('COACH')} className={`p-2 ${activeTab === 'COACH' ? 'text-black' : 'text-notion-dim'}`}><Mic /></button>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-12 overflow-y-auto max-h-screen">
        <header className="mb-8 md:mb-10 no-print">
            <h1 className="text-3xl font-serif font-medium tracking-tight">reThink 2026</h1>
        </header>

        <div className="max-w-4xl mx-auto h-full">
            {activeTab === 'STRATEGY' && (
                <StrategyTab 
                    data={data}
                    onAddStrategicItem={addStrategicItem}
                    onDeleteStrategicItem={deleteStrategicItem}
                    onAddGoal={addGoal}
                />
            )}
            {activeTab === 'TODAY' && (
                <TodayTab 
                    data={data}
                    todayKey={todayKey}
                    onAddGoal={addGoal}
                    onCompleteGoal={completeGoal}
                    onAddHabit={addHabit}
                    onToggleHabit={toggleHabit}
                    onDeleteHabit={deleteHabit}
                    onAddTodo={addTodo}
                    onToggleTodo={toggleTodo}
                    onDeleteTodo={deleteTodo}
                />
            )}
            {activeTab === 'DASHBOARD' && (
                <DashboardTab data={data} />
            )}
            {activeTab === 'COACH' && (
                <CoachTab data={data} />
            )}
        </div>
      </main>
    </div>
  );
};

export default App;
