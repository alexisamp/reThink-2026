import React, { useState } from 'react';
import { AppData, Goal, Habit, GoalStatus, HabitType, Todo } from '../types';
import HabitTracker from '../components/HabitTracker';
import { Target, Plus, Check, Sparkles, Square, Trash2, PenTool } from '../components/Icon';
import { refineGoalWithAI } from '../services/ai';

interface FocusTabProps {
  data: AppData;
  todayKey: string;
  onAddGoal: (text: string, motivation?: string) => void;
  onUpdateGoalMotivation: (id: string, motivation: string) => void;
  onCompleteGoal: (id: string) => void;
  onAddHabit: (text: string, goalId: string, type: HabitType) => void;
  onToggleHabit: (id: string, val: number) => void;
  onDeleteHabit: (id: string) => void;
  onAddTodo: (text: string, goalId: string, link?: string) => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
}

const FocusTab: React.FC<FocusTabProps> = ({
  data,
  todayKey,
  onAddGoal,
  onUpdateGoalMotivation,
  onCompleteGoal,
  onAddHabit,
  onToggleHabit,
  onDeleteHabit,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo
}) => {
  const [newGoalText, setNewGoalText] = useState('');
  
  // Local state for interacting with specific cards
  const [addingHabitFor, setAddingHabitFor] = useState<string | null>(null);
  const [habitText, setHabitText] = useState('');
  const [habitType, setHabitType] = useState<HabitType>(HabitType.BINARY);

  const [todoText, setTodoText] = useState<{[key:string]: string}>({}); // Map goalId -> text

  const activeGoals = data.goals.filter(g => g.status === GoalStatus.ACTIVE);

  const handleAddGoal = () => {
    if(!newGoalText.trim()) return;
    onAddGoal(newGoalText);
    setNewGoalText('');
  };

  const handleAddTodo = (goalId: string) => {
    const text = todoText[goalId];
    if(!text?.trim()) return;
    onAddTodo(text, goalId);
    setTodoText(prev => ({...prev, [goalId]: ''}));
  };

  return (
    <div className="space-y-10 animate-fade-in pb-20">
      
      {/* Input Section */}
      <div className="bg-notion-sidebar p-1 rounded-lg border border-notion-border flex items-center shadow-sm">
        <input 
            type="text" 
            value={newGoalText}
            onChange={(e) => setNewGoalText(e.target.value)}
            placeholder="Define a new Outcome (e.g., 'Launch MVP')"
            className="flex-1 p-3 bg-transparent text-sm outline-none"
            onKeyDown={(e) => e.key === 'Enter' && handleAddGoal()}
        />
        <button 
            onClick={handleAddGoal}
            className="mr-1 px-4 py-2 bg-black text-white text-xs font-medium rounded hover:opacity-80 transition-opacity"
        >
            Set Goal
        </button>
      </div>

      {activeGoals.length === 0 && (
          <div className="text-center py-20 text-notion-dim opacity-50">
             <Target className="w-12 h-12 mx-auto mb-4 stroke-1" />
             <p className="font-serif italic">The canvas is empty. What matters most?</p>
          </div>
      )}

      {/* Goal Cards */}
      <div className="grid grid-cols-1 gap-8">
        {activeGoals.map(goal => {
          const goalHabits = data.habits.filter(h => h.goalId === goal.id);
          const goalTodos = data.todos.filter(t => t.goalId === goal.id && t.date === todayKey);

          return (
            <div key={goal.id} className="bg-white border border-notion-border rounded-xl shadow-sm overflow-hidden flex flex-col group transition-all hover:shadow-md">
              
              {/* Card Header */}
              <div className="p-6 border-b border-notion-border bg-notion-sidebar/30">
                 <div className="flex justify-between items-start">
                    <div className="flex-1">
                        <h3 className="font-serif text-xl font-medium text-notion-text">{goal.text}</h3>
                        <input 
                            className="w-full bg-transparent text-xs text-notion-dim mt-1 outline-none font-serif italic placeholder:text-notion-dim/50"
                            placeholder="Add motivation (Why does this matter?)..."
                            value={goal.motivation || ''}
                            onChange={(e) => onUpdateGoalMotivation(goal.id, e.target.value)}
                        />
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => onCompleteGoal(goal.id)} className="p-1.5 text-notion-dim hover:text-green-600 hover:bg-green-50 rounded">
                            <Check className="w-4 h-4" />
                        </button>
                    </div>
                 </div>
              </div>

              <div className="p-6 space-y-8">
                  {/* Habits Section */}
                  <div>
                    <h4 className="text-xs font-bold text-notion-dim uppercase tracking-wider mb-3">Daily Habits</h4>
                    <div className="space-y-1">
                        {goalHabits.map(habit => (
                        <HabitTracker 
                            key={habit.id}
                            habit={habit}
                            goalName={goal.text}
                            todayKey={todayKey}
                            onToggle={onToggleHabit}
                            onDelete={onDeleteHabit}
                        />
                        ))}
                    </div>

                    {/* Add Habit Logic */}
                    {addingHabitFor === goal.id ? (
                        <div className="mt-3 p-3 bg-notion-sidebar rounded text-sm animate-in fade-in zoom-in-95">
                            <input 
                                autoFocus
                                className="w-full bg-transparent border-b border-notion-border pb-1 outline-none mb-2"
                                placeholder="Habit name..."
                                value={habitText}
                                onChange={e => setHabitText(e.target.value)}
                                onKeyDown={e => {
                                    if(e.key === 'Enter') {
                                        onAddHabit(habitText, goal.id, HabitType.BINARY);
                                        setAddingHabitFor(null);
                                        setHabitText('');
                                    }
                                }}
                            />
                            <div className="flex justify-between">
                                <span className="text-[10px] text-notion-dim">Press Enter to save</span>
                                <button onClick={() => setAddingHabitFor(null)} className="text-xs text-notion-dim hover:text-red-500">Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <button 
                            onClick={() => setAddingHabitFor(goal.id)}
                            className="mt-2 text-xs text-notion-dim hover:text-black flex items-center gap-1 transition-colors"
                        >
                            <Plus className="w-3 h-3" /> Add Habit
                        </button>
                    )}
                  </div>

                  {/* Todos Section */}
                  <div>
                    <h4 className="text-xs font-bold text-notion-dim uppercase tracking-wider mb-3">Next Steps (Today)</h4>
                    <div className="space-y-2 mb-3">
                        {goalTodos.map(todo => (
                             <div key={todo.id} className="group flex items-start gap-3 text-sm">
                                <button 
                                  onClick={() => onToggleTodo(todo.id)}
                                  className={`mt-0.5 min-w-[16px] h-4 flex items-center justify-center rounded border transition-all ${
                                    todo.completed ? 'bg-black border-black text-white' : 'bg-white border-notion-dim hover:border-black'
                                  }`}
                                >
                                  {todo.completed && <Check className="w-2.5 h-2.5" />}
                                </button>
                                <span className={`flex-1 transition-all ${todo.completed ? 'text-notion-dim line-through decoration-notion-dim' : ''}`}>
                                  {todo.text}
                                </span>
                                <button onClick={() => onDeleteTodo(todo.id)} className="opacity-0 group-hover:opacity-100 text-notion-dim hover:text-red-500">
                                    <Trash2 className="w-3 h-3" />
                                </button>
                             </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-notion-dim">
                        <Plus className="w-3 h-3" />
                        <input 
                            className="flex-1 outline-none bg-transparent placeholder:text-notion-dim/50"
                            placeholder="Add a step..."
                            value={todoText[goal.id] || ''}
                            onChange={(e) => setTodoText(prev => ({...prev, [goal.id]: e.target.value}))}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddTodo(goal.id)}
                        />
                    </div>
                  </div>
              </div>

              {/* AI Footer */}
              <div className="bg-notion-sidebar/20 p-2 border-t border-notion-border flex justify-end">
                  <button className="flex items-center gap-1 text-[10px] text-notion-dim hover:text-purple-600 transition-colors px-2 py-1 rounded hover:bg-purple-50">
                      <Sparkles className="w-3 h-3" /> AI Prioritize
                  </button>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FocusTab;