import React, { useState, useEffect } from 'react';
import { AppData, Goal, GoalStatus, Habit, HabitType, WorkbookData } from '../types';
import { Printer, PenTool, Target, Map, Zap, AlertTriangle, Anchor, Check, Trash2, Plus, Clock, Sparkles, Ban, Shield, Users, BarChart2, Calendar } from '../components/Icon';
import AnnualReview from './AnnualReview';
import ContributionGraph from '../components/ContributionGraph';

// --- HELPERS ---
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// --- GOAL SYSTEM WIZARD ---
const GoalWizard: React.FC<{
    goal: Goal;
    onSave: (g: Goal, newHabits: Habit[]) => void;
    onCancel: () => void;
}> = ({ goal, onSave, onCancel }) => {
    
    // Flattened State
    const [text, setText] = useState(goal.text || '');
    const [metric, setMetric] = useState(goal.metric || '');
    const [motivation, setMotivation] = useState(goal.motivation || '');
    
    // Habit State
    const [habits, setHabits] = useState<{
        text: string, 
        defaultTime: string, 
        frequency: 'DAILY' | 'WEEKLY',
        reward: string
    }[]>([]);
    const [newHabit, setNewHabit] = useState('');
    const [newHabitTime, setNewHabitTime] = useState('');
    const [newHabitFreq, setNewHabitFreq] = useState<'DAILY' | 'WEEKLY'>('DAILY');
    const [newHabitReward, setNewHabitReward] = useState('');

    // Milestone State
    const [milestones, setMilestones] = useState(goal.milestones || []);
    const [newMilestone, setNewMilestone] = useState('');
    const [newMilestoneMonth, setNewMilestoneMonth] = useState(MONTHS[new Date().getMonth()]);

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
            frequency: h.frequency,
            defaultTime: h.defaultTime || undefined,
            reward: h.reward || undefined,
            contributions: {}
        }));

        onSave(finalGoal, newHabitsToCreate);
    };

    const addHabit = () => {
        if(newHabit.trim()) {
            setHabits([...habits, { 
                text: newHabit, 
                defaultTime: newHabitTime,
                frequency: newHabitFreq,
                reward: newHabitReward
            }]);
            setNewHabit(''); setNewHabitTime(''); setNewHabitReward('');
        }
    };

    const addMilestone = () => {
        if(newMilestone.trim()) {
            setMilestones([...milestones, {
                id: crypto.randomUUID(), 
                text: newMilestone, 
                targetMonth: newMilestoneMonth, 
                completed: false
            }]);
            setNewMilestone('');
        }
    };

    return (
        <div className="fixed inset-0 bg-white/95 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="max-w-5xl w-full bg-white shadow-2xl border border-notion-border max-h-[90vh] overflow-y-auto rounded-xl flex flex-col md:flex-row overflow-hidden animate-in fade-in zoom-in-95">
                
                {/* Left: Context */}
                <div className="bg-notion-sidebar p-8 md:w-1/3 border-r border-notion-border">
                    <h3 className="font-bold uppercase tracking-widest text-xs text-notion-dim mb-6">Workbook Context</h3>
                    <div className="space-y-6">
                        <div>
                            <label className="text-xs font-bold text-notion-dim block mb-1">Goal</label>
                            <p className="font-serif text-lg leading-tight break-words text-notion-text">{goal.text}</p>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-notion-dim block mb-1">Support Needed</label>
                            <p className="text-sm text-gray-600 break-words">{goal.keySupport || 'None specified'}</p>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-notion-dim block mb-1">Initial Next Step</label>
                            <p className="text-sm text-gray-600 break-words">{goal.nextStep || 'None specified'}</p>
                        </div>
                    </div>
                </div>

                {/* Right: Form */}
                <div className="p-8 md:w-2/3 space-y-10">
                    <div className="flex justify-between items-center pb-4 border-b border-notion-border">
                        <h2 className="text-2xl font-serif font-bold text-notion-text">Systemize Goal</h2>
                        <button onClick={onCancel} className="text-notion-dim hover:text-black"><Trash2 className="w-5 h-5"/></button>
                    </div>

                    {/* Section 1: Identity */}
                    <div className="space-y-4">
                        <h4 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2"><Target className="w-4 h-4"/> 1. Definition</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <label className="text-xs text-notion-dim block mb-1">Refined Objective</label>
                                <input className="w-full bg-white border border-notion-border p-2.5 rounded text-sm focus:border-black outline-none transition-colors" value={text} onChange={e => setText(e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs text-notion-dim block mb-1">Metric (KPI)</label>
                                <input className="w-full bg-white border border-notion-border p-2.5 rounded text-sm focus:border-black outline-none transition-colors" value={metric} onChange={e => setMetric(e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs text-notion-dim block mb-1">Why (Motivation)</label>
                                <input className="w-full bg-white border border-notion-border p-2.5 rounded text-sm focus:border-black outline-none transition-colors" value={motivation} onChange={e => setMotivation(e.target.value)} />
                            </div>
                        </div>
                    </div>

                    {/* Section 2: System (Habits) */}
                    <div className="space-y-4">
                         <h4 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2"><Zap className="w-4 h-4"/> 2. Daily System</h4>
                         
                         <div className="space-y-3">
                             {habits.map((h, i) => (
                                 <div key={i} className="flex items-start justify-between bg-white p-3 rounded border border-notion-border shadow-sm">
                                     <div className="flex items-start gap-3">
                                         <Check className="w-4 h-4 text-gray-400 mt-0.5" />
                                         <div>
                                            <div className="text-sm font-bold text-notion-text">{h.text}</div>
                                            <div className="text-xs text-notion-dim flex flex-wrap gap-x-3 gap-y-1 mt-1">
                                                <span className="uppercase tracking-wider font-bold text-[10px]">{h.frequency}</span>
                                                {h.defaultTime && <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {h.defaultTime}</span>}
                                                {h.reward && <span className="flex items-center gap-1"><Sparkles className="w-3 h-3"/> {h.reward}</span>}
                                            </div>
                                         </div>
                                     </div>
                                     <button onClick={() => setHabits(habits.filter((_, idx) => idx !== i))}><Trash2 className="w-3 h-3 text-notion-dim hover:text-black"/></button>
                                 </div>
                             ))}
                             
                             <div className="bg-notion-sidebar p-4 rounded border border-notion-border space-y-3">
                                 {/* Row 1: Habit Text */}
                                 <div>
                                     <input 
                                        className="w-full bg-white border border-notion-border p-2.5 rounded text-sm outline-none focus:border-black placeholder:text-notion-dim" 
                                        placeholder="Habit (e.g. Read 10 pages)" 
                                        value={newHabit} 
                                        onChange={e => setNewHabit(e.target.value)} 
                                        autoFocus 
                                     />
                                 </div>
                                 
                                 {/* Row 2: Details */}
                                 <div className="flex flex-wrap gap-2">
                                     <div className="w-32 flex-shrink-0">
                                        <select 
                                            className="w-full bg-white border border-notion-border p-2 rounded text-xs outline-none focus:border-black" 
                                            value={newHabitFreq} 
                                            onChange={(e: any) => setNewHabitFreq(e.target.value)}
                                        >
                                            <option value="DAILY">Daily</option>
                                            <option value="WEEKLY">Weekly</option>
                                        </select>
                                     </div>
                                     <div className="w-32 flex-shrink-0">
                                        <input 
                                            type="time" 
                                            className="w-full bg-white border border-notion-border p-2 rounded text-xs outline-none focus:border-black" 
                                            value={newHabitTime} 
                                            onChange={e => setNewHabitTime(e.target.value)} 
                                        />
                                     </div>
                                     <div className="flex-1 min-w-[120px]">
                                        <input 
                                            className="w-full bg-white border border-notion-border p-2 rounded text-xs outline-none focus:border-black placeholder:text-notion-dim" 
                                            placeholder="Reward (e.g. Coffee)" 
                                            value={newHabitReward} 
                                            onChange={e => setNewHabitReward(e.target.value)} 
                                        />
                                     </div>
                                     <button 
                                        onClick={addHabit} 
                                        disabled={!newHabit} 
                                        className="bg-black text-white px-4 rounded text-xs font-bold uppercase tracking-widest disabled:opacity-50 hover:opacity-80"
                                     >
                                        Add
                                     </button>
                                 </div>
                             </div>
                         </div>
                    </div>

                    {/* Section 3: Roadmap (Milestones) */}
                    <div className="space-y-4">
                         <h4 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2"><Map className="w-4 h-4"/> 3. Milestones</h4>
                         
                         <div className="space-y-2">
                             {milestones.map((m, i) => (
                                 <div key={i} className="flex items-center gap-3 p-2 border-b border-notion-border last:border-0">
                                     <div className="w-1.5 h-1.5 bg-black rounded-full"></div>
                                     <span className="flex-1 text-sm">{m.text}</span>
                                     <span className="text-xs font-mono bg-notion-sidebar px-2 py-1 rounded text-notion-dim">{m.targetMonth || 'Any'}</span>
                                     <button onClick={() => setMilestones(milestones.filter(x => x.id !== m.id))}><Trash2 className="w-3 h-3 text-notion-dim hover:text-black"/></button>
                                 </div>
                             ))}
                             <div className="flex gap-2 pt-2">
                                 <input className="flex-1 bg-white border-b border-notion-border p-1 text-sm outline-none placeholder:text-notion-dim" placeholder="Next milestone..." value={newMilestone} onChange={e => setNewMilestone(e.target.value)} onKeyDown={e => e.key === 'Enter' && addMilestone()} />
                                 <select className="bg-white border-b border-notion-border p-1 text-sm outline-none w-24" value={newMilestoneMonth} onChange={e => setNewMilestoneMonth(e.target.value)}>
                                     {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                                 </select>
                                 <button onClick={addMilestone} disabled={!newMilestone} className="text-xs font-bold text-notion-dim hover:text-black">Add</button>
                             </div>
                         </div>
                    </div>

                    <div className="pt-4 border-t border-notion-border flex justify-end">
                        <button onClick={handleSave} className="bg-black text-white px-8 py-3 rounded text-sm font-bold hover:opacity-90 shadow-lg">
                            Initialize System
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- MANIFESTO ITEM COMPONENT ---
const ManifestoLevel: React.FC<{
    level: number;
    title: string;
    quote?: string;
    children: React.ReactNode;
}> = ({ level, title, quote, children }) => (
    <div className="mb-12 border-l-2 border-notion-border pl-6 relative">
        <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-notion-sidebar border border-notion-border text-[10px] flex items-center justify-center font-bold text-notion-dim">
            {level}
        </div>
        <h3 className="font-bold text-sm uppercase tracking-widest text-notion-text mb-2">{title}</h3>
        {quote && <p className="font-serif italic text-notion-dim text-sm mb-6 max-w-2xl">"{quote}"</p>}
        <div className="text-notion-text">{children}</div>
    </div>
);

// --- MAIN COMPONENT ---
interface StrategyTabProps {
  data: AppData;
  onUpdateGoal: (goal: Goal) => void;
  onDeleteGoal: (id: string) => void;
  onAddHabit: (habit: Habit) => void;
  onDeleteHabit: (id: string) => void;
  onCompleteReview: (wb: WorkbookData, active: Goal[], backlog: Goal[]) => void;
  onDeleteWorkbook: (year: string, deleteGoals: boolean, deleteHabits: boolean) => void;
  // Legacy unused
  onAddStrategicItem: any; onDeleteStrategicItem: any; onAddGoal: any; onUpdateGlobalRules: any; onUpdateFullData: any;
}

const StrategyTab: React.FC<StrategyTabProps> = ({ 
  data, 
  onUpdateGoal, onDeleteGoal, onAddHabit, onDeleteHabit, onCompleteReview, onDeleteWorkbook 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>("2026");
  
  // Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteOptionGoals, setDeleteOptionGoals] = useState(true);
  const [deleteOptionHabits, setDeleteOptionHabits] = useState(true);

  const availableYears = Object.keys(data.workbookReviews).sort().reverse();

  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears]);

  const handleDeleteSubmit = () => {
    if (deleteConfirmation.toLowerCase() === "delete") {
        onDeleteWorkbook(selectedYear, deleteOptionGoals, deleteOptionHabits);
        setShowDeleteModal(false);
        setDeleteConfirmation("");
        // Reset defaults
        setDeleteOptionGoals(true);
        setDeleteOptionHabits(true);
        
        // Fallback to latest year or empty
        const remaining = availableYears.filter(y => y !== selectedYear);
        if (remaining.length > 0) setSelectedYear(remaining[0]);
    }
  };

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
    <div className="animate-fade-in pb-24 space-y-16 relative">
      
      {/* --- DELETE CONFIRMATION MODAL --- */}
      {showDeleteModal && (
          <div className="fixed inset-0 z-[200] bg-black/20 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md animate-in fade-in zoom-in-95 border border-notion-border">
                  <div className="flex items-start gap-4 mb-6">
                      <div className="p-3 bg-red-100 rounded-full text-red-600">
                          <AlertTriangle className="w-6 h-6" />
                      </div>
                      <div>
                          <h3 className="font-bold text-lg text-gray-900">Delete Review?</h3>
                          <p className="text-sm text-gray-500 mt-1">
                              This will permanently remove the <strong>{selectedYear} Annual Review</strong>.
                          </p>
                      </div>
                  </div>
                  
                  <div className="space-y-3 mb-6 bg-gray-50 p-4 rounded border border-gray-100">
                      <div className="text-xs font-bold uppercase tracking-wider text-notion-dim mb-2">What to delete?</div>
                      <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                          <input 
                            type="checkbox" 
                            checked={deleteOptionGoals} 
                            onChange={e => setDeleteOptionGoals(e.target.checked)}
                            className="accent-black w-4 h-4 rounded border-gray-300"
                          />
                          <span className="text-sm text-gray-700">Delete associated Goals & Milestones</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                          <input 
                            type="checkbox" 
                            checked={deleteOptionHabits} 
                            onChange={e => setDeleteOptionHabits(e.target.checked)}
                            className="accent-black w-4 h-4 rounded border-gray-300"
                          />
                          <span className="text-sm text-gray-700">Delete associated Habits</span>
                      </label>
                  </div>

                  <div className="mb-6">
                      <label className="block text-xs font-bold uppercase tracking-wider text-notion-dim mb-2">
                          Type "Delete" to confirm
                      </label>
                      <input 
                          type="text" 
                          className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:border-red-500 transition-colors"
                          placeholder="Delete"
                          value={deleteConfirmation}
                          onChange={(e) => setDeleteConfirmation(e.target.value)}
                          autoFocus
                      />
                  </div>
                  
                  <div className="flex justify-end gap-3">
                      <button 
                          onClick={() => setShowDeleteModal(false)}
                          className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-black hover:bg-gray-100 rounded transition-colors"
                      >
                          Cancel
                      </button>
                      <button 
                          onClick={handleDeleteSubmit}
                          disabled={deleteConfirmation.toLowerCase() !== "delete"}
                          className="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                          Delete Review
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Header Area */}
      <div className="flex justify-between items-center border-b border-notion-border pb-4 no-print">
         <div>
             <h2 className="text-3xl font-serif text-notion-text">Executive Strategy</h2>
             <p className="text-notion-dim font-serif italic">Your contract with yourself for {selectedYear}.</p>
         </div>
         <div className="flex items-center gap-2">
             {/* Delete Button (Only if review exists) */}
             {currentWorkbook && (
                 <button 
                    onClick={() => { setDeleteConfirmation(""); setShowDeleteModal(true); }}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                    title="Delete Review"
                 >
                     <Trash2 className="w-4 h-4" />
                 </button>
             )}
             
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

      {/* ================= ZONE A: ACTIVE STRATEGY (Grid Layout) ================= */}
      <section>
          {activeGoals.length === 0 && (
              <div className="text-center py-20 text-notion-dim">
                  No active goals. Start a review.
              </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              {/* Left Column: Active Goals */}
              <div className="lg:col-span-2 space-y-8">
                  {activeGoals.map(goal => {
                      const habits = data.habits.filter(h => h.goalId === goal.id);
                      
                      // --- UNCONFIGURED: Minimalist Card ---
                      if (goal.needsConfig) {
                          return (
                              <div key={goal.id} className="bg-white border border-notion-border rounded-xl p-6 shadow-sm flex flex-col justify-between group min-h-[180px] relative overflow-hidden transition-shadow hover:shadow-md">
                                  <div className="absolute top-0 right-0 bg-notion-sidebar px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-notion-dim">
                                      Needs System
                                  </div>
                                  <div>
                                      <h3 className="text-xl font-serif font-bold mb-2 break-words leading-tight pr-4">{goal.text}</h3>
                                      <p className="text-sm text-notion-dim">Metric: {goal.metric}</p>
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

                      // --- CONFIGURED: Text-Based Summary Card WITH GRAPHS ---
                      return (
                          <div key={goal.id} className="bg-white border border-notion-border rounded-xl shadow-sm overflow-hidden group">
                              {/* Header */}
                              <div className="bg-notion-sidebar/50 p-4 border-b border-notion-border flex justify-between items-center">
                                  <div className="min-w-0 flex-1 mr-4">
                                      <div className="text-[10px] font-bold uppercase tracking-widest text-notion-dim mb-1">Strategic Objective</div>
                                      <h3 className="text-xl font-serif font-medium break-words leading-tight">{goal.text}</h3>
                                  </div>
                                  <div className="flex items-center gap-3 flex-shrink-0">
                                      <div className="text-xs font-mono bg-white px-2 py-1 rounded border border-notion-border text-notion-dim whitespace-nowrap">
                                          {goal.metric}
                                      </div>
                                      <button onClick={() => setEditingGoal(goal)} className="p-1.5 text-notion-dim hover:text-black bg-white rounded border border-notion-border opacity-0 group-hover:opacity-100 transition-opacity">
                                          <PenTool className="w-3 h-3" />
                                      </button>
                                  </div>
                              </div>

                              <div className="p-6 grid md:grid-cols-2 gap-8">
                                  {/* Left: Execution Roadmap */}
                                  <div>
                                      <h4 className="text-xs font-bold uppercase tracking-widest text-notion-dim mb-4 flex items-center gap-2">
                                          <Map className="w-3 h-3" /> Roadmap
                                      </h4>
                                      <ul className="space-y-3">
                                          {goal.milestones.map(m => (
                                              <li key={m.id} className="flex items-start gap-2 text-sm">
                                                  <div className={`mt-1.5 w-1.5 h-1.5 rounded-full ${m.completed ? 'bg-black' : 'bg-notion-border'}`}></div>
                                                  <div className="flex-1">
                                                      <span className={m.completed ? 'line-through text-notion-dim' : 'text-notion-text'}>{m.text}</span>
                                                      {m.targetMonth && <span className="ml-2 text-xs font-mono text-notion-dim bg-notion-sidebar px-1 rounded">Target: {m.targetMonth}</span>}
                                                  </div>
                                              </li>
                                          ))}
                                          {goal.milestones.length === 0 && <li className="text-xs text-notion-dim italic">No milestones defined.</li>}
                                      </ul>
                                  </div>

                                  {/* Right: Daily Protocol (With Graphs) */}
                                  <div>
                                      <h4 className="text-xs font-bold uppercase tracking-widest text-notion-dim mb-4 flex items-center gap-2">
                                          <Zap className="w-3 h-3" /> System
                                      </h4>
                                      <div className="space-y-4">
                                          {habits.map(h => (
                                              <div key={h.id} className="text-sm flex flex-col gap-1">
                                                  <div className="flex justify-between items-baseline">
                                                      <span className="font-medium text-notion-text">{h.text}</span>
                                                      <span className="text-[9px] uppercase tracking-wider text-notion-dim">{h.frequency || 'DAILY'}</span>
                                                  </div>
                                                  {/* Graph Integrated directly here */}
                                                  <div className="h-4">
                                                     <ContributionGraph data={h.contributions} frequency={h.frequency} year={selectedYear} />
                                                  </div>
                                              </div>
                                          ))}
                                          {habits.length === 0 && <span className="text-xs text-notion-dim italic">No habits configured.</span>}
                                      </div>
                                  </div>
                              </div>
                          </div>
                      );
                  })}
              </div>

              {/* Right Column: Avoid List (Backlog) */}
              <div className="lg:col-span-1 self-start">
                  <div className="bg-notion-sidebar rounded-xl border border-notion-border p-6">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-notion-dim mb-6 flex items-center gap-2">
                          <Ban className="w-4 h-4"/> Avoid List
                      </h3>
                      <p className="text-xs text-notion-dim mb-6 italic border-b border-notion-border pb-4">
                          "Really successful people say no to almost everything."
                      </p>
                      <ul className="space-y-3">
                          {backlogGoals.map(g => (
                              <li key={g.id} className="bg-white border border-notion-border p-3 rounded text-sm text-notion-text shadow-sm flex items-start gap-3">
                                  <div className="w-1.5 h-1.5 bg-notion-tag rounded-full mt-1.5 flex-shrink-0"></div>
                                  <span className="leading-snug break-words">{g.text}</span>
                              </li>
                          ))}
                          {backlogGoals.length === 0 && <li className="text-xs text-notion-dim italic">Empty list.</li>}
                      </ul>
                  </div>
              </div>
          </div>
      </section>

      {/* ================= ZONE B: THE MANIFESTO (Full 11 Levels) ================= */}
      <section className="border-t-2 border-notion-border pt-16">
           <div className="flex gap-4 mb-8">
               {availableYears.map(year => (
                   <button 
                      key={year}
                      onClick={() => setSelectedYear(year)}
                      className={`px-3 py-1 rounded text-sm transition-colors ${selectedYear === year ? 'bg-black text-white' : 'bg-notion-sidebar text-notion-dim hover:bg-gray-200'}`}
                   >
                       {year}
                   </button>
               ))}
           </div>

           {currentWorkbook ? (
               <div className="bg-white border border-notion-border rounded-xl p-8 md:p-16 shadow-sm">
                    
                    <div className="text-center space-y-4 mb-16">
                        <h2 className="text-4xl font-serif font-medium">The Contract</h2>
                        <div className="w-24 h-px bg-black mx-auto"></div>
                        <p className="text-sm font-serif italic text-notion-dim">"What lies behind us and what lies before us are tiny matters compared to what lies within us."</p>
                    </div>

                    <div className="max-w-3xl mx-auto space-y-2">
                        
                        <ManifestoLevel level={1} title="The Key" quote="Every breakthrough starts from knowing what you want to achieve.">
                             <p className="font-serif text-xl leading-relaxed whitespace-pre-line">{currentWorkbook.keySuccess}</p>
                        </ManifestoLevel>

                        <ManifestoLevel level={2} title="An Honest Audit" quote="Success is simple: Do more of what works and less of what doesn't.">
                             <div className="space-y-6">
                                 <div>
                                     <h4 className="font-bold text-xs mb-1">Time Audit</h4>
                                     <p className="text-sm text-gray-600">{currentWorkbook.timeAudit}</p>
                                 </div>
                                 <div className="grid grid-cols-2 gap-4">
                                     <div>
                                         <h4 className="font-bold text-xs mb-1 uppercase tracking-wide">Eliminated</h4>
                                         <ul className="list-disc pl-4 text-sm text-gray-600">{currentWorkbook.notWorking?.map((x,i)=><li key={i}>{x}</li>)}</ul>
                                     </div>
                                     <div>
                                         <h4 className="font-bold text-xs mb-1 uppercase tracking-wide">Doubled Down</h4>
                                         <ul className="list-disc pl-4 text-sm text-gray-600">{currentWorkbook.working?.map((x,i)=><li key={i}>{x}</li>)}</ul>
                                     </div>
                                 </div>
                             </div>
                        </ManifestoLevel>

                        <ManifestoLevel level={3} title="Map Your Horizon" quote="Even exceptional leaders face the challenge of too many opportunities.">
                             <p className="text-sm text-notion-dim mb-2">Top 10 Potential Priorities:</p>
                             <ul className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                                 {currentWorkbook.topTen?.map((x,i) => <li key={i}>• {x}</li>)}
                             </ul>
                        </ManifestoLevel>

                        <ManifestoLevel level={4} title="Do Less, Better" quote="Really successful people say no to almost everything.">
                             <p className="text-sm text-notion-dim mb-2">The Critical Three (Focus):</p>
                             <div className="space-y-4">
                                 {activeGoals.map((g, i) => (
                                     <div key={i} className="bg-notion-sidebar p-4 border-l-2 border-black">
                                         <div className="font-serif font-bold text-lg">{g.text}</div>
                                         <div className="text-xs text-notion-dim mt-1">Metric: {g.metric}</div>
                                     </div>
                                 ))}
                             </div>
                        </ManifestoLevel>

                        <ManifestoLevel level={5} title="Momentum" quote="Think of what you can do with what there is.">
                             <p className="text-sm text-notion-dim mb-4 italic">Small steps overcome the inertia of procrastination.</p>
                             <ul className="space-y-2">
                                 {currentWorkbook.momentum.map((m, i) => (
                                     <li key={i} className="text-sm">
                                         <span className="text-notion-dim">Putting off:</span> <span className="font-medium text-notion-text">{m.item}</span> <span className="text-notion-dim">→</span> <span className="text-notion-dim">Step:</span> <span className="font-medium text-notion-text">{m.step}</span>
                                     </li>
                                 ))}
                             </ul>
                        </ManifestoLevel>

                        <ManifestoLevel level={6} title="Play to Strengths" quote="Do what you do best and outsource the rest.">
                             <p className="text-sm text-notion-dim mb-4 italic">Identify weaknesses and build workarounds so they don't block you.</p>
                             <ul className="space-y-2">
                                 {currentWorkbook.weaknesses.map((w, i) => (
                                     <li key={i} className="text-sm">
                                         <span className="text-notion-dim">Weakness:</span> <span className="font-medium text-notion-text">{w.weakness}</span> <span className="text-notion-dim">→</span> <span className="text-notion-dim">Fix:</span> <span className="font-medium text-notion-text">{w.workaround}</span>
                                     </li>
                                 ))}
                             </ul>
                        </ManifestoLevel>

                        <ManifestoLevel level={7} title="Easy Mode" quote="Invent and simplify.">
                             <p className="text-sm text-notion-dim mb-4 italic">Where are you making things harder than they need to be?</p>
                             <ul className="space-y-2">
                                 {currentWorkbook.easyMode.map((em, i) => (
                                     <li key={i} className="text-sm">
                                         <span className="text-notion-dim">Hard:</span> <span className="font-medium text-notion-text">{em.hard}</span> <span className="text-notion-dim">→</span> <span className="text-notion-dim">Easy:</span> <span className="font-medium text-notion-text">{em.easy}</span>
                                     </li>
                                 ))}
                             </ul>
                        </ManifestoLevel>

                        <ManifestoLevel level={8} title="Inner Circle" quote="You are the average of the five people you spend the most time with.">
                             <div className="flex flex-wrap gap-2">
                                 {currentWorkbook.innerCircle.map((m, i) => (
                                     <span key={i} className="bg-notion-sidebar px-3 py-1 rounded-full text-sm font-medium border border-notion-border">{m.name} ({m.totalScore > 0 ? '+' : ''}{m.totalScore})</span>
                                 ))}
                             </div>
                        </ManifestoLevel>

                        <ManifestoLevel level={10} title="The Rules" quote="Turning acquired knowledge into default behavior.">
                             <p className="text-sm text-notion-dim mb-4 italic">Algorithms for your life to reduce decision fatigue.</p>
                             <div className="grid md:grid-cols-3 gap-4">
                                 <div className="bg-notion-sidebar p-4 rounded text-sm border border-notion-border">
                                     <div className="font-bold text-xs uppercase mb-2">Prosper</div>
                                     <ul className="list-disc pl-4">{currentWorkbook.rulesProsper.map((r,i)=><li key={i}>{r}</li>)}</ul>
                                 </div>
                                 <div className="bg-notion-sidebar p-4 rounded text-sm border border-notion-border">
                                     <div className="font-bold text-xs uppercase mb-2">Protect</div>
                                     <ul className="list-disc pl-4">{currentWorkbook.rulesProtect.map((r,i)=><li key={i}>{r}</li>)}</ul>
                                 </div>
                                 <div className="bg-notion-sidebar p-4 rounded text-sm border border-notion-border">
                                     <div className="font-bold text-xs uppercase mb-2">Limit</div>
                                     <ul className="list-disc pl-4">{currentWorkbook.rulesLimit.map((r,i)=><li key={i}>{r}</li>)}</ul>
                                 </div>
                             </div>
                        </ManifestoLevel>

                        <ManifestoLevel level={11} title="Commitment" quote="Better decisions compound into extraordinary results.">
                             <div className="space-y-4">
                                 <div>
                                     <span className="text-notion-dim text-xs uppercase font-bold">Key Insights</span>
                                     <ul className="list-disc pl-4 text-sm mt-1">{currentWorkbook.insights.map((x,i)=><li key={i}>{x}</li>)}</ul>
                                 </div>
                                 <div>
                                     <span className="text-notion-dim text-xs uppercase font-bold">One Immediate Change:</span>
                                     <p className="text-sm font-medium">{currentWorkbook.oneChange}</p>
                                 </div>
                                 <div>
                                     <span className="text-notion-dim text-xs uppercase font-bold">Revisit Date:</span>
                                     <p className="text-sm font-medium">{currentWorkbook.revisitDate}</p>
                                 </div>
                             </div>
                        </ManifestoLevel>

                        <div className="mt-16 pt-8 border-t border-black text-center">
                            <div className="font-serif text-3xl mb-2">{currentWorkbook.signatureName}</div>
                            <p className="text-notion-dim text-xs uppercase tracking-widest">
                                Signed on {new Date(currentWorkbook.signedAt!).toLocaleDateString()}
                            </p>
                        </div>
                    </div>
               </div>
           ) : (
               <div className="text-center py-32 text-notion-dim text-xl font-serif italic">
                   No manifesto recorded for {selectedYear}.
               </div>
           )}
      </section>

    </div>
  );
};

export default StrategyTab;