import React, { useState } from 'react';
import { AppData, StrategicItem, Goal, GoalStatus, HabitType } from '../types';
import { Shield, Zap, Plus, Printer, Trash2, Check, Layout, Target, Map } from '../components/Icon';

interface StrategyTabProps {
  data: AppData;
  onAddStrategicItem: (item: StrategicItem) => void;
  onDeleteStrategicItem: (id: string) => void;
  onAddGoal: (text: string, motivation?: string) => void;
  onUpdateGoalText: (id: string, text: string) => void;
  onUpdateGoalMotivation: (id: string, motivation: string) => void;
  onCompleteGoal: (id: string) => void;
  onDeleteGoal: (id: string) => void;
  onAddMilestone: (goalId: string, text: string) => void;
  onDeleteMilestone: (goalId: string, milestoneId: string) => void;
  onToggleMilestone: (goalId: string, milestoneId: string) => void;
  onAddHabit: (text: string, goalId: string, type: HabitType) => void;
  onDeleteHabit: (id: string) => void;
  onUpdateGlobalRules: (rules: string) => void;
}

const StrategyTab: React.FC<StrategyTabProps> = ({ 
  data, 
  onAddStrategicItem, 
  onDeleteStrategicItem, 
  onAddGoal,
  onUpdateGoalText,
  onUpdateGoalMotivation,
  onCompleteGoal,
  onDeleteGoal,
  onAddMilestone,
  onDeleteMilestone,
  onToggleMilestone,
  onAddHabit,
  onDeleteHabit,
  onUpdateGlobalRules
}) => {
  // Input States
  const [itemTitle, setItemTitle] = useState('');
  const [itemTactic, setItemTactic] = useState('');
  const [itemType, setItemType] = useState<'STRENGTH' | 'WEAKNESS'>('STRENGTH');
  const [newGoalText, setNewGoalText] = useState('');
  
  // Local inputs for sub-items
  const [habitInputs, setHabitInputs] = useState<{[key:string]: string}>({});
  const [milestoneInputs, setMilestoneInputs] = useState<{[key:string]: string}>({});

  const activeGoals = data.goals.filter(g => g.status === GoalStatus.ACTIVE);

  const handleAddStratItem = () => {
      if(!itemTitle.trim()) return;
      onAddStrategicItem({
          id: crypto.randomUUID(),
          type: itemType,
          title: itemTitle,
          tactic: itemTactic
      });
      setItemTitle('');
      setItemTactic('');
  };

  const handleAddHabit = (goalId: string) => {
      if (!habitInputs[goalId]?.trim()) return;
      onAddHabit(habitInputs[goalId], goalId, HabitType.BINARY);
      setHabitInputs(prev => ({...prev, [goalId]: ''}));
  };

  const handleAddMilestone = (goalId: string) => {
      if (!milestoneInputs[goalId]?.trim()) return;
      onAddMilestone(goalId, milestoneInputs[goalId]);
      setMilestoneInputs(prev => ({...prev, [goalId]: ''}));
  };

  return (
    <div className="animate-fade-in space-y-16 max-w-3xl mx-auto print:max-w-none print:space-y-8">
      
      {/* Print Optimization Styles */}
      <style>{`
        @media print {
            @page { margin: 1.5cm; size: auto; }
            body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .no-print { display: none !important; }
            .print-break-avoid { break-inside: avoid; page-break-inside: avoid; }
            input::placeholder, textarea::placeholder { color: transparent; }
            input, textarea { border: none !important; }
        }
      `}</style>

      {/* 1. Identity / Manifesto Header */}
      <section className="print-break-avoid">
          <div className="flex justify-between items-start border-b border-notion-border pb-6 mb-8 print:border-black">
            <div>
                <h2 className="text-4xl font-serif text-notion-text mb-2">The 2026 Manifesto</h2>
                <p className="text-notion-dim font-serif italic text-lg print:text-gray-600">"Identity determines behavior."</p>
            </div>
            <button 
                onClick={() => window.print()} 
                className="no-print flex items-center gap-2 px-4 py-2 bg-black text-white rounded hover:opacity-80 transition-opacity text-sm font-medium"
            >
                <Printer className="w-4 h-4" /> Export Strategy
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Strengths */}
              <div>
                  <h3 className="font-bold text-xs uppercase tracking-wider text-notion-dim mb-3 flex items-center gap-2 print:text-black">
                      <Shield className="w-3 h-3" /> Core Strengths
                  </h3>
                  <div className="space-y-3">
                      {data.strategy.filter(s => s.type === 'STRENGTH').map(s => (
                          <div key={s.id} className="group relative pl-4 border-l-2 border-green-200 print:border-green-400">
                              <div className="font-medium text-notion-text">{s.title}</div>
                              <div className="text-sm text-notion-dim italic print:text-gray-600">{s.tactic}</div>
                              <button onClick={() => onDeleteStrategicItem(s.id)} className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 text-notion-dim hover:text-red-500 no-print">
                                  <Trash2 className="w-3 h-3" />
                              </button>
                          </div>
                      ))}
                      
                      {/* Add Input */}
                      <div className="no-print bg-notion-sidebar p-3 rounded text-sm mt-4">
                          <input 
                            className="bg-transparent w-full outline-none mb-2 font-medium" 
                            placeholder="Add Strength..."
                            value={itemType === 'STRENGTH' ? itemTitle : ''}
                            onChange={e => { setItemType('STRENGTH'); setItemTitle(e.target.value); }}
                          />
                           {itemType === 'STRENGTH' && itemTitle && (
                            <input 
                                className="bg-transparent w-full outline-none text-notion-dim italic" 
                                placeholder="How to leverage?"
                                value={itemTactic}
                                onChange={e => setItemTactic(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAddStratItem()}
                            />
                           )}
                      </div>
                  </div>
              </div>

              {/* Weaknesses */}
              <div>
                  <h3 className="font-bold text-xs uppercase tracking-wider text-notion-dim mb-3 flex items-center gap-2 print:text-black">
                      <Zap className="w-3 h-3" /> Workarounds
                  </h3>
                  <div className="space-y-3">
                      {data.strategy.filter(s => s.type === 'WEAKNESS').map(s => (
                          <div key={s.id} className="group relative pl-4 border-l-2 border-orange-200 print:border-orange-400">
                              <div className="font-medium text-notion-text">{s.title}</div>
                              <div className="text-sm text-notion-dim italic print:text-gray-600">{s.tactic}</div>
                              <button onClick={() => onDeleteStrategicItem(s.id)} className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 text-notion-dim hover:text-red-500 no-print">
                                  <Trash2 className="w-3 h-3" />
                              </button>
                          </div>
                      ))}

                      {/* Add Input */}
                      <div className="no-print bg-notion-sidebar p-3 rounded text-sm mt-4">
                          <input 
                            className="bg-transparent w-full outline-none mb-2 font-medium" 
                            placeholder="Add Weakness..."
                            value={itemType === 'WEAKNESS' ? itemTitle : ''}
                            onChange={e => { setItemType('WEAKNESS'); setItemTitle(e.target.value); }}
                          />
                           {itemType === 'WEAKNESS' && itemTitle && (
                            <input 
                                className="bg-transparent w-full outline-none text-notion-dim italic" 
                                placeholder="System to mitigate?"
                                value={itemTactic}
                                onChange={e => setItemTactic(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAddStratItem()}
                            />
                           )}
                      </div>
                  </div>
              </div>
          </div>
      </section>

      {/* 2. Active Goals (The Core Document) */}
      <section className="space-y-12 print:space-y-8">
          {activeGoals.map((goal, idx) => {
              const habits = data.habits.filter(h => h.goalId === goal.id);
              
              return (
                  <div key={goal.id} className="border-t border-gray-200 pt-8 print-break-avoid">
                      {/* Header */}
                      <div className="mb-6">
                          <div className="text-xs font-bold text-notion-dim uppercase tracking-widest mb-2 print:text-black">Priority {idx + 1}</div>
                          <input 
                            className="text-3xl font-serif text-notion-text w-full outline-none bg-transparent placeholder:text-gray-300"
                            value={goal.text}
                            onChange={e => onUpdateGoalText(goal.id, e.target.value)}
                          />
                          <input 
                            className="text-lg font-serif italic text-notion-dim w-full outline-none bg-transparent mt-1 print:text-gray-600"
                            value={goal.motivation}
                            onChange={e => onUpdateGoalMotivation(goal.id, e.target.value)}
                            placeholder="Why this matters..."
                          />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 print:gap-8">
                          
                          {/* A. The System (Habits) */}
                          <div className="bg-gray-50 p-6 rounded-xl border border-gray-100 print:bg-gray-50 print:border-gray-300">
                              <h4 className="font-bold text-xs uppercase tracking-wider text-notion-dim mb-4 flex items-center gap-2 print:text-black">
                                  <Layout className="w-3 h-3" /> Daily System (Habits)
                              </h4>
                              <ul className="space-y-3">
                                  {habits.map(h => (
                                      <li key={h.id} className="flex justify-between items-center group text-sm">
                                          <span className="flex items-center gap-2">
                                              <div className="w-1.5 h-1.5 bg-black rounded-full" />
                                              {h.text}
                                          </span>
                                          <button onClick={() => onDeleteHabit(h.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 no-print">
                                              <Trash2 className="w-3 h-3" />
                                          </button>
                                      </li>
                                  ))}
                              </ul>
                              <div className="mt-4 pt-4 border-t border-gray-200 flex items-center gap-2 no-print">
                                  <Plus className="w-3 h-3 text-gray-400" />
                                  <input 
                                    className="bg-transparent text-sm outline-none w-full"
                                    placeholder="Add habit..."
                                    value={habitInputs[goal.id] || ''}
                                    onChange={e => setHabitInputs(prev => ({...prev, [goal.id]: e.target.value}))}
                                    onKeyDown={e => e.key === 'Enter' && handleAddHabit(goal.id)}
                                  />
                              </div>
                          </div>

                          {/* B. The Roadmap (Milestones) */}
                          <div className="bg-white p-6 rounded-xl border border-gray-200 print:border-gray-300">
                              <h4 className="font-bold text-xs uppercase tracking-wider text-notion-dim mb-4 flex items-center gap-2 print:text-black">
                                  <Map className="w-3 h-3" /> Roadmap (Milestones)
                              </h4>
                              <ul className="space-y-3">
                                  {goal.milestones?.map(m => (
                                      <li key={m.id} className="flex justify-between items-center group text-sm">
                                          <button 
                                            onClick={() => onToggleMilestone(goal.id, m.id)}
                                            className={`flex items-center gap-2 text-left transition-colors ${m.completed ? 'line-through text-gray-400' : 'text-notion-text'}`}
                                          >
                                              <div className={`w-1.5 h-1.5 border border-black transform rotate-45 ${m.completed ? 'bg-black' : 'bg-transparent'}`} />
                                              {m.text}
                                          </button>
                                          <button onClick={() => onDeleteMilestone(goal.id, m.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 no-print">
                                              <Trash2 className="w-3 h-3" />
                                          </button>
                                      </li>
                                  ))}
                              </ul>
                              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2 no-print">
                                  <Plus className="w-3 h-3 text-gray-400" />
                                  <input 
                                    className="bg-transparent text-sm outline-none w-full"
                                    placeholder="Add milestone..."
                                    value={milestoneInputs[goal.id] || ''}
                                    onChange={e => setMilestoneInputs(prev => ({...prev, [goal.id]: e.target.value}))}
                                    onKeyDown={e => e.key === 'Enter' && handleAddMilestone(goal.id)}
                                  />
                              </div>
                          </div>

                      </div>

                      {/* Goal Footer */}
                      <div className="flex justify-end mt-4 opacity-0 hover:opacity-100 transition-opacity no-print">
                         <button onClick={() => onCompleteGoal(goal.id)} className="text-xs text-green-600 mr-4">Archive</button>
                         <button onClick={() => onDeleteGoal(goal.id)} className="text-xs text-red-400">Delete</button>
                      </div>
                  </div>
              );
          })}

          {activeGoals.length < 3 && (
              <div className="py-10 border-t border-dashed border-gray-300 text-center no-print">
                  <input 
                    className="text-xl font-serif text-center bg-transparent outline-none placeholder:text-gray-300"
                    placeholder="+ Define New Outcome"
                    value={newGoalText}
                    onChange={e => setNewGoalText(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && newGoalText.trim()) {
                            onAddGoal(newGoalText);
                            setNewGoalText('');
                        }
                    }}
                  />
              </div>
          )}
      </section>

      {/* 3. Global Rules */}
      <section className="border-t-4 border-black pt-8 pb-20 print:pb-0 print-break-avoid">
          <h3 className="font-bold text-xs uppercase tracking-wider text-notion-dim mb-4 print:text-black">Non-Negotiable Rules</h3>
          <textarea 
            className="w-full h-32 text-sm text-notion-text bg-transparent outline-none resize-none font-mono leading-relaxed print:text-sm"
            placeholder="- No phone after 9pm&#10;- Read 10 pages daily&#10;- Clean desk before leaving"
            value={data.globalRules || ''}
            onChange={e => onUpdateGlobalRules(e.target.value)}
          />
      </section>

    </div>
  );
};

export default StrategyTab;