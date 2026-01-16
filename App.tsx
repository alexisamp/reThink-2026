import React, { useState, useEffect } from 'react';
import { loadData, saveData, getTodayKey } from './services/storage';
import { AppData, Goal, Habit, Todo, GoalStatus, HabitType } from './types';
import { Calendar, Trash2, Check, Ban, X, Target, Layout, Brain } from './components/Icon';
import FocusTab from './views/FocusTab';
import StrategyTab from './views/StrategyTab';
import ReviewTab from './views/ReviewTab';

const MAX_ACTIVE_GOALS = 3;
type Tab = 'FOCUS' | 'STRATEGY' | 'REVIEW';

const App: React.FC = () => {
  const [data, setData] = useState<AppData>(loadData());
  const [activeTab, setActiveTab] = useState<Tab>('FOCUS');
  const [newTodoText, setNewTodoText] = useState('');

  // Persist on change
  useEffect(() => {
    saveData(data);
  }, [data]);

  const todayKey = getTodayKey();

  // --- Actions ---

  const addGoal = (text: string) => {
    const activeCount = data.goals.filter(g => g.status === GoalStatus.ACTIVE).length;
    const isFull = activeCount >= MAX_ACTIVE_GOALS;
    
    const newGoal: Goal = {
      id: crypto.randomUUID(),
      text,
      status: isFull ? GoalStatus.BACKLOG : GoalStatus.ACTIVE,
      createdAt: Date.now()
    };
    setData(prev => ({ ...prev, goals: [...prev.goals, newGoal] }));
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
      habits: prev.habits.filter(h => h.goalId !== id)
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

  // --- Todo Logic ---
  const addTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoText.trim()) return;
    const newTodo: Todo = { id: crypto.randomUUID(), text: newTodoText, completed: false, date: todayKey };
    setData(prev => ({ ...prev, todos: [...prev.todos, newTodo] }));
    setNewTodoText('');
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

  // --- Non Negotiable Logic (Inverse Habits) ---
  const nonNegotiables = data.habits.filter(h => h.type === HabitType.NON_NEGOTIABLE);
  
  const addNonNegotiable = () => {
      const text = prompt("Enter a bad habit to avoid (e.g., 'No Social Media'):");
      if(text) addHabit(text, 'global', HabitType.NON_NEGOTIABLE);
  };

  const addReview = (text: string) => {
      setData(prev => ({
          ...prev,
          reviews: [...prev.reviews, { date: todayKey, text }]
      }));
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
          <div className="flex justify-between items-center mb-4">
             <h3 className="text-xs font-bold text-notion-dim uppercase tracking-wider">Non-Negotiables</h3>
             <button onClick={addNonNegotiable} className="text-notion-dim hover:text-black"><PlusIcon className="w-3 h-3"/></button>
          </div>
          <div className="space-y-2">
            {nonNegotiables.map(h => {
                const failed = !!h.contributions[todayKey];
                return (
                    <div key={h.id} className="flex items-center justify-between text-sm group">
                        <span className={`truncate ${failed ? 'line-through text-red-400' : 'text-notion-text'}`}>{h.text}</span>
                        <div className="flex items-center gap-1">
                            <button 
                                onClick={() => toggleHabit(h.id, failed ? 0 : 1)}
                                className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${failed ? 'bg-red-100 border-red-200 text-red-600' : 'bg-green-100 border-green-200 text-green-700 hover:bg-green-200'}`}
                                title={failed ? "Click to reset (Undo failure)" : "Click if you failed"}
                            >
                                {failed ? <X className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
                            </button>
                            <button onClick={() => deleteHabit(h.id)} className="opacity-0 group-hover:opacity-100 text-notion-dim hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                        </div>
                    </div>
                );
            })}
             {nonNegotiables.length === 0 && <div className="text-xs text-notion-dim">No strict habits defined.</div>}
          </div>
        </div>
      </aside>

      {/* Mobile Tab Bar (Bottom) - Visible only on small screens */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-notion-border flex justify-around p-3 z-50">
        <button onClick={() => setActiveTab('FOCUS')} className={`p-2 ${activeTab === 'FOCUS' ? 'text-black' : 'text-notion-dim'}`}><Target /></button>
        <button onClick={() => setActiveTab('STRATEGY')} className={`p-2 ${activeTab === 'STRATEGY' ? 'text-black' : 'text-notion-dim'}`}><Layout /></button>
        <button onClick={() => setActiveTab('REVIEW')} className={`p-2 ${activeTab === 'REVIEW' ? 'text-black' : 'text-notion-dim'}`}><Brain /></button>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-12 overflow-y-auto max-h-screen">
        <header className="mb-8 md:mb-12">
            <h1 className="text-3xl font-serif font-medium tracking-tight">reThink 2026</h1>
            <p className="text-notion-dim font-serif italic mt-2">
                {activeTab === 'FOCUS' && "Execute on the essential."}
                {activeTab === 'STRATEGY' && "Zoom out to see the pattern."}
                {activeTab === 'REVIEW' && "Reflect to refine."}
            </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            {/* View Area */}
            <div className="lg:col-span-8 pb-20 md:pb-0">
                {activeTab === 'FOCUS' && (
                    <FocusTab 
                        data={data} 
                        todayKey={todayKey}
                        onAddGoal={addGoal}
                        onCompleteGoal={completeGoal}
                        onAddHabit={addHabit}
                        onToggleHabit={toggleHabit}
                        onDeleteHabit={deleteHabit}
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
                    />
                )}
            </div>

            {/* Right Column: Daily Actions (Persistent in Focus/Strategy, or simplified) */}
            <div className="lg:col-span-4 hidden lg:block">
                 <div className="bg-notion-sidebar p-5 rounded-md border border-notion-border sticky top-6">
                  <h2 className="text-lg font-serif font-medium mb-4 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Today's Actions
                  </h2>
                  
                  <form onSubmit={addTodo} className="mb-4">
                     <input 
                      type="text" 
                      value={newTodoText}
                      onChange={(e) => setNewTodoText(e.target.value)}
                      placeholder="+ Add task"
                      className="w-full bg-transparent border-b border-transparent focus:border-notion-dim outline-none text-sm pb-1 placeholder:text-notion-dim"
                    />
                  </form>

                  <div className="space-y-2 max-h-[50vh] overflow-y-auto hide-scrollbar">
                    {data.todos.filter(t => t.date === todayKey).map(todo => (
                      <div key={todo.id} className="group flex items-start gap-2 text-sm">
                        <button 
                          onClick={() => toggleTodo(todo.id)}
                          className={`mt-0.5 min-w-[16px] h-4 flex items-center justify-center rounded border transition-all ${
                            todo.completed ? 'bg-black border-black text-white' : 'bg-white border-gray-400 hover:border-black'
                          }`}
                        >
                          {todo.completed && <Check className="w-2.5 h-2.5" />}
                        </button>
                        <span className={`flex-1 transition-all ${todo.completed ? 'text-notion-dim line-through decoration-notion-dim' : ''}`}>
                          {todo.text}
                        </span>
                        <button 
                          onClick={() => deleteTodo(todo.id)}
                          className="opacity-0 group-hover:opacity-100 text-notion-dim hover:text-red-500"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                     {data.todos.filter(t => t.date === todayKey).length === 0 && (
                        <div className="text-xs text-notion-dim italic text-center py-4">Nothing scheduled.</div>
                     )}
                  </div>
                </div>
            </div>
        </div>
      </main>
    </div>
  );
};

// Simple Plus Icon helper since I used it inline
const PlusIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M5 12h14"/><path d="M12 5v14"/></svg>
);

export default App;
