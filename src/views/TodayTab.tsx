
import React, { useState, useRef, useMemo } from 'react';
import { AppData, GoalStatus, Todo, Milestone } from '../types';
import HabitTracker from '../components/HabitTracker';
import { Plus, Check, Trash2, ArrowRight, Sun, Moon, Zap, Feather, PenTool, CheckSquare, RefreshCw, Shield, Ban, Award, Sparkles, Map, Target } from '../components/Icon';
import { saveTodo, updateMilestoneStatus } from '../services/storage';

interface TodayTabProps {
  data: AppData;
  todayKey: string;
  onToggleHabit: (id: string, val: number) => void;
  onAddTodo: (text: string, goalId: string, milestoneId?: string, effort?: 'DEEP' | 'SHALLOW') => void;
  onToggleTodo: (id: string) => void;
  onEditTodo: (id: string, newText: string) => void;
  onUpdateTodo: (id: string, updates: Partial<Todo>) => void;
  onDeleteTodo: (id: string) => void;
  onNavigateToStrategy: () => void;
}

const TodayTab: React.FC<TodayTabProps> = ({
  data,
  todayKey,
  onToggleHabit,
  onAddTodo,
  onToggleTodo,
  onEditTodo,
  onUpdateTodo,
  onDeleteTodo,
  onNavigateToStrategy
}) => {
  // --- Refs for Navigation ---
  const todoSectionRef = useRef<HTMLElement>(null);
  const habitSectionRef = useRef<HTMLElement>(null);

  // --- Input State ---
  const [taskText, setTaskText] = useState('');
  const [selectedGoalId, setSelectedGoalId] = useState<string>('');
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string>('');
  const [effort, setEffort] = useState<'DEEP' | 'SHALLOW'>('SHALLOW');
  const [showRules, setShowRules] = useState(false);

  // --- Editing State ---
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  // --- Derived Data ---
  const activeGoals = data.goals.filter(g => g.status === GoalStatus.ACTIVE);
  const availableMilestones = activeGoals.find(g => g.id === selectedGoalId)?.milestones.filter(m => !m.completed) || [];

  // --- 1. SMART NUDGES LOGIC ---
  const smartNudges = useMemo(() => {
      const nudges: { milestone: Milestone, goalName: string }[] = [];
      activeGoals.forEach(goal => {
          const activeMilestones = goal.milestones.filter(m => !m.completed);
          activeMilestones.forEach(ms => {
              const pendingLinkedTodos = data.todos.filter(t => t.milestoneId === ms.id && !t.completed);
              const completedLinkedTodos = data.todos.filter(t => t.milestoneId === ms.id && t.completed);
              // Nudge if started but no pending tasks
              if (completedLinkedTodos.length > 0 && pendingLinkedTodos.length === 0) {
                  nudges.push({ milestone: ms, goalName: goal.text });
              }
          });
      });
      return nudges;
  }, [data.todos, activeGoals]);

  const currentMonthShort = new Date().toLocaleString('en-US', { month: 'short' });
  const monthlyMilestones = useMemo(() => {
      const list: { m: Milestone, goalName: string }[] = [];
      activeGoals.forEach(g => {
          g.milestones.forEach(m => {
              if (!m.completed && (m.targetMonth === currentMonthShort || !m.targetMonth)) {
                  list.push({ m, goalName: g.text });
              }
          });
      });
      return list;
  }, [activeGoals, currentMonthShort]);

  const handleCloseMilestone = async (ms: Milestone) => {
      await updateMilestoneStatus(ms.id, true);
      window.location.reload(); 
  };

  // --- 2. ACTION PLAN ---
  const todaysTodos = data.todos.filter(t => t.date === todayKey);
  const amTodos = todaysTodos.filter(t => !t.completed && t.block === 'AM');
  const pmTodos = todaysTodos.filter(t => !t.completed && t.block === 'PM');
  const unassignedTodos = todaysTodos.filter(t => !t.completed && !t.block);
  const completedTodos = todaysTodos.filter(t => t.completed).sort((a,b) => (b.completedAt||0) - (a.completedAt||0));

  // --- 3. SYSTEM (HABITS) ---
  const activeHabits = data.habits.filter(h => {
      const parentGoal = data.goals.find(g => g.id === h.goalId);
      return parentGoal?.status === GoalStatus.ACTIVE;
  });
  const pendingHabits = activeHabits.filter(h => (h.contributions[todayKey] || 0) === 0);
  const completedHabits = activeHabits.filter(h => (h.contributions[todayKey] || 0) > 0);

  // --- HANDLERS ---
  const handleAddTask = () => {
    if (!selectedGoalId || !taskText.trim()) return;
    onAddTodo(taskText, selectedGoalId, selectedMilestoneId || undefined, effort);
    setTaskText('');
    setEffort('SHALLOW');
  };

  const startEditing = (id: string, currentText: string) => {
      setEditingTodoId(id);
      setEditingText(currentText);
  };

  const saveEditing = (id: string) => {
      if (editingText.trim()) {
          onEditTodo(id, editingText);
      }
      setEditingTodoId(null);
  };

  const scrollToSection = (ref: React.RefObject<HTMLElement>) => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (activeGoals.length === 0) {
      return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 animate-fade-in">
              <div className="p-4 bg-gray-50 rounded-full border border-gray-100">
                  <Target className="w-8 h-8 text-gray-400" />
              </div>
              <div className="text-center">
                  <h2 className="text-xl font-serif font-medium mb-2">System Offline</h2>
                  <p className="text-notion-dim text-sm max-w-xs mx-auto">
                      You haven't defined your Critical 3 goals yet. 
                      Strategy determines execution.
                  </p>
              </div>
              <button 
                  onClick={onNavigateToStrategy}
                  className="px-6 py-3 bg-black text-white rounded-lg text-sm font-bold hover:scale-105 transition-transform shadow-lg"
              >
                  Define Strategy
              </button>
          </div>
      );
  }

  return (
    <div className="animate-fade-in pb-32 max-w-3xl mx-auto space-y-8 relative">
      
      {/* RULES OVERLAY */}
      {showRules && (
          <div className="absolute top-12 right-0 z-20 w-72 bg-white border border-notion-border rounded-xl shadow-xl p-4 animate-in fade-in zoom-in-95">
              <div className="flex justify-between items-center mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-notion-dim">The Code</h4>
                  <button onClick={() => setShowRules(false)} className="text-notion-dim hover:text-black">✕</button>
              </div>
              <div className="space-y-4">
                  {data.globalRules.prescriptions.map((r, i) => <div key={i} className="text-xs">• {r}</div>)}
                  {data.globalRules.prescriptions.length === 0 && <div className="text-xs text-gray-400">No rules.</div>}
              </div>
          </div>
      )}

      {/* HEADER */}
      <div className="flex justify-between items-start">
          <div>
              <div className="flex items-center gap-2 text-notion-dim mb-1">
                  <Sun className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-widest">Today's Focus</span>
              </div>
              <h2 className="text-3xl font-serif font-medium text-notion-text">Execution Mode</h2>
              <p className="text-notion-dim font-serif italic text-sm mt-1">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </div>
          <div className="flex gap-2 mt-2">
               <button onClick={() => setShowRules(!showRules)} className="p-2 bg-gray-100 rounded-full hover:bg-black hover:text-white transition-colors"><Shield className="w-4 h-4"/></button>
               <button onClick={() => scrollToSection(todoSectionRef)} className="p-2 bg-notion-sidebar rounded-full hover:bg-black hover:text-white transition-colors"><CheckSquare className="w-4 h-4"/></button>
               <button onClick={() => scrollToSection(habitSectionRef)} className="p-2 bg-notion-sidebar rounded-full hover:bg-black hover:text-white transition-colors"><RefreshCw className="w-4 h-4"/></button>
          </div>
      </div>

      {/* ================= SECTION 1: SMART NUDGES & MILESTONES ================= */}
      {(smartNudges.length > 0 || monthlyMilestones.length > 0) && (
          <section className="animate-in fade-in slide-in-from-top-4 space-y-4">
              {/* Nudges */}
              {smartNudges.map((nudge, i) => (
                  <div key={i} className="bg-purple-50 border border-purple-100 p-4 rounded-xl flex items-center justify-between shadow-sm">
                      <div>
                          <h4 className="font-bold text-sm text-purple-900">{nudge.milestone.text}</h4>
                          <p className="text-xs text-purple-700 mt-1">All tasks completed. Close this milestone?</p>
                          <div className="text-[10px] uppercase tracking-wider text-purple-400 mt-2 font-bold">{nudge.goalName}</div>
                      </div>
                      <button 
                          onClick={() => handleCloseMilestone(nudge.milestone)}
                          className="bg-purple-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-purple-700 transition-colors shadow-md flex items-center gap-2"
                      >
                          <Award className="w-4 h-4" /> Close
                      </button>
                  </div>
              ))}

              {/* Monthly Milestones */}
              {monthlyMilestones.length > 0 && (
                  <div className="bg-white border border-notion-border rounded-xl p-4">
                      <div className="flex items-center gap-2 text-notion-dim mb-3">
                          <Map className="w-4 h-4" />
                          <span className="text-xs font-bold uppercase tracking-widest">Active Milestones ({currentMonthShort})</span>
                      </div>
                      <div className="space-y-2">
                          {monthlyMilestones.map((item, i) => (
                              <div key={i} className="flex items-center gap-3 text-sm p-2 bg-notion-sidebar rounded">
                                  <div className="w-1.5 h-1.5 bg-black rounded-full"></div>
                                  <div className="flex-1">
                                      <div className="font-medium text-notion-text">{item.m.text}</div>
                                      <div className="text-[10px] text-notion-dim font-bold uppercase">{item.goalName}</div>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              )}
          </section>
      )}

      {/* ================= SECTION 2: ACTION PLAN ================= */}
      <section ref={todoSectionRef} className="scroll-mt-6">
        
        {/* ADD TASK INPUT */}
        <div className="bg-white p-2 rounded-xl border border-notion-border shadow-sm flex flex-col md:flex-row gap-2 mb-8 items-center focus-within:ring-2 focus-within:ring-notion-dim/20 transition-all">
             <div className="flex-1 w-full">
                 <input 
                    className="w-full p-2.5 bg-transparent text-sm font-medium placeholder:text-gray-400 outline-none"
                    placeholder="New action item..."
                    value={taskText}
                    onChange={e => setTaskText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                 />
             </div>
             
             <div className="flex gap-2 w-full md:w-auto overflow-x-auto md:overflow-visible pb-2 md:pb-0">
                 <select 
                    className="bg-notion-sidebar border border-notion-border rounded px-3 py-2 text-xs font-medium outline-none cursor-pointer hover:bg-gray-100 max-w-[120px] truncate"
                    value={selectedGoalId}
                    onChange={e => { setSelectedGoalId(e.target.value); setSelectedMilestoneId(''); }}
                 >
                     <option value="" disabled>Goal</option>
                     {activeGoals.map(g => <option key={g.id} value={g.id}>{g.text}</option>)}
                 </select>

                 <select 
                    className="bg-notion-sidebar border border-notion-border rounded px-3 py-2 text-xs font-medium outline-none cursor-pointer hover:bg-gray-100 max-w-[120px] truncate disabled:opacity-50"
                    value={selectedMilestoneId}
                    onChange={e => setSelectedMilestoneId(e.target.value)}
                    disabled={!selectedGoalId || availableMilestones.length === 0}
                 >
                     <option value="">Milestone?</option>
                     {availableMilestones.map(m => <option key={m.id} value={m.id}>{m.text}</option>)}
                 </select>

                 <button
                    onClick={() => setEffort(prev => prev === 'DEEP' ? 'SHALLOW' : 'DEEP')}
                    className={`flex items-center gap-1 px-3 py-2 rounded border text-xs font-bold transition-colors ${
                        effort === 'DEEP' 
                            ? 'bg-notion-text border-notion-text text-white' 
                            : 'bg-white border-notion-border text-notion-dim hover:border-black'
                    }`}
                 >
                    {effort === 'DEEP' ? <Zap className="w-3 h-3 fill-white" /> : <Feather className="w-3 h-3" />}
                 </button>

                 <button 
                    onClick={handleAddTask}
                    disabled={!taskText || !selectedGoalId}
                    className="bg-black text-white px-3 py-2 rounded hover:opacity-80 disabled:opacity-30 flex items-center justify-center min-w-[36px]"
                 >
                     <Plus className="w-4 h-4" />
                 </button>
             </div>
        </div>

        {/* LISTS */}
        <div className="space-y-6">
            
            {/* AM BLOCK */}
            {amTodos.length > 0 && (
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-notion-dim mb-2 flex items-center gap-2">
                        <Sun className="w-3 h-3" /> AM Block
                    </div>
                    <div className="space-y-2">
                        {amTodos.map(todo => <TodoItem key={todo.id} todo={todo} data={data} onToggle={onToggleTodo} onUpdate={onUpdateTodo} onDelete={onDeleteTodo} />)}
                    </div>
                </div>
            )}

            {/* PM BLOCK */}
            {pmTodos.length > 0 && (
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-notion-dim mb-2 flex items-center gap-2">
                        <Moon className="w-3 h-3" /> PM Block
                    </div>
                    <div className="space-y-2">
                        {pmTodos.map(todo => <TodoItem key={todo.id} todo={todo} data={data} onToggle={onToggleTodo} onUpdate={onUpdateTodo} onDelete={onDeleteTodo} />)}
                    </div>
                </div>
            )}

            {/* UNASSIGNED */}
            {unassignedTodos.length > 0 && (
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-notion-dim mb-2">Unassigned</div>
                    <div className="space-y-2">
                        {unassignedTodos.map(todo => <TodoItem key={todo.id} todo={todo} data={data} onToggle={onToggleTodo} onUpdate={onUpdateTodo} onDelete={onDeleteTodo} />)}
                    </div>
                </div>
            )}

            {completedTodos.length > 0 && (
                <div className="opacity-60 grayscale-[0.5] hover:grayscale-0 transition-all pt-4 border-t border-dashed border-gray-200">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-notion-dim mb-2">Done</div>
                    <div className="space-y-1">
                        {completedTodos.map(todo => (
                            <div key={todo.id} className="flex items-center gap-3 p-2">
                                <Check className="w-4 h-4 text-green-600" />
                                <span className="text-sm line-through text-gray-400">{todo.text}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
      </section>

      <hr className="border-notion-border" />

      {/* ================= SECTION 3: THE SYSTEM ================= */}
      <section ref={habitSectionRef} className="scroll-mt-6">
        <div className="mb-6">
            <div className="flex items-center gap-2 text-notion-dim mb-1">
                <RefreshCw className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-widest">The System</span>
            </div>
            <h2 className="text-2xl font-serif font-medium text-notion-text">Daily Habits</h2>
        </div>

        <div className="space-y-4">
             {pendingHabits.map(habit => {
                 const goal = data.goals.find(g => g.id === habit.goalId);
                 return (
                    <HabitTracker 
                        key={habit.id}
                        habit={habit}
                        goalName={goal?.text || 'Strategic'}
                        todayKey={todayKey}
                        onToggle={onToggleHabit}
                        onDelete={() => {}} 
                    />
                 );
             })}
             {completedHabits.length > 0 && (
                 <div className="opacity-60 pt-4">
                     {completedHabits.map(habit => {
                         const goal = data.goals.find(g => g.id === habit.goalId);
                         return (
                            <HabitTracker 
                                key={habit.id}
                                habit={habit}
                                goalName={goal?.text || 'Strategic'}
                                todayKey={todayKey}
                                onToggle={onToggleHabit}
                                onDelete={() => {}} 
                            />
                         );
                     })}
                 </div>
             )}
        </div>
      </section>

    </div>
  );
};

// --- SUB-COMPONENT: TODO ITEM ---
const TodoItem: React.FC<{todo: Todo, data: AppData, onToggle: any, onUpdate: any, onDelete: any}> = ({ todo, data, onToggle, onUpdate, onDelete }) => {
    const goal = data.goals.find(g => g.id === todo.goalId);
    const milestone = goal?.milestones?.find(m => m.id === todo.milestoneId);
    
    return (
        <div className="group flex items-center p-3 bg-white hover:bg-notion-sidebar rounded-lg transition-colors border border-notion-border hover:border-gray-300">
            <button 
                onClick={() => onToggle(todo.id)}
                className="flex-shrink-0 w-5 h-5 mr-4 border border-gray-300 rounded flex items-center justify-center transition-all bg-white hover:border-black"
            ></button>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-notion-text truncate">{todo.text}</span>
                    {todo.effort === 'DEEP' && <Zap className="w-3 h-3 text-notion-text fill-black" />}
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-notion-dim">{goal?.text}</span>
                    {milestone && (
                        <span className="text-[10px] text-gray-400 flex items-center gap-1 border-l border-gray-300 pl-2 truncate">
                            <ArrowRight className="w-2 h-2" /> {milestone.text}
                        </span>
                    )}
                </div>
            </div>
            <select 
                className="bg-transparent text-[10px] font-bold text-notion-dim hover:text-black border-none outline-none cursor-pointer text-right mr-2 uppercase"
                value={todo.block || ''}
                onChange={(e) => onUpdate(todo.id, { block: e.target.value || null })}
            >
                <option value="">--</option>
                <option value="AM">AM</option>
                <option value="PM">PM</option>
            </select>
            <button onClick={() => onDelete(todo.id)} className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-300 hover:text-red-500 transition-all">
                <Trash2 className="w-3 h-3" />
            </button>
        </div>
    );
};

export default TodayTab;
