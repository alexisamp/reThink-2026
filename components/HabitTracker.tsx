import React from 'react';
import { Habit, HabitType } from '../types';
import { Check, Square } from './Icon';

interface HabitTrackerProps {
  habit: Habit;
  todayKey: string;
  onToggle: (id: string, value: number) => void;
  onDelete: (id: string) => void;
  showDelete?: boolean;
}

const HabitTracker: React.FC<HabitTrackerProps> = ({ habit, todayKey, onToggle, onDelete, showDelete = true }) => {
  const todayValue = habit.contributions[todayKey] || 0;

  const renderControl = () => {
    if (habit.type === HabitType.SCALE) {
      return (
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((val) => (
            <button
              key={val}
              onClick={() => onToggle(habit.id, todayValue === val ? 0 : val)}
              className={`w-6 h-6 rounded-full border text-[10px] flex items-center justify-center transition-all ${
                todayValue >= val 
                  ? 'bg-black border-black text-white' 
                  : 'bg-white border-notion-border text-notion-dim hover:border-black'
              }`}
            >
              {val}
            </button>
          ))}
        </div>
      );
    }

    // Binary
    return (
      <button 
        onClick={() => onToggle(habit.id, todayValue > 0 ? 0 : 1)}
        className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded transition-colors border ${
          todayValue > 0 
            ? 'bg-black text-white border-black' 
            : 'bg-white text-notion-text border-notion-border hover:bg-notion-sidebar'
        }`}
      >
        {todayValue > 0 ? <Check className="w-3 h-3" /> : <Square className="w-3 h-3" />}
        <span>Done</span>
      </button>
    );
  };

  return (
    <div className="group flex justify-between items-center py-2">
      <div className="flex-1">
        <div className="flex items-center gap-2">
           <h4 className="font-medium text-sm text-notion-text">{habit.text}</h4>
           {habit.type === HabitType.SCALE && (
             <span className="text-[10px] uppercase tracking-wider text-notion-dim border border-notion-border px-1 rounded">Scale 1-5</span>
           )}
        </div>
      </div>
      <div className="flex items-center gap-4">
        {renderControl()}
        {showDelete && (
          <button 
            onClick={() => onDelete(habit.id)}
            className="opacity-0 group-hover:opacity-100 text-notion-dim hover:text-red-600 transition-all px-2"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
};

export default HabitTracker;
