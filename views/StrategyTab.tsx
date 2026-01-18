import React, { useState } from 'react';
import { AppData, Goal, GoalStatus, Habit, HabitType, Milestone, Obstacle, GlobalRules, StrategicItem } from '../types';
import { Shield, Zap, Plus, Printer, Trash2, Clock, Sparkles, AlertTriangle, Ban, Check, Map, Target, PenTool, Lock, Brain, Anchor } from '../components/Icon';

interface StrategyTabProps {
  data: AppData;
  onAddStrategicItem: (item: StrategicItem) => void;
  onDeleteStrategicItem: (id: string) => void;
  onAddGoal: (goal: Goal) => void;
  onUpdateGoal: (goal: Goal) => void;
  onDeleteGoal: (id: string) => void;
  onAddHabit: (habit: Habit) => void;
  onDeleteHabit: (id: string) => void;
  onUpdateGlobalRules: (rules: GlobalRules) => void;
}

// --- Components ---

const ListEditor: React.FC<{
    items: string[];
    onUpdate: (items: string[]) => void;
    placeholder: string;
    icon?: React.ReactNode;
    colorClass?: string;
}> = ({ items, onUpdate, placeholder, icon, colorClass = "text-black" }) => {
    const [newItem, setNewItem] = useState('');
    
    const add = () => {
        if(newItem.trim()) {
            onUpdate([...items, newItem.trim()]);
            setNewItem('');
        }
    };

    return (
        <div className="space-y-2">
            <ul className="space-y-1">
                {items.map((item, idx) => (
                    <li key={idx} className="group flex justify-between items-center text-sm p-2 bg-white border border-notion-border rounded hover:border-gray-300 transition-colors">
                        <div className={`flex items-start gap-2 ${colorClass}`}>
                            <div className="mt-0.5">{icon}</div>
                            <span>{item}</span>
                        </div>
                        <button onClick={() => onUpdate(items.filter((_, i) => i !== idx))} className="opacity-0 group-hover:opacity-100 text-notion-dim hover:text-red-500">
                            <Trash2 className="w-3 h-3" />
                        </button>
                    </li>
                ))}
            </ul>
            <div className="flex gap-2">
                <input 
                    className="flex-1 p-2 text-sm bg-gray-50 border border-transparent rounded outline-none focus:bg-white focus:border-black transition-all"
                    placeholder={placeholder}
                    value={newItem}
                    onChange={e => setNewItem(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && add()}
                />
                <button onClick={add} disabled={!newItem} className="p-2 bg-black text-white rounded hover:opacity-80 disabled:opacity-30">
                    <Plus className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

// --- Wizard ---

const GoalWizard: React.FC<{
    goal?: Goal;
    onSave: (g: Goal, newHabits: Habit[]) => void;
    onCancel: () => void;
}> = ({ goal, onSave, onCancel }) => {
    const [step, setStep] = useState(1);
    
    // Step 1: Definition
    const [text, setText] = useState(goal?.text || '');
    const [metric, setMetric] = useState(goal?.metric || '');
    const [motivation, setMotivation] = useState(goal?.motivation || '');
    
    // Step 2: Reality Check
    const [leverage, setLeverage] = useState<string[]>(goal?.leverage || []);
    const [obstacles, setObstacles] = useState<Obstacle[]>(goal?.obstacles || []);
    // Temp obstacle state
    const [obsText, setObsText] = useState('');
    const [workaroundText, setWorkaroundText] = useState('');

    // Step 3: System
    const [habits, setHabits] = useState<{text: string, defaultTime: string, reward: string}[]>([]);
    const [tempHabit, setTempHabit] = useState('');
    const [tempHabitTime, setTempHabitTime] = useState('');
    const [tempHabitReward, setTempHabitReward] = useState('');

    // Step 4: Roadmap
    const [milestones, setMilestones] = useState<Milestone[]>(goal?.milestones || []);
    const [tempMilestone, setTempMilestone] = useState('');

    // Step 5: Status
    const [status, setStatus] = useState<GoalStatus>(goal?.status || GoalStatus.ACTIVE);

    const handleSave = () => {
        if (!text || !metric) return;
        
        const finalGoal: Goal = {
            id: goal?.id || crypto.randomUUID(),
            text,
            metric,
            motivation,
            leverage,
            obstacles,
            status,
            milestones,
            createdAt: goal?.createdAt || Date.now()
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

    const addObstacle = () => {
        if(obsText && workaroundText) {
            setObstacles([...obstacles, { id: crypto.randomUUID(), obstacle: obsText, workaround: workaroundText }]);
            setObsText('');
            setWorkaroundText('');
        }
    };

    const addHabit = () => {
        if(tempHabit) {
            setHabits([...habits, { text: tempHabit, defaultTime: tempHabitTime, reward: tempHabitReward }]);
            setTempHabit(''); setTempHabitTime(''); setTempHabitReward('');
        }
    };

    return (
        <div className="bg-white p-8 rounded-xl border border-notion-border shadow-2xl mb-12 animate-in fade-in slide-in-from-top-4 relative z-50">
            <div className="flex justify-between items-center mb-8 border-b border-gray-100 pb-4">
                <div className="text-xs font-bold uppercase tracking-wider text-notion-dim">
                    Step {step} of 5: {['Definition', 'Strategic Audit', 'The System', 'Roadmap', 'Status'][step-1]}
                </div>
                <div className="flex gap-3">
                    {step > 1 && <button onClick={() => setStep(s => s - 1)} className="text-xs text-notion-dim hover:text-black font-medium">Back</button>}
                    <button onClick={onCancel} className="text-xs text-red-500 hover:text-red-700 font-medium">Cancel</button>
                </div>
            </div>

            {/* Step 1: Definition */}
            {step === 1 && (
                <div className="space-y-6">
                    <h3 className="text-2xl font-serif font-medium">Define the Outcome</h3>
                    <div>
                        <label className="block text-xs font-bold text-notion-dim mb-1 uppercase tracking-wide">Goal (The Mission)</label>
                        <input className="w-full p-4 bg-gray-50 border border-transparent rounded text-lg focus:bg-white focus:border-black outline-none transition-all" 
                            placeholder="e.g. Launch MVP" value={text} onChange={e => setText(e.target.value)} autoFocus />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-notion-dim mb-1 uppercase tracking-wide">Metric (Success Condition)</label>
                            <input className="w-full p-3 bg-gray-50 border border-transparent rounded text-sm focus:bg-white focus:border-black outline-none" 
                                placeholder="e.g. 100 Paying Users" value={metric} onChange={e => setMetric(e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-notion-dim mb-1 uppercase tracking-wide">Motivation (The Why)</label>
                            <input className="w-full p-3 bg-gray-50 border border-transparent rounded text-sm focus:bg-white focus:border-black outline-none" 
                                placeholder="e.g. Financial Freedom" value={motivation} onChange={e => setMotivation(e.target.value)} />
                        </div>
                    </div>
                    <button onClick={() => setStep(2)} disabled={!text || !metric} className="mt-4 px-6 py-3 bg-black text-white rounded font-medium text-sm disabled:opacity-50 hover:opacity-90 w-full transition-opacity">Next: Strategic Audit</button>
                </div>
            )}

            {/* Step 2: Reality Check */}
            {step === 2 && (
                <div className="space-y-8">
                    <h3 className="text-2xl font-serif font-medium">Strategic Audit</h3>
                    
                    {/* Leverage */}
                    <div>
                        <label className="block text-xs font-bold text-green-700 mb-2 uppercase tracking-wide flex items-center gap-2">
                            <Zap className="w-3 h-3" /> Why I will win (Unfair Advantages)
                        </label>
                        <ListEditor items={leverage} onUpdate={setLeverage} placeholder="e.g. 'Deep industry knowledge'" colorClass="text-green-800" icon={<Check className="w-3 h-3" />} />
                    </div>

                    {/* Obstacles */}
                    <div>
                         <label className="block text-xs font-bold text-red-700 mb-2 uppercase tracking-wide flex items-center gap-2">
                            <AlertTriangle className="w-3 h-3" /> Failure Modes (What kills this goal?)
                        </label>
                        <ul className="space-y-2 mb-3">
                            {obstacles.map(o => (
                                <li key={o.id} className="text-sm p-3 bg-red-50/50 rounded border border-red-100 flex justify-between items-start">
                                    <div>
                                        <div className="font-bold text-red-900 mb-1 text-xs">⚠️ {o.obstacle}</div>
                                        <div className="text-green-700 text-xs flex items-center gap-1">🛡️ <span className="font-medium">The Fix:</span> {o.workaround}</div>
                                    </div>
                                    <button onClick={() => setObstacles(obstacles.filter(x => x.id !== o.id))}><Trash2 className="w-3 h-3 text-red-300 hover:text-red-500" /></button>
                                </li>
                            ))}
                        </ul>
                        <div className="flex flex-col gap-2 p-3 bg-gray-50 rounded border border-gray-100">
                            <input className="p-2 text-sm bg-white border border-gray-200 rounded outline-none" placeholder="Failure Mode (e.g. 'I get distracted')" value={obsText} onChange={e => setObsText(e.target.value)} />
                            <div className="flex gap-2">
                                <input className="flex-1 p-2 text-sm bg-white border border-gray-200 rounded outline-none" placeholder="The Fix (Prevention Mechanism)" value={workaroundText} onChange={e => setWorkaroundText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addObstacle()} />
                                <button onClick={addObstacle} disabled={!obsText || !workaroundText} className="px-4 bg-black text-white rounded text-xs font-bold disabled:opacity-50">Add</button>
                            </div>
                        </div>
                    </div>
                    
                    <button onClick={() => setStep(3)} className="w-full px-6 py-3 bg-black text-white rounded font-medium text-sm hover:opacity-90">Next: The System</button>
                </div>
            )}

            {/* Step 3: System */}
            {step === 3 && (
                <div className="space-y-6">
                    <h3 className="text-2xl font-serif font-medium">The System</h3>
                    <p className="text-sm text-notion-dim">You do not rise to the level of your goals. You fall to the level of your systems.</p>
                    
                    <ul className="space-y-2">
                        {habits.map((h, i) => (
                            <li key={i} className="flex justify-between items-center text-sm p-3 bg-gray-50 rounded border border-gray-100">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">{h.text}</span>
                                    {h.defaultTime && <span className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-gray-200 text-notion-dim flex items-center gap-1"><Clock className="w-3 h-3"/> {h.defaultTime}</span>}
                                    {h.reward && <span className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-gray-200 text-notion-dim flex items-center gap-1"><Sparkles className="w-3 h-3"/> {h.reward}</span>}
                                </div>
                                <button onClick={() => setHabits(habits.filter((_, idx) => idx !== i))}><Trash2 className="w-3 h-3 text-gray-400 hover:text-red-500" /></button>
                            </li>
                        ))}
                    </ul>

                    <div className="p-3 bg-gray-50 rounded border border-gray-100 flex flex-col gap-2">
                        <input className="p-2 text-sm bg-white border border-gray-200 rounded outline-none" placeholder="Daily Habit (e.g. Write 500 words)" value={tempHabit} onChange={e => setTempHabit(e.target.value)} onKeyDown={e => e.key === 'Enter' && addHabit()} />
                        <div className="flex gap-2">
                            <input type="time" className="w-24 p-2 text-sm bg-white border border-gray-200 rounded outline-none text-notion-dim" value={tempHabitTime} onChange={e => setTempHabitTime(e.target.value)} />
                            <input className="flex-1 p-2 text-sm bg-white border border-gray-200 rounded outline-none" placeholder="Reward (Optional)" value={tempHabitReward} onChange={e => setTempHabitReward(e.target.value)} onKeyDown={e => e.key === 'Enter' && addHabit()} />
                            <button onClick={addHabit} disabled={!tempHabit} className="px-4 bg-black text-white rounded text-xs font-bold disabled:opacity-50">Add</button>
                        </div>
                    </div>
                    <button onClick={() => setStep(4)} className="w-full px-6 py-3 bg-black text-white rounded font-medium text-sm hover:opacity-90">Next: Roadmap</button>
                </div>
            )}

            {/* Step 4: Roadmap */}
            {step === 4 && (
                <div className="space-y-6">
                    <h3 className="text-2xl font-serif font-medium">The Roadmap</h3>
                    <p className="text-sm text-notion-dim">Proof of progress.</p>
                    <ListEditor items={milestones.map(m => m.text)} onUpdate={(strs) => setMilestones(strs.map(s => ({id: crypto.randomUUID(), text: s, completed: false})))} placeholder="Milestone (e.g. First 10 users)" icon={<Map className="w-3 h-3 text-notion-dim"/>} />
                    <button onClick={() => setStep(5)} className="w-full px-6 py-3 bg-black text-white rounded font-medium text-sm hover:opacity-90">Next: Confirm</button>
                </div>
            )}

            {/* Step 5: Status */}
            {step === 5 && (
                <div className="space-y-8 text-center">
                    <h3 className="text-2xl font-serif font-medium">Commitment</h3>
                    <div className="flex gap-4 justify-center">
                        <button onClick={() => setStatus(GoalStatus.ACTIVE)} className={`p-6 border-2 rounded-xl w-40 transition-all ${status === GoalStatus.ACTIVE ? 'border-black bg-black text-white' : 'border-gray-200 hover:border-black'}`}>
                            <Target className="w-8 h-8 mx-auto mb-2" />
                            <div className="font-bold">Priority</div>
                            <div className="text-[10px] opacity-70">Focus now</div>
                        </button>
                        <button onClick={() => setStatus(GoalStatus.BACKLOG)} className={`p-6 border-2 rounded-xl w-40 transition-all ${status === GoalStatus.BACKLOG ? 'border-black bg-black text-white' : 'border-gray-200 hover:border-black'}`}>
                            <Map className="w-8 h-8 mx-auto mb-2" />
                            <div className="font-bold">Bench</div>
                            <div className="text-[10px] opacity-70">Save for later</div>
                        </button>
                    </div>
                    <button onClick={handleSave} className="w-full px-6 py-4 bg-black text-white rounded-lg font-bold text-lg hover:scale-[1.01] transition-transform shadow-lg">
                        {goal ? 'Update Strategy' : 'Sign Manifesto'}
                    </button>
                </div>
            )}
        </div>
    );
};

// --- Main View ---

const StrategyTab: React.FC<StrategyTabProps> = ({ 
  data, 
  onDeleteGoal,
  onAddGoal,
  onUpdateGoal,
  onAddHabit,
  onUpdateGlobalRules,
  onAddStrategicItem,
  onDeleteStrategicItem
}) => {
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Strategic Item state
  const [strType, setStrType] = useState<'STRENGTH' | 'WEAKNESS'>('STRENGTH');
  const [strTitle, setStrTitle] = useState('');
  const [strTactic, setStrTactic] = useState('');

  const activeGoals = data.goals.filter(g => g.status === GoalStatus.ACTIVE);
  const backlogGoals = data.goals.filter(g => g.status === GoalStatus.BACKLOG);

  const handleAddStrategicItem = () => {
      if(strTitle && strTactic) {
          onAddStrategicItem({ id: crypto.randomUUID(), type: strType, title: strTitle, tactic: strTactic });
          setStrTitle('');
          setStrTactic('');
      }
  };

  return (
    <div className="animate-fade-in space-y-16 max-w-7xl mx-auto pb-20">
      
      {/* HEADER */}
      <div className="flex justify-between items-end border-b-2 border-black pb-4">
        <div>
            <h1 className="text-4xl font-serif text-notion-text mb-1">Strategic Manifesto</h1>
            <p className="text-notion-dim font-serif italic text-lg">Define the mission. Secure the outcome.</p>
        </div>
        <div className="flex gap-2">
            <button onClick={() => window.print()} className="no-print opacity-50 hover:opacity-100 transition-opacity">
                <Printer className="w-5 h-5" />
            </button>
        </div>
      </div>

      {/* WIZARD OVERLAY */}
      {(isCreating || editingGoal) && (
           <GoalWizard 
                goal={editingGoal || undefined}
                onCancel={() => { setIsCreating(false); setEditingGoal(null); }}
                onSave={(g, habits) => {
                    if(editingGoal) onUpdateGoal(g);
                    else onAddGoal(g);
                    habits.forEach(h => onAddHabit(h));
                    setIsCreating(false);
                    setEditingGoal(null);
                }}
           />
      )}

      {/* SECTION 1: GOALS GRID */}
      {!isCreating && !editingGoal && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              
              {/* LEFT COL: ACTIVE STRATEGY (2/3) */}
              <div className="lg:col-span-2 space-y-6">
                  <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-black flex items-center gap-2">
                          <Target className="w-4 h-4" /> Active Directives ({activeGoals.length}/3)
                      </h3>
                      <button onClick={() => setIsCreating(true)} className="flex items-center gap-1 text-xs font-bold bg-black text-white px-3 py-1.5 rounded hover:opacity-80 transition-opacity shadow-sm">
                          <Plus className="w-3 h-3" /> New Directive
                      </button>
                  </div>

                  <div className="space-y-8">
                    {activeGoals.map((goal, idx) => {
                        const habits = data.habits.filter(h => h.goalId === goal.id);
                        
                        return (
                            <div key={goal.id} className="group bg-white border border-notion-border rounded-xl shadow-sm hover:shadow-lg transition-all relative overflow-hidden">
                                {/* Card Actions */}
                                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 z-10 no-print">
                                    <button onClick={() => setEditingGoal(goal)} className="p-1.5 bg-gray-100 hover:bg-black hover:text-white rounded text-xs">Edit</button>
                                    <button onClick={() => onDeleteGoal(goal.id)} className="p-1.5 bg-gray-100 hover:bg-red-500 hover:text-white rounded text-xs"><Trash2 className="w-3 h-3" /></button>
                                </div>

                                {/* Manifesto Header */}
                                <div className="p-8 border-b border-notion-border bg-notion-sidebar/30">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="text-[10px] text-notion-dim font-bold uppercase tracking-wider mb-2">Priority Sequence 0{idx + 1}</div>
                                            <h2 className="text-3xl font-serif font-bold text-notion-text mb-2 leading-tight">{goal.text}</h2>
                                            <div className="font-mono text-xs text-black bg-white border border-black/10 inline-block px-2 py-1 rounded">
                                                SUCCESS CONDITION: {goal.metric.toUpperCase()}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-4 text-sm text-notion-dim font-serif italic border-l-2 border-black/20 pl-3">
                                        "{goal.motivation}"
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2">
                                    {/* Column 1: Strategic Audit */}
                                    <div className="p-6 border-b md:border-b-0 md:border-r border-notion-border bg-gray-50/50">
                                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-notion-dim mb-4 border-b border-gray-200 pb-2">Strategic Audit</h4>
                                        
                                        <div className="space-y-6">
                                            {/* Leverage */}
                                            <div>
                                                <div className="text-xs font-bold text-green-800 mb-2 flex items-center gap-1"><Zap className="w-3 h-3" /> UNFAIR ADVANTAGES</div>
                                                <ul className="space-y-1">
                                                    {goal.leverage.length > 0 ? goal.leverage.map((l, i) => (
                                                        <li key={i} className="text-sm text-notion-text flex items-start gap-2">
                                                            <span className="text-green-500 mt-1">✓</span> {l}
                                                        </li>
                                                    )) : <li className="text-xs text-gray-400 italic">None defined.</li>}
                                                </ul>
                                            </div>

                                            {/* Failure Modes */}
                                            <div>
                                                <div className="text-xs font-bold text-red-800 mb-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> FAILURE MODES & FIXES</div>
                                                <ul className="space-y-3">
                                                    {goal.obstacles.length > 0 ? goal.obstacles.map((o, i) => (
                                                        <li key={i} className="text-sm bg-white p-2 rounded border border-gray-200 shadow-sm">
                                                            <div className="text-red-900 font-medium mb-1">⚠️ {o.obstacle}</div>
                                                            <div className="text-green-800 text-xs pl-4 border-l-2 border-green-200">🛡️ {o.workaround}</div>
                                                        </li>
                                                    )) : <li className="text-xs text-gray-400 italic">No risks identified.</li>}
                                                </ul>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Column 2: Execution Contract */}
                                    <div className="p-6">
                                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-notion-dim mb-4 border-b border-gray-200 pb-2">Execution Contract</h4>
                                        
                                        <div className="space-y-6">
                                            {/* System */}
                                            <div>
                                                <div className="text-xs font-bold text-black mb-2 flex items-center gap-1"><Anchor className="w-3 h-3" /> THE SYSTEM (Daily)</div>
                                                <ul className="space-y-2">
                                                    {habits.map(h => (
                                                        <li key={h.id} className="text-sm flex justify-between items-center border-b border-dashed border-gray-200 pb-1">
                                                            <span>{h.text}</span>
                                                            {h.defaultTime && <span className="text-[10px] font-mono text-gray-400">{h.defaultTime}</span>}
                                                        </li>
                                                    ))}
                                                    {habits.length === 0 && <li className="text-xs text-gray-400 italic">No system installed.</li>}
                                                </ul>
                                            </div>

                                            {/* Roadmap */}
                                            <div>
                                                <div className="text-xs font-bold text-black mb-2 flex items-center gap-1"><Map className="w-3 h-3" /> THE PATH (Milestones)</div>
                                                <ul className="space-y-1 pl-1">
                                                    {goal.milestones.map((m, i) => (
                                                        <li key={m.id} className={`text-xs flex items-center gap-2 ${m.completed ? 'text-gray-400 line-through' : 'text-notion-text'}`}>
                                                            <div className={`w-1.5 h-1.5 rounded-full ${m.completed ? 'bg-gray-300' : 'bg-black'}`} />
                                                            {m.text}
                                                        </li>
                                                    ))}
                                                    {goal.milestones.length === 0 && <li className="text-xs text-gray-400 italic">No roadmap defined.</li>}
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {activeGoals.length === 0 && <div className="p-12 border-2 border-dashed border-gray-200 rounded-xl text-center text-gray-400 font-serif italic">Initialize strategic objectives to begin.</div>}
                  </div>
              </div>

              {/* RIGHT COL: BACKLOG (1/3) */}
              <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-notion-dim flex items-center gap-2">
                          <Lock className="w-4 h-4" /> The Bench ({backlogGoals.length})
                      </h3>
                  </div>
                  <div className="bg-notion-sidebar rounded-xl border border-notion-border p-4 min-h-[300px]">
                      <ul className="space-y-3">
                          {backlogGoals.map(g => (
                              <li key={g.id} className="group p-4 bg-white border border-gray-200 rounded hover:border-black transition-colors relative shadow-sm">
                                  <div className="font-bold text-sm text-notion-text mb-1">{g.text}</div>
                                  <div className="text-xs text-notion-dim font-mono">{g.metric}</div>
                                  <div className="mt-2 text-[10px] text-gray-400 line-clamp-2 italic">"{g.motivation}"</div>
                                  
                                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 bg-white">
                                      <button onClick={() => setEditingGoal(g)} className="p-1 hover:text-black"><PenTool className="w-3 h-3" /></button>
                                  </div>
                              </li>
                          ))}
                          {backlogGoals.length === 0 && <li className="text-xs text-gray-400 italic text-center py-10">Bench is empty. Focus is absolute.</li>}
                      </ul>
                  </div>
              </div>
          </div>
      )}

      <hr className="border-black/10" />

      {/* SECTION 2: STRATEGIC IDENTITY */}
      <section>
          <div className="mb-6">
              <h2 className="text-xl font-serif font-bold text-notion-text mb-1">Strategic Identity</h2>
              <p className="text-sm text-notion-dim italic">Know yourself. Leverage assets, mitigate liabilities.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* ASSETS */}
              <div className="border border-green-200 bg-green-50/30 rounded-xl p-6">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-green-800 mb-4 flex items-center gap-2">
                      <Zap className="w-4 h-4" /> Assets (Global Strengths)
                  </h3>
                  <ul className="space-y-3 mb-4">
                      {data.strategy.filter(s => s.type === 'STRENGTH').map(s => (
                          <li key={s.id} className="bg-white p-3 rounded border border-green-100 shadow-sm flex justify-between group">
                              <div>
                                  <div className="font-bold text-sm text-green-900">{s.title}</div>
                                  <div className="text-xs text-green-700 mt-0.5">{s.tactic}</div>
                              </div>
                              <button onClick={() => onDeleteStrategicItem(s.id)} className="opacity-0 group-hover:opacity-100 text-green-300 hover:text-green-600"><Trash2 className="w-3 h-3" /></button>
                          </li>
                      ))}
                  </ul>
              </div>

              {/* LIABILITIES */}
              <div className="border border-red-200 bg-red-50/30 rounded-xl p-6">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-red-800 mb-4 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> Liabilities (Global Weaknesses)
                  </h3>
                  <ul className="space-y-3 mb-4">
                      {data.strategy.filter(s => s.type === 'WEAKNESS').map(s => (
                          <li key={s.id} className="bg-white p-3 rounded border border-red-100 shadow-sm flex justify-between group">
                              <div>
                                  <div className="font-bold text-sm text-red-900">{s.title}</div>
                                  <div className="text-xs text-red-700 mt-0.5">{s.tactic}</div>
                              </div>
                              <button onClick={() => onDeleteStrategicItem(s.id)} className="opacity-0 group-hover:opacity-100 text-red-300 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                          </li>
                      ))}
                  </ul>
              </div>
          </div>
          
          {/* Quick Add for Identity */}
          <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg flex flex-wrap gap-4 items-end no-print">
              <div className="flex-1 min-w-[200px]">
                  <label className="block text-[10px] font-bold uppercase text-notion-dim mb-1">Characteristic</label>
                  <input className="w-full p-2 text-sm border border-gray-300 rounded" placeholder="e.g. Deep Focus" value={strTitle} onChange={e => setStrTitle(e.target.value)} />
              </div>
              <div className="flex-1 min-w-[200px]">
                  <label className="block text-[10px] font-bold uppercase text-notion-dim mb-1">Tactic / Application</label>
                  <input className="w-full p-2 text-sm border border-gray-300 rounded" placeholder="e.g. Can work 4h blocks without break" value={strTactic} onChange={e => setStrTactic(e.target.value)} />
              </div>
              <div>
                  <label className="block text-[10px] font-bold uppercase text-notion-dim mb-1">Type</label>
                  <select className="p-2 text-sm border border-gray-300 rounded w-32" value={strType} onChange={e => setStrType(e.target.value as any)}>
                      <option value="STRENGTH">Asset</option>
                      <option value="WEAKNESS">Liability</option>
                  </select>
              </div>
              <button onClick={handleAddStrategicItem} disabled={!strTitle || !strTactic} className="px-4 py-2 bg-black text-white rounded text-sm font-bold hover:opacity-80 disabled:opacity-50">Add Item</button>
          </div>
      </section>

      <hr className="border-black/10" />

      {/* SECTION 3: THE CODE */}
      <section className="print-break-avoid">
          <div className="mb-6">
              <h2 className="text-xl font-serif font-bold text-notion-text mb-1">The Code</h2>
              <p className="text-sm text-notion-dim italic">Operating principles and hard boundaries.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Prescriptions */}
              <div className="bg-notion-sidebar p-6 rounded-xl border border-notion-border">
                  <h3 className="text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2 text-black">
                     <Shield className="w-4 h-4" /> Prescriptions (Identity)
                  </h3>
                  <ListEditor 
                     items={data.globalRules.prescriptions} 
                     onUpdate={(items) => onUpdateGlobalRules({ ...data.globalRules, prescriptions: items })} 
                     placeholder="Always do..."
                     icon={<Check className="w-3 h-3 text-green-600" />}
                  />
              </div>
              {/* Anti-Goals */}
              <div className="bg-notion-sidebar p-6 rounded-xl border border-notion-border">
                  <h3 className="text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2 text-black">
                     <Ban className="w-4 h-4" /> Anti-Goals (Constraints)
                  </h3>
                  <ListEditor 
                     items={data.globalRules.antiGoals} 
                     onUpdate={(items) => onUpdateGlobalRules({ ...data.globalRules, antiGoals: items })} 
                     placeholder="Never do..."
                     icon={<Ban className="w-3 h-3 text-red-600" />}
                  />
              </div>
          </div>
      </section>

    </div>
  );
};

export default StrategyTab;