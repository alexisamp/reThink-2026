import React, { useMemo } from 'react';
import { Habit, HabitType } from '../types';
import { Check, Flame, AlertTriangle } from './Icon';

interface HabitTrackerProps {
  habit: Habit;
  goalName: string;
  todayKey: string;
  onToggle: (id: string, value: number) => void;
  onDelete: (id: string) => void; // Kept for interface compatibility, though hidden in strict mode
}

const HabitTracker: React.FC<HabitTrackerProps> = ({ habit, goalName, todayKey, onToggle }) => {
  const todayValue = habit.contributions[todayKey] || 0;

  // --- Atomic Logic: Streaks & Critical Days ---
  
  const { streak, isCritical } = useMemo(() => {
    let currentStreak = 0;
    const date = new Date();
    // If completed today, start counting from today. If not, start from yesterday.
    if (todayValue > 0) {
        currentStreak = 1; 
        date.setDate(date.getDate() - 1);
    } else {
        date.setDate(date.getDate() - 1); // Start checking yesterday
    }

    // Loop backwards
    while (true) {
        const key = date.toISOString().split('T')[0];
        if ((habit.contributions[key] || 0) > 0) {
            currentStreak++;
            date.setDate(date.getDate() - 1);
        } else {
            break;
        }
    }

    // Critical: If yesterday was missed and today is not done yet.
    // "Never Miss Twice" rule.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = yesterday.toISOString().split('T')[0];
    const missedYesterday = (habit.contributions[yKey] || 0) === 0;
    const isCrit = missedYesterday && todayValue === 0;

    return { streak: currentStreak, isCritical: isCrit };
  }, [habit.contributions, todayValue]);


  // --- Controls ---

  const renderControl = () => {
    if (habit.type === HabitType.SCALE) {
      return (
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((val) => (
            <button
              key={val}
              onClick={() => onToggle(habit.id, todayValue === val ? 0 : val)}
              className={`w-5 h-5 rounded border text-[10px] flex items-center justify-center transition-all ${
                todayValue >= val 
                  ? 'bg-black border-black text-white' 
                  : 'bg-white border-gray-200 text-gray-400 hover:border-black'
              }`}
            >
              {val}
            </button>
          ))}
        </div>
      );
    }

    // Binary Checkbox
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

  return (
    <div className={`group flex justify-between items-center py-3 px-4 bg-white border rounded-lg transition-all ${isCritical ? 'border-orange-200 shadow-sm' : 'border-gray-100 hover:border-gray-300'}`}>
      
      {/* Left: Identity & Habit */}
      <div className="flex items-center gap-3">
         {isCritical && (
             <div className="text-orange-500" title="Never Miss Twice! You missed yesterday.">
                 <AlertTriangle className="w-4 h-4" />
             </div>
         )}
         <div>
             <div className="font-semibold text-sm text-notion-text leading-tight">{habit.text}</div>
             <div className="text-[10px] font-medium uppercase tracking-wide text-notion-dim mt-0.5">{goalName}</div>
         </div>
      </div>

      {/* Right: Streak & Action */}
      <div className="flex items-center gap-5">
        
        {/* Streak Indicator */}
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