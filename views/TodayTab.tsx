import React, { useState, useEffect } from 'react';
import { AppData, GoalStatus, HabitType } from '../types';
import HabitTracker from '../components/HabitTracker';
import { Target, Plus, Check, Sparkles, Trash2, Shield, Zap } from '../components/Icon';

interface TodayTabProps {
  data: AppData;
  todayKey: string;
  onAddGoal: (text: string) => void;
  onCompleteGoal: (id: string) => void;
  onAddHabit: (text: string, goalId: string, type: HabitType) => void;
  onToggleHabit: (id: string, val: number) => void;
  onDeleteHabit: (id: string) => void;
  onAddTodo: (text: string, goalId: string) => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
}

const TodayTab: React.FC<TodayTabProps> = ({
  data,
  todayKey,
  onAddGoal,
  onCompleteGoal,
  onAddHabit,
  onToggleHabit,
  onDeleteHabit,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo
}) => {
  const [smartTip, setSmartTip] = useState<{title: string, tactic: string, type: string} | null>(null);
  const [newGoalText, setNewGoalText] = useState('');
  const [addingHabitFor, setAddingHabitFor] = useState<string | null>(null);
  const [habitText, setHabitText] = useState('');
  const [todoText, setTodoText] = useState<{[key:string]: string}>({});

  const activeGoals = data.goals.filter(g => g.status === GoalStatus.ACTIVE);

  // Smart Widget Logic: Pick a random strategy item on mount
  useEffect(() => {
    if (data.strategy.length > 0) {
      const randomItem = data.strategy[Math.floor(Math.random() * data.strategy.length)];
      setSmartTip(randomItem);
    }
  }, [data.strategy]);

  const handleAddTodo = (goalId: string) => {
    const text = todoText[goalId];
    if(!text?.trim()) return;
    onAddTodo(text, goalId);
    setTodoText(prev => ({...prev, [goalId]: ''}));
  };

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      
      {/* AM Planner Header */}
      <div className="flex justify-between items-center">
        <div>
           <h2 className="text-2xl font-serif">Today's Execution</h2>
           <p className="text-notion-dim text-sm">AM: Plan. PM: Execute.</p>
        </div>
      </div>

      {/* Smart Strategy Widget */}
      {smartTip && (
        <div className={`p-4 rounded-lg border flex items-start gap-4 shadow-sm ${smartTip.type === 'STRENGTH' ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}`}>
           <div className={`p-2 rounded-full ${smartTip.type === 'STRENGTH' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
              {smartTip.type === 'STRENGTH' ? <Shield className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
           </div>
           <div>
              <div className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
                {smartTip.type === 'STRENGTH' ? 'Leverage Your Strength' : 'Mitigate Your Weakness'}
              </div>
              <h3 className="font-medium text-lg">{smartTip.title}</h3>
              <p className="text-sm opacity-90 font-serif italic mt-1">"{smartTip.tactic}"</p>
           </div>
        </div>
      )}

      {/* Goal Cards */}
      <div className="grid grid-cols-1 gap-6">
        {activeGoals.map(goal => {
          const goalHabits = data.habits.filter(h => h.goalId === goal.id);
          const goalTodos = data.todos.filter(t => t.goalId === goal.id && t.date === todayKey);

          return (
            <div key={goal.id} className="bg-white border border-notion-border rounded-xl p-6 shadow-sm group">
              <div className="flex justify-between items-start mb-6">
                 <div>
                    <h3 className="font-serif text-xl font-medium">{goal.text}</h3>
                    <div className="text-xs text-notion-dim">{goal.motivation}</div>
                 </div>
                 <button onClick={() => onCompleteGoal(goal.id)} className="opacity-0 group-hover:opacity-100 text-notion-dim hover:text-green-600 transition-opacity">
                    <Check className="w-5 h-5" />
                 </button>
              </div>

              <div className="space-y-6">
                  {/* Habits */}
                  <div>
                    <h4 className="text-xs font-bold text-notion-dim uppercase tracking-wider mb-2">Daily Habits</h4>
                    <div className="space-y-1">
                        {goalHabits.map(habit => (
                            <HabitTracker 
                                key={habit.id}
                                habit={habit}
                                todayKey={todayKey}
                                onToggle={onToggleHabit}
                                onDelete={onDeleteHabit}
                            />
                        ))}
                    </div>
                     {addingHabitFor === goal.id ? (
                        <div className="mt-2 flex gap-2">
                            <input 
                                autoFocus
                                className="flex-1 text-sm border-b border-notion-border outline-none" 
                                placeholder="Habit..." 
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
                            <button onClick={() => setAddingHabitFor(null)} className="text-xs text-red-500">Cancel</button>
                        </div>
                     ) : (
                        <button onClick={() => setAddingHabitFor(goal.id)} className="text-xs text-notion-dim hover:text-black mt-2 flex items-center gap-1">
                            <Plus className="w-3 h-3"/> Add Habit
                        </button>
                     )}
                  </div>

                  {/* Todos */}
                  <div>
                    <h4 className="text-xs font-bold text-notion-dim uppercase tracking-wider mb-2">Today's Tasks</h4>
                    <div className="space-y-2">
                        {goalTodos.map(todo => (
                             <div key={todo.id} className="flex items-start gap-3 text-sm group/todo">
                                <button 
                                  onClick={() => onToggleTodo(todo.id)}
                                  className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-colors ${todo.completed ? 'bg-black border-black text-white' : 'bg-white border-notion-dim'}`}
                                >
                                  {todo.completed && <Check className="w-3 h-3" />}
                                </button>
                                <span className={todo.completed ? 'line-through text-notion-dim' : ''}>{todo.text}</span>
                                <button onClick={() => onDeleteTodo(todo.id)} className="opacity-0 group-hover/todo:opacity-100 text-notion-dim hover:text-red-500 ml-auto">
                                    <Trash2 className="w-3 h-3" />
                                </button>
                             </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                        <Plus className="w-3 h-3 text-notion-dim" />
                        <input 
                            className="flex-1 bg-transparent text-sm outline-none placeholder:text-notion-dim"
                            placeholder="Add task..."
                            value={todoText[goal.id] || ''}
                            onChange={(e) => setTodoText(prev => ({...prev, [goal.id]: e.target.value}))}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddTodo(goal.id)}
                        />
                    </div>
                  </div>
              </div>
            </div>
          );
        })}
        {activeGoals.length === 0 && (
            <div className="text-center py-10 text-notion-dim">
                No active goals. Go to <strong>Strategy</strong> to define your vision.
            </div>
        )}
      </div>

      {/* Quick Add Goal (if needed) */}
      <div className="mt-8 border-t border-notion-border pt-4">
        <input 
            className="w-full bg-transparent text-sm outline-none"
            placeholder="+ Quick add goal to strategy..."
            value={newGoalText}
            onChange={e => setNewGoalText(e.target.value)}
            onKeyDown={e => {
                if(e.key === 'Enter' && newGoalText.trim()) {
                    onAddGoal(newGoalText);
                    setNewGoalText('');
                }
            }}
        />
      </div>
    </div>
  );
};

export default TodayTab;
