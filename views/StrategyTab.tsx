import React, { useState, useEffect } from 'react';
import { AppData, Goal, GoalStatus, Habit, GlobalRules, StrategicItem, WorkbookData } from '../types';
import { Printer, PenTool, Target, Map, Zap, AlertTriangle, Anchor, Check, Trash2, Plus } from '../components/Icon';
import AnnualReview from './AnnualReview';

interface StrategyTabProps {
  data: AppData;
  onUpdateGoal: (goal: Goal) => void;
  onDeleteGoal: (id: string) => void;
  onAddHabit: (habit: Habit) => void;
  onDeleteHabit: (id: string) => void;
  
  // To launch review
  onCompleteReview: (wb: WorkbookData, active: Goal[], backlog: Goal[]) => void;
}

const StrategyTab: React.FC<StrategyTabProps> = ({ 
  data, 
  onUpdateGoal,
  onDeleteGoal,
  onAddHabit,
  onDeleteHabit,
  onCompleteReview
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string>("2026");

  // Get available years from data, default to 2026 if empty
  const availableYears = Object.keys(data.workbookReviews).sort().reverse();
  const hasReviews = availableYears.length > 0;

  // Auto-select latest year on load
  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears]);

  // If no reviews at all, show empty state forcing a review
  if (!hasReviews && !isEditing) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 text-center animate-fade-in">
            <h1 className="text-4xl font-serif">Annual Review</h1>
            <p className="text-notion-dim max-w-md">No strategic data found. Initialize your first annual review to generate the manifesto.</p>
            <button onClick={() => setIsEditing(true)} className="px-6 py-3 bg-black text-white font-bold rounded hover:opacity-80">
                Begin Review 2026
            </button>
        </div>
      );
  }

  if (isEditing) {
      return (
        <AnnualReview 
            initialYear={selectedYear || "2026"}
            onCancel={() => setIsEditing(false)}
            onComplete={(wb, active, backlog) => {
                onCompleteReview(wb, active, backlog);
                setIsEditing(false);
                setSelectedYear(wb.year);
            }}
        />
      );
  }

  const activeGoals = data.goals.filter(g => g.status === GoalStatus.ACTIVE);
  const backlogGoals = data.goals.filter(g => g.status === GoalStatus.BACKLOG);
  
  // Determine which workbook data to show in Archive
  const currentWorkbook = data.workbookReviews[selectedYear];

  return (
    <div className="max-w-6xl mx-auto pb-20 animate-fade-in">
      
      {/* HEADER Actions */}
      <div className="flex justify-end mb-8 no-print">
         <button onClick={() => setIsEditing(true)} className="flex items-center gap-1 text-xs font-bold bg-black text-white px-3 py-1.5 rounded hover:opacity-80">
            <Plus className="w-3 h-3" /> New Annual Review
         </button>
      </div>

      {/* ================= ZONE 1: THE ACTION BOARD (Current State) ================= */}
      <section className="mb-20">
          <div className="flex justify-between items-end border-b border-black pb-4 mb-8">
             <div>
                <h2 className="text-4xl font-serif text-notion-text">The Action Board</h2>
                <p className="text-notion-dim font-serif italic text-lg">Active Directives & System.</p>
             </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Active Goals */}
              <div className="lg:col-span-2 space-y-6">
                   {activeGoals.map((goal, idx) => {
                        const habits = data.habits.filter(h => h.goalId === goal.id);
                        return (
                             <div key={goal.id} className="bg-white border border-notion-border rounded-xl shadow-sm relative overflow-hidden group">
                                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => onDeleteGoal(goal.id)} className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded"><Trash2 className="w-3 h-3" /></button>
                                </div>

                                <div className="p-8 border-b border-notion-border bg-gray-50/50">
                                    <div className="text-[10px] text-notion-dim font-bold uppercase tracking-wider mb-2">Priority 0{idx + 1}</div>
                                    <h3 className="text-2xl font-serif font-bold mb-2">{goal.text}</h3>
                                    <p className="text-sm text-notion-dim italic">"{goal.motivation || 'No motivation defined.'}"</p>
                                </div>
                                <div className="p-6">
                                    <div className="text-xs font-bold text-black mb-3 flex items-center gap-1"><Anchor className="w-3 h-3" /> SYSTEM (Daily Habits)</div>
                                    <ul className="space-y-2 mb-4">
                                        {habits.map(h => (
                                            <li key={h.id} className="text-sm flex justify-between items-center border-b border-dashed border-gray-200 pb-1">
                                                <span>{h.text}</span>
                                                <button onClick={() => onDeleteHabit(h.id)} className="opacity-0 hover:opacity-100 group-hover:opacity-50"><Trash2 className="w-3 h-3 text-gray-300" /></button>
                                            </li>
                                        ))}
                                        {habits.length === 0 && <li className="text-xs text-gray-400 italic">No system installed.</li>}
                                    </ul>
                                </div>
                             </div>
                        );
                   })}
                   {activeGoals.length === 0 && <div className="p-12 border-2 border-dashed border-gray-200 rounded text-center text-gray-400">No active goals.</div>}
              </div>

              {/* Backlog */}
              <div>
                  <div className="bg-notion-sidebar rounded-xl border border-notion-border p-6 min-h-[200px]">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-notion-dim mb-4 flex items-center gap-2">
                          Avoid List / Backlog
                      </h3>
                      <ul className="space-y-3">
                          {backlogGoals.map(g => (
                              <li key={g.id} className="p-3 bg-white border border-gray-200 rounded shadow-sm text-sm text-notion-text">
                                  {g.text}
                              </li>
                          ))}
                          {backlogGoals.length === 0 && <li className="text-xs text-gray-400 italic">Empty.</li>}
                      </ul>
                  </div>
              </div>
          </div>
      </section>

      {/* ================= ZONE 2: THE ARCHIVE (Manifesto) ================= */}
      <section>
           <div className="flex items-center gap-6 border-b border-gray-200 mb-8">
               {availableYears.map(year => (
                   <button 
                      key={year}
                      onClick={() => setSelectedYear(year)}
                      className={`pb-2 text-xl font-serif transition-colors ${selectedYear === year ? 'text-black border-b-2 border-black' : 'text-gray-300 hover:text-gray-500'}`}
                   >
                       {year} Manifesto
                   </button>
               ))}
           </div>

           {currentWorkbook ? (
               <div className="max-w-4xl mx-auto space-y-16 animate-in fade-in slide-in-from-bottom-2">
                    
                    {/* Header */}
                    <div className="text-center">
                        <h2 className="text-4xl font-serif font-bold mb-2">The {currentWorkbook.year} Contract</h2>
                        <div className="text-notion-dim text-sm uppercase tracking-widest">Signed by {currentWorkbook.signatureName}</div>
                    </div>

                    {/* Audit */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                             <h3 className="text-xs font-bold uppercase tracking-widest border-b border-black pb-2 mb-4">Key to Success</h3>
                             <p className="font-serif leading-relaxed text-lg">{currentWorkbook.keySuccess}</p>
                        </div>
                         <div>
                             <h3 className="text-xs font-bold uppercase tracking-widest border-b border-black pb-2 mb-4">Time Audit</h3>
                             <p className="font-serif leading-relaxed text-lg">{currentWorkbook.timeAudit}</p>
                        </div>
                    </div>

                    {/* Momentum */}
                    <div>
                        <h3 className="text-xs font-bold uppercase tracking-widest border-b border-black pb-2 mb-6">Momentum (Unblocking)</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {currentWorkbook.momentum.map((m, i) => (
                                <div key={i} className="bg-gray-50 p-4 border border-gray-200">
                                    <div className="font-bold text-sm mb-1">{m.item}</div>
                                    <div className="text-xs italic text-notion-dim">Start: {m.step}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Identity */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                        <div className="bg-white border border-gray-200 p-6 rounded-xl">
                             <h3 className="text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2"><Zap className="w-4 h-4"/> Assets</h3>
                             <ul className="space-y-4">
                                 {currentWorkbook.strengths.map((s, i) => (
                                     <li key={i}>
                                         <div className="font-bold text-sm">{s.strength}</div>
                                         <div className="text-xs text-notion-dim">{s.application}</div>
                                     </li>
                                 ))}
                             </ul>
                        </div>
                        <div className="bg-white border border-gray-200 p-6 rounded-xl">
                             <h3 className="text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4"/> Liabilities</h3>
                             <ul className="space-y-4">
                                 {currentWorkbook.weaknesses.map((s, i) => (
                                     <li key={i}>
                                         <div className="font-bold text-sm">{s.weakness}</div>
                                         <div className="text-xs text-notion-dim">Fix: {s.workaround}</div>
                                     </li>
                                 ))}
                             </ul>
                        </div>
                    </div>

                    {/* Rules */}
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                        <div>
                             <h3 className="text-xs font-bold uppercase tracking-widest border-b border-black pb-2 mb-4">Prescriptions (Always)</h3>
                             <ul className="list-disc pl-5 space-y-2 font-serif text-lg">
                                 {currentWorkbook.prescriptions.map((r, i) => <li key={i}>{r}</li>)}
                             </ul>
                        </div>
                        <div>
                             <h3 className="text-xs font-bold uppercase tracking-widest border-b border-black pb-2 mb-4">Anti-Goals (Never)</h3>
                             <ul className="list-disc pl-5 space-y-2 font-serif text-lg">
                                 {currentWorkbook.antiGoals.map((r, i) => <li key={i}>{r}</li>)}
                             </ul>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="text-center pt-12 border-t border-gray-100">
                        <p className="text-notion-dim text-xs italic">
                            Digitally signed on {currentWorkbook.signedAt ? new Date(currentWorkbook.signedAt).toLocaleDateString() : 'Unknown Date'}
                        </p>
                    </div>

               </div>
           ) : (
               <div className="text-center py-20 text-gray-400 italic">
                   No manifesto recorded for {selectedYear}.
               </div>
           )}
      </section>

    </div>
  );
};

export default StrategyTab;