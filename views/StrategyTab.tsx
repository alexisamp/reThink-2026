import React, { useState } from 'react';
import { AppData, StrategicItem, Goal, GoalStatus, Habit, HabitType, Milestone } from '../types';
import { Shield, Zap, Plus, Printer, Trash2, Check, Layout, Target, Map, ChevronRight, ArrowRight, Clock, Sparkles } from '../components/Icon';

interface StrategyTabProps {
  data: AppData;
  onAddStrategicItem: (item: StrategicItem) => void;
  onDeleteStrategicItem: (id: string) => void;
  onAddGoal: (goal: Goal) => void;
  onUpdateGoal: (goal: Goal) => void;
  onDeleteGoal: (id: string) => void;
  onAddHabit: (habit: Habit) => void;
  onDeleteHabit: (id: string) => void;
  onUpdateGlobalRules: (rules: string) => void;
}

// Internal Wizard Component for Editing/Creating Goals
const GoalWizard: React.FC<{
    goal?: Goal;
    onSave: (g: Goal, newHabits: Habit[]) => void;
    onCancel: () => void;
}> = ({ goal, onSave, onCancel }) => {
    const [step, setStep] = useState(1);
    
    // Form State
    const [text, setText] = useState(goal?.text || '');
    const [metric, setMetric] = useState(goal?.metric || '');
    const [motivation, setMotivation] = useState(goal?.motivation || '');
    const [type, setType] = useState<'STRENGTH' | 'WEAKNESS'>(goal?.type || 'STRENGTH');
    const [workaround, setWorkaround] = useState(goal?.workaround || '');
    
    // Temporary Arrays for Wizard
    const [milestones, setMilestones] = useState<Milestone[]>(goal?.milestones || []);
    const [habits, setHabits] = useState<{text: string, type: HabitType, defaultTime: string, reward: string}[]>([]);
    
    const [tempMilestone, setTempMilestone] = useState('');
    const [tempHabit, setTempHabit] = useState('');
    const [tempHabitTime, setTempHabitTime] = useState('');
    const [tempHabitReward, setTempHabitReward] = useState('');

    const handleNext = () => setStep(s => s + 1);
    const handleBack = () => setStep(s => s - 1);

    const handleSave = () => {
        if (!text || !metric) return;
        
        const finalGoal: Goal = {
            id: goal?.id || crypto.randomUUID(),
            text,
            metric,
            motivation,
            type,
            workaround: type === 'WEAKNESS' ? workaround : undefined,
            status: goal?.status || GoalStatus.ACTIVE,
            milestones,
            createdAt: goal?.createdAt || Date.now()
        };

        const newHabits = habits.map(h => ({
            id: crypto.randomUUID(),
            goalId: finalGoal.id,
            text: h.text,
            type: h.type,
            defaultTime: h.defaultTime || undefined,
            reward: h.reward || undefined,
            contributions: {}
        }));

        onSave(finalGoal, newHabits);
    };

    const addTempHabit = () => {
        if (tempHabit) {
            setHabits([...habits, { 
                text: tempHabit, 
                type: HabitType.BINARY, 
                defaultTime: tempHabitTime,
                reward: tempHabitReward
            }]);
            setTempHabit('');
            setTempHabitTime('');
            setTempHabitReward('');
        }
    };

    return (
        <div className="bg-gray-50 p-8 rounded-xl border border-notion-border animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center mb-6">
                <div className="text-xs font-bold uppercase tracking-wider text-notion-dim">
                    Step {step} of 4: {['Definition', 'Strategy', 'System', 'Roadmap'][step-1]}
                </div>
                <div className="flex gap-2">
                    {step > 1 && <button onClick={handleBack} className="text-xs text-notion-dim hover:text-black">Back</button>}
                    <button onClick={onCancel} className="text-xs text-red-500 hover:text-red-700">Cancel</button>
                </div>
            </div>

            {step === 1 && (
                <div className="space-y-4">
                    <h3 className="text-xl font-serif font-medium">Define the Outcome</h3>
                    <div>
                        <label className="block text-xs font-bold text-notion-dim mb-1">Goal (What)</label>
                        <input className="w-full p-3 border border-gray-200 rounded text-sm focus:border-black outline-none" 
                            placeholder="e.g. Launch MVP" value={text} onChange={e => setText(e.target.value)} autoFocus />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-notion-dim mb-1">Success Metric (How Measured)</label>
                        <input className="w-full p-3 border border-gray-200 rounded text-sm focus:border-black outline-none" 
                            placeholder="e.g. 100 Paying Users" value={metric} onChange={e => setMetric(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-notion-dim mb-1">Motivation (Why)</label>
                        <input className="w-full p-3 border border-gray-200 rounded text-sm focus:border-black outline-none" 
                            placeholder="e.g. Financial Freedom" value={motivation} onChange={e => setMotivation(e.target.value)} />
                    </div>
                    <button onClick={handleNext} disabled={!text || !metric} className="mt-4 px-6 py-2 bg-black text-white rounded text-sm disabled:opacity-50 hover:bg-gray-800 w-full">Next</button>
                </div>
            )}

            {step === 2 && (
                <div className="space-y-4">
                    <h3 className="text-xl font-serif font-medium">Strategic Leverage</h3>
                    <div className="flex gap-4">
                        <button onClick={() => setType('STRENGTH')} className={`flex-1 p-4 border rounded text-center transition-all ${type === 'STRENGTH' ? 'bg-black text-white border-black' : 'bg-white text-gray-500'}`}>
                            Strength Play
                        </button>
                        <button onClick={() => setType('WEAKNESS')} className={`flex-1 p-4 border rounded text-center transition-all ${type === 'WEAKNESS' ? 'bg-black text-white border-black' : 'bg-white text-gray-500'}`}>
                            Weakness Fix
                        </button>
                    </div>
                    {type === 'WEAKNESS' && (
                        <div>
                             <label className="block text-xs font-bold text-notion-dim mb-1">Systematic Workaround</label>
                             <input className="w-full p-3 border border-gray-200 rounded text-sm focus:border-black outline-none" 
                                placeholder="How will you mitigate this weakness?" value={workaround} onChange={e => setWorkaround(e.target.value)} />
                        </div>
                    )}
                    <button onClick={handleNext} className="mt-4 px-6 py-2 bg-black text-white rounded text-sm hover:bg-gray-800 w-full">Next</button>
                </div>
            )}

            {step === 3 && (
                <div className="space-y-4">
                    <h3 className="text-xl font-serif font-medium">The System (Habits)</h3>
                    <p className="text-xs text-notion-dim">What daily/weekly actions guarantee success?</p>
                    
                    <ul className="space-y-2 mb-4">
                        {habits.map((h, i) => (
                            <li key={i} className="flex justify-between items-center text-sm p-2 bg-white border rounded">
                                <div className="flex items-center gap-2">
                                    <span>{h.text}</span>
                                    {h.defaultTime && (
                                        <span className="text-[10px] bg-gray-100 px-1 rounded text-gray-500 flex items-center gap-1">
                                            <Clock className="w-3 h-3" /> {h.defaultTime}
                                        </span>
                                    )}
                                    {h.reward && (
                                        <span className="text-[10px] bg-purple-50 px-1 rounded text-purple-600 flex items-center gap-1">
                                            <Sparkles className="w-3 h-3" /> {h.reward}
                                        </span>
                                    )}
                                </div>
                                <button onClick={() => setHabits(habits.filter((_, idx) => idx !== i))}><Trash2 className="w-3 h-3 text-red-400" /></button>
                            </li>
                        ))}
                    </ul>

                    <div className="flex gap-2 items-start">
                        <div className="flex-1 flex flex-col gap-2">
                            <input className="w-full p-2 border border-gray-200 rounded text-sm outline-none" 
                                placeholder="Add habit..." value={tempHabit} onChange={e => setTempHabit(e.target.value)} 
                                onKeyDown={e => {
                                    if (e.key === 'Enter') addTempHabit();
                                }}
                            />
                            <div className="flex gap-2">
                                {/* Time Input */}
                                <div className="relative flex-1">
                                    <Clock className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input 
                                        type="time"
                                        className="p-2 pl-8 border border-gray-200 rounded text-sm outline-none w-full text-gray-600"
                                        value={tempHabitTime}
                                        onChange={e => setTempHabitTime(e.target.value)}
                                    />
                                </div>
                                {/* Reward Input */}
                                <div className="relative flex-[1.5]">
                                    <Sparkles className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input 
                                        type="text"
                                        className="p-2 pl-8 border border-gray-200 rounded text-sm outline-none w-full text-gray-600 placeholder:text-gray-400"
                                        placeholder="Reward (e.g. 🎁 Coffee)"
                                        value={tempHabitReward}
                                        onChange={e => setTempHabitReward(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') addTempHabit();
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                        <button onClick={addTempHabit} className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 h-[76px] flex items-center"><Plus className="w-4 h-4" /></button>
                    </div>
                    <button onClick={handleNext} className="mt-4 px-6 py-2 bg-black text-white rounded text-sm hover:bg-gray-800 w-full">Next</button>
                </div>
            )}

            {step === 4 && (
                <div className="space-y-4">
                    <h3 className="text-xl font-serif font-medium">The Roadmap (Milestones)</h3>
                    <p className="text-xs text-notion-dim">Break it down into check-points.</p>
                    
                    <ul className="space-y-2 mb-4">
                        {milestones.map((m, i) => (
                            <li key={i} className="flex justify-between items-center text-sm p-2 bg-white border rounded">
                                <span>{m.text}</span>
                                <button onClick={() => setMilestones(milestones.filter((_, idx) => idx !== i))}><Trash2 className="w-3 h-3 text-red-400" /></button>
                            </li>
                        ))}
                    </ul>

                    <div className="flex gap-2">
                        <input className="flex-1 p-2 border border-gray-200 rounded text-sm outline-none" 
                            placeholder="Add milestone..." value={tempMilestone} onChange={e => setTempMilestone(e.target.value)} 
                             onKeyDown={e => {
                                if (e.key === 'Enter' && tempMilestone) {
                                    setMilestones([...milestones, { id: crypto.randomUUID(), text: tempMilestone, completed: false }]);
                                    setTempMilestone('');
                                }
                            }}
                        />
                        <button onClick={() => {
                             if (tempMilestone) {
                                setMilestones([...milestones, { id: crypto.randomUUID(), text: tempMilestone, completed: false }]);
                                setTempMilestone('');
                            }
                        }} className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300"><Plus className="w-4 h-4" /></button>
                    </div>
                    <button onClick={handleSave} className="mt-4 px-6 py-2 bg-black text-white rounded text-sm hover:bg-gray-800 w-full">Finish & Commit</button>
                </div>
            )}
        </div>
    );
};


const StrategyTab: React.FC<StrategyTabProps> = ({ 
  data, 
  onAddStrategicItem, 
  onDeleteStrategicItem, 
  onAddGoal,
  onUpdateGoal,
  onDeleteGoal,
  onAddHabit,
  onDeleteHabit,
  onUpdateGlobalRules
}) => {
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newIdentity, setNewIdentity] = useState('');
  const [newIdentityType, setNewIdentityType] = useState<'STRENGTH' | 'WEAKNESS'>('STRENGTH');

  const activeGoals = data.goals.filter(g => g.status === GoalStatus.ACTIVE);
  const backlogGoals = data.goals.filter(g => g.status === GoalStatus.BACKLOG);

  return (
    <div className="animate-fade-in space-y-20 max-w-4xl mx-auto print:space-y-8">
      
      {/* Print Styles */}
      <style>{`
        @media print {
            @page { margin: 1.5cm; size: auto; }
            body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .no-print { display: none !important; }
            .print-break-avoid { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      {/* HEADER */}
      <div className="flex justify-between items-end border-b border-black pb-6">
        <div>
            <h1 className="text-5xl font-serif text-notion-text mb-2">Manifesto 2026</h1>
            <p className="text-notion-dim font-serif italic text-xl">Operational Strategy & Identity</p>
        </div>
        <button onClick={() => window.print()} className="no-print opacity-50 hover:opacity-100 transition-opacity">
            <Printer className="w-5 h-5" />
        </button>
      </div>

      {/* SECTION 1: IDENTITY */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-12 print:gap-8 print-break-avoid">
         <div>
            <h3 className="text-xs font-bold uppercase tracking-widest mb-4 border-b border-gray-200 pb-2 flex items-center gap-2">
                <Shield className="w-3 h-3" /> Core Strengths
            </h3>
            <ul className="space-y-2">
                {data.strategy.filter(s => s.type === 'STRENGTH').map(s => (
                    <li key={s.id} className="group relative pl-4 border-l-2 border-notion-border hover:border-black transition-colors">
                        <div className="font-serif text-lg">{s.title}</div>
                        <div className="text-xs text-notion-dim italic">{s.tactic}</div>
                        <button onClick={() => onDeleteStrategicItem(s.id)} className="absolute -right-4 top-1 opacity-0 group-hover:opacity-100 text-red-400 no-print"><Trash2 className="w-3 h-3" /></button>
                    </li>
                ))}
            </ul>
         </div>
         <div>
            <h3 className="text-xs font-bold uppercase tracking-widest mb-4 border-b border-gray-200 pb-2 flex items-center gap-2">
                <Zap className="w-3 h-3" /> Strategic Weaknesses
            </h3>
            <ul className="space-y-2">
                {data.strategy.filter(s => s.type === 'WEAKNESS').map(s => (
                    <li key={s.id} className="group relative pl-4 border-l-2 border-notion-border hover:border-black transition-colors">
                        <div className="font-serif text-lg">{s.title}</div>
                        <div className="text-xs text-notion-dim italic">{s.tactic}</div>
                        <button onClick={() => onDeleteStrategicItem(s.id)} className="absolute -right-4 top-1 opacity-0 group-hover:opacity-100 text-red-400 no-print"><Trash2 className="w-3 h-3" /></button>
                    </li>
                ))}
            </ul>
         </div>
      </section>

      {/* SECTION 2: STRATEGIC FOCUS (WIZARD CONTROLLED) */}
      <section className="print-break-avoid">
         <h3 className="text-xs font-bold uppercase tracking-widest mb-6 border-b border-gray-200 pb-2 flex items-center justify-between">
            <span>Strategic Objectives (Level 4)</span>
            <span className="text-[10px] text-notion-dim">{activeGoals.length}/3 Active</span>
         </h3>

         {/* Wizard Mode */}
         {(isCreating || editingGoal) && (
             <div className="mb-12">
                 <GoalWizard 
                    goal={editingGoal || undefined}
                    onCancel={() => { setIsCreating(false); setEditingGoal(null); }}
                    onSave={(savedGoal, newHabits) => {
                        if (editingGoal) {
                            onUpdateGoal(savedGoal);
                            // Note: Habits logic in update is tricky without deleting old ones.
                            // For V7 simplistic approach: If editing, we preserve old habits unless user manages them in a full habit manager.
                            // The Wizard currently recreates habits list.
                            // Let's assume on update we just update goal fields for now, or add new habits.
                            // For simplicity in this prompt: We update the goal. New habits are added.
                             newHabits.forEach(h => onAddHabit(h));
                        } else {
                            onAddGoal(savedGoal);
                            newHabits.forEach(h => onAddHabit(h));
                        }
                        setIsCreating(false);
                        setEditingGoal(null);
                    }}
                 />
             </div>
         )}

         {/* Active Goals Display */}
         {!isCreating && !editingGoal && (
             <div className="space-y-12">
                 {activeGoals.map((goal, idx) => {
                     const habits = data.habits.filter(h => h.goalId === goal.id);
                     return (
                         <div key={goal.id} className="group relative">
                             {/* Edit Overlay */}
                             <div className="absolute -left-10 top-0 h-full opacity-0 group-hover:opacity-100 no-print flex flex-col justify-center gap-2">
                                 <button onClick={() => setEditingGoal(goal)} className="p-2 bg-gray-100 hover:bg-black hover:text-white rounded-full"><Target className="w-4 h-4" /></button>
                                 <button onClick={() => onDeleteGoal(goal.id)} className="p-2 bg-gray-100 hover:bg-red-500 hover:text-white rounded-full"><Trash2 className="w-4 h-4" /></button>
                             </div>

                             <div className="flex flex-col md:flex-row gap-8 items-start">
                                 <div className="flex-1">
                                     <div className="flex items-center gap-2 mb-2">
                                         <span className="text-[10px] font-bold border border-black px-1 rounded uppercase">{goal.type}</span>
                                         <span className="text-xs text-notion-dim uppercase tracking-wider">Priority {idx + 1}</span>
                                     </div>
                                     <h2 className="text-3xl font-serif font-medium text-notion-text mb-2 leading-tight">{goal.text}</h2>
                                     <p className="text-sm font-serif italic text-notion-dim mb-4">"{goal.motivation}"</p>
                                     <div className="bg-gray-50 p-3 rounded text-sm border border-gray-100 inline-block">
                                         <span className="font-bold text-xs uppercase tracking-wider mr-2">Metric:</span>
                                         {goal.metric}
                                     </div>
                                 </div>

                                 <div className="w-full md:w-1/3 space-y-6">
                                     {/* System */}
                                     <div>
                                         <h4 className="text-[10px] font-bold uppercase tracking-widest text-notion-dim mb-2">The System</h4>
                                         <ul className="space-y-1">
                                             {habits.map(h => (
                                                 <li key={h.id} className="text-sm flex items-start gap-2">
                                                     <ArrowRight className="w-3 h-3 mt-1 text-gray-400" />
                                                     <span>{h.text}</span>
                                                     {h.defaultTime && (
                                                         <span className="text-[9px] bg-gray-100 px-1 rounded text-gray-400 flex items-center gap-1">
                                                             <Clock className="w-2.5 h-2.5" /> {h.defaultTime}
                                                         </span>
                                                     )}
                                                     {h.reward && (
                                                         <span className="text-[9px] bg-purple-50 px-1 rounded text-purple-600 flex items-center gap-1">
                                                             <Sparkles className="w-2.5 h-2.5" /> {h.reward}
                                                         </span>
                                                     )}
                                                 </li>
                                             ))}
                                         </ul>
                                     </div>
                                     {/* Roadmap */}
                                     <div>
                                         <h4 className="text-[10px] font-bold uppercase tracking-widest text-notion-dim mb-2">The Roadmap</h4>
                                          <ul className="space-y-1">
                                             {goal.milestones.map(m => (
                                                 <li key={m.id} className={`text-sm flex items-center gap-2 ${m.completed ? 'text-gray-400 line-through' : ''}`}>
                                                     <div className={`w-1.5 h-1.5 rounded-full ${m.completed ? 'bg-gray-300' : 'bg-black'}`} />
                                                     <span>{m.text}</span>
                                                 </li>
                                             ))}
                                         </ul>
                                     </div>
                                 </div>
                             </div>
                             <div className="h-px bg-gray-100 mt-12" />
                         </div>
                     );
                 })}
                 
                 {activeGoals.length < 3 && (
                     <button 
                        onClick={() => setIsCreating(true)}
                        className="w-full py-12 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:border-black hover:text-black transition-all flex flex-col items-center justify-center gap-2 no-print"
                     >
                         <Plus className="w-6 h-6" />
                         <span className="font-serif italic text-lg">Define Strategic Objective</span>
                     </button>
                 )}
             </div>
         )}
      </section>

      {/* SECTION 3: RULES */}
      <section className="print-break-avoid bg-notion-sidebar p-8 rounded-xl border border-notion-border">
          <h3 className="text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
            Non-Negotiable Rules (Level 10)
          </h3>
          <textarea 
            className="w-full h-40 bg-transparent outline-none font-mono text-sm leading-relaxed resize-none"
            placeholder="1. Never miss two days in a row.&#10;2. No phones in the bedroom."
            value={data.globalRules || ''}
            onChange={e => onUpdateGlobalRules(e.target.value)}
          />
      </section>

      {/* BACKLOG COMPACT */}
      <section className="opacity-60 hover:opacity-100 transition-opacity print:hidden">
          <h3 className="text-xs font-bold uppercase tracking-widest mb-4 border-b border-gray-200 pb-2">Backlog</h3>
          <ul className="space-y-2">
              {backlogGoals.map(g => (
                  <li key={g.id} className="text-sm text-notion-dim flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-gray-300 rounded-full" />
                      {g.text}
                  </li>
              ))}
          </ul>
      </section>

    </div>
  );
};

export default StrategyTab;