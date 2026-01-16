import React, { useState } from 'react';
import { AppData, GoalStatus } from '../types';
import HabitTracker from '../components/HabitTracker';
import { Plus, Check, Trash2, ArrowRight } from '../components/Icon';

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
  const activeHabits = data.habits.filter(h => h.goalId !== 'archived'); // basic filter

  // Derived state for dropdowns
  const selectedGoal = activeGoals.find(g => g.id === selectedGoalId);
  const availableMilestones = selectedGoal?.milestones?.filter(m => !m.completed) || [];

  const handleAddTask = () => {
    if (!selectedGoalId || !taskText.trim()) return;
    onAddTodo(taskText, selectedGoalId, selectedMilestoneId || undefined);
    setTaskText('');
  };

  return (
    <div className="animate-fade-in pb-20 max-w-4xl mx-auto">
      
      {/* Header */}
      <div className="mb-10">
        <div className="text-xs font-bold text-notion-dim uppercase tracking-widest mb-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric'})}
        </div>
        <h2 className="text-3xl font-serif text-notion-text">Execution Plan</h2>
      </div>

      {/* BLOCK 1: THE PLANNING TABLE */}
      <section className="mb-16 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs font-medium text-notion-dim uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 w-1/4">Goal (Outcome)</th>
              <th className="px-4 py-3 w-1/4">Milestone (Context)</th>
              <th className="px-4 py-3 w-1/3">Action (Task)</th>
              <th className="px-4 py-3 w-16 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            
            {/* Input Row */}
            <tr className="bg-notion-sidebar/30">
              <td className="px-4 py-2">
                <select 
                    className="w-full bg-transparent outline-none py-1 text-notion-text cursor-pointer"
                    value={selectedGoalId}
                    onChange={e => { setSelectedGoalId(e.target.value); setSelectedMilestoneId(''); }}
                >
                    <option value="" disabled>Select Goal...</option>
                    {activeGoals.map(g => <option key={g.id} value={g.id}>{g.text}</option>)}
                </select>
              </td>
              <td className="px-4 py-2">
                 <select 
                    className="w-full bg-transparent outline-none py-1 text-notion-text cursor-pointer disabled:opacity-50"
                    value={selectedMilestoneId}
                    onChange={e => setSelectedMilestoneId(e.target.value)}
                    disabled={!selectedGoalId}
                >
                    <option value="">No specific milestone</option>
                    {availableMilestones.map(m => <option key={m.id} value={m.id}>{m.text}</option>)}
                </select>
              </td>
              <td className="px-4 py-2">
                <input 
                    className="w-full bg-transparent outline-none placeholder:text-gray-400"
                    placeholder="What specific action?"
                    value={taskText}
                    onChange={e => setTaskText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                />
              </td>
              <td className="px-4 py-2 text-center">
                 <button 
                    onClick={handleAddTask}
                    disabled={!selectedGoalId || !taskText}
                    className="text-black hover:bg-gray-200 p-1.5 rounded disabled:opacity-30 transition-colors"
                 >
                    <Plus className="w-4 h-4" />
                 </button>
              </td>
            </tr>

            {/* Task Rows */}
            {todaysTodos.map(todo => {
                const goal = data.goals.find(g => g.id === todo.goalId);
                const milestone = goal?.milestones?.find(m => m.id === todo.milestoneId);

                return (
                    <tr key={todo.id} className="group hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-notion-dim font-medium truncate max-w-[150px]">
                            {goal?.text}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs truncate max-w-[150px]">
                            {milestone ? milestone.text : '-'}
                        </td>
                        <td className={`px-4 py-3 transition-all ${todo.completed ? 'line-through text-gray-300' : 'text-notion-text'}`}>
                            {todo.text}
                        </td>
                        <td className="px-4 py-3 flex items-center justify-center gap-2">
                            <button 
                                onClick={() => onToggleTodo(todo.id)}
                                className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                                    todo.completed ? 'bg-black border-black text-white' : 'border-gray-300 hover:border-black'
                                }`}
                            >
                                {todo.completed && <Check className="w-3 h-3" />}
                            </button>
                            <button 
                                onClick={() => onDeleteTodo(todo.id)}
                                className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </td>
                    </tr>
                );
            })}

            {todaysTodos.length === 0 && (
                <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-400 italic">
                        No actions planned for today yet.
                    </td>
                </tr>
            )}

          </tbody>
        </table>
      </section>

      {/* BLOCK 2: SYSTEM CHECK (HABITS) */}
      <section>
          <div className="flex items-center gap-4 mb-6">
              <h3 className="text-xl font-serif text-notion-text">System Check</h3>
              <div className="h-px flex-1 bg-gray-200" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeGoals.map(goal => {
                  const habits = activeHabits.filter(h => h.goalId === goal.id);
                  if (habits.length === 0) return null;

                  return (
                      <div key={goal.id} className="bg-gray-50 p-5 rounded-xl border border-gray-100">
                          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 truncate">
                              {goal.text}
                          </div>
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
                  )
              })}
          </div>
          {activeHabits.length === 0 && (
              <div className="text-center text-gray-400 italic">No system (habits) defined in Strategy.</div>
          )}
      </section>

    </div>
  );
};

export default TodayTab;
