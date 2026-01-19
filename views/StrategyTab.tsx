import React, { useState, useEffect } from 'react';
import { AppData, Goal, GoalStatus, Habit, HabitType, WorkbookData } from '../types';
import { Printer, PenTool, Target, Map, Zap, AlertTriangle, Anchor, Check, Trash2, Plus, Clock, Sparkles } from '../components/Icon';
import AnnualReview from './AnnualReview';

// --- GOAL SYSTEM WIZARD (Mini-Wizard for Active Goals) ---
const GoalWizard: React.FC<{
    goal: Goal;
    onSave: (g: Goal, newHabits: Habit[]) => void;
    onCancel: () => void;
}> = ({ goal, onSave, onCancel }) => {
    const [step, setStep] = useState(1);
    
    // Definition
    const [text, setText] = useState(goal.text || '');
    const [metric, setMetric] = useState(goal.metric === 'To be defined' ? '' : goal.metric);
    const [motivation, setMotivation] = useState(goal.motivation || '');
    
    // System
    const [habits, setHabits] = useState<{text: string, defaultTime: string, reward: string}[]>([]);
    const [tempHabit, setTempHabit] = useState('');
    const [tempHabitTime, setTempHabitTime] = useState('');
    const [tempHabitReward, setTempHabitReward] = useState('');
    const [isAddingHabit, setIsAddingHabit] = useState(false);

    // Roadmap
    const [milestones, setMilestones] = useState(goal.milestones || []);
    const [tempMilestone, setTempMilestone] = useState('');

    const handleSave = () => {
        const finalGoal: Goal = {
            ...goal,
            text,
            metric: metric || 'Defined',
            motivation,
            milestones,
            needsConfig: false // Mark as configured
        };

        const newHabits = habits.map(h => ({
            id: crypto.randomUUID(),
            goalId: finalGoal.id,
            text: h.text,
            type: HabitType.BINARY,
            defaultTime: h.defaultTime || undefined,
            reward: h.reward || undefined,
            contributions: {}
        }));

        onSave(finalGoal, newHabits);
    };

    const addHabit = () => {
        if(tempHabit) {
            setHabits([...habits, { text: tempHabit, defaultTime: tempHabitTime, reward: tempHabitReward }]);
            setTempHabit(''); setTempHabitTime(''); setTempHabitReward('');
            setIsAddingHabit(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl max-w-2xl w-full p-8 shadow-2xl animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                    <h3 className="text-xl font-serif font-bold">Systemize: {goal.text}</h3>
                    <div className="flex gap-2">
                        {step > 1 && <button onClick={() => setStep(s => s - 1)} className="text-xs text-notion-dim hover:text-black">Back</button>}
                        <button onClick={onCancel} className="text-xs text-notion-dim hover:text-black">Cancel</button>
                    </div>
                </div>

                {step === 1 && (
                    <div className="space-y-6">
                        <div>
                            <label className="block text-xs font-bold uppercase mb-1 text-notion-dim">Refine Goal (Objective)</label>
                            <input className="w-full p-3 bg-gray-50 border border-transparent focus:bg-white focus:border-black rounded outline-none" value={text} onChange={e => setText(e.target.value)} />
                        </div>
                         <div>
                            <label className="block text-xs font-bold uppercase mb-1 text-notion-dim">Success Metric (Key Result)</label>
                            <input className="w-full p-3 bg-gray-50 border border-transparent focus:bg-white focus:border-black rounded outline-none" placeholder="e.g. 100 Paying Users" value={metric} onChange={e => setMetric(e.target.value)} autoFocus />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase mb-1 text-notion-dim">Motivation (The Why)</label>
                            <input className="w-full p-3 bg-gray-50 border border-transparent focus:bg-white focus:border-black rounded outline-none" placeholder="Why does this matter?" value={motivation} onChange={e => setMotivation(e.target.value)} />
                        </div>
                        <button onClick={() => setStep(2)} disabled={!metric} className="w-full py-3 bg-black text-white rounded font-bold hover:opacity-90 disabled:opacity-50 mt-4">Next: The System</button>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-6">
                        <div className="bg-blue-50 p-4 rounded text-blue-900 text-sm mb-4">
                            "You do not rise to the level of your goals. You fall to the level of your systems."
                        </div>
                        <ul className="space-y-2">
                            {habits.map((h, i) => (
                                <li key={i} className="flex justify-between items-center text-sm p-3 bg-white rounded border border-gray-200">
                                    <span className="font-medium">{h.text}</span>
                                    <button onClick={() => setHabits(habits.filter((_, idx) => idx !== i))}><Trash2 className="w-3 h-3 text-notion-dim" /></button>
                                </li>
                            ))}
                        </ul>
                         {isAddingHabit ? (
                             <div className="p-3 bg-gray-50 rounded border border-gray-200 flex flex-col gap-2">
                                <input className="p-2 text-sm bg-white border border-gray-200 rounded outline-none" placeholder="Habit (e.g. Write 500 words)" value={tempHabit} onChange={e => setTempHabit(e.target.value)} onKeyDown={e => e.key === 'Enter' && addHabit()} autoFocus />
                                <div className="flex gap-2">
                                    <input type="time" className="w-24 p-2 text-sm bg-white border border-gray-200 rounded outline-none" value={tempHabitTime} onChange={e => setTempHabitTime(e.target.value)} />
                                    <button onClick={addHabit} disabled={!tempHabit} className="px-4 bg-black text-white rounded text-xs font-bold">Add</button>
                                </div>
                            </div>
                        ) : (
                             <button onClick={() => setIsAddingHabit(true)} className="text-xs font-bold flex items-center gap-1 text-notion-dim hover:text-black"><Plus className="w-3 h-3" /> Add Habit</button>
                        )}
                        <button onClick={() => setStep(3)} className="w-full py-3 bg-black text-white rounded font-bold hover:opacity-90 mt-4">Next: Roadmap</button>
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-6">
                        <div className="space-y-2">
                             <label className="block text-xs font-bold uppercase mb-1 text-notion-dim">Milestones (Checkpoints)</label>
                             <div className="flex gap-2">
                                 <input className="flex-1 p-3 bg-gray-50 border border-transparent focus:bg-white focus:border-black rounded outline-none" placeholder="Add milestone..." value={tempMilestone} onChange={e => setTempMilestone(e.target.value)} onKeyDown={e => e.key === 'Enter' && (setMilestones([...milestones, {id: crypto.randomUUID(), text: tempMilestone, completed: false}]), setTempMilestone(''))} />
                                 <button onClick={() => { if(tempMilestone) { setMilestones([...milestones, {id: crypto.randomUUID(), text: tempMilestone, completed: false}]); setTempMilestone(''); }}} className="px-4 bg-black text-white rounded font-bold">Add</button>
                             </div>
                             <ul className="space-y-1 mt-2">
                                 {milestones.map(m => (
                                     <li key={m.id} className="flex items-center gap-2 text-sm p-2 border-b border-gray-100">
                                         <div className="w-1.5 h-1.5 rounded-full bg-black"></div>
                                         <span className="flex-1">{m.text}</span>
                                         <button onClick={() => setMilestones(milestones.filter(x => x.id !== m.id))}><Trash2 className="w-3 h-3 text-notion-dim hover:text-black"/></button>
                                     </li>
                                 ))}
                             </ul>
                        </div>
                        <button onClick={handleSave} className="w-full py-4 bg-black text-white rounded font-bold text-lg hover:scale-[1.01] transition-transform shadow-lg mt-8">
                            Initialize Directive
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};


interface StrategyTabProps {
  data: AppData;
  onUpdateGoal: (goal: Goal) => void;
  onDeleteGoal: (id: string) => void;
  onAddHabit: (habit: Habit) => void;
  onDeleteHabit: (id: string) => void;
  
  // To launch review
  onCompleteReview: (wb: WorkbookData, active: Goal[], backlog: Goal[]) => void;
  
  // Legacy props kept for compatibility if needed, though mostly unused now
  onAddStrategicItem: (item: any) => void;
  onDeleteStrategicItem: (id: string) => void;
  onAddGoal: (goal: Goal) => void;
  onUpdateGlobalRules: (rules: any) => void;
  onUpdateFullData: (wb: any, active: any, backlog: any, strat: any, rules: any) => void;
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
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
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

      {/* SYSTEMIZE MODAL */}
      {editingGoal && (
          <GoalWizard 
            goal={editingGoal}
            onCancel={() => setEditingGoal(null)}
            onSave={(updatedGoal, newHabits) => {
                onUpdateGoal(updatedGoal);
                newHabits.forEach(h => onAddHabit(h));
                setEditingGoal(null);
            }}
          />
      )}

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
                        
                        // --- UNCONFIGURED GOAL STATE ---
                        if (goal.needsConfig) {
                            return (
                                <div key={goal.id} className="bg-yellow-50 border-2 border-yellow-400 rounded-xl p-8 flex flex-col items-center justify-center text-center gap-4 shadow-sm animate-pulse-slow">
                                    <AlertTriangle className="w-8 h-8 text-yellow-600" />
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-yellow-700">Action Required</div>
                                        <h3 className="text-xl font-bold text-yellow-900">{goal.text}</h3>
                                        <p className="text-sm text-yellow-700 mt-1">This directive needs a system. Define success metrics and habits.</p>
                                    </div>
                                    <button 
                                        onClick={() => setEditingGoal(goal)}
                                        className="mt-2 px-6 py-3 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-bold rounded shadow-sm transition-colors flex items-center gap-2"
                                    >
                                        <Zap className="w-4 h-4" /> ⚙️ Systemize Goal
                                    </button>
                                </div>
                            );
                        }

                        // --- CONFIGURED GOAL STATE ---
                        return (
                             <div key={goal.id} className="bg-white border border-notion-border rounded-xl shadow-sm relative overflow-hidden group">
                                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                     <button onClick={() => setEditingGoal(goal)} className="p-1.5 hover:bg-gray-100 text-gray-400 hover:text-black rounded"><PenTool className="w-3 h-3" /></button>
                                    <button onClick={() => onDeleteGoal(goal.id)} className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded"><Trash2 className="w-3 h-3" /></button>
                                </div>

                                <div className="p-8 border-b border-notion-border bg-gray-50/50">
                                    <div className="text-[10px] text-notion-dim font-bold uppercase tracking-wider mb-2">Priority 0{idx + 1}</div>
                                    <h3 className="text-2xl font-serif font-bold mb-2">{goal.text}</h3>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-xs font-mono bg-white px-2 py-0.5 border border-gray-200 rounded">{goal.metric}</span>
                                    </div>
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

                    {/* Deep Work */}
                    <div className="bg-gray-50 p-6 border border-gray-200">
                        <h3 className="text-xs font-bold uppercase tracking-widest border-b border-black pb-2 mb-4">Second-Order Thinking</h3>
                        <p className="font-serif leading-relaxed text-lg whitespace-pre-wrap">{currentWorkbook.secondOrderThinking}</p>
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