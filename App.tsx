import React, { useState, useEffect } from 'react';
import { loadData, saveData, getTodayKey } from './services/storage';
import { AppData, Goal, Habit, Todo, GoalStatus, HabitType, DayRating } from './types';
import { Calendar, Trash2, Check, Ban, X, Target, Layout, Brain } from './components/Icon';
import FocusTab from './views/FocusTab';
import StrategyTab from './views/StrategyTab';
import ReviewTab from './views/ReviewTab';

const MAX_ACTIVE_GOALS = 3;
type Tab = 'FOCUS' | 'STRATEGY' | 'REVIEW';

const App: React.FC = () => {
  const [data, setData] = useState<AppData>(loadData());
  const [activeTab, setActiveTab] = useState<Tab>('FOCUS');

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

  const updateGoalMotivation = (id: string, motivation: string) => {
    setData(prev => ({
      ...prev,
      goals: prev.goals.map(g => g.id === id ? { ...g, motivation } : g)
    }));
  };

  const completeGoal = (id: string) => {
    if(!window.confirm("Archive this goal?")) return;
    setData(prev => ({
      ...prev,
      goals: prev.goals.map(g => g.id === id ? { ...g, status: GoalStatus.COMPLETED } : g)
    }));
  };

  const promoteGoal = (id: string) => {
    const activeCount = data.goals.filter(g => g.status === GoalStatus.ACTIVE).length;
    if (activeCount >= MAX_ACTIVE_GOALS) {
      alert(`Complete an active goal first. Limit is ${MAX_ACTIVE_GOALS}.`);
      return;
    }
    setData(prev => ({
      ...prev,
      goals: prev.goals.map(g => g.id === id ? { ...g, status: GoalStatus.ACTIVE } : g)
    }));
  };

  const deleteGoal = (id: string) => {
    if(!window.confirm("Delete goal?")) return;
    setData(prev => ({
      ...prev,
      goals: prev.goals.filter(g => g.id !== id),
      habits: prev.habits.filter(h => h.goalId !== id),
      todos: prev.todos.filter(t => t.goalId !== id)
    }));
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
            // Depending on logic, 0 might mean "removed" or "failed".
            // For data sparsity, we usually remove the key if it's "undone", 
            // but for Non-Negotiables, explicit 0 might be useful.
            // We will stick to: Key missing = undefined/not done. 
            // BUT for Non-Negotiables in ReviewTab, we will treat 'undefined' as Success visually until marked otherwise.
            // Let's stick to standard: 0 = Delete key.
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

  // --- Todo Logic (Updated for Goal-Centricity) ---
  const addTodo = (text: string, goalId: string, link?: string) => {
    if (!text.trim()) return;
    const newTodo: Todo = { 
      id: crypto.randomUUID(), 
      goalId, 
      text, 
      completed: false, 
      externalLink: link,
      date: todayKey 
    };
    setData(prev => ({ ...prev, todos: [...prev.todos, newTodo] }));
  };
  
  const toggleTodo = (id: string) => {
    setData(prev => ({
      ...prev,
      todos: prev.todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t)
    }));
  };

  const deleteTodo = (id: string) => {
    setData(prev => ({ ...prev, todos: prev.todos.filter(t => t.id !== id) }));
  };

  // --- Review Logic ---
  const addReview = (text: string, easyMode: boolean, energy: number, rating: DayRating) => {
      // Remove existing review for today if exists to allow update
      const filteredReviews = data.reviews.filter(r => r.date !== todayKey);
      
      setData(prev => ({
          ...prev,
          reviews: [...filteredReviews, { 
            date: todayKey, 
            text, 
            easyMode, 
            energyLevel: energy, 
            dayRating: rating 
          }]
      }));
  };

  // --- Helper for Day Rating Calculation ---
  // Returns tuple: [Rating, Percentage]
  const calculateDayStatus = (): [DayRating, number] => {
    const activeHabits = data.habits.filter(h => {
        const goal = data.goals.find(g => g.id === h.goalId);
        return goal?.status === GoalStatus.ACTIVE && h.type !== HabitType.NON_NEGOTIABLE;
    });

    const nonNegotiables = data.habits.filter(h => h.type === HabitType.NON_NEGOTIABLE);

    if (activeHabits.length === 0 && nonNegotiables.length === 0) return ['GRAY', 0];

    // Habits: 1 point if done (>0). 
    let habitPoints = 0;
    activeHabits.forEach(h => {
        if ((h.contributions[todayKey] || 0) > 0) habitPoints++;
    });

    // Non-Negotiables: Default is "Success" (1). If they explicitly marked it 0 (which we might store as special value, 
    // but simplified: Let's assume user explicitly marks failures).
    // Actually, in the UI (ReviewTab), we will toggle them.
    // Let's assume: If key exists and is 1 = Success. Key missing = Success (default state).
    // Wait, tracking "Bad Habits" usually requires explicit tracking of "I did it".
    // Let's Standardize: 1 in DB means "I kept the rule". 0/undefined means "I haven't logged it yet" OR "I failed".
    // To make "Day Rating" accurate, the user MUST review the day.
    
    // For calculation purposes, let's just count Active Habits % for now, 
    // as Non-Negotiables are often subjective until the nightly review.
    const percentage = activeHabits.length > 0 ? Math.round((habitPoints / activeHabits.length) * 100) : 0;
    
    // Simple Heuristic
    if (percentage === 100) return ['GOLD', 100];
    if (percentage >= 75) return ['GREEN', percentage];
    return ['GRAY', percentage];
  };

  return (
    <div className="min-h-screen bg-notion-bg text-notion-text font-sans selection:bg-gray-200 flex">
      
      {/* Sidebar (Left, Fixed) */}
      <aside className="w-64 border-r border-notion-border h-screen sticky top-0 bg-notion-sidebar flex flex-col hidden md:flex">
        <div className="p-6">
           <div className="w-8 h-8 bg-black text-white flex items-center justify-center rounded-sm font-serif font-bold text-lg mb-6">R</div>
           
           <nav className="flex flex-col gap-1">
             <button onClick={() => setActiveTab('FOCUS')} className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors ${activeTab === 'FOCUS' ? 'bg-white text-black shadow-sm' : 'text-notion-dim hover:bg-notion-hover'}`}>
                <Target className="w-4 h-4" /> Focus
             </button>
             <button onClick={() => setActiveTab('STRATEGY')} className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors ${activeTab === 'STRATEGY' ? 'bg-white text-black shadow-sm' : 'text-notion-dim hover:bg-notion-hover'}`}>
                <Layout className="w-4 h-4" /> Strategy
             </button>
             <button onClick={() => setActiveTab('REVIEW')} className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors ${activeTab === 'REVIEW' ? 'bg-white text-black shadow-sm' : 'text-notion-dim hover:bg-notion-hover'}`}>
                <Brain className="w-4 h-4" /> Review
             </button>
           </nav>
        </div>

        <div className="mt-auto p-6 border-t border-notion-border">
           <div className="text-xs font-serif italic text-notion-dim">
              "We do not rise to the level of our goals. We fall to the level of our systems."
           </div>
        </div>
      </aside>

      {/* Mobile Tab Bar (Bottom) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-notion-border flex justify-around p-3 z-50">
        <button onClick={() => setActiveTab('FOCUS')} className={`p-2 ${activeTab === 'FOCUS' ? 'text-black' : 'text-notion-dim'}`}><Target /></button>
        <button onClick={() => setActiveTab('STRATEGY')} className={`p-2 ${activeTab === 'STRATEGY' ? 'text-black' : 'text-notion-dim'}`}><Layout /></button>
        <button onClick={() => setActiveTab('REVIEW')} className={`p-2 ${activeTab === 'REVIEW' ? 'text-black' : 'text-notion-dim'}`}><Brain /></button>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-12 overflow-y-auto max-h-screen">
        <header className="mb-8 md:mb-10 flex justify-between items-end">
            <div>
                <h1 className="text-3xl font-serif font-medium tracking-tight">reThink 2026</h1>
                <p className="text-notion-dim font-serif italic mt-2">
                    {activeTab === 'FOCUS' && "AM Ritual: Define & Execute."}
                    {activeTab === 'STRATEGY' && "Zoom out: The Long Game."}
                    {activeTab === 'REVIEW' && "PM Ritual: Reflect & Rate."}
                </p>
            </div>
            {/* Mini Status Indicator */}
            {activeTab === 'FOCUS' && (
                <div className="hidden md:block">
                    <span className="text-xs font-mono border border-notion-border px-2 py-1 rounded text-notion-dim">
                        Day Status: {calculateDayStatus()[1]}%
                    </span>
                </div>
            )}
        </header>

        <div className="max-w-4xl mx-auto">
            {activeTab === 'FOCUS' && (
                <FocusTab 
                    data={data} 
                    todayKey={todayKey}
                    onAddGoal={addGoal}
                    onUpdateGoalMotivation={updateGoalMotivation}
                    onCompleteGoal={completeGoal}
                    onAddHabit={addHabit}
                    onToggleHabit={toggleHabit}
                    onDeleteHabit={deleteHabit}
                    onAddTodo={addTodo}
                    onToggleTodo={toggleTodo}
                    onDeleteTodo={deleteTodo}
                />
            )}
            {activeTab === 'STRATEGY' && (
                <StrategyTab 
                    data={data}
                    onPromoteGoal={promoteGoal}
                    onDeleteGoal={deleteGoal}
                />
            )}
            {activeTab === 'REVIEW' && (
                <ReviewTab 
                    data={data}
                    todayKey={todayKey}
                    onAddReview={addReview}
                    onToggleHabit={toggleHabit}
                />
            )}
        </div>
      </main>
    </div>
  );
};

export default App;
