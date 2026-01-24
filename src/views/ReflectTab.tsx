
import React, { useState, useEffect } from 'react';
import { AppData, ReviewEntry, HabitType, DayRating, GoalStatus, Todo } from '../types';
import { Brain, Ban, PenTool, Sparkles, Check, X, Moon, Sun, Plus, Trash2 } from '../components/Icon';
import { saveTodo } from '../services/storage';

interface ReflectTabProps {
  data: AppData;
  todayKey: string;
  onAddReview: (text: string, easyMode: boolean, energy: number, rating: DayRating) => void;
  onToggleHabit: (id: string, val: number) => void;
  onAddTodo: (text: string, goalId: string, milestoneId?: string, effort?: 'DEEP' | 'SHALLOW') => void;
}

const ReflectTab: React.FC<ReflectTabProps> = ({ data, todayKey, onAddReview, onToggleHabit, onAddTodo }) => {
  const [reviewText, setReviewText] = useState('');
  const [easyMode, setEasyMode] = useState(false);
  const [energy, setEnergy] = useState(3);
  
  // Plan Tomorrow State
  const [tomorrowTask, setTomorrowTask] = useState('');
  const [tomorrowGoalId, setTomorrowGoalId] = useState('');

  // Load existing data
  useEffect(() => {
      const existing = data.reviews.find(r => r.date === todayKey);
      if (existing) {
          setReviewText(existing.text);
          setEasyMode(existing.easyMode);
          setEnergy(existing.energyLevel);
      }
  }, [data.reviews, todayKey]);

  // Derived Status
  const activeHabits = data.habits.filter(h => {
      const goal = data.goals.find(g => g.id === h.goalId);
      return goal?.status === GoalStatus.ACTIVE;
  });

  const activeHabitCount = activeHabits.length;
  const activeHabitDone = activeHabits.filter(h => (h.contributions[todayKey] || 0) > 0).length;
  
  let currentRating: DayRating = 'GRAY';
  const habitCompletion = activeHabitCount > 0 ? activeHabitDone / activeHabitCount : 0;
  
  if ((activeHabitCount === 0 || habitCompletion === 1)) {
      currentRating = 'GOLD';
  } else if (habitCompletion >= 0.75) {
      currentRating = 'GREEN';
  }

  // Tomorrow Key Calculation
  const getTomorrowKey = () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
  };

  const handleAddTomorrowTask = async () => {
      if (!tomorrowTask.trim() || !tomorrowGoalId) return;
      
      const tomorrowKey = getTomorrowKey();
      
      // We manually construct Todo to save it with tomorrow's date
      const newTodo: Todo = { 
        id: crypto.randomUUID(), 
        goalId: tomorrowGoalId, 
        text: tomorrowTask, 
        effort: 'SHALLOW', 
        completed: false, 
        date: tomorrowKey 
      };
      
      await saveTodo(newTodo);
      // Reload page or just clear input? Since onAddTodo in props updates local state for TODAY, 
      // we might not see tomorrow's tasks immediately unless we have a specific view for it.
      // For now, clear input and show alert or just success.
      setTomorrowTask('');
  };

  // Get active goals for selector
  const activeGoals = data.goals.filter(g => g.status === GoalStatus.ACTIVE);

  const getRatingColor = (r: DayRating) => {
      switch(r) {
          case 'GOLD': return 'bg-yellow-50 text-yellow-900 border-yellow-200';
          case 'GREEN': return 'bg-green-50 text-green-900 border-green-200';
          default: return 'bg-gray-50 text-gray-900 border-gray-200';
      }
  };

  return (
    <div className="animate-fade-in max-w-2xl mx-auto pb-24">
      
      <div className="text-center mb-10">
          <h2 className="text-3xl font-serif font-medium">Daily Close</h2>
          <p className="text-notion-dim font-serif italic">Audit the day. Clear the mind. Plan the win.</p>
      </div>

      {/* 1. AUDIT */}
      <section className="mb-12">
          <div className={`p-8 rounded-xl border flex flex-col md:flex-row items-center justify-between transition-colors duration-500 ${getRatingColor(currentRating)}`}>
              <div className="text-center md:text-left mb-4 md:mb-0">
                  <div className="text-xs font-bold uppercase tracking-widest opacity-70 mb-1">Day Rating</div>
                  <div className="text-4xl font-serif font-bold flex items-center justify-center md:justify-start gap-3">
                      {currentRating === 'GOLD' && <Sparkles className="w-8 h-8" />}
                      {currentRating}
                  </div>
              </div>
              <div className="flex gap-8 text-center">
                  <div>
                      <div className="text-2xl font-bold">{activeHabitDone}/{activeHabitCount}</div>
                      <div className="text-[10px] uppercase tracking-wider opacity-70">Habits</div>
                  </div>
                  <div>
                      <div className="text-2xl font-bold">{energy}/5</div>
                      <div className="text-[10px] uppercase tracking-wider opacity-70">Energy</div>
                  </div>
              </div>
          </div>
          
          <div className="mt-6 flex justify-center gap-2">
                {[1,2,3,4,5].map(lvl => (
                    <button 
                        key={lvl}
                        onClick={() => setEnergy(lvl)}
                        className={`w-10 h-10 rounded-full text-sm font-bold transition-all ${energy === lvl ? 'bg-black text-white scale-110' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                    >
                        {lvl}
                    </button>
                ))}
          </div>
      </section>

      {/* 2. JOURNAL */}
      <section className="mb-12">
         <h3 className="text-sm font-bold text-notion-dim uppercase tracking-wider mb-4 flex items-center gap-2">
            <PenTool className="w-4 h-4" /> Brain Dump
         </h3>
         <textarea
            className="w-full h-40 p-5 text-base bg-white border border-notion-border rounded-xl outline-none font-serif placeholder:text-gray-300 resize-none focus:border-black transition-colors shadow-sm"
            placeholder="What worked? What didn't? Clear your head..."
            value={reviewText}
            onChange={e => setReviewText(e.target.value)}
        />
        
        <div 
            onClick={() => setEasyMode(!easyMode)}
            className={`mt-4 p-4 rounded-xl border cursor-pointer transition-all flex items-center gap-4 ${easyMode ? 'bg-blue-50 border-blue-200' : 'bg-white border-notion-border hover:border-blue-200'}`}
        >
            <div className={`w-5 h-5 rounded border flex items-center justify-center ${easyMode ? 'bg-blue-500 border-blue-500 text-white' : 'border-notion-dim bg-white'}`}>
                {easyMode && <Check className="w-3 h-3" />}
            </div>
            <div>
                <div className="font-bold text-sm text-notion-text">Easy Mode Prep</div>
                <div className="text-xs text-notion-dim">I have laid out my clothes/tasks for tomorrow morning.</div>
            </div>
        </div>
      </section>

      {/* 3. PLAN TOMORROW */}
      <section className="mb-12">
          <h3 className="text-sm font-bold text-notion-dim uppercase tracking-wider mb-4 flex items-center gap-2">
            <Sun className="w-4 h-4" /> Plan Tomorrow
         </h3>
         <div className="bg-notion-sidebar p-6 rounded-xl border border-notion-border">
             <p className="text-sm text-notion-dim mb-4 italic">"Start the day knowing exactly what you need to do."</p>
             
             <div className="flex flex-col gap-3">
                 <input 
                    className="p-3 rounded-lg border border-notion-border outline-none focus:border-black text-sm"
                    placeholder="Key task for tomorrow..."
                    value={tomorrowTask}
                    onChange={e => setTomorrowTask(e.target.value)}
                 />
                 <div className="flex gap-2">
                     <select 
                        className="flex-1 p-3 rounded-lg border border-notion-border outline-none focus:border-black text-sm bg-white"
                        value={tomorrowGoalId}
                        onChange={e => setTomorrowGoalId(e.target.value)}
                     >
                         <option value="" disabled>Select Goal</option>
                         {activeGoals.map(g => <option key={g.id} value={g.id}>{g.text}</option>)}
                     </select>
                     <button 
                        onClick={handleAddTomorrowTask}
                        disabled={!tomorrowTask || !tomorrowGoalId}
                        className="bg-black text-white px-6 rounded-lg font-bold text-sm hover:opacity-80 disabled:opacity-50"
                     >
                        Add
                     </button>
                 </div>
             </div>
             
             <div className="mt-4 text-xs text-gray-400 text-center">
                 Tasks added here will appear in "Today" tomorrow morning.
             </div>
         </div>
      </section>

      <div className="flex justify-center">
          <button 
              onClick={() => {
                  onAddReview(reviewText, easyMode, energy, currentRating);
                  alert("Day closed. Rest well.");
              }}
              className="bg-black text-white px-12 py-4 rounded-full font-bold text-lg hover:scale-105 transition-transform shadow-xl"
          >
              Close Day
          </button>
      </div>

    </div>
  );
};

export default ReflectTab;
