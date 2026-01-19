import React, { useState, useEffect } from 'react';
import { AppData, Goal, GoalStatus, Habit, HabitType, WorkbookData } from '../types';
import { Printer, PenTool, Target, Map, Zap, AlertTriangle, Anchor, Check, Trash2, Plus, Clock, Sparkles, Ban } from '../components/Icon';
import AnnualReview from './AnnualReview';

// --- GOAL SYSTEM WIZARD ---
const GoalWizard: React.FC<{
    goal: Goal;
    onSave: (g: Goal, newHabits: Habit[]) => void;
    onCancel: () => void;
}> = ({ goal, onSave, onCancel }) => {
    const [step, setStep] = useState(1);
    
    // Step 1: Definition
    const [text, setText] = useState(goal.text || '');
    const [metric, setMetric] = useState(goal.metric === 'To be defined' ? '' : goal.metric);
    const [motivation, setMotivation] = useState(goal.motivation || '');
    
    // Step 2: System
    const [habits, setHabits] = useState<{text: string, defaultTime: string, reward: string}[]>([]);
    const [tempHabit, setTempHabit] = useState('');
    const [tempTime, setTempTime] = useState('');
    const [tempReward, setTempReward] = useState('');
    const [isAddingHabit, setIsAddingHabit] = useState(false);

    // Step 3: Roadmap
    const [milestones, setMilestones] = useState(goal.milestones || []);
    const [tempMilestone, setTempMilestone] = useState('');

    const handleSave = () => {
        const finalGoal: Goal = {
            ...goal,
            text,
            metric: metric || 'Defined',
            motivation,
            milestones,
            needsConfig: false // Mark systemized
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
            setHabits([...habits, { text: tempHabit, defaultTime: tempTime, reward: tempReward }]);
            setTempHabit(''); setTempTime(''); setTempReward('');
            setIsAddingHabit(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-white z-[200] flex items-center justify-center p-4">
            <div className="max-w-2xl w-full p-8 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-12 border-b-2 border-black pb-4">
                    <h3 className="text-3xl font-serif font-bold">Systemize: {goal.text}</h3>
                    <div className="flex gap-4">
                        {step > 1 && <button onClick={() => setStep(s => s - 1)} className="text-sm font-bold underline">Back</button>}
                        <button onClick={onCancel} className="text-sm text-gray-400 hover:text-black">Cancel</button>
                    </div>
                </div>

                {step === 1 && (
                    <div className="space-y-8">
                        <div>
                            <label className="block text-xs font-bold uppercase mb-2">Objective (Refine)</label>
                            <input className="w-full p-4 bg-gray-50 border-b border-gray-200 focus:border-black outline-none font-medium" value={text} onChange={e => setText(e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase mb-2">Success Metric (Key Result)</label>
                            <input className="w-full p-4 bg-gray-50 border-b border-gray-200 focus:border-black outline-none font-medium" placeholder="e.g. 100 Paying Users" value={metric} onChange={e => setMetric(e.target.value)} autoFocus />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase mb-2">Motivation (Why)</label>
                            <input className="w-full p-4 bg-gray-50 border-b border-gray-200 focus:border-black outline-none font-medium" placeholder="Why does this matter?" value={motivation} onChange={e => setMotivation(e.target.value)} />
                        </div>
                        <button onClick={() => setStep(2)} disabled={!metric} className="w-full py-4 bg-black text-white font-bold hover:opacity-90 disabled:opacity-50 mt-8">Next: The System</button>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-8">
                        <div className="bg-gray-50 p-4 border border-gray-200 italic font-serif text-sm">
                            "You do not rise to the level of your goals. You fall to the level of your systems."
                        </div>
                        
                        <div className="space-y-3">
                             {habits.map((h, i) => (
                                <div key={i} className="flex justify-between items-center p-4 border border-gray-200">
                                    <div>
                                        <div className="font-bold">{h.text}</div>
                                        <div className="text-xs text-gray-500 flex gap-2 mt-1">
                                            {h.defaultTime && <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {h.defaultTime}</span>}
                                            {h.reward && <span className="flex items-center gap-1"><Sparkles className="w-3 h-3"/> {h.reward}</span>}
                                        </div>
                                    </div>
                                    <button onClick={() => setHabits(habits.filter((_, idx) => idx !== i))}><Trash2 className="w-4 h-4 text-gray-300 hover:text-black" /></button>
                                </div>
                            ))}
                        </div>

                        {isAddingHabit ? (
                             <div className="p-6 bg-gray-50 border border-gray-200 space-y-4">
                                <div>
                                    <label className="block text-[10px] font-bold uppercase mb-1">Habit</label>
                                    <input className="w-full p-2 border-b border-gray-300 bg-transparent outline-none" placeholder="e.g. Write 500 words" value={tempHabit} onChange={e => setTempHabit(e.target.value)} autoFocus />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                     <div>
                                        <label className="block text-[10px] font-bold uppercase mb-1">Time (Optional)</label>
                                        <input type="time" className="w-full p-2 border-b border-gray-300 bg-transparent outline-none" value={tempTime} onChange={e => setTempTime(e.target.value)} />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold uppercase mb-1">Reward (Optional)</label>
                                        <input className="w-full p-2 border-b border-gray-300 bg-transparent outline-none" placeholder="e.g. Coffee" value={tempReward} onChange={e => setTempReward(e.target.value)} />
                                    </div>
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <button onClick={addHabit} disabled={!tempHabit} className="px-6 py-2 bg-black text-white text-xs font-bold">Add Habit</button>
                                    <button onClick={() => setIsAddingHabit(false)} className="px-4 py-2 text-xs font-bold">Cancel</button>
                                </div>
                            </div>
                        ) : (
                             <button onClick={() => setIsAddingHabit(true)} className="flex items-center gap-2 font-bold text-sm border-b border-black pb-0.5"><Plus className="w-4 h-4" /> Add Daily Habit</button>
                        )}

                        <button onClick={() => setStep(3)} className="w-full py-4 bg-black text-white font-bold hover:opacity-90 mt-8">Next: Roadmap</button>
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-8">
                        <div>
                             <label className="block text-xs font-bold uppercase mb-2">Milestones (Checkpoints)</label>
                             <div className="flex gap-2">
                                 <input className="flex-1 p-3 bg-gray-50 border-b border-gray-200 outline-none" placeholder="Add milestone..." value={tempMilestone} onChange={e => setTempMilestone(e.target.value)} onKeyDown={e => e.key === 'Enter' && (setMilestones([...milestones, {id: crypto.randomUUID(), text: tempMilestone, completed: false}]), setTempMilestone(''))} />
                                 <button onClick={() => { if(tempMilestone) { setMilestones([...milestones, {id: crypto.randomUUID(), text: tempMilestone, completed: false}]); setTempMilestone(''); }}} className="px-6 bg-black text-white font-bold">Add</button>
                             </div>
                             <ul className="space-y-2 mt-4">
                                 {milestones.map(m => (
                                     <li key={m.id} className="flex items-center gap-3 p-3 border-b border-gray-100">
                                         <div className="w-2 h-2 rounded-full bg-black"></div>
                                         <span className="flex-1 font-medium">{m.text}</span>
                                         <button onClick={() => setMilestones(milestones.filter(x => x.id !== m.id))}><Trash2 className="w-3 h-3 text-gray-300 hover:text-black"/></button>
                                     </li>
                                 ))}
                             </ul>
                        </div>
                        <button onClick={handleSave} className="w-full py-5 bg-black text-white rounded-none font-bold text-xl hover:scale-[1.01] transition-transform shadow-2xl mt-8 border border-black">
                            Initialize Directive
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---
interface StrategyTabProps {
  data: AppData;
  onUpdateGoal: (goal: Goal) => void;
  onDeleteGoal: (id: string) => void;
  onAddHabit: (habit: Habit) => void;
  onDeleteHabit: (id: string) => void;
  onCompleteReview: (wb: WorkbookData, active: Goal[], backlog: Goal[]) => void;
  // Legacy unused
  onAddStrategicItem: any; onDeleteStrategicItem: any; onAddGoal: any; onUpdateGlobalRules: any; onUpdateFullData: any;
}

const StrategyTab: React.FC<StrategyTabProps> = ({ 
  data, 
  onUpdateGoal, onDeleteGoal, onAddHabit, onDeleteHabit, onCompleteReview 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>("2026");

  const availableYears = Object.keys(data.workbookReviews).sort().reverse();

  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears]);

  if (availableYears.length === 0 && !isEditing) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 text-center animate-fade-in">
            <h1 className="text-5xl font-serif font-medium mb-4">reThink 2026</h1>
            <p className="text-gray-500 max-w-md text-lg">Identity determines behavior. Build your system.</p>
            <button onClick={() => setIsEditing(true)} className="px-8 py-4 bg-black text-white font-bold text-lg hover:opacity-90 transition-opacity">
                Initialize Annual Review
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
  const currentWorkbook = data.workbookReviews[selectedYear];

  return (
    <div className="max-w-6xl mx-auto pb-32 animate-fade-in">
      
      <div className="flex justify-end mb-12 no-print">
         <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest bg-white border border-black px-4 py-2 hover:bg-black hover:text-white transition-colors">
            <Plus className="w-3 h-3" /> New Review
         </button>
      </div>

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

      {/* --- ZONE 1: ACTIVE GOALS --- */}
      <section className="mb-24">
          <h2 className="text-4xl font-serif mb-8">The Action Board</h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                   {activeGoals.map((goal, idx) => {
                        const habits = data.habits.filter(h => h.goalId === goal.id);

                        // --- UNCONFIGURED: BLACK & WHITE STRONG UI ---
                        if (goal.needsConfig) {
                            return (
                                <div key={goal.id} className="border-2 border-black p-8 flex flex-col items-center justify-center text-center gap-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-white">
                                    <div className="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center">
                                        <AlertTriangle className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Priority {idx + 1}</div>
                                        <h3 className="text-3xl font-serif font-bold">{goal.text}</h3>
                                        <p className="text-gray-500 mt-2">Directive established. System required.</p>
                                    </div>
                                    <button 
                                        onClick={() => setEditingGoal(goal)}
                                        className="px-8 py-3 bg-black text-white font-bold hover:scale-105 transition-transform flex items-center gap-2"
                                    >
                                        <Zap className="w-4 h-4" /> ⚙️ Systemize Goal
                                    </button>
                                </div>
                            );
                        }

                        // --- CONFIGURED ---
                        return (
                             <div key={goal.id} className="border border-gray-200 bg-white shadow-sm relative group">
                                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 flex gap-2">
                                     <button onClick={() => setEditingGoal(goal)} className="p-2 hover:bg-gray-100"><PenTool className="w-3 h-3" /></button>
                                    <button onClick={() => onDeleteGoal(goal.id)} className="p-2 hover:bg-red-50 text-red-500"><Trash2 className="w-3 h-3" /></button>
                                </div>

                                <div className="p-8 border-b border-gray-100">
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Priority 0{idx + 1}</div>
                                    <h3 className="text-2xl font-serif font-bold mb-3">{goal.text}</h3>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-xs font-mono bg-gray-50 px-2 py-1 border border-gray-200">{goal.metric}</span>
                                    </div>
                                    <p className="text-sm text-gray-500 italic">"{goal.motivation}"</p>
                                </div>
                                <div className="p-6 bg-gray-50/30">
                                    <div className="text-xs font-bold uppercase mb-4 flex items-center gap-1"><Anchor className="w-3 h-3" /> System</div>
                                    <ul className="space-y-3">
                                        {habits.map(h => (
                                            <li key={h.id} className="text-sm flex justify-between items-center border-b border-dashed border-gray-200 pb-2 last:border-0 last:pb-0">
                                                <span>{h.text}</span>
                                                <button onClick={() => onDeleteHabit(h.id)} className="opacity-0 group-hover:opacity-100"><Trash2 className="w-3 h-3 text-gray-300 hover:text-red-500" /></button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                             </div>
                        );
                   })}
              </div>

              <div>
                  <div className="bg-gray-50 border border-gray-200 p-8 min-h-[300px]">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
                          <Ban className="w-4 h-4"/> Avoid List
                      </h3>
                      <ul className="space-y-4">
                          {backlogGoals.map(g => (
                              <li key={g.id} className="p-4 bg-white border border-gray-200 text-sm font-medium text-gray-600 shadow-sm">
                                  {g.text}
                              </li>
                          ))}
                      </ul>
                  </div>
              </div>
          </div>
      </section>

      {/* --- ZONE 2: ARCHIVE --- */}
      <section>
           <div className="flex gap-8 border-b-2 border-gray-100 mb-12">
               {availableYears.map(year => (
                   <button 
                      key={year}
                      onClick={() => setSelectedYear(year)}
                      className={`pb-4 text-3xl font-serif transition-colors ${selectedYear === year ? 'text-black border-b-2 border-black -mb-0.5' : 'text-gray-300 hover:text-gray-500'}`}
                   >
                       {year}
                   </button>
               ))}
           </div>

           {currentWorkbook ? (
               <div className="max-w-4xl mx-auto space-y-20 animate-in fade-in slide-in-from-bottom-2">
                    
                    <div className="text-center">
                        <h2 className="text-5xl font-serif mb-4">The Contract</h2>
                        <div className="text-sm uppercase tracking-widest text-gray-400">Signed by {currentWorkbook.signatureName}</div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-12">
                        <div>
                             <h3 className="text-xs font-bold uppercase border-b border-black pb-2 mb-4">Key to Success</h3>
                             <p className="font-serif text-lg leading-relaxed">{currentWorkbook.keySuccess}</p>
                        </div>
                         <div>
                             <h3 className="text-xs font-bold uppercase border-b border-black pb-2 mb-4">Time Audit</h3>
                             <p className="font-serif text-lg leading-relaxed">{currentWorkbook.timeAudit}</p>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-xs font-bold uppercase border-b border-black pb-2 mb-6">Momentum</h3>
                        <div className="grid md:grid-cols-3 gap-6">
                            {currentWorkbook.momentum.map((m, i) => (
                                <div key={i} className="bg-gray-50 p-6 border border-gray-200">
                                    <div className="font-bold mb-2">{m.item}</div>
                                    <div className="text-sm italic text-gray-500">→ {m.smallStep}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-12">
                        <div className="bg-gray-50 p-8 border border-gray-200">
                             <h3 className="text-xs font-bold uppercase mb-6 flex gap-2"><Zap className="w-4 h-4"/> Assets</h3>
                             <ul className="space-y-6">
                                 {currentWorkbook.strengths.map((s, i) => (
                                     <li key={i}>
                                         <div className="font-bold text-lg mb-1">{s.strength}</div>
                                         <div className="text-sm text-gray-600">{s.application}</div>
                                     </li>
                                 ))}
                             </ul>
                        </div>
                        <div className="bg-gray-50 p-8 border border-gray-200">
                             <h3 className="text-xs font-bold uppercase mb-6 flex gap-2"><AlertTriangle className="w-4 h-4"/> Liabilities</h3>
                             <ul className="space-y-6">
                                 {currentWorkbook.weaknesses.map((s, i) => (
                                     <li key={i}>
                                         <div className="font-bold text-lg mb-1">{s.weakness}</div>
                                         <div className="text-sm text-gray-600">Fix: {s.workaround}</div>
                                     </li>
                                 ))}
                             </ul>
                        </div>
                    </div>

                    <div className="space-y-8">
                        <h3 className="text-xs font-bold uppercase border-b border-black pb-2">Mental Models</h3>
                        <div className="grid gap-8">
                            <div className="bg-gray-50 p-6">
                                <div className="font-bold mb-2">Easy Mode</div>
                                <p className="font-serif text-gray-600">{currentWorkbook.easyMode}</p>
                            </div>
                            <div className="bg-gray-50 p-6">
                                <div className="font-bold mb-2">Inversion</div>
                                <p className="font-serif text-gray-600">{currentWorkbook.inversion}</p>
                            </div>
                            <div className="bg-gray-50 p-6">
                                <div className="font-bold mb-2">Second Order</div>
                                <p className="font-serif text-gray-600">{currentWorkbook.secondOrder}</p>
                            </div>
                        </div>
                    </div>

                     <div className="grid md:grid-cols-2 gap-16">
                        <div>
                             <h3 className="text-xs font-bold uppercase border-b border-black pb-2 mb-6">Prescriptions</h3>
                             <ul className="list-disc pl-5 space-y-3 font-serif text-lg">
                                 {currentWorkbook.prescriptions.map((r, i) => <li key={i}>{r}</li>)}
                             </ul>
                        </div>
                        <div>
                             <h3 className="text-xs font-bold uppercase border-b border-black pb-2 mb-6">Anti-Goals</h3>
                             <ul className="list-disc pl-5 space-y-3 font-serif text-lg">
                                 {currentWorkbook.antiGoals.map((r, i) => <li key={i}>{r}</li>)}
                             </ul>
                        </div>
                    </div>

                    <div className="text-center pt-16 border-t border-gray-100">
                        <p className="text-gray-400 text-xs uppercase tracking-widest">
                            {new Date(currentWorkbook.signedAt!).toLocaleDateString()}
                        </p>
                    </div>
               </div>
           ) : (
               <div className="text-center py-32 text-gray-300 text-xl font-serif italic">
                   No manifesto recorded for {selectedYear}.
               </div>
           )}
      </section>

    </div>
  );
};

export default StrategyTab;