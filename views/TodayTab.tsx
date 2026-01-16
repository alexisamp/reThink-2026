import React, { useState, useEffect } from 'react';
import { AppData, GoalStatus } from '../types';
import HabitTracker from '../components/HabitTracker';
import { Target, Plus, Check, Trash2, Shield, Zap } from '../components/Icon';

interface TodayTabProps {
  data: AppData;
  todayKey: string;
  onCompleteGoal: (id: string) => void;
  onToggleHabit: (id: string, val: number) => void;
  onAddTodo: (text: string, goalId: string) => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
}

const TodayTab: React.FC<TodayTabProps> = ({
  data,
  todayKey,
  onCompleteGoal,
  onToggleHabit,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo
}) => {
  const [smartTip, setSmartTip] = useState<{title: string, tactic: string, type: string} | null>(null);
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
           <p className="text-notion-dim text-sm">Action Mode. No editing, just doing.</p>
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
              </div>

              <div className="space-y-6">
                  {/* Habits - READ/EXECUTE ONLY */}
                  <div>
                    <h4 className="text-xs font-bold text-notion-dim uppercase tracking-wider mb-2">The System</h4>
                    <div className="space-y-1">
                        {goalHabits.map(habit => (
                            <HabitTracker 
                                key={habit.id}
                                habit={habit}
                                todayKey={todayKey}
                                onToggle={onToggleHabit}
                                onDelete={() => {}} // No deleting here
                                showDelete={false} // Hide delete button
                            />
                        ))}
                        {goalHabits.length === 0 && (
                            <div className="text-sm text-notion-dim italic pl-1">No system configured. Go to Strategy to setup habits.</div>
                        )}
                    </div>
                  </div>

                  {/* Todos - PLAN/EXECUTE */}
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
            <div className="text-center py-20 text-notion-dim">
                <Target className="w-12 h-12 mx-auto mb-4 stroke-1 text-notion-tag" />
                <p>No active goals.</p>
                <p className="text-sm mt-2">Go to <strong>Strategy</strong> to define your vision.</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default TodayTab;
