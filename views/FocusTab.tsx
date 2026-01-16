import React, { useState } from 'react';
import { AppData, Goal, Habit, GoalStatus, HabitType } from '../types';
import HabitTracker from '../components/HabitTracker';
import { Target, Plus, Check, Sparkles } from '../components/Icon';
import { refineGoalWithAI } from '../services/ai';

interface FocusTabProps {
  data: AppData;
  todayKey: string;
  onAddGoal: (text: string) => void;
  onCompleteGoal: (id: string) => void;
  onAddHabit: (text: string, goalId: string, type: HabitType) => void;
  onToggleHabit: (id: string, val: number) => void;
  onDeleteHabit: (id: string) => void;
}

const FocusTab: React.FC<FocusTabProps> = ({
  data,
  todayKey,
  onAddGoal,
  onCompleteGoal,
  onAddHabit,
  onToggleHabit,
  onDeleteHabit
}) => {
  const [newGoalText, setNewGoalText] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  
  // Local state for adding habit inside a goal card
  const [addingHabitFor, setAddingHabitFor] = useState<string | null>(null);
  const [newHabitText, setNewHabitText] = useState('');
  const [newHabitType, setNewHabitType] = useState<HabitType>(HabitType.BINARY);

  const activeGoals = data.goals.filter(g => g.status === GoalStatus.ACTIVE);

  const handleRefine = async () => {
    if (!newGoalText.trim()) return;
    setIsRefining(true);
    const refined = await refineGoalWithAI(newGoalText);
    setNewGoalText(refined);
    setIsRefining(false);
  };

  const handleAddHabit = (goalId: string) => {
    if (!newHabitText.trim()) return;
    onAddHabit(newHabitText, goalId, newHabitType);
    setAddingHabitFor(null);
    setNewHabitText('');
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-medium flex items-center gap-2">
          <Target className="w-5 h-5" />
          Execution Mode
        </h2>
        <span className="text-xs font-mono bg-notion-tag px-2 py-1 rounded text-notion-dim">
          {activeGoals.length} / 3 Active Goals
        </span>
      </div>

      {/* Goal Input */}
      <div className="bg-notion-sidebar p-4 rounded-md border border-notion-border">
        <div className="flex gap-2">
          <input 
            type="text" 
            value={newGoalText}
            onChange={(e) => setNewGoalText(e.target.value)}
            placeholder="What is your main focus?"
            className="flex-1 p-2 text-sm bg-white border border-notion-border rounded outline-none focus:border-black"
            onKeyDown={(e) => e.key === 'Enter' && onAddGoal(newGoalText)}
          />
          <button 
            onClick={handleRefine}
            disabled={!newGoalText || isRefining}
            className="p-2 bg-white border border-notion-border text-notion-dim hover:text-purple-600 rounded transition-colors"
            title="Refine with AI"
          >
            <Sparkles className={`w-4 h-4 ${isRefining ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={() => { onAddGoal(newGoalText); setNewGoalText(''); }}
            className="text-sm px-4 bg-black text-white rounded hover:opacity-80"
          >
            Add
          </button>
        </div>
      </div>

      {/* Active Goals & Habits */}
      <div className="space-y-6">
        {activeGoals.length === 0 && (
          <div className="text-center py-12 text-notion-dim border border-dashed border-notion-border rounded">
            No active goals. Define your outcome above.
          </div>
        )}

        {activeGoals.map(goal => {
          const goalHabits = data.habits.filter(h => h.goalId === goal.id);
          
          return (
            <div key={goal.id} className="bg-white border border-notion-border rounded-lg shadow-sm p-6 relative group">
              <div className="flex justify-between items-start mb-6">
                <h3 className="font-serif text-xl">{goal.text}</h3>
                <button 
                  onClick={() => onCompleteGoal(goal.id)}
                  className="p-2 hover:bg-green-50 text-notion-dim hover:text-green-600 rounded-full transition-colors"
                  title="Mark Goal Complete"
                >
                  <Check className="w-5 h-5" />
                </button>
              </div>

              {/* Habits List */}
              <div className="space-y-2 mb-4">
                {goalHabits.map(habit => (
                  <HabitTracker 
                    key={habit.id}
                    habit={habit}
                    todayKey={todayKey}
                    onToggle={onToggleHabit}
                    onDelete={onDeleteHabit}
                  />
                ))}
                
                {goalHabits.length === 0 && (
                   <div className="text-xs text-notion-dim italic mb-2">No habits defined for this goal yet.</div>
                )}
              </div>

              {/* Add Habit Inline */}
              {addingHabitFor === goal.id ? (
                <div className="mt-4 p-3 bg-notion-sidebar rounded animate-in fade-in slide-in-from-top-2">
                  <div className="flex flex-col gap-2">
                    <input 
                      autoFocus
                      className="text-sm p-2 border border-notion-border rounded outline-none"
                      placeholder="Habit name..."
                      value={newHabitText}
                      onChange={e => setNewHabitText(e.target.value)}
                    />
                    <div className="flex justify-between items-center">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setNewHabitType(HabitType.BINARY)}
                          className={`text-xs px-2 py-1 rounded border ${newHabitType === HabitType.BINARY ? 'bg-black text-white border-black' : 'bg-white border-notion-border'}`}
                        >
                          Binary
                        </button>
                        <button 
                          onClick={() => setNewHabitType(HabitType.SCALE)}
                          className={`text-xs px-2 py-1 rounded border ${newHabitType === HabitType.SCALE ? 'bg-black text-white border-black' : 'bg-white border-notion-border'}`}
                        >
                          Scale 1-5
                        </button>
                      </div>
                      <div className="flex gap-2">
                         <button onClick={() => setAddingHabitFor(null)} className="text-xs text-notion-dim hover:text-black">Cancel</button>
                         <button onClick={() => handleAddHabit(goal.id)} className="text-xs bg-black text-white px-3 py-1 rounded">Save</button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <button 
                  onClick={() => setAddingHabitFor(goal.id)}
                  className="text-xs flex items-center gap-1 text-notion-dim hover:text-black transition-colors mt-2"
                >
                  <Plus className="w-3 h-3" /> Add Habit
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FocusTab;
