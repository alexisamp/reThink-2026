import React, { useState } from 'react';
import { Goal, GoalStatus, WorkbookData } from '../types';
import { ArrowRight, Check, Trash2 } from '../components/Icon';

interface AnnualReviewProps {
  onComplete: (workbook: WorkbookData, activeGoals: Goal[], backlogGoals: Goal[]) => void;
  onCancel: () => void;
  initialYear?: string;
}

const AnnualReview: React.FC<AnnualReviewProps> = ({ onComplete, onCancel, initialYear = "2026" }) => {
  const [step, setStep] = useState(1);
  const [year] = useState(initialYear);

  // --- State for each Level ---
  
  // Step 1: Audit
  const [keySuccess, setKeySuccess] = useState('');
  const [stupidestDecision, setStupidestDecision] = useState('');
  const [smartestDecision, setSmartestDecision] = useState('');
  const [timeAudit, setTimeAudit] = useState('');

  // Step 2 & 3: The Lists
  const [longList, setLongList] = useState<Goal[]>([]);
  const [tempGoal, setTempGoal] = useState('');

  // Step 4: Momentum
  const [momentum, setMomentum] = useState([
      {id: '1', item: '', step: ''}, 
      {id: '2', item: '', step: ''}, 
      {id: '3', item: '', step: ''}
  ]);

  // Step 5: Strategy (Identity)
  const [strengths, setStrengths] = useState<{ id: string; strength: string; application: string }[]>([]);
  const [weaknesses, setWeaknesses] = useState<{ id: string; weakness: string; workaround: string }[]>([]);
  
  // Temp inputs for strategy
  const [sTitle, setSTitle] = useState(''); const [sApp, setSApp] = useState('');
  const [wTitle, setWTitle] = useState(''); const [wWork, setWWork] = useState('');

  // Step 6: Easy Mode
  const [easyModeReflection, setEasyModeReflection] = useState('');

  // Step 7: Inversion
  const [failurePreMortem, setFailurePreMortem] = useState('');

  // Step 8: Rules
  const [prescriptions, setPrescriptions] = useState<string[]>([]);
  const [antiGoals, setAntiGoals] = useState<string[]>([]);
  const [tempRule, setTempRule] = useState('');
  const [tempAnti, setTempAnti] = useState('');

  // Final: Contract
  const [signatureName, setSignatureName] = useState('');

  // --- Helpers ---

  const addToLongList = () => {
      if(!tempGoal.trim()) return;
      const newGoal: Goal = {
          id: crypto.randomUUID(),
          text: tempGoal,
          metric: 'To be defined',
          motivation: '',
          leverage: [],
          obstacles: [],
          status: GoalStatus.BACKLOG, 
          milestones: [],
          createdAt: Date.now(),
          needsConfig: true
      };
      setLongList([...longList, newGoal]);
      setTempGoal('');
  };

  const toggleCriticalThree = (id: string) => {
      const currentActive = longList.filter(g => g.status === GoalStatus.ACTIVE).length;
      const targetGoal = longList.find(g => g.id === id);
      
      if (!targetGoal) return;

      if (targetGoal.status === GoalStatus.ACTIVE) {
          // Deactivate
          setLongList(longList.map(g => g.id === id ? { ...g, status: GoalStatus.BACKLOG } : g));
      } else {
          // Activate (Limit 3)
          if (currentActive >= 3) {
              alert("You can only choose 3 Critical Goals. Deselect one first.");
              return;
          }
          setLongList(longList.map(g => g.id === id ? { ...g, status: GoalStatus.ACTIVE } : g));
      }
  };

  const updateMomentum = (idx: number, field: 'item' | 'step', val: string) => {
      const newList = [...momentum];
      newList[idx] = { ...newList[idx], [field]: val };
      setMomentum(newList);
  };

  const finish = () => {
      if(!signatureName.trim()) return;
      
      const finalWorkbook: WorkbookData = {
          year,
          keySuccess,
          stupidestDecision,
          smartestDecision,
          timeAudit,
          momentum,
          strengths,
          weaknesses,
          easyModeReflection,
          failurePreMortem,
          prescriptions,
          antiGoals,
          signedAt: Date.now(),
          signatureName
      };

      const activeGoals = longList.filter(g => g.status === GoalStatus.ACTIVE);
      const backlogGoals = longList.filter(g => g.status === GoalStatus.BACKLOG);

      onComplete(finalWorkbook, activeGoals, backlogGoals);
  };

  // --- Render ---

  return (
    <div className="fixed inset-0 bg-white z-[100] overflow-y-auto">
        <div className="max-w-3xl mx-auto py-16 px-6">
            
            {/* PROGRESS HEADER */}
            <div className="mb-12 flex justify-between items-end border-b border-black pb-4">
                <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-notion-dim mb-2">reThink Workbook</div>
                    <h1 className="text-3xl font-serif font-medium">Annual Review {year}</h1>
                </div>
                <div className="text-right">
                    <span className="font-serif text-xl italic">{step} / 9</span>
                </div>
            </div>

            {/* STEP 1: THE REVIEW */}
            {step === 1 && (
                <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4">
                    <p className="font-serif text-lg italic text-notion-dim">Clarity emerges from reflection.</p>
                    
                    <div className="space-y-4">
                        <label className="block font-serif text-xl">What was the key to your success this year? If you had to narrow it down to one thing that made the biggest difference, what would it be?</label>
                        <textarea className="w-full p-4 bg-gray-50 border-l-2 border-black focus:outline-none min-h-[100px]" value={keySuccess} onChange={e => setKeySuccess(e.target.value)} />
                    </div>

                    <div className="space-y-4">
                        <label className="block font-serif text-xl">What was the stupidest thing you did this year?</label>
                        <textarea className="w-full p-4 bg-gray-50 border-l-2 border-black focus:outline-none min-h-[100px]" value={stupidestDecision} onChange={e => setStupidestDecision(e.target.value)} />
                    </div>

                    <div className="space-y-4">
                        <label className="block font-serif text-xl">What was the smartest thing you did this year?</label>
                        <textarea className="w-full p-4 bg-gray-50 border-l-2 border-black focus:outline-none min-h-[100px]" value={smartestDecision} onChange={e => setSmartestDecision(e.target.value)} />
                    </div>

                    <div className="space-y-4">
                        <label className="block font-serif text-xl">Where did you actually spend your time versus where you think you spent it? (Look at your calendar).</label>
                        <textarea className="w-full p-4 bg-gray-50 border-l-2 border-black focus:outline-none min-h-[100px]" value={timeAudit} onChange={e => setTimeAudit(e.target.value)} />
                    </div>
                </div>
            )}

            {/* STEP 2: THE LONG LIST */}
            {step === 2 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                    <div>
                        <h2 className="text-4xl font-serif mb-4">The Long List</h2>
                        <p className="font-serif text-lg leading-relaxed text-notion-dim">Write down everything you want to accomplish in the next 12 months. Don't filter. Don't edit. Just write. Aim for at least 25 items.</p>
                    </div>

                    <div className="flex gap-2">
                        <input 
                            className="flex-1 p-4 border border-black outline-none font-medium"
                            placeholder="I want to..."
                            value={tempGoal}
                            onChange={e => setTempGoal(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && addToLongList()}
                            autoFocus
                        />
                        <button onClick={addToLongList} className="px-6 bg-black text-white font-bold hover:opacity-80">Add</button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {longList.map((g, i) => (
                            <div key={g.id} className="p-4 bg-gray-50 border border-gray-200 flex justify-between items-center group">
                                <span className="text-sm font-medium">{(i+1).toString().padStart(2, '0')}. {g.text}</span>
                                <button onClick={() => setLongList(longList.filter(x => x.id !== g.id))} className="opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" /></button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* STEP 3: THE CRITICAL THREE */}
            {step === 3 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                    <div>
                        <h2 className="text-4xl font-serif mb-4">The Critical Three</h2>
                        <p className="font-serif text-lg leading-relaxed text-notion-dim">
                            Review your long list. Select the top 3 items. These are your Critical Three. 
                            The items you don't select become your 'Avoid-at-all-costs' list. 
                            These are not your backup plan. They are the enemies of your Critical Three.
                        </p>
                    </div>

                    <div className="space-y-2">
                         {longList.map(g => (
                            <div 
                                key={g.id} 
                                onClick={() => toggleCriticalThree(g.id)}
                                className={`p-4 border cursor-pointer transition-all flex items-center gap-4 ${g.status === GoalStatus.ACTIVE ? 'bg-black text-white border-black' : 'bg-white border-gray-200 hover:border-black'}`}
                            >
                                <div className={`w-6 h-6 border flex items-center justify-center ${g.status === GoalStatus.ACTIVE ? 'border-white' : 'border-black'}`}>
                                    {g.status === GoalStatus.ACTIVE && <Check className="w-4 h-4" />}
                                </div>
                                <span className="text-lg font-medium">{g.text}</span>
                            </div>
                         ))}
                    </div>
                    <div className="text-right text-xs font-bold uppercase tracking-widest mt-4">
                        Selected: {longList.filter(g => g.status === GoalStatus.ACTIVE).length} / 3
                    </div>
                </div>
            )}

            {/* STEP 4: MOMENTUM */}
            {step === 4 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                    <div>
                        <h2 className="text-4xl font-serif mb-4">Small Steps for Momentum</h2>
                        <p className="font-serif text-lg leading-relaxed text-notion-dim">
                            Identify 3 things you are procrastinating on. For each, write down the smallest possible step you can take to start.
                        </p>
                    </div>

                    <div className="space-y-6">
                        {momentum.map((p, idx) => (
                            <div key={idx} className="bg-gray-50 p-6 border border-gray-200">
                                <div className="mb-4">
                                    <label className="block text-xs font-bold uppercase mb-1">Thing I'm Avoiding</label>
                                    <input className="w-full bg-transparent border-b border-gray-300 focus:border-black outline-none py-2" 
                                        value={p.item} onChange={e => updateMomentum(idx, 'item', e.target.value)} placeholder="e.g. Taxes" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase mb-1">Smallest Step</label>
                                    <input className="w-full bg-transparent border-b border-gray-300 focus:border-black outline-none py-2" 
                                        value={p.step} onChange={e => updateMomentum(idx, 'step', e.target.value)} placeholder="e.g. Open folder" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* STEP 5: STRATEGY */}
            {step === 5 && (
                <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4">
                     <div>
                        <h2 className="text-4xl font-serif mb-4">Play to Your Strengths</h2>
                        <p className="font-serif text-lg leading-relaxed text-notion-dim mb-6">
                            List your top 3 strengths. How can you apply these to achieve your Critical Three?
                        </p>
                        
                        <div className="flex gap-2 mb-4">
                             <input className="flex-1 p-3 border border-gray-300 outline-none text-sm" placeholder="Strength" value={sTitle} onChange={e => setSTitle(e.target.value)} />
                             <input className="flex-1 p-3 border border-gray-300 outline-none text-sm" placeholder="Application" value={sApp} onChange={e => setSApp(e.target.value)} />
                             <button onClick={() => { if(sTitle && sApp) { setStrengths([...strengths, {id: crypto.randomUUID(), strength: sTitle, application: sApp}]); setSTitle(''); setSApp(''); }}} className="px-4 bg-black text-white text-xs font-bold">Add</button>
                        </div>
                        <ul className="space-y-2">
                            {strengths.map(s => (
                                <li key={s.id} className="bg-gray-50 p-3 border border-gray-200 flex justify-between">
                                    <span className="text-sm"><strong>{s.strength}:</strong> {s.application}</span>
                                    <button onClick={() => setStrengths(strengths.filter(x => x.id !== s.id))}><Trash2 className="w-3 h-3" /></button>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="pt-8 border-t border-gray-200">
                        <p className="font-serif text-lg leading-relaxed text-notion-dim mb-6">
                           List your top 3 weaknesses. Don't try to fix them. Create a workaround.
                        </p>
                         <div className="flex gap-2 mb-4">
                             <input className="flex-1 p-3 border border-gray-300 outline-none text-sm" placeholder="Weakness" value={wTitle} onChange={e => setWTitle(e.target.value)} />
                             <input className="flex-1 p-3 border border-gray-300 outline-none text-sm" placeholder="Workaround" value={wWork} onChange={e => setWWork(e.target.value)} />
                             <button onClick={() => { if(wTitle && wWork) { setWeaknesses([...weaknesses, {id: crypto.randomUUID(), weakness: wTitle, workaround: wWork}]); setWTitle(''); setWWork(''); }}} className="px-4 bg-black text-white text-xs font-bold">Add</button>
                        </div>
                         <ul className="space-y-2">
                            {weaknesses.map(s => (
                                <li key={s.id} className="bg-gray-50 p-3 border border-gray-200 flex justify-between">
                                    <span className="text-sm"><strong>{s.weakness}:</strong> {s.workaround}</span>
                                    <button onClick={() => setWeaknesses(weaknesses.filter(x => x.id !== s.id))}><Trash2 className="w-3 h-3" /></button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {/* STEP 6: EASY MODE */}
            {step === 6 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                     <div>
                        <h2 className="text-4xl font-serif mb-4">Find Your Easy Mode</h2>
                        <p className="font-serif text-lg leading-relaxed text-notion-dim">
                            Where are you making things harder than they need to be? How can you switch to Easy Mode? (What is the path of least resistance to your goal?)
                        </p>
                    </div>
                    <textarea className="w-full p-6 bg-gray-50 border-l-2 border-black focus:outline-none min-h-[300px] text-lg font-serif" 
                        value={easyModeReflection} onChange={e => setEasyModeReflection(e.target.value)} placeholder="Journal here..." />
                </div>
            )}

            {/* STEP 7: INVERSION */}
            {step === 7 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                     <div>
                        <h2 className="text-4xl font-serif mb-4">Inversion</h2>
                        <p className="font-serif text-lg leading-relaxed text-notion-dim">
                             Look at your Critical Three. Instead of asking how to achieve them, ask: What would guarantee failure? List everything that would ensure you fail. Then, make a plan to avoid those things.
                        </p>
                    </div>
                    <textarea className="w-full p-6 bg-gray-50 border-l-2 border-black focus:outline-none min-h-[300px] text-lg font-serif" 
                        value={failurePreMortem} onChange={e => setFailurePreMortem(e.target.value)} placeholder="How to guarantee failure..." />
                </div>
            )}

            {/* STEP 8: RULES */}
            {step === 8 && (
                <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4">
                    <h2 className="text-4xl font-serif mb-4">Rules of Engagement</h2>
                    
                    <div>
                        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">Prescriptions: Things I always do.</h3>
                         <div className="flex gap-2 mb-4">
                            <input className="flex-1 p-3 border border-gray-300 outline-none text-sm" value={tempRule} onChange={e => setTempRule(e.target.value)} onKeyDown={e => e.key === 'Enter' && (setPrescriptions([...prescriptions, tempRule]), setTempRule(''))} />
                            <button onClick={() => { if(tempRule) { setPrescriptions([...prescriptions, tempRule]); setTempRule(''); }}} className="px-4 bg-black text-white text-xs font-bold">Add</button>
                        </div>
                        <ul className="list-disc pl-5 space-y-2">
                            {prescriptions.map((r, i) => <li key={i} className="text-lg font-serif">{r}</li>)}
                        </ul>
                    </div>

                     <div>
                        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">Anti-Goals: Things I never do.</h3>
                         <div className="flex gap-2 mb-4">
                            <input className="flex-1 p-3 border border-gray-300 outline-none text-sm" value={tempAnti} onChange={e => setTempAnti(e.target.value)} onKeyDown={e => e.key === 'Enter' && (setAntiGoals([...antiGoals, tempAnti]), setTempAnti(''))} />
                            <button onClick={() => { if(tempAnti) { setAntiGoals([...antiGoals, tempAnti]); setTempAnti(''); }}} className="px-4 bg-black text-white text-xs font-bold">Add</button>
                        </div>
                        <ul className="list-disc pl-5 space-y-2">
                            {antiGoals.map((r, i) => <li key={i} className="text-lg font-serif">{r}</li>)}
                        </ul>
                    </div>
                </div>
            )}

            {/* STEP 9: THE CONTRACT */}
            {step === 9 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 text-center py-20">
                     <h2 className="text-4xl font-serif mb-8">The Contract</h2>
                     <p className="font-serif text-2xl leading-relaxed text-notion-text italic max-w-2xl mx-auto">
                        "I commit to executing this plan. I accept that I cannot do everything, but I can do anything if I focus. I will review this document weekly."
                     </p>
                     
                     <div className="max-w-md mx-auto mt-12 space-y-4">
                         <input 
                            className="w-full text-center border-b-2 border-black py-2 text-3xl font-serif outline-none bg-transparent placeholder:text-gray-200"
                            placeholder="Sign Name Here"
                            value={signatureName}
                            onChange={e => setSignatureName(e.target.value)}
                         />
                         <div className="text-xs uppercase tracking-widest text-notion-dim">Dated: {new Date().toLocaleDateString()}</div>
                     </div>

                     <div className="pt-12">
                         <button onClick={finish} disabled={!signatureName} className="px-8 py-4 bg-black text-white text-lg font-bold rounded hover:scale-105 transition-transform disabled:opacity-50">
                             Sign Manifesto
                         </button>
                     </div>
                </div>
            )}

            {/* NAVIGATION FOOTER */}
            <div className="mt-16 flex justify-between border-t border-gray-200 pt-8">
                <button onClick={() => step > 1 ? setStep(step - 1) : onCancel()} className="text-notion-dim hover:text-black">
                    {step === 1 ? 'Cancel' : 'Back'}
                </button>
                {step < 9 && (
                    <button onClick={() => setStep(step + 1)} className="flex items-center gap-2 font-bold hover:underline">
                        Next <ArrowRight className="w-4 h-4" />
                    </button>
                )}
            </div>

        </div>
    </div>
  );
};

export default AnnualReview;