import React, { useState } from 'react';
import { AppData, GoalStatus } from '../types';
import HabitTracker from '../components/HabitTracker';
import { Plus, Check, Trash2, ArrowRight, Sun, Moon, Zap, Feather } from '../components/Icon';

interface TodayTabProps {
  data: AppData;
  todayKey: string;
  onToggleHabit: (id: string, val: number) => void;
  onAddTodo: (text: string, goalId: string, milestoneId?: string, effort?: 'DEEP' | 'SHALLOW') => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
}

const TodayTab: React.FC<TodayTabProps> = ({
  data,
  todayKey,
  onToggleHabit,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo
}) => {
  // --- Input State ---
  const [taskText, setTaskText] = useState('');
  const [selectedGoalId, setSelectedGoalId] = useState<string>('');
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string>('');
  const [effort, setEffort] = useState<'DEEP' | 'SHALLOW'>('SHALLOW');

  // --- Derived Data ---
  const activeGoals = data.goals.filter(g => g.status === GoalStatus.ACTIVE);
  
  // Tasks: Show today's tasks OR incomplete tasks from the past (carry-over)
  const activeTodos = data.todos.filter(t => {
      if (t.completed && t.date !== todayKey) return false; // Hide old completed
      if (t.date === todayKey) return true; // Show all today
      if (!t.completed && t.date < todayKey) return true; // Show past overdue
      return false;
  }).sort((a, b) => (a.completed === b.completed ? 0 : a.completed ? 1 : -1)); // Sort incomplete first

  const activeHabits = data.habits.filter(h => {
      const parentGoal = data.goals.find(g => g.id === h.goalId);
      return parentGoal?.status === GoalStatus.ACTIVE;
  });

  // Group Habits
  const pendingHabits = activeHabits.filter(h => (h.contributions[todayKey] || 0) === 0);
  const completedHabits = activeHabits.filter(h => (h.contributions[todayKey] || 0) > 0);

  // Milestone logic: Show ALL milestones for the selected goal (removed .filter(m => !m.completed))
  const availableMilestones = activeGoals.find(g => g.id === selectedGoalId)?.milestones || [];

  const handleAddTask = () => {
    if (!selectedGoalId || !taskText.trim()) return;
    (onAddTodo as any)(taskText, selectedGoalId, selectedMilestoneId || undefined, effort);
    setTaskText('');
    setEffort('SHALLOW');
  };

  const handleSchedule = (id: string, timestamp: number) => {
    console.log(`Scheduled habit ${id} at ${timestamp}`);
  };

  return (
    <div className="animate-fade-in pb-32 max-w-3xl mx-auto space-y-16">
      
      {/* ================= AM BLOCK: PLANNING ================= */}
      <section>
        <div className="mb-6">
            <div className="flex items-center gap-2 text-notion-dim mb-1">
                <Sun className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-widest">AM • Planning</span>
            </div>
            <h2 className="text-3xl font-serif font-medium text-notion-text">Today's Action Plan</h2>
            <p className="text-notion-dim font-serif italic text-sm mt-1">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>

        {/* --- Inverted Input Row --- */}
        <div className="bg-white p-2 rounded-xl border border-notion-border shadow-sm flex flex-col md:flex-row gap-2 mb-8 items-center focus-within:ring-2 focus-within:ring-notion-dim/20 transition-all">
             {/* 1. Task Text (Grow) */}
             <div className="flex-1 w-full">
                 <input 
                    className="w-full p-2.5 bg-transparent text-sm font-medium placeholder:text-gray-400 outline-none"
                    placeholder="Write a task..."
                    value={taskText}
                    onChange={e => setTaskText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                    autoFocus
                 />
             </div>
             
             <div className="flex gap-2 w-full md:w-auto overflow-x-auto md:overflow-visible pb-2 md:pb-0">
                 {/* 2. Goal Select */}
                 <select 
                    className="bg-notion-sidebar border border-notion-border rounded px-3 py-2 text-xs font-medium outline-none cursor-pointer hover:bg-gray-100 max-w-[120px] truncate"
                    value={selectedGoalId}
                    onChange={e => { setSelectedGoalId(e.target.value); setSelectedMilestoneId(''); }}
                 >
                     <option value="" disabled>Goal</option>
                     {activeGoals.map(g => <option key={g.id} value={g.id}>{g.text}</option>)}
                 </select>

                 {/* 3. Milestone Select */}
                 <select 
                    className="bg-notion-sidebar border border-notion-border rounded px-3 py-2 text-xs font-medium outline-none cursor-pointer hover:bg-gray-100 max-w-[120px] truncate disabled:opacity-50"
                    value={selectedMilestoneId}
                    onChange={e => setSelectedMilestoneId(e.target.value)}
                    disabled={!selectedGoalId || availableMilestones.length === 0}
                 >
                     <option value="">Milestone?</option>
                     {availableMilestones.map(m => <option key={m.id} value={m.id}>{m.text}</option>)}
                 </select>

                 {/* 4. Effort Toggle (New Minimal Style) */}
                 <button
                    onClick={() => setEffort(prev => prev === 'DEEP' ? 'SHALLOW' : 'DEEP')}
                    className={`flex items-center gap-1 px-3 py-2 rounded border text-xs font-bold transition-colors ${
                        effort === 'DEEP' 
                            ? 'bg-notion-text border-notion-text text-white' 
                            : 'bg-white border-notion-border text-notion-dim hover:border-black'
                    }`}
                    title={effort === 'DEEP' ? "High Energy / Deep Work" : "Low Energy / Admin"}
                 >
                    {effort === 'DEEP' ? <Zap className="w-3 h-3 fill-white" /> : <Feather className="w-3 h-3" />}
                    <span className="hidden md:inline">{effort === 'DEEP' ? 'Deep' : 'Shallow'}</span>
                 </button>

                 {/* 5. Add Button */}
                 <button 
                    onClick={handleAddTask}
                    disabled={!taskText || !selectedGoalId}
                    className="bg-black text-white px-3 py-2 rounded hover:opacity-80 disabled:opacity-30 flex items-center justify-center min-w-[36px]"
                 >
                     <Plus className="w-4 h-4" />
                 </button>
             </div>
        </div>

        {/* --- Task List --- */}
        <div className="space-y-1">
            {activeTodos.length === 0 && (
                <div className="text-center py-10 border-2 border-dashed border-notion-border rounded-xl">
                    <p className="text-notion-dim text-sm italic">No active tasks. Plan your victory.</p>
                </div>
            )}
            
            {activeTodos.map(todo => {
                const goal = data.goals.find(g => g.id === todo.goalId);
                const milestone = goal?.milestones?.find(m => m.id === todo.milestoneId);
                const isOverdue = !todo.completed && todo.date < todayKey;

                return (
                    <div key={todo.id} className="group flex items-center p-3 hover:bg-notion-sidebar rounded-lg transition-colors border border-transparent hover:border-notion-border">
                        <button 
                            onClick={() => onToggleTodo(todo.id)}
                            className={`flex-shrink-0 w-5 h-5 mr-4 border rounded flex items-center justify-center transition-all ${
                                todo.completed ? 'bg-notion-dim border-notion-dim text-white' : 'bg-white border-gray-300 hover:border-black'
                            }`}
                        >
                            {todo.completed && <Check className="w-3 h-3" />}
                        </button>
                        
                        <div className={`flex-1 ${todo.completed ? 'opacity-40' : ''}`}>
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`text-sm font-medium ${todo.completed ? 'line-through text-notion-dim' : 'text-notion-text'}`}>
                                    {todo.text}
                                </span>
                                {isOverdue && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold uppercase">Overdue</span>}
                                {todo.effort === 'DEEP' && <Zap className="w-3 h-3 text-notion-text fill-black" />}
                            </div>
                            
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-notion-dim">{goal?.text}</span>
                                {milestone && (
                                    <span className="text-[10px] text-gray-400 flex items-center gap-1 border-l border-gray-300 pl-2">
                                        <ArrowRight className="w-2 h-2" /> {milestone.text}
                                    </span>
                                )}
                            </div>
                        </div>

                        <button onClick={() => onDeleteTodo(todo.id)} className="opacity-0 group-hover:opacity-100 p-2 text-gray-300 hover:text-red-500 transition-all">
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                );
            })}
        </div>
      </section>

      {/* --- DIVIDER --- */}
      <hr className="border-notion-border" />

      {/* ================= PM BLOCK: SYSTEM ================= */}
      <section>
        <div className="mb-8">
            <div className="flex items-center gap-2 text-notion-dim mb-1">
                <Moon className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-widest">PM • System</span>
            </div>
            <h2 className="text-3xl font-serif font-medium text-notion-text">Atomic Execution</h2>
            <p className="text-notion-dim font-serif italic text-sm mt-1">Consistency compounds.</p>
        </div>

        <div className="space-y-6">
             {activeHabits.length === 0 && (
                <div className="text-center py-10">
                    <p className="text-notion-dim text-sm italic">System offline. Define habits in Strategy tab.</p>
                </div>
             )}

             {/* Pending Habits */}
             {pendingHabits.length > 0 && (
                <div className="space-y-3">
                    {pendingHabits.map(habit => {
                        const goal = data.goals.find(g => g.id === habit.goalId);
                        return (
                           <HabitTracker 
                               key={habit.id}
                               habit={habit}
                               goalName={goal?.text || 'Strategic'}
                               todayKey={todayKey}
                               onToggle={onToggleHabit}
                               onSchedule={handleSchedule}
                               onDelete={() => {}} 
                           />
                        );
                    })}
                </div>
             )}

             {/* Completed Habits (Visual Separation) */}
             {completedHabits.length > 0 && (
                <div className="space-y-3 opacity-75 grayscale-[0.5] hover:grayscale-0 transition-all">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-notion-dim/50 pl-2">Completed</div>
                    {completedHabits.map(habit => {
                        const goal = data.goals.find(g => g.id === habit.goalId);
                        return (
                           <HabitTracker 
                               key={habit.id}
                               habit={habit}
                               goalName={goal?.text || 'Strategic'}
                               todayKey={todayKey}
                               onToggle={onToggleHabit}
                               onSchedule={handleSchedule}
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

export default TodayTab;