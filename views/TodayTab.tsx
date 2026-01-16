import React, { useState } from 'react';
import { AppData, GoalStatus } from '../types';
import HabitTracker from '../components/HabitTracker';
import { Plus, Check, Trash2, ArrowRight, Sun, Moon } from '../components/Icon';

interface TodayTabProps {
  data: AppData;
  todayKey: string;
  onToggleHabit: (id: string, val: number) => void;
  onAddTodo: (text: string, goalId: string, milestoneId?: string) => void;
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
  // Input State
  const [selectedGoalId, setSelectedGoalId] = useState<string>('');
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string>('');
  const [taskText, setTaskText] = useState('');

  const activeGoals = data.goals.filter(g => g.status === GoalStatus.ACTIVE);
  const todaysTodos = data.todos.filter(t => t.date === todayKey);
  const activeHabits = data.habits.filter(h => {
      const parentGoal = data.goals.find(g => g.id === h.goalId);
      return parentGoal?.status === GoalStatus.ACTIVE;
  });

  const availableMilestones = activeGoals.find(g => g.id === selectedGoalId)?.milestones?.filter(m => !m.completed) || [];

  const handleAddTask = () => {
    if (!selectedGoalId || !taskText.trim()) return;
    onAddTodo(taskText, selectedGoalId, selectedMilestoneId || undefined);
    setTaskText('');
  };

  return (
    <div className="animate-fade-in pb-20 max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16">
      
      {/* LEFT COLUMN: AM BLOCK (PLANNING & TASKS) */}
      <div className="space-y-8">
        <div className="flex items-center gap-3 border-b border-black pb-4">
            <Sun className="w-5 h-5" />
            <h2 className="text-xl font-serif font-medium">AM: Strategic Action</h2>
        </div>

        {/* Input Area */}
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 shadow-sm space-y-3">
             <div className="flex gap-2">
                 <select 
                    className="flex-1 bg-white border border-gray-200 rounded px-2 py-1.5 text-sm outline-none"
                    value={selectedGoalId}
                    onChange={e => { setSelectedGoalId(e.target.value); setSelectedMilestoneId(''); }}
                 >
                     <option value="" disabled>Select Objective...</option>
                     {activeGoals.map(g => <option key={g.id} value={g.id}>{g.text}</option>)}
                 </select>
                 <select 
                    className="flex-1 bg-white border border-gray-200 rounded px-2 py-1.5 text-sm outline-none disabled:opacity-50"
                    value={selectedMilestoneId}
                    onChange={e => setSelectedMilestoneId(e.target.value)}
                    disabled={!selectedGoalId || availableMilestones.length === 0}
                 >
                     <option value="">{availableMilestones.length === 0 ? "No active milestones" : "Link to Milestone (Opt)"}</option>
                     {availableMilestones.map(m => <option key={m.id} value={m.id}>{m.text}</option>)}
                 </select>
             </div>
             <div className="flex gap-2">
                 <input 
                    className="flex-1 p-2 border border-gray-200 rounded text-sm outline-none focus:border-black"
                    placeholder="Task: What needs to be done today?"
                    value={taskText}
                    onChange={e => setTaskText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                 />
                 <button 
                    onClick={handleAddTask}
                    disabled={!selectedGoalId || !taskText}
                    className="bg-black text-white px-3 rounded hover:opacity-80 disabled:opacity-30"
                 >
                     <Plus className="w-4 h-4" />
                 </button>
             </div>
        </div>

        {/* Task List */}
        <div className="space-y-0">
            {todaysTodos.length === 0 && <div className="text-gray-400 italic text-sm text-center py-10">No actions logged for today.</div>}
            
            {todaysTodos.map(todo => {
                const goal = data.goals.find(g => g.id === todo.goalId);
                const milestone = goal?.milestones?.find(m => m.id === todo.milestoneId);

                return (
                    <div key={todo.id} className="group flex items-center py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors -mx-2 px-2 rounded">
                        <button 
                            onClick={() => onToggleTodo(todo.id)}
                            className={`flex-shrink-0 w-5 h-5 mr-3 border rounded flex items-center justify-center transition-all ${todo.completed ? 'bg-gray-200 border-gray-200 text-gray-500' : 'border-gray-300 hover:border-black'}`}
                        >
                            {todo.completed && <Check className="w-3 h-3" />}
                        </button>
                        
                        <div className={`flex-1 ${todo.completed ? 'opacity-40' : ''}`}>
                            <div className={`text-sm font-medium ${todo.completed ? 'line-through' : 'text-notion-text'}`}>
                                {todo.text}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-notion-dim">{goal?.text}</span>
                                {milestone && (
                                    <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                        <ArrowRight className="w-2 h-2" /> {milestone.text}
                                    </span>
                                )}
                            </div>
                        </div>

                        <button onClick={() => onDeleteTodo(todo.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity">
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                );
            })}
        </div>
      </div>

      {/* RIGHT COLUMN: PM BLOCK (SYSTEMS & HABITS) */}
      <div className="space-y-8">
         <div className="flex items-center gap-3 border-b border-black pb-4">
            <Moon className="w-5 h-5" />
            <h2 className="text-xl font-serif font-medium">PM: System Execution</h2>
        </div>
        
        <div className="space-y-6">
            {activeGoals.map(goal => {
                const habits = activeHabits.filter(h => h.goalId === goal.id);
                if(habits.length === 0) return null;

                return (
                    <div key={goal.id} className="bg-notion-sidebar/30 p-5 rounded-xl border border-notion-border">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-notion-dim mb-4">{goal.text}</h4>
                        <div className="space-y-1">
                            {habits.map(habit => (
                                <HabitTracker 
                                    key={habit.id}
                                    habit={habit}
                                    todayKey={todayKey}
                                    onToggle={onToggleHabit}
                                    onDelete={() => {}}
                                    showDelete={false}
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
            
            {activeHabits.length === 0 && <div className="text-gray-400 italic text-sm text-center py-10">No system defined in Strategy.</div>}
        </div>
      </div>

    </div>
  );
};

export default TodayTab;