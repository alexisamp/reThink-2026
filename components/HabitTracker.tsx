import React, { useMemo, useState, useEffect } from 'react';
import { Habit, HabitType } from '../types';
import { Check, Flame, AlertTriangle, Calendar, Clock, CheckSquare } from './Icon';
import { createCalendarEvent, initGoogleClient } from '../services/google';

interface HabitTrackerProps {
  habit: Habit;
  goalName: string;
  todayKey: string;
  onToggle: (id: string, value: number) => void;
  onSchedule?: (id: string, timestamp: number) => void; // Optional for state persistence
  onDelete: (id: string) => void;
}

const HabitTracker: React.FC<HabitTrackerProps> = ({ habit, goalName, todayKey, onToggle, onSchedule }) => {
  const todayValue = habit.contributions[todayKey] || 0;
  
  // Scheduling State
  const [scheduleTime, setScheduleTime] = useState(habit.defaultTime || '');
  const [isScheduling, setIsScheduling] = useState(false);
  const [justScheduled, setJustScheduled] = useState(false);

  // Initialize Google Client once
  useEffect(() => {
    // Only init if we actually might use it (performance)
    if (habit.defaultTime && !habit.lastScheduledAt) {
        initGoogleClient();
    }
  }, [habit.defaultTime, habit.lastScheduledAt]);

  const isScheduledToday = useMemo(() => {
    if (justScheduled) return true;
    if (!habit.lastScheduledAt) return false;
    const last = new Date(habit.lastScheduledAt).toDateString();
    const today = new Date().toDateString();
    return last === today;
  }, [habit.lastScheduledAt, justScheduled]);

  const handleCommit = async () => {
    if (!scheduleTime) return;
    setIsScheduling(true);
    
    const result = await createCalendarEvent(habit.text, scheduleTime);
    
    setIsScheduling(false);
    if (result) {
        setJustScheduled(true);
        // Call parent to save the timestamp
        if (onSchedule) onSchedule(habit.id, Date.now());
    }
  };

  // --- Atomic Logic: Streaks & Critical Days ---
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

      {/* Right: Actions */}
      <div className="flex items-center gap-4">
        
        {/* COMMIT WIDGET (One-Click Scheduling) */}
        {habit.defaultTime && !isScheduledToday && todayValue === 0 && (
            <div className="hidden md:flex items-center gap-1 bg-gray-50 p-1 rounded border border-gray-200 animate-in fade-in">
                <div className="relative">
                    <Clock className="w-3 h-3 absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                        type="time" 
                        value={scheduleTime} 
                        onChange={(e) => setScheduleTime(e.target.value)}
                        className="bg-transparent text-[10px] font-medium w-16 pl-5 outline-none text-gray-600"
                    />
                </div>
                <button 
                    onClick={handleCommit}
                    disabled={isScheduling}
                    className="bg-white hover:bg-black hover:text-white border border-gray-200 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
                >
                    {isScheduling ? '...' : <><Calendar className="w-3 h-3" /> Commit</>}
                </button>
            </div>
        )}

        {justScheduled && !todayValue && (
            <span className="text-[10px] text-green-600 font-medium flex items-center gap-1 animate-in slide-in-from-right-2">
                <CheckSquare className="w-3 h-3" /> Scheduled
            </span>
        )}
        
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