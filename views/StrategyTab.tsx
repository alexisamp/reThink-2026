import React, { useState } from 'react';
import { AppData, StrategicItem, Goal, GoalStatus, HabitType } from '../types';
import { Shield, Zap, Plus, Printer, Trash2, Check, Layout, Target } from '../components/Icon';

interface StrategyTabProps {
  data: AppData;
  onAddStrategicItem: (item: StrategicItem) => void;
  onDeleteStrategicItem: (id: string) => void;
  onAddGoal: (text: string, motivation?: string) => void;
  onUpdateGoalText: (id: string, text: string) => void;
  onUpdateGoalMotivation: (id: string, motivation: string) => void;
  onCompleteGoal: (id: string) => void;
  onDeleteGoal: (id: string) => void;
  onAddHabit: (text: string, goalId: string, type: HabitType) => void;
  onDeleteHabit: (id: string) => void;
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
  onAddHabit,
  onDeleteHabit
}) => {
  const [newItemType, setNewItemType] = useState<'STRENGTH' | 'WEAKNESS'>('STRENGTH');
  const [itemTitle, setItemTitle] = useState('');
  const [itemTactic, setItemTactic] = useState('');
  const [newGoalText, setNewGoalText] = useState('');
  
  // Local state for habit creation inputs
  const [habitInputs, setHabitInputs] = useState<{[goalId: string]: string}>({});
  const [habitTypes, setHabitTypes] = useState<{[goalId: string]: HabitType}>({});

  const strengths = data.strategy.filter(s => s.type === 'STRENGTH');
  const weaknesses = data.strategy.filter(s => s.type === 'WEAKNESS');
  const activeGoals = data.goals.filter(g => g.status === GoalStatus.ACTIVE);
  const backlogGoals = data.goals.filter(g => g.status === GoalStatus.BACKLOG);

  const handleAddItem = () => {
    if(!itemTitle.trim()) return;
    const newItem: StrategicItem = {
      id: crypto.randomUUID(),
      type: newItemType,
      title: itemTitle,
      tactic: itemTactic
    };
    onAddStrategicItem(newItem);
    setItemTitle('');
    setItemTactic('');
  };

  const handleAddGoal = () => {
    if(!newGoalText.trim()) return;
    onAddGoal(newGoalText);
    setNewGoalText('');
  };

  const handleAddHabit = (goalId: string) => {
    const text = habitInputs[goalId];
    if (!text?.trim()) return;
    const type = habitTypes[goalId] || HabitType.BINARY;
    
    onAddHabit(text, goalId, type);
    
    // Clear input
    setHabitInputs(prev => ({...prev, [goalId]: ''}));
    setHabitTypes(prev => ({...prev, [goalId]: HabitType.BINARY}));
  };

  return (
    <div className="animate-fade-in space-y-12 pb-20">
      
      {/* Header & Print */}
      <div className="flex justify-between items-end border-b border-notion-border pb-4">
        <div>
          <h2 className="text-3xl font-serif">Strategic Identity</h2>
          <p className="text-notion-dim font-serif italic">Know yourself to play your own game.</p>
        </div>
        <button 
          onClick={() => window.print()}
          className="no-print flex items-center gap-2 text-xs bg-notion-sidebar px-3 py-2 rounded hover:bg-notion-hover text-notion-text transition-colors"
        >
          <Printer className="w-4 h-4" /> Export PDF
        </button>
      </div>

      {/* Identity Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Strengths */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg border border-green-100">
            <Shield className="w-5 h-5" />
            <h3 className="font-bold uppercase tracking-wider text-sm">Strengths (Leverage)</h3>
          </div>
          
          <div className="space-y-3">
             {strengths.map(s => (
               <div key={s.id} className="group p-4 bg-white border border-notion-border rounded-lg shadow-sm">
                 <div className="flex justify-between items-start">
                   <div className="font-medium text-lg mb-1">{s.title}</div>
                   <button onClick={() => onDeleteStrategicItem(s.id)} className="no-print opacity-0 group-hover:opacity-100 text-notion-dim hover:text-red-500"><Trash2 className="w-4 h-4"/></button>
                 </div>
                 <div className="text-sm text-notion-dim font-serif">Action: {s.tactic}</div>
               </div>
             ))}
          </div>

          {/* Add Form (No Print) */}
          <div className="no-print p-4 bg-notion-sidebar rounded-lg border border-notion-border space-y-2">
            <input 
              placeholder="Add Strength..."
              className="w-full bg-transparent border-b border-notion-border outline-none pb-1"
              value={newItemType === 'STRENGTH' ? itemTitle : ''}
              onChange={e => { setNewItemType('STRENGTH'); setItemTitle(e.target.value); }}
            />
            {newItemType === 'STRENGTH' && itemTitle && (
              <div className="animate-in fade-in">
                 <input 
                    placeholder="How will you leverage this?"
                    className="w-full bg-transparent text-sm text-notion-dim italic outline-none"
                    value={itemTactic}
                    onChange={e => setItemTactic(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddItem()}
                 />
                 <button onClick={handleAddItem} className="mt-2 text-xs bg-green-600 text-white px-3 py-1 rounded">Add</button>
              </div>
            )}
          </div>
        </section>

        {/* Weaknesses */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-orange-700 bg-orange-50 p-3 rounded-lg border border-orange-100">
            <Zap className="w-5 h-5" />
            <h3 className="font-bold uppercase tracking-wider text-sm">Weaknesses (Mitigate)</h3>
          </div>

          <div className="space-y-3">
             {weaknesses.map(s => (
               <div key={s.id} className="group p-4 bg-white border border-notion-border rounded-lg shadow-sm">
                 <div className="flex justify-between items-start">
                   <div className="font-medium text-lg mb-1">{s.title}</div>
                   <button onClick={() => onDeleteStrategicItem(s.id)} className="no-print opacity-0 group-hover:opacity-100 text-notion-dim hover:text-red-500"><Trash2 className="w-4 h-4"/></button>
                 </div>
                 <div className="text-sm text-notion-dim font-serif">Hack: {s.tactic}</div>
               </div>
             ))}
          </div>

           {/* Add Form (No Print) */}
           <div className="no-print p-4 bg-notion-sidebar rounded-lg border border-notion-border space-y-2">
            <input 
              placeholder="Add Weakness..."
              className="w-full bg-transparent border-b border-notion-border outline-none pb-1"
              value={newItemType === 'WEAKNESS' ? itemTitle : ''}
              onChange={e => { setNewItemType('WEAKNESS'); setItemTitle(e.target.value); }}
            />
            {newItemType === 'WEAKNESS' && itemTitle && (
              <div className="animate-in fade-in">
                 <input 
                    placeholder="System/Hack to prevent this?"
                    className="w-full bg-transparent text-sm text-notion-dim italic outline-none"
                    value={itemTactic}
                    onChange={e => setItemTactic(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddItem()}
                 />
                 <button onClick={handleAddItem} className="mt-2 text-xs bg-orange-600 text-white px-3 py-1 rounded">Add</button>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Goals & System Configuration */}
      <section>
        <div className="flex items-center gap-3 mb-6 pb-2 border-b border-notion-border">
          <Target className="w-6 h-6" />
          <h2 className="text-3xl font-serif">System Configuration</h2>
        </div>

        <div className="space-y-8">
           {activeGoals.map(g => {
             const goalHabits = data.habits.filter(h => h.goalId === g.id);

             return (
               <div key={g.id} className="bg-white border border-notion-border rounded-xl shadow-sm overflow-hidden flex flex-col group">
                 
                 {/* Card Header: Goal Definition */}
                 <div className="p-6 border-b border-notion-border">
                    <label className="text-xs font-bold text-notion-dim uppercase tracking-wider mb-2 block">Outcome (Goal)</label>
                    <input 
                      className="text-xl font-medium w-full outline-none bg-transparent mb-2 focus:bg-notion-sidebar/30 rounded p-1 -ml-1"
                      value={g.text}
                      onChange={(e) => onUpdateGoalText(g.id, e.target.value)}
                      placeholder="What is the goal?"
                    />
                    <input 
                      className="text-sm text-notion-dim w-full outline-none bg-transparent font-serif italic focus:bg-notion-sidebar/30 rounded p-1 -ml-1"
                      value={g.motivation || ''}
                      onChange={(e) => onUpdateGoalMotivation(g.id, e.target.value)}
                      placeholder="Why does this matter? (Motivation)"
                    />
                 </div>

                 {/* Card Body: System (Habits) */}
                 <div className="p-6 bg-notion-sidebar/30">
                    <div className="flex items-center gap-2 mb-4">
                      <Layout className="w-4 h-4 text-notion-dim" />
                      <h4 className="text-xs font-bold text-notion-dim uppercase tracking-wider">The System (Habits)</h4>
                    </div>

                    {/* Existing Habits */}
                    <div className="space-y-2 mb-6">
                      {goalHabits.map(h => (
                        <div key={h.id} className="flex items-center justify-between bg-white p-3 rounded border border-notion-border shadow-sm group/habit">
                           <div className="flex items-center gap-3">
                              <span className="text-sm font-medium">{h.text}</span>
                              {h.type === HabitType.SCALE && (
                                <span className="text-[10px] border px-1 rounded text-notion-dim uppercase">Scale</span>
                              )}
                           </div>
                           <button 
                            onClick={() => onDeleteHabit(h.id)}
                            className="text-notion-dim hover:text-red-500 opacity-0 group-hover/habit:opacity-100 transition-opacity"
                           >
                             <Trash2 className="w-4 h-4" />
                           </button>
                        </div>
                      ))}
                      {goalHabits.length === 0 && <div className="text-sm text-notion-dim italic">No habits configured yet.</div>}
                    </div>

                    {/* Add Habit Form Inline */}
                    <div className="flex items-center gap-2 bg-white p-2 rounded border border-notion-border border-dashed focus-within:border-solid focus-within:border-black">
                       <Plus className="w-4 h-4 text-notion-dim" />
                       <input 
                          className="flex-1 text-sm outline-none bg-transparent"
                          placeholder="Configure a new habit..."
                          value={habitInputs[g.id] || ''}
                          onChange={(e) => setHabitInputs(prev => ({...prev, [g.id]: e.target.value}))}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddHabit(g.id)}
                       />
                       <select 
                          className="text-xs bg-notion-sidebar border border-notion-border rounded px-2 py-1 outline-none"
                          value={habitTypes[g.id] || HabitType.BINARY}
                          onChange={(e) => setHabitTypes(prev => ({...prev, [g.id]: e.target.value as HabitType}))}
                       >
                         <option value={HabitType.BINARY}>Binary</option>
                         <option value={HabitType.SCALE}>Scale 1-5</option>
                       </select>
                       <button 
                        onClick={() => handleAddHabit(g.id)}
                        className="text-xs bg-black text-white px-3 py-1 rounded hover:opacity-80"
                       >
                         Add
                       </button>
                    </div>
                 </div>

                 {/* Card Footer: Actions */}
                 <div className="p-4 bg-white border-t border-notion-border flex justify-end gap-3 no-print">
                    <button 
                      onClick={() => onDeleteGoal(g.id)}
                      className="text-xs text-notion-dim hover:text-red-600 flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Delete Goal
                    </button>
                    <button 
                      onClick={() => onCompleteGoal(g.id)}
                      className="text-xs text-green-700 hover:text-green-800 bg-green-50 px-3 py-1 rounded flex items-center gap-1 border border-green-100"
                    >
                      <Check className="w-3 h-3" /> Archive as Complete
                    </button>
                 </div>
               </div>
             );
           })}
           
           {/* New Goal Input */}
           {activeGoals.length < 3 ? (
             <div className="mt-8 no-print p-6 bg-notion-sidebar border border-notion-border border-dashed rounded-xl flex items-center justify-center">
                <input 
                  className="bg-transparent text-center text-lg outline-none placeholder:text-notion-dim/50 w-full"
                  placeholder="+ Click to define a new outcome (Max 3)"
                  value={newGoalText}
                  onChange={(e) => setNewGoalText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddGoal()}
                />
             </div>
           ) : (
             <div className="text-center text-notion-dim italic mt-8">System capacity reached (3/3 active goals). Complete one to add more.</div>
           )}
        </div>
        
        <div className="mt-12 no-print border-t border-notion-border pt-6">
            <h4 className="text-sm font-bold text-notion-dim uppercase mb-4">Backlog</h4>
            {backlogGoals.length > 0 ? (
              <ul className="list-disc list-inside text-sm text-notion-text space-y-1">
                  {backlogGoals.map(g => <li key={g.id}>{g.text}</li>)}
              </ul>
            ) : (
              <p className="text-sm text-notion-dim italic">No goals in backlog.</p>
            )}
        </div>
      </section>

    </div>
  );
};

export default StrategyTab;
