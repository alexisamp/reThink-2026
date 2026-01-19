import React, { useState, useEffect } from 'react';
import { AppData, Goal, GoalStatus, Habit, HabitType, WorkbookData } from '../types';
import { Printer, PenTool, Target, Map, Zap, AlertTriangle, Anchor, Check, Trash2, Plus, Clock, Sparkles, Ban, Shield, Users, BarChart2 } from '../components/Icon';
import AnnualReview from './AnnualReview';
import ContributionGraph from '../components/ContributionGraph';

// --- GOAL SYSTEM WIZARD (Redesigned) ---
const GoalWizard: React.FC<{
    goal: Goal;
    onSave: (g: Goal, newHabits: Habit[]) => void;
    onCancel: () => void;
}> = ({ goal, onSave, onCancel }) => {
    
    // Flattened State
    const [text, setText] = useState(goal.text || '');
    const [metric, setMetric] = useState(goal.metric || '');
    const [motivation, setMotivation] = useState(goal.motivation || '');
    
    const [habits, setHabits] = useState<{text: string, defaultTime: string}[]>([]);
    const [newHabit, setNewHabit] = useState('');
    const [newHabitTime, setNewHabitTime] = useState('');

    const [milestones, setMilestones] = useState(goal.milestones || []);
    const [newMilestone, setNewMilestone] = useState('');

    const handleSave = () => {
        const finalGoal: Goal = {
            ...goal,
            text,
            metric: metric || 'Defined',
            motivation,
            milestones,
            needsConfig: false
        };

        const newHabitsToCreate = habits.map(h => ({
            id: crypto.randomUUID(),
            goalId: finalGoal.id,
            text: h.text,
            type: HabitType.BINARY,
            defaultTime: h.defaultTime || undefined,
            contributions: {}
        }));

        onSave(finalGoal, newHabitsToCreate);
    };

    const addHabit = () => {
        if(newHabit.trim()) {
            setHabits([...habits, { text: newHabit, defaultTime: newHabitTime }]);
            setNewHabit(''); setNewHabitTime('');
        }
    };

    const addMilestone = () => {
        if(newMilestone.trim()) {
            setMilestones([...milestones, {id: crypto.randomUUID(), text: newMilestone, completed: false}]);
            setNewMilestone('');
        }
    };

    return (
        <div className="fixed inset-0 bg-white/90 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="max-w-4xl w-full bg-white shadow-2xl border border-gray-200 max-h-[90vh] overflow-y-auto rounded-xl flex flex-col md:flex-row overflow-hidden animate-in fade-in zoom-in-95">
                
                {/* Left: Context */}
                <div className="bg-gray-50 p-8 md:w-1/3 border-r border-gray-200">
                    <h3 className="font-bold uppercase tracking-widest text-xs text-gray-400 mb-6">Workbook Context</h3>
                    <div className="space-y-6">
                        <div>
                            <label className="text-xs font-bold text-gray-500 block mb-1">Goal</label>
                            <p className="font-serif text-lg leading-tight">{goal.text}</p>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 block mb-1">Support Needed</label>
                            <p className="text-sm text-gray-600">{goal.keySupport || 'None specified'}</p>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 block mb-1">Initial Next Step</label>
                            <p className="text-sm text-gray-600">{goal.nextStep || 'None specified'}</p>
                        </div>
                    </div>
                </div>

                {/* Right: Form */}
                <div className="p-8 md:w-2/3 space-y-8">
                    <div className="flex justify-between items-center pb-4 border-b border-gray-100">
                        <h2 className="text-2xl font-serif font-bold">Systemize Goal</h2>
                        <button onClick={onCancel} className="text-gray-400 hover:text-black"><Trash2 className="w-5 h-5"/></button>
                    </div>

                    {/* Section 1: Identity */}
                    <div className="space-y-4">
                        <h4 className="text-sm font-bold uppercase tracking-wide">1. Definition</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <label className="text-xs text-gray-500 block mb-1">Refined Objective</label>
                                <input className="w-full border border-gray-200 p-2 rounded text-sm focus:border-black outline-none" value={text} onChange={e => setText(e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Metric (KPI)</label>
                                <input className="w-full border border-gray-200 p-2 rounded text-sm focus:border-black outline-none" value={metric} onChange={e => setMetric(e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Why (Motivation)</label>
                                <input className="w-full border border-gray-200 p-2 rounded text-sm focus:border-black outline-none" value={motivation} onChange={e => setMotivation(e.target.value)} />
                            </div>
                        </div>
                    </div>

                    {/* Section 2: System (Habits) */}
                    <div className="space-y-4">
                         <h4 className="text-sm font-bold uppercase tracking-wide">2. Daily System</h4>
                         <p className="text-xs text-gray-500 italic">"You fall to the level of your systems." Add daily actions.</p>
                         
                         <div className="space-y-2">
                             {habits.map((h, i) => (
                                 <div key={i} className="flex items-center justify-between bg-gray-50 p-2 rounded border border-gray-100">
                                     <div className="flex items-center gap-2">
                                         <Check className="w-4 h-4 text-gray-400" />
                                         <span className="text-sm font-medium">{h.text}</span>
                                         {h.defaultTime && <span className="text-xs text-gray-400">({h.defaultTime})</span>}
                                     </div>
                                     <button onClick={() => setHabits(habits.filter((_, idx) => idx !== i))}><Trash2 className="w-3 h-3 text-gray-300 hover:text-red-500"/></button>
                                 </div>
                             ))}
                             
                             <div className="flex gap-2">
                                 <input className="flex-1 border border-gray-200 p-2 rounded text-sm outline-none" placeholder="Habit (e.g. Read 10 pages)" value={newHabit} onChange={e => setNewHabit(e.target.value)} onKeyDown={e => e.key === 'Enter' && addHabit()} />
                                 <input className="w-24 border border-gray-200 p-2 rounded text-sm outline-none" type="time" value={newHabitTime} onChange={e => setNewHabitTime(e.target.value)} />
                                 <button onClick={addHabit} className="bg-black text-white px-3 rounded text-sm font-bold">+</button>
                             </div>
                         </div>
                    </div>

                    {/* Section 3: Roadmap (Milestones) */}
                    <div className="space-y-4">
                         <h4 className="text-sm font-bold uppercase tracking-wide">3. Milestones</h4>
                         
                         <div className="space-y-2">
                             {milestones.map((m, i) => (
                                 <div key={i} className="flex items-center gap-3 p-2 border-b border-gray-100 last:border-0">
                                     <div className="w-1.5 h-1.5 bg-black rounded-full"></div>
                                     <span className="flex-1 text-sm">{m.text}</span>
                                     <button onClick={() => setMilestones(milestones.filter(x => x.id !== m.id))}><Trash2 className="w-3 h-3 text-gray-300 hover:text-red-500"/></button>
                                 </div>
                             ))}
                             <div className="flex gap-2 pt-2">
                                 <input className="flex-1 border-b border-gray-200 p-1 text-sm outline-none" placeholder="Next milestone..." value={newMilestone} onChange={e => setNewMilestone(e.target.value)} onKeyDown={e => e.key === 'Enter' && addMilestone()} />
                                 <button onClick={addMilestone} className="text-xs font-bold text-gray-500 hover:text-black">Add</button>
                             </div>
                         </div>
                    </div>

                    <div className="pt-4 border-t border-gray-100 flex justify-end">
                        <button onClick={handleSave} className="bg-black text-white px-8 py-3 rounded text-sm font-bold hover:opacity-90 shadow-lg">
                            Initialize System
                        </button>
                    </div>
                </div>
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
    <div className="animate-fade-in pb-20 space-y-12">
      
      {/* Header Area */}
      <div className="flex justify-between items-center border-b border-gray-200 pb-4 no-print">
         <div>
             <h2 className="text-3xl font-serif text-notion-text">Executive Strategy</h2>
             <p className="text-notion-dim font-serif italic">Your contract with yourself for {selectedYear}.</p>
         </div>
         <div className="flex gap-2">
             <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded text-sm font-medium hover:opacity-80 transition-opacity shadow-sm">
                <Plus className="w-4 h-4" /> Review
             </button>
         </div>
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

      {/* ================= ZONE A: ACTIVE STRATEGY (2-Column Layout) ================= */}
      <section>
          {activeGoals.length === 0 && (
              <div className="text-center py-20 text-gray-400">
                  No active goals. Start a review.
              </div>
          )}

          <div className="flex flex-col lg:flex-row gap-8">
              {/* Left Column: Active Goals */}
              <div className="flex-1 space-y-8">
                  {activeGoals.map(goal => {
                      const habits = data.habits.filter(h => h.goalId === goal.id);
                      
                      // --- UNCONFIGURED: Minimalist Card (Dashboard Style) ---
                      if (goal.needsConfig) {
                          return (
                              <div key={goal.id} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col justify-between group h-full min-h-[200px] relative overflow-hidden">
                                  <div className="absolute top-0 right-0 bg-gray-100 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                                      Needs System
                                  </div>
                                  <div>
                                      <h3 className="text-xl font-serif font-bold mb-2">{goal.text}</h3>
                                      <p className="text-sm text-gray-500">Metric: {goal.metric}</p>
                                  </div>
                                  <div className="mt-6 flex justify-end">
                                      <button 
                                          onClick={() => setEditingGoal(goal)}
                                          className="flex items-center gap-2 text-sm font-bold border border-black px-4 py-2 rounded hover:bg-black hover:text-white transition-colors"
                                      >
                                          <Zap className="w-3 h-3" /> Systemize
                                      </button>
                                  </div>
                              </div>
                          );
                      }

                      // --- CONFIGURED: Dashboard Card Style ---
                      return (
                          <div key={goal.id} className="bg-white border border-notion-border rounded-xl shadow-sm overflow-hidden group">
                              {/* Header */}
                              <div className="bg-notion-sidebar/50 p-4 border-b border-notion-border flex justify-between items-center">
                                  <div>
                                      <div className="text-[10px] font-bold uppercase tracking-widest text-notion-dim mb-1">Strategic Objective</div>
                                      <h3 className="text-xl font-serif font-medium">{goal.text}</h3>
                                  </div>
                                  <div className="flex items-center gap-3">
                                      <div className="text-xs font-mono bg-white px-2 py-1 rounded border border-gray-200 text-notion-dim">
                                          {goal.metric}
                                      </div>
                                      <button onClick={() => setEditingGoal(goal)} className="p-1.5 text-notion-dim hover:text-black bg-white rounded border border-gray-200 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <PenTool className="w-3 h-3" />
                                      </button>
                                  </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2">
                                  {/* Left: Timeline & Milestones */}
                                  <div className="p-6 border-r border-notion-border">
                                      <h4 className="text-xs font-bold uppercase tracking-widest text-notion-dim mb-4 flex items-center gap-2">
                                          <Map className="w-3 h-3" /> Execution Roadmap
                                      </h4>
                                      <div className="space-y-4 relative pl-2">
                                          <div className="absolute left-[11px] top-2 bottom-2 w-px bg-gray-200" />
                                          
                                          {goal.milestones.length === 0 && <span className="text-xs text-gray-400 italic">No milestones defined.</span>}

                                          {goal.milestones.map((m) => (
                                              <div key={m.id} className="relative flex items-start gap-4">
                                                  <div className={`relative z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center bg-white ${m.completed ? 'border-black text-black' : 'border-gray-300'}`}>
                                                      {m.completed && <div className="w-2 h-2 bg-black rounded-full" />}
                                                  </div>
                                                  <div className="flex-1">
                                                      <div className={`text-sm ${m.completed ? 'line-through text-gray-400' : 'text-notion-text'}`}>{m.text}</div>
                                                  </div>
                                              </div>
                                          ))}
                                      </div>
                                  </div>

                                  {/* Right: Consistency */}
                                  <div className="p-6 bg-gray-50/30">
                                      <h4 className="text-xs font-bold uppercase tracking-widest text-notion-dim mb-4 flex items-center gap-2">
                                          <BarChart2 className="w-3 h-3" /> Daily System
                                      </h4>
                                      <div className="space-y-6">
                                          {habits.map(h => (
                                              <div key={h.id}>
                                                  <div className="text-xs font-medium mb-2 flex justify-between">
                                                      <span>{h.text}</span>
                                                  </div>
                                                  <ContributionGraph data={h.contributions} colorBase="bg-black" />
                                              </div>
                                          ))}
                                          {habits.length === 0 && <span className="text-xs text-gray-400 italic">No habits linked. Edit goal to add.</span>}
                                      </div>
                                  </div>
                              </div>
                          </div>
                      );
                  })}
              </div>

              {/* Right Column: Avoid List (Backlog) */}
              <div className="lg:w-1/3">
                  <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 sticky top-6">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
                          <Ban className="w-4 h-4"/> Avoid List
                      </h3>
                      <p className="text-xs text-gray-400 mb-6 italic border-b border-gray-200 pb-4">
                          "Really successful people say no to almost everything."
                      </p>
                      <ul className="space-y-3">
                          {backlogGoals.map(g => (
                              <li key={g.id} className="bg-white border border-gray-200 p-3 rounded text-sm text-gray-600 shadow-sm flex items-start gap-3">
                                  <div className="w-1.5 h-1.5 bg-gray-300 rounded-full mt-1.5 flex-shrink-0"></div>
                                  <span className="leading-snug">{g.text}</span>
                              </li>
                          ))}
                          {backlogGoals.length === 0 && <li className="text-xs text-gray-400 italic">Empty list.</li>}
                      </ul>
                  </div>
              </div>
          </div>
      </section>

      {/* ================= ZONE B: THE MANIFESTO ================= */}
      <section className="border-t border-gray-200 pt-12">
           <div className="flex gap-4 mb-8">
               {availableYears.map(year => (
                   <button 
                      key={year}
                      onClick={() => setSelectedYear(year)}
                      className={`px-3 py-1 rounded text-sm transition-colors ${selectedYear === year ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                   >
                       {year}
                   </button>
               ))}
           </div>

           {currentWorkbook ? (
               <div className="bg-white border border-notion-border rounded-xl p-8 md:p-12 shadow-sm space-y-16">
                    
                    <div className="text-center space-y-4">
                        <h2 className="text-4xl font-serif font-medium">The Contract</h2>
                        <div className="w-24 h-px bg-black mx-auto"></div>
                        <p className="text-sm font-serif italic text-gray-500">"What lies behind us and what lies before us are tiny matters compared to what lies within us."</p>
                    </div>

                    {/* Key & Audit */}
                    <div className="grid md:grid-cols-2 gap-12">
                        <div className="space-y-4">
                             <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">The Key to Success</h3>
                             <p className="font-serif text-xl leading-relaxed text-notion-text whitespace-pre-line">{currentWorkbook.keySuccess}</p>
                        </div>
                         <div className="space-y-4">
                             <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Time Audit</h3>
                             <p className="font-serif text-lg leading-relaxed text-gray-600">{currentWorkbook.timeAudit}</p>
                        </div>
                    </div>

                    {/* The Lists */}
                    <div className="bg-gray-50 p-8 rounded-lg border border-gray-100 grid md:grid-cols-2 gap-12">
                        <div>
                            <h4 className="font-bold text-sm uppercase mb-4 flex items-center gap-2"><Trash2 className="w-4 h-4"/> Eliminated</h4>
                            <ul className="list-disc pl-5 space-y-2">{currentWorkbook.notWorking?.map((item, i) => <li key={i} className="text-gray-600 text-sm">{item}</li>)}</ul>
                        </div>
                        <div>
                            <h4 className="font-bold text-sm uppercase mb-4 flex items-center gap-2"><Check className="w-4 h-4"/> Doubled Down</h4>
                            <ul className="list-disc pl-5 space-y-2">{currentWorkbook.working?.map((item, i) => <li key={i} className="text-gray-600 text-sm">{item}</li>)}</ul>
                        </div>
                    </div>

                    {/* Strategy Grid */}
                    <div className="grid md:grid-cols-3 gap-8">
                        {/* Column 1: Momentum */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold uppercase border-b border-gray-200 pb-2">Momentum</h3>
                            {currentWorkbook.momentum.map((m, i) => (
                                <div key={i} className="text-sm">
                                    <div className="font-medium text-gray-900">{m.item}</div>
                                    <div className="text-gray-500">→ {m.step}</div>
                                </div>
                            ))}
                        </div>
                        {/* Column 2: Easy Mode */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold uppercase border-b border-gray-200 pb-2">Easy Mode</h3>
                            {currentWorkbook.easyMode.map((m, i) => (
                                <div key={i} className="text-sm">
                                    <div className="font-medium text-gray-900">{m.hard}</div>
                                    <div className="text-gray-500">→ {m.easy}</div>
                                </div>
                            ))}
                        </div>
                        {/* Column 3: Workarounds */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold uppercase border-b border-gray-200 pb-2">Workarounds</h3>
                            {currentWorkbook.weaknesses.map((m, i) => (
                                <div key={i} className="text-sm">
                                    <div className="font-medium text-gray-900">{m.weakness}</div>
                                    <div className="text-gray-500">→ {m.workaround}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Rules (Monochrome) */}
                     <div className="grid md:grid-cols-3 gap-8 pt-8 border-t border-gray-100">
                        <div className="bg-white p-6 rounded-lg border border-gray-200">
                             <h3 className="text-xs font-bold uppercase mb-4 text-black flex items-center gap-2"><Target className="w-3 h-3"/> Prosper</h3>
                             <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">{currentWorkbook.rulesProsper?.map((r, i) => <li key={i}>{r}</li>)}</ul>
                        </div>
                        <div className="bg-white p-6 rounded-lg border border-gray-200">
                             <h3 className="text-xs font-bold uppercase mb-4 text-black flex items-center gap-2"><Shield className="w-3 h-3"/> Protect</h3>
                             <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">{currentWorkbook.rulesProtect?.map((r, i) => <li key={i}>{r}</li>)}</ul>
                        </div>
                        <div className="bg-white p-6 rounded-lg border border-gray-200">
                             <h3 className="text-xs font-bold uppercase mb-4 text-black flex items-center gap-2"><Ban className="w-3 h-3"/> Limit</h3>
                             <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">{currentWorkbook.rulesLimit?.map((r, i) => <li key={i}>{r}</li>)}</ul>
                        </div>
                    </div>

                    <div className="text-center pt-8 border-t border-gray-100">
                        <div className="font-serif text-2xl mb-2">{currentWorkbook.signatureName}</div>
                        <p className="text-gray-400 text-xs uppercase tracking-widest">
                            Signed on {new Date(currentWorkbook.signedAt!).toLocaleDateString()}
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