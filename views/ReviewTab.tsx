import React, { useState, useEffect } from 'react';
import { AppData, ReviewEntry, HabitType, DayRating, GoalStatus } from '../types';
import { Brain, AlertTriangle, PenTool, Sparkles, Check, X, Ban } from '../components/Icon';

interface ReviewTabProps {
  data: AppData;
  todayKey: string;
  onAddReview: (text: string, easyMode: boolean, energy: number, rating: DayRating) => void;
  onToggleHabit: (id: string, val: number) => void;
}

const ReviewTab: React.FC<ReviewTabProps> = ({ data, todayKey, onAddReview, onToggleHabit }) => {
  const [reviewText, setReviewText] = useState('');
  const [easyMode, setEasyMode] = useState(false);
  const [energy, setEnergy] = useState(3);
  
  // Load existing data if available
  useEffect(() => {
      const existing = data.reviews.find(r => r.date === todayKey);
      if (existing) {
          setReviewText(existing.text);
          setEasyMode(existing.easyMode);
          setEnergy(existing.energyLevel);
      }
  }, [data.reviews, todayKey]);

  // Calculate Status Live
  const nonNegotiables = data.habits.filter(h => h.type === HabitType.NON_NEGOTIABLE);
  const activeHabits = data.habits.filter(h => {
      const goal = data.goals.find(g => g.id === h.goalId);
      return goal?.status === GoalStatus.ACTIVE && h.type !== HabitType.NON_NEGOTIABLE;
  });

  // Calculation Logic
  // 1. Habits: % Completed
  // 2. Rules: All kept (value 1) = Pass. Any broken (value 0 or missing if we assume explicit 1 needed)
  // Let's simplify: 
  // Non-Negotiables: Must be 1 (Active Success) to count towards Gold.
  
  const activeHabitCount = activeHabits.length;
  const activeHabitDone = activeHabits.filter(h => (h.contributions[todayKey] || 0) > 0).length;
  
  const rulesCount = nonNegotiables.length;
  // For non-negotiables in this view, we assume Undefined = Success (Kept the rule), Explicit 0 = Failed.
  // Wait, storage logic was: 1 = Done.
  // Let's stick to storage: If stored value is 1, it is kept. If 0 or undefined, it's NOT kept.
  // BUT the UI below initializes them as 1 (Success) if undefined.
  const rulesKept = nonNegotiables.filter(h => {
     const val = h.contributions[todayKey];
     return val === undefined || val === 1; // Undefined treated as success visually, so we count it as success
  }).length;

  // Rating
  let currentRating: DayRating = 'GRAY';
  const habitCompletion = activeHabitCount > 0 ? activeHabitDone / activeHabitCount : 0;
  
  // Gold: 100% Habits + All Rules Kept (ignoring empty habits list)
  if ((activeHabitCount === 0 || habitCompletion === 1) && rulesKept === rulesCount) {
      currentRating = 'GOLD';
  } else if (habitCompletion >= 0.75 && rulesKept === rulesCount) {
      currentRating = 'GREEN';
  }

  const handleSubmit = () => {
    onAddReview(reviewText, easyMode, energy, currentRating);
    alert("Day closed. See you tomorrow.");
  };

  const getRatingColor = (r: DayRating) => {
      switch(r) {
          case 'GOLD': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
          case 'GREEN': return 'bg-green-100 text-green-800 border-green-200';
          default: return 'bg-gray-100 text-gray-800 border-gray-200';
      }
  };

  return (
    <div className="animate-fade-in max-w-2xl mx-auto pb-20">
      
      {/* Day Status Banner */}
      <div className={`p-6 rounded-lg border flex items-center justify-between mb-8 transition-colors duration-500 ${getRatingColor(currentRating)}`}>
          <div>
              <div className="text-xs font-bold uppercase tracking-wider opacity-70">Current Status</div>
              <div className="text-2xl font-serif font-bold flex items-center gap-2">
                  {currentRating === 'GOLD' && <Sparkles className="w-6 h-6" />}
                  {currentRating} DAY
              </div>
          </div>
          <div className="text-right text-xs opacity-70">
              <div>Habits: {activeHabitDone}/{activeHabitCount}</div>
              <div>Rules: {rulesKept}/{rulesCount}</div>
          </div>
      </div>

      <div className="space-y-10">
          
          {/* Section 1: Non-Negotiables (Rules) */}
          <section>
              <h3 className="text-sm font-bold text-notion-dim uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Ban className="w-4 h-4" /> Non-Negotiables
              </h3>
              <div className="bg-white border border-notion-border rounded-lg overflow-hidden">
                 {nonNegotiables.length === 0 && <div className="p-4 text-sm text-notion-dim italic">No rules defined.</div>}
                 {nonNegotiables.map(rule => {
                     // Logic: Undefined (default) or 1 = Success. 0 = Fail.
                     const isKept = rule.contributions[todayKey] !== 0; 
                     
                     return (
                         <div 
                            key={rule.id} 
                            onClick={() => onToggleHabit(rule.id, isKept ? 0 : 1)}
                            className="p-4 border-b border-notion-border last:border-0 flex items-center justify-between cursor-pointer hover:bg-notion-sidebar transition-colors"
                         >
                             <span className={`text-sm ${!isKept ? 'line-through text-red-400' : ''}`}>{rule.text}</span>
                             <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${isKept ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                 {isKept ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                             </div>
                         </div>
                     );
                 })}
              </div>
              <p className="text-xs text-notion-dim mt-2 pl-1">
                  *Rules start successfully. Click to mark as broken.
              </p>
          </section>

          {/* Section 2: Easy Mode */}
          <section>
               <h3 className="text-sm font-bold text-notion-dim uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Brain className="w-4 h-4" /> Tomorrow's Setup
              </h3>
              <div 
                onClick={() => setEasyMode(!easyMode)}
                className={`p-4 rounded-lg border cursor-pointer transition-all flex items-center gap-4 ${easyMode ? 'bg-blue-50 border-blue-200' : 'bg-white border-notion-border hover:border-blue-200'}`}
              >
                  <div className={`w-5 h-5 rounded border flex items-center justify-center ${easyMode ? 'bg-blue-500 border-blue-500 text-white' : 'border-notion-dim'}`}>
                      {easyMode && <Check className="w-3 h-3" />}
                  </div>
                  <div>
                      <div className="font-medium text-sm text-notion-text">Easy Mode Activated</div>
                      <div className="text-xs text-notion-dim">Did you lay out clothes/tasks for tomorrow?</div>
                  </div>
              </div>
          </section>

          {/* Section 3: Reflection */}
          <section>
             <h3 className="text-sm font-bold text-notion-dim uppercase tracking-wider mb-4">Daily Log</h3>
             <textarea
                className="w-full h-32 p-4 text-sm bg-white border border-notion-border rounded-lg outline-none font-serif placeholder:text-notion-dim resize-none focus:border-black transition-colors"
                placeholder="Briefly: What was the highlight? What was the struggle?"
                value={reviewText}
                onChange={e => setReviewText(e.target.value)}
            />
            
            <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-notion-dim">Energy:</span>
                    {[1,2,3,4,5].map(lvl => (
                        <button 
                            key={lvl}
                            onClick={() => setEnergy(lvl)}
                            className={`w-6 h-6 rounded text-xs transition-colors ${energy === lvl ? 'bg-black text-white' : 'bg-notion-sidebar text-notion-dim hover:bg-notion-hover'}`}
                        >
                            {lvl}
                        </button>
                    ))}
                </div>
                <button 
                    onClick={handleSubmit}
                    className="flex items-center gap-2 bg-black text-white px-6 py-2 rounded text-sm hover:opacity-80 transition-opacity shadow-sm"
                >
                    <PenTool className="w-3 h-3" /> Close Day
                </button>
            </div>
          </section>

      </div>
    </div>
  );
};

export default ReviewTab;
