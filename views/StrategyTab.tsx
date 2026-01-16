import React, { useState } from 'react';
import { AppData, StrategicItem, Goal, GoalStatus } from '../types';
import { Shield, Zap, Plus, Printer, Trash2 } from '../components/Icon';

interface StrategyTabProps {
  data: AppData;
  onAddStrategicItem: (item: StrategicItem) => void;
  onDeleteStrategicItem: (id: string) => void;
  onAddGoal: (text: string, motivation?: string) => void;
}

const StrategyTab: React.FC<StrategyTabProps> = ({ data, onAddStrategicItem, onDeleteStrategicItem, onAddGoal }) => {
  const [newItemType, setNewItemType] = useState<'STRENGTH' | 'WEAKNESS'>('STRENGTH');
  const [itemTitle, setItemTitle] = useState('');
  const [itemTactic, setItemTactic] = useState('');
  const [goalText, setGoalText] = useState('');

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

      {/* Goals View */}
      <section>
        <h3 className="text-xl font-serif mb-6 pb-2 border-b border-notion-border">Current Vision</h3>
        <div className="space-y-4">
           {activeGoals.map(g => (
             <div key={g.id} className="flex justify-between items-center p-4 bg-notion-sidebar rounded border border-notion-border">
                <span className="font-medium">{g.text}</span>
                <span className="text-xs text-notion-dim italic">{g.motivation}</span>
             </div>
           ))}
           {activeGoals.length === 0 && <div className="text-notion-dim italic">No active goals set.</div>}
        </div>
        
        <div className="mt-8 no-print">
            <h4 className="text-sm font-bold text-notion-dim uppercase mb-2">Backlog</h4>
            <ul className="list-disc list-inside text-sm text-notion-text space-y-1">
                {backlogGoals.map(g => <li key={g.id}>{g.text}</li>)}
            </ul>
        </div>
      </section>

    </div>
  );
};

export default StrategyTab;
