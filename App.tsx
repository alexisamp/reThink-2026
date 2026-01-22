import React, { useState, useEffect } from 'react';
import { supabase, signOut } from './services/supabase';
import { loadData, saveGoal, deleteGoal, saveHabit, deleteHabit, saveWorkbook, deleteWorkbook, saveTodo, deleteTodo, saveReview, getTodayKey, INITIAL_DATA } from './services/storage';
import { AppData, Goal, Habit, Todo, WorkbookData, StrategicItem, GlobalRules } from './types';
import { Target as StrategyIcon, Sun, BarChart2, Mic, Lock } from './components/Icon'; 
import StrategyTab from './views/StrategyTab';
import TodayTab from './views/TodayTab';
import DashboardTab from './views/DashboardTab';
import CoachTab from './views/CoachTab';
import LoginView from './views/LoginView';

interface ErrorBoundaryProps {
  children?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Internal Error Boundary to prevent white screens
class AppErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  readonly props: Readonly<ErrorBoundaryProps>;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }
  
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("App Crash:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-8 text-center">
          <div>
            <h1 className="text-xl font-bold text-red-700 mb-2">Application Error</h1>
            <pre className="text-xs text-red-500 bg-white p-4 rounded border border-red-200 text-left overflow-auto max-w-lg">
              {this.state.error?.toString()}
            </pre>
            <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700">
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const AppContent: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [data, setData] = useState<AppData>(INITIAL_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'STRATEGY' | 'TODAY' | 'DASHBOARD' | 'COACH'>('TODAY');

  // Auth & Data Loading
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        initializeData(session.user.id);
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (_event === 'SIGNED_IN' && session) {
          initializeData(session.user.id);
      } else if (_event === 'SIGNED_OUT') {
          setData(INITIAL_DATA);
          setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const initializeData = async (userId: string) => {
      setIsLoading(true);
      const fetchedData = await loadData(userId);
      setData(fetchedData);
      setIsLoading(false);
  };

  const todayKey = getTodayKey();

  // --- ACTIONS ---
  // (Pass-throughs to storage service with optimistic updates)

  const handleReviewComplete = (wb: WorkbookData, active: Goal[], backlog: Goal[]) => {
      saveWorkbook(wb);
      [...active, ...backlog].forEach(g => saveGoal(g));
      
      const newGlobalStrategy: StrategicItem[] = [
          ...wb.strengths.map(s => ({ id: s.id, type: 'STRENGTH' as const, title: s.strength, tactic: s.application })),
          ...wb.weaknesses.map(w => ({ id: w.id, type: 'WEAKNESS' as const, title: w.weakness, tactic: w.workaround }))
      ];
      
      setData(prev => ({
          ...prev,
          workbookReviews: { ...prev.workbookReviews, [wb.year]: wb },
          goals: [...active, ...backlog],
          strategy: newGlobalStrategy,
          globalRules: { prescriptions: [...wb.rulesProsper, ...wb.rulesProtect, ...wb.rulesLimit], antiGoals: [] }
      }));
  };

  const deleteWorkbookAction = async (year: string, deleteGoals: boolean, deleteHabits: boolean) => {
      // 1. Call DB Delete with flags
      await deleteWorkbook(year, deleteGoals, deleteHabits);
      
      // 2. Cleanup Local State
      setData(prev => {
          const workbookToDelete = prev.workbookReviews[year];
          let goalIdsToDelete: string[] = [];
          
          if (workbookToDelete) {
              const activeIds = workbookToDelete.criticalThree?.map(g => g.id) || [];
              const backlogIds = workbookToDelete.backlogGoals?.map(g => g.id) || [];
              goalIdsToDelete = [...activeIds, ...backlogIds];
          }

          let newGoals = prev.goals;
          let newHabits = prev.habits;
          let newTodos = prev.todos;

          // If deleting goals, remove goals, habits, and todos linked to them
          if (deleteGoals && goalIdsToDelete.length > 0) {
              newGoals = prev.goals.filter(g => !goalIdsToDelete.includes(g.id));
              newHabits = prev.habits.filter(h => !goalIdsToDelete.includes(h.goalId));
              newTodos = prev.todos.filter(t => !goalIdsToDelete.includes(t.goalId));
          } 
          // If NOT deleting goals but deleting habits, keep goals but remove habits/todos
          else if (deleteHabits && goalIdsToDelete.length > 0) {
              newHabits = prev.habits.filter(h => !goalIdsToDelete.includes(h.goalId));
              newTodos = prev.todos.filter(t => !goalIdsToDelete.includes(t.goalId));
          }

          const newReviews = { ...prev.workbookReviews };
          delete newReviews[year];
          
          return { 
              ...prev, 
              workbookReviews: newReviews,
              goals: newGoals,
              habits: newHabits,
              todos: newTodos
          };
      });
  };

  const updateGoal = (g: Goal) => {
    saveGoal(g);
    setData(prev => ({ ...prev, goals: prev.goals.map(x => x.id === g.id ? g : x) }));
  };

  const deleteGoalAction = (id: string) => {
    if(!window.confirm("Delete goal permanently?")) return;
    deleteGoal(id);
    setData(prev => ({
      ...prev,
      goals: prev.goals.filter(g => g.id !== id),
      habits: prev.habits.filter(h => h.goalId !== id),
      todos: prev.todos.filter(t => t.goalId !== id)
    }));
  };

  const addHabitAction = (h: Habit) => {
    saveHabit(h);
    setData(prev => ({ ...prev, habits: [...prev.habits, h] }));
  };

  const toggleHabitAction = (id: string, value: number) => {
    const habit = data.habits.find(h => h.id === id);
    if (!habit) return;
    const newContrib = { ...habit.contributions, [todayKey]: value };
    if (value === 0) delete newContrib[todayKey];
    
    const updated = { ...habit, contributions: newContrib };
    saveHabit(updated);
    setData(prev => ({ ...prev, habits: prev.habits.map(h => h.id === id ? updated : h) }));
  };

  const deleteHabitAction = (id: string) => {
    deleteHabit(id);
    setData(prev => ({ ...prev, habits: prev.habits.filter(h => h.id !== id) }));
  };

  const addTodoAction = (text: string, goalId: string, milestoneId?: string, effort?: 'DEEP' | 'SHALLOW') => {
    const newTodo: Todo = { 
      id: crypto.randomUUID(), goalId, milestoneId, text, effort: effort || 'SHALLOW', completed: false, date: todayKey 
    };
    saveTodo(newTodo);
    setData(prev => ({ ...prev, todos: [...prev.todos, newTodo] }));
  };
  
  const toggleTodoAction = (id: string) => {
    const todo = data.todos.find(t => t.id === id);
    if (!todo) return;
    const updated = { ...todo, completed: !todo.completed, completedAt: !todo.completed ? Date.now() : undefined };
    saveTodo(updated);
    setData(prev => ({ ...prev, todos: prev.todos.map(t => t.id === id ? updated : t) }));
  };

  const editTodoAction = (id: string, text: string) => {
    const todo = data.todos.find(t => t.id === id);
    if (!todo) return;
    const updated = { ...todo, text };
    saveTodo(updated);
    setData(prev => ({ ...prev, todos: prev.todos.map(t => t.id === id ? updated : t) }));
  };

  const updateTodoAction = (id: string, updates: Partial<Todo>) => {
    const todo = data.todos.find(t => t.id === id);
    if (!todo) return;
    const updated = { ...todo, ...updates };
    saveTodo(updated);
    setData(prev => ({ ...prev, todos: prev.todos.map(t => t.id === id ? updated : t) }));
  };

  const deleteTodoAction = (id: string) => {
    deleteTodo(id);
    setData(prev => ({ ...prev, todos: prev.todos.filter(t => t.id !== id) }));
  };

  // --- RENDER ---

  if (isLoading) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-white">
              <div className="flex flex-col items-center animate-pulse">
                  <div className="w-12 h-12 bg-black rounded-lg mb-4"></div>
                  <div className="text-sm font-serif italic text-gray-500">Syncing database...</div>
              </div>
          </div>
      );
  }

  if (!session) {
      return <LoginView />;
  }

  return (
    <div className="min-h-screen bg-white text-[#37352F] font-sans flex">
      <style>{`@media print { aside, .no-print { display: none !important; } main { width: 100% !important; } }`}</style>

      {/* Sidebar */}
      <aside className="w-64 border-r border-[#E9E9E7] h-screen sticky top-0 bg-[#F7F7F5] flex flex-col hidden md:flex z-50">
        <div className="p-8">
           <div className="w-10 h-10 bg-black text-white flex items-center justify-center rounded font-serif font-bold text-xl mb-8">OS</div>
           <nav className="flex flex-col gap-2">
             <button onClick={() => setActiveTab('STRATEGY')} className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors ${activeTab === 'STRATEGY' ? 'bg-white text-black shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:bg-[#EFEFED]'}`}>
                <StrategyIcon className="w-4 h-4" /> Strategy
             </button>
             <button onClick={() => setActiveTab('TODAY')} className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors ${activeTab === 'TODAY' ? 'bg-white text-black shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:bg-[#EFEFED]'}`}>
                <Sun className="w-4 h-4" /> Today
             </button>
             <button onClick={() => setActiveTab('DASHBOARD')} className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors ${activeTab === 'DASHBOARD' ? 'bg-white text-black shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:bg-[#EFEFED]'}`}>
                <BarChart2 className="w-4 h-4" /> Dashboard
             </button>
             <button onClick={() => setActiveTab('COACH')} className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors ${activeTab === 'COACH' ? 'bg-white text-black shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:bg-[#EFEFED]'}`}>
                <Mic className="w-4 h-4" /> Coach
             </button>
           </nav>
        </div>
        <div className="mt-auto p-8 border-t border-[#E9E9E7]">
           <div className="text-[10px] uppercase tracking-widest text-gray-500 font-medium mb-4 truncate">{session.user.email}</div>
           <button onClick={() => signOut()} className="flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-black transition-colors">
               <Lock className="w-3 h-3" /> Sign Out
           </button>
        </div>
      </aside>

      {/* Mobile Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#E9E9E7] flex justify-around p-3 z-50 no-print safe-area-bottom">
        <button onClick={() => setActiveTab('STRATEGY')} className={`p-2 ${activeTab === 'STRATEGY' ? 'text-black' : 'text-gray-400'}`}><StrategyIcon /></button>
        <button onClick={() => setActiveTab('TODAY')} className={`p-2 ${activeTab === 'TODAY' ? 'text-black' : 'text-gray-400'}`}><Sun /></button>
        <button onClick={() => setActiveTab('DASHBOARD')} className={`p-2 ${activeTab === 'DASHBOARD' ? 'text-black' : 'text-gray-400'}`}><BarChart2 /></button>
        <button onClick={() => setActiveTab('COACH')} className={`p-2 ${activeTab === 'COACH' ? 'text-black' : 'text-gray-400'}`}><Mic /></button>
      </div>

      {/* Main */}
      <main className="flex-1 p-6 md:p-16 overflow-y-auto max-h-screen">
        <div className="max-w-6xl mx-auto min-h-full pb-24">
            {activeTab === 'STRATEGY' && (
                <StrategyTab 
                    data={data}
                    onUpdateGoal={updateGoal}
                    onDeleteGoal={deleteGoalAction}
                    onAddHabit={addHabitAction}
                    onDeleteHabit={deleteHabitAction}
                    onCompleteReview={handleReviewComplete}
                    onDeleteWorkbook={deleteWorkbookAction}
                    onAddStrategicItem={() => {}} onDeleteStrategicItem={() => {}} onAddGoal={() => {}} onUpdateGlobalRules={() => {}} onUpdateFullData={() => {}} 
                />
            )}
            {activeTab === 'TODAY' && (
                <TodayTab 
                    data={data}
                    todayKey={todayKey}
                    onToggleHabit={toggleHabitAction}
                    onAddTodo={addTodoAction}
                    onToggleTodo={toggleTodoAction}
                    onEditTodo={editTodoAction}
                    onUpdateTodo={updateTodoAction}
                    onDeleteTodo={deleteTodoAction}
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

const App: React.FC = () => {
  return (
    <AppErrorBoundary>
      <AppContent />
    </AppErrorBoundary>
  );
};

export default App;
