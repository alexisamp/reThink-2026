
import React, { useMemo, useState } from 'react';
import { Habit, HabitType } from '../types';
import { Check, Flame, AlertTriangle, Sparkles } from './Icon';

interface HabitTrackerProps {
  habit: Habit;
  goalName: string;
  todayKey: string;
  onToggle: (id: string, value: number) => void;
  onSchedule?: (id: string, timestamp: number) => void; 
  onDelete: (id: string) => void;
}

const HabitTracker: React.FC<HabitTrackerProps> = ({ habit, goalName, todayKey, onToggle }) => {
  const todayValue = habit.contributions[todayKey] || 0;
  const [inputValue, setInputValue] = useState(todayValue.toString());

  // --- Streak Logic ---
  const { streak, isCritical } = useMemo(() => {
    let currentStreak = 0;
    const date = new Date();
    if (todayValue > 0) {
        currentStreak = 1; 
        date.setDate(date.getDate() - 1);
    } else {
        date.setDate(date.getDate() - 1); 
    }

    while (true) {
        const key = date.toISOString().split('T')[0];
        if ((habit.contributions[key] || 0) > 0) {
            currentStreak++;
            date.setDate(date.getDate() - 1);
        } else {
            break;
        }
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = yesterday.toISOString().split('T')[0];
    const missedYesterday = (habit.contributions[yKey] || 0) === 0;
    const isCrit = missedYesterday && todayValue === 0;

    return { streak: currentStreak, isCritical: isCrit };
  }, [habit.contributions, todayValue]);


  // --- Controls ---
  const renderControl = () => {
    // If target value is set, show numeric input
    if (habit.targetValue && habit.targetValue > 0) {
        return (
            <div className="flex items-center gap-2">
                <input 
                    type="number"
                    className="w-16 h-8 border border-gray-200 rounded text-center text-sm outline-none focus:border-black"
                    value={inputValue}
                    onChange={(e) => {
                        setInputValue(e.target.value);
                        const val = parseInt(e.target.value);
                        if (!isNaN(val)) onToggle(habit.id, val);
                    }}
                    placeholder="0"
                />
                <span className="text-xs text-notion-dim">/ {habit.targetValue} {habit.unit}</span>
            </div>
        );
    }

    // Default Binary Checkbox
    return (
      <button 
        onClick={() => onToggle(habit.id, todayValue > 0 ? 0 : 1)}
        className={`w-6 h-6 rounded border flex items-center justify-center transition-all duration-200 ${
          todayValue > 0 
            ? 'bg-black border-black text-white' 
            : 'bg-white border-gray-300 hover:border-black'
        }`}
      >
        {todayValue > 0 && <Check className="w-4 h-4" />}
      </button>
    );
  };

  const isCompleted = habit.targetValue ? todayValue >= habit.targetValue : todayValue > 0;

  return (
    <div className={`group flex justify-between items-center py-3 px-4 bg-white border rounded-lg transition-all ${isCritical ? 'border-notion-border border-l-4 border-l-black bg-gray-50' : 'border-notion-border hover:border-gray-300'}`}>
      
      {/* Left: Identity & Habit */}
      <div className="flex items-center gap-3">
         {isCritical && (
             <div className="text-notion-text opacity-70" title="Never Miss Twice! You missed yesterday.">
                 <AlertTriangle className="w-4 h-4" />
             </div>
         )}
         <div>
             <div className="font-semibold text-sm text-notion-text leading-tight">{habit.text}</div>
             <div className="text-[10px] font-medium uppercase tracking-wide text-notion-dim mt-0.5">{goalName}</div>
         </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-4">
        
        {isCompleted && habit.reward && (
            <div className="flex items-center gap-1.5 text-xs font-semibold bg-gray-100 px-2 py-1 rounded-md animate-in fade-in slide-in-from-bottom-2 border border-gray-200">
                <Sparkles className="w-3 h-3 text-notion-text" />
                <span className="text-notion-text">{habit.reward}</span>
            </div>
        )}
        
        <div className={`flex items-center gap-1.5 ${streak > 0 ? 'opacity-100' : 'opacity-0'} transition-opacity`}>
            <span className={`text-xs font-bold font-mono ${streak > 3 ? 'text-orange-600' : 'text-gray-400'}`}>{streak}</span>
            <Flame className={`w-3.5 h-3.5 ${streak > 3 ? 'text-orange-500 fill-orange-500' : 'text-gray-300'}`} />
        </div>

        {renderControl()}
      </div>
    </div>
  );
};

export default HabitTracker;
