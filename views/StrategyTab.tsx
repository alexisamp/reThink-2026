import React from 'react';
import { AppData, Goal, GoalStatus, Habit, GlobalRules, StrategicItem, WorkbookData } from '../types';
import { Printer, PenTool } from '../components/Icon';
import AnnualReview from './AnnualReview';

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
  
  // New props for updating full data from wizard
  onUpdateFullData: (
      workbook: WorkbookData, 
      activeGoals: Goal[], 
      backlogGoals: Goal[], 
      strategy: StrategicItem[], 
      rules: GlobalRules
  ) => void;
}

const StrategyTab: React.FC<StrategyTabProps> = ({ 
  data, 
  onUpdateFullData
}) => {
  const [isEditing, setIsEditing] = React.useState(false);

  // If not signed, show Wizard immediately
  if (!data.workbook?.signedAt && !isEditing) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 text-center">
            <h1 className="text-4xl font-serif">Annual Review 2025/2026</h1>
            <p className="text-notion-dim max-w-md">The strategy is undefined. You must complete the workbook to generate your manifesto.</p>
            <button onClick={() => setIsEditing(true)} className="px-6 py-3 bg-black text-white font-bold rounded hover:opacity-80">
                Begin Review
            </button>
        </div>
      );
  }

  if (isEditing) {
      return (
        <AnnualReview 
            data={data}
            onCancel={() => setIsEditing(false)}
            onComplete={(wb, active, backlog, strat, rules) => {
                onUpdateFullData(wb, active, backlog, strat, rules);
                setIsEditing(false);
            }}
        />
      );
  }

  const activeGoals = data.goals.filter(g => g.status === GoalStatus.ACTIVE);
  const backlogGoals = data.goals.filter(g => g.status === GoalStatus.BACKLOG);
  const strengths = data.strategy.filter(s => s.type === 'STRENGTH');
  const weaknesses = data.strategy.filter(s => s.type === 'WEAKNESS');

  // --- THE MANIFESTO DOCUMENT ---
  return (
    <div className="max-w-4xl mx-auto pb-20 animate-fade-in print:max-w-none">
      
      {/* TOOLBAR */}
      <div className="flex justify-between items-center mb-12 no-print border-b border-gray-200 pb-4">
          <div className="text-xs font-bold uppercase tracking-widest text-notion-dim">Strategic Document</div>
          <div className="flex gap-4">
              <button onClick={() => window.print()} className="opacity-50 hover:opacity-100"><Printer className="w-5 h-5"/></button>
              <button onClick={() => setIsEditing(true)} className="opacity-50 hover:opacity-100 flex items-center gap-1 text-xs font-bold"><PenTool className="w-4 h-4"/> Edit</button>
          </div>
      </div>

      {/* HEADER */}
      <div className="text-center mb-16">
          <h1 className="text-5xl font-serif font-bold mb-4 tracking-tight">The 2026 Manifesto</h1>
          <p className="text-notion-dim font-serif italic text-xl">Defined by {data.workbook.signatureName}</p>
      </div>

      <div className="space-y-16">
          
          {/* SECTION 1: THE AUDIT */}
          <section>
              <h2 className="text-xs font-bold uppercase tracking-widest border-b-2 border-black pb-2 mb-8">Part I: The Audit</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div>
                      <h3 className="font-serif text-lg font-bold mb-2">Key to Success</h3>
                      <p className="font-serif text-notion-text leading-relaxed whitespace-pre-wrap">{data.workbook.keySuccess}</p>
                  </div>
                  <div>
                      <h3 className="font-serif text-lg font-bold mb-2">Time Reality</h3>
                      <p className="font-serif text-notion-text leading-relaxed whitespace-pre-wrap">{data.workbook.timeAudit}</p>
                  </div>
                  <div className="bg-gray-50 p-6">
                      <h3 className="font-serif text-lg font-bold mb-2">Smartest Decision</h3>
                      <p className="font-serif text-notion-text leading-relaxed whitespace-pre-wrap">{data.workbook.smartestDecision}</p>
                  </div>
                   <div className="bg-gray-50 p-6">
                      <h3 className="font-serif text-lg font-bold mb-2">Stupidest Decision</h3>
                      <p className="font-serif text-notion-text leading-relaxed whitespace-pre-wrap">{data.workbook.stupidestDecision}</p>
                  </div>
              </div>

              <div className="mt-12">
                  <h3 className="font-serif text-lg font-bold mb-2">Inversion (Pre-Mortem)</h3>
                  <div className="border-l-4 border-black pl-6 py-2">
                       <p className="font-serif text-notion-text leading-relaxed whitespace-pre-wrap italic">{data.workbook.failurePreMortem}</p>
                  </div>
              </div>
          </section>

          {/* SECTION 2: THE PLAN */}
          <section>
              <h2 className="text-xs font-bold uppercase tracking-widest border-b-2 border-black pb-2 mb-8">Part II: The Critical Three</h2>
              
              <div className="space-y-8">
                  {activeGoals.map((g, i) => (
                      <div key={g.id} className="border border-black p-8 relative">
                          <div className="absolute top-0 left-0 bg-black text-white px-3 py-1 text-xs font-bold">Priority {i+1}</div>
                          <h3 className="text-3xl font-serif font-bold mb-2 mt-4">{g.text}</h3>
                          <p className="text-notion-dim font-serif italic text-lg">{g.motivation}</p>
                      </div>
                  ))}
                  {activeGoals.length === 0 && <p className="text-center italic text-gray-400">No active goals defined.</p>}
              </div>

              <div className="mt-12 bg-gray-50 p-8">
                  <h3 className="font-serif text-lg font-bold mb-4 text-notion-dim">Avoid-At-All-Costs List (The Bench)</h3>
                  <ul className="list-disc pl-5 grid grid-cols-1 md:grid-cols-2 gap-2">
                      {backlogGoals.map(g => (
                          <li key={g.id} className="text-notion-text font-serif">{g.text}</li>
                      ))}
                  </ul>
              </div>
          </section>

          {/* SECTION 3: MOMENTUM */}
          <section>
              <h2 className="text-xs font-bold uppercase tracking-widest border-b-2 border-black pb-2 mb-8">Part III: Momentum</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {data.workbook.procrastinationList.map((p, i) => (
                      <div key={i} className="bg-notion-sidebar p-6 border border-gray-200">
                          <div className="text-[10px] uppercase font-bold text-notion-dim mb-2">Unblocking</div>
                          <div className="font-bold mb-1">{p.item}</div>
                          <div className="text-sm italic">→ {p.smallStep}</div>
                      </div>
                  ))}
              </div>
          </section>

           {/* SECTION 4: IDENTITY */}
          <section>
              <h2 className="text-xs font-bold uppercase tracking-widest border-b-2 border-black pb-2 mb-8">Part IV: Identity & Code</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-12">
                  <div>
                      <h3 className="font-serif text-lg font-bold mb-4">Assets (Strengths)</h3>
                      <ul className="space-y-4">
                          {strengths.map(s => (
                              <li key={s.id}>
                                  <div className="font-bold text-sm">{s.title}</div>
                                  <div className="text-xs text-notion-dim">{s.tactic}</div>
                              </li>
                          ))}
                      </ul>
                  </div>
                  <div>
                      <h3 className="font-serif text-lg font-bold mb-4">Liabilities (Weaknesses)</h3>
                      <ul className="space-y-4">
                          {weaknesses.map(s => (
                              <li key={s.id}>
                                  <div className="font-bold text-sm">{s.title}</div>
                                  <div className="text-xs text-notion-dim">Workaround: {s.tactic}</div>
                              </li>
                          ))}
                      </ul>
                  </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                   <div>
                      <h3 className="font-serif text-lg font-bold mb-4">Prescriptions (Always)</h3>
                      <ul className="list-disc pl-5 space-y-2 font-serif">
                          {data.globalRules.prescriptions.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                  </div>
                   <div>
                      <h3 className="font-serif text-lg font-bold mb-4">Anti-Goals (Never)</h3>
                      <ul className="list-disc pl-5 space-y-2 font-serif">
                          {data.globalRules.antiGoals.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                  </div>
              </div>
          </section>

          {/* FOOTER */}
          <div className="border-t-4 border-black pt-8 mt-20 text-center">
              <p className="font-serif text-xl italic mb-4">
                "I commit to executing this plan. I accept that I cannot do everything, but I can do anything if I focus."
              </p>
              <div className="font-signature text-3xl font-serif mt-8">{data.workbook.signatureName}</div>
              <div className="text-xs uppercase tracking-widest text-notion-dim mt-2">
                  Signed on {data.workbook.signedAt ? new Date(data.workbook.signedAt).toLocaleDateString() : 'Unknown'}
              </div>
          </div>

      </div>

    </div>
  );
};

export default StrategyTab;