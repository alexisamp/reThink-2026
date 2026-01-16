import React, { useState, useEffect } from 'react';
import { AppData, ReviewEntry } from '../types';
import { Brain, AlertTriangle, PenTool } from '../components/Icon';

interface ReviewTabProps {
  data: AppData;
  todayKey: string;
  onAddReview: (text: string) => void;
}

const ReviewTab: React.FC<ReviewTabProps> = ({ data, todayKey, onAddReview }) => {
  const [reviewText, setReviewText] = useState('');
  const [bottleneck, setBottleneck] = useState<{habit: string, goal: string} | null>(null);

  // Socratic Logic: Check for habits missed 3 days in a row ending yesterday
  useEffect(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Check past 3 days
    const checkDays = [];
    for(let i=0; i<3; i++) {
        const d = new Date(yesterday);
        d.setDate(d.getDate() - i);
        checkDays.push(d.toISOString().split('T')[0]);
    }

    // Find a habit with 0 contributions in these days
    const strugglingHabit = data.habits.find(h => {
        // Only check habits attached to active goals
        const parentGoal = data.goals.find(g => g.id === h.goalId);
        if(!parentGoal || parentGoal.status !== 'ACTIVE') return false;
        
        // Check if all 3 days are empty/0
        return checkDays.every(dayKey => !h.contributions[dayKey]);
    });

    if (strugglingHabit) {
        const parentGoal = data.goals.find(g => g.id === strugglingHabit.goalId);
        setBottleneck({
            habit: strugglingHabit.text,
            goal: parentGoal?.text || 'Unknown Goal'
        });
    } else {
        setBottleneck(null);
    }

  }, [data.habits]);

  const handleSubmit = () => {
    if(!reviewText.trim()) return;
    onAddReview(reviewText);
    setReviewText('');
  };

  const todaysEntry = data.reviews.find(r => r.date === todayKey);

  return (
    <div className="space-y-8 animate-fade-in max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-6 justify-center">
        <Brain className="w-6 h-6 text-notion-text" />
        <h2 className="text-xl font-serif">Daily Check-in</h2>
      </div>

      {/* Bottleneck Alert */}
      {bottleneck && (
        <div className="bg-orange-50 border border-orange-200 p-6 rounded-lg shadow-sm">
           <div className="flex items-start gap-4">
              <div className="p-2 bg-orange-100 rounded-full text-orange-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                 <h3 className="font-medium text-orange-900 mb-1">Bottleneck Detected</h3>
                 <p className="text-sm text-orange-800 mb-3">
                    You've missed <strong>"{bottleneck.habit}"</strong> for 3 days in a row. 
                    This creates friction for your goal: <em>{bottleneck.goal}</em>.
                 </p>
                 <div className="bg-white p-4 rounded text-sm text-notion-text border border-orange-100 italic font-serif">
                    "Is this a lack of capability (skill), or a fake dependency? Try shrinking the habit: 
                    Can you do a 2-minute version of it today?"
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Review Input */}
      <div className="bg-white border border-notion-border rounded-lg p-1 shadow-sm">
        <textarea
          className="w-full h-48 p-4 text-notion-text resize-none outline-none font-serif placeholder:text-notion-dim"
          placeholder="What worked today? What didn't? Clear your mind..."
          value={reviewText}
          onChange={e => setReviewText(e.target.value)}
        />
        <div className="bg-notion-sidebar p-2 flex justify-between items-center rounded-b-md">
            <span className="text-xs text-notion-dim pl-2">
                {todaysEntry ? 'You have already journaled today.' : 'Reflect to disconnect.'}
            </span>
            <button 
                onClick={handleSubmit}
                className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded text-sm hover:opacity-80 transition-opacity"
            >
                <PenTool className="w-3 h-3" /> Save Entry
            </button>
        </div>
      </div>

      {/* Previous Entries (Simple List) */}
      <div className="space-y-4 pt-8 border-t border-notion-border">
         <h3 className="text-sm font-bold text-notion-dim uppercase tracking-wider">Recent Thoughts</h3>
         {data.reviews.slice(-3).reverse().map((entry, idx) => (
             <div key={idx} className="p-4 bg-notion-sidebar rounded text-sm">
                 <div className="text-xs text-notion-dim mb-2 font-mono">{entry.date}</div>
                 <p className="font-serif text-notion-text">{entry.text}</p>
             </div>
         ))}
      </div>
    </div>
  );
};

export default ReviewTab;
