import React, { useState } from 'react';
import { Goal, GoalStatus, WorkbookData, InnerCircleMember } from '../types';
import { ArrowRight, Check, Trash2, Plus, Ban, Zap, AlertTriangle, Users, Shield, Target } from '../components/Icon';

interface AnnualReviewProps {
  onComplete: (workbook: WorkbookData, activeGoals: Goal[], backlogGoals: Goal[]) => void;
  onCancel: () => void;
  initialYear?: string;
}

const AnnualReview: React.FC<AnnualReviewProps> = ({ onComplete, onCancel, initialYear = "2026" }) => {
  const [step, setStep] = useState(1); // Mapped to Levels 1-11
  const [year] = useState(initialYear);

  // --- L1: Key to Success ---
  const [keySuccessLines, setKeySuccessLines] = useState<string[]>(['', '', '']);

  // --- L2: Audit ---
  const [timeAudit, setTimeAudit] = useState('');
  const [notWorking, setNotWorking] = useState<string[]>(['', '', '']);
  const [working, setWorking] = useState<string[]>(['', '', '']);

  // --- L3: Top 10 ---
  const [topTen, setTopTen] = useState<string[]>([]);
  const [tempGoal, setTempGoal] = useState('');

  // --- L4: Critical 3 ---
  const [selectedGoalIndices, setSelectedGoalIndices] = useState<number[]>([]);
  const [refinedGoals, setRefinedGoals] = useState<{
      id: string, 
      text: string, 
      metric: string, 
      nextSteps: string[], // Up to 3
      support: string
  }[]>([]);

  // --- L5: Momentum ---
  const [momentum, setMomentum] = useState([
      {id: '1', item: '', step: ''}, 
      {id: '2', item: '', step: ''}, 
      {id: '3', item: '', step: ''}
  ]);

  // --- L6: Weaknesses ---
  const [weaknesses, setWeaknesses] = useState([
      {id: '1', weakness: '', workaround: ''},
      {id: '2', weakness: '', workaround: ''},
      {id: '3', weakness: '', workaround: ''}
  ]);

  // --- L7: Easy Mode ---
  const [easyModes, setEasyModes] = useState([
      {id: '1', hard: '', easy: ''},
      {id: '2', hard: '', easy: ''},
      {id: '3', hard: '', easy: ''}
  ]);

  // --- L8 & L9: Inner Circle ---
  const [innerCircle, setInnerCircle] = useState<InnerCircleMember[]>(
      Array(5).fill({ name: '', scores: { info: 0, growth: 0, energy: 0, future: 0, values: 0 }, totalScore: 0 })
  );

  // --- L10: Rules ---
  const [rulesProsper, setRulesProsper] = useState<string[]>(['', '', '']);
  const [rulesProtect, setRulesProtect] = useState<string[]>(['', '', '']);
  const [rulesLimit, setRulesLimit] = useState<string[]>(['', '', '']);

  // --- L11: Commit ---
  const [insights, setInsights] = useState<string[]>(['', '', '']);
  const [oneChange, setOneChange] = useState('');
  const [revisitDate, setRevisitDate] = useState('');
  const [signatureName, setSignatureName] = useState('');

  // --- Helpers ---
  const updateList = (setter: React.Dispatch<React.SetStateAction<string[]>>, idx: number, val: string) => {
      setter(prev => prev.map((item, i) => i === idx ? val : item));
  };

  const addTopTen = () => {
      if (tempGoal.trim() && topTen.length < 10) { 
          setTopTen([...topTen, tempGoal]);
          setTempGoal('');
      }
  };

  const toggleSelection = (idx: number) => {
      if (selectedGoalIndices.includes(idx)) {
          setSelectedGoalIndices(selectedGoalIndices.filter(i => i !== idx));
          // Remove from refined
          setRefinedGoals(refinedGoals.filter(g => g.id !== idx.toString()));
      } else {
          if (selectedGoalIndices.length >= 3) return;
          setSelectedGoalIndices([...selectedGoalIndices, idx]);
          // Add to refined
          setRefinedGoals([...refinedGoals, {
              id: idx.toString(),
              text: topTen[idx],
              metric: '',
              nextSteps: [''],
              support: ''
          }]);
      }
  };

  const updateRefined = (id: string, field: string, val: any) => {
      setRefinedGoals(refinedGoals.map(g => g.id === id ? { ...g, [field]: val } : g));
  };

  const updateRefinedStep = (goalId: string, stepIdx: number, val: string) => {
      setRefinedGoals(refinedGoals.map(g => {
          if(g.id !== goalId) return g;
          const newSteps = [...g.nextSteps];
          newSteps[stepIdx] = val;
          return { ...g, nextSteps: newSteps };
      }));
  };

  const addRefinedStep = (goalId: string) => {
      setRefinedGoals(refinedGoals.map(g => {
          if(g.id !== goalId) return g;
          if(g.nextSteps.length >= 3) return g;
          return { ...g, nextSteps: [...g.nextSteps, ''] };
      }));
  };

  const updateInnerName = (idx: number, name: string) => {
      setInnerCircle(prev => prev.map((m, i) => i === idx ? { ...m, name } : m));
  };

  const updateInnerScore = (idx: number, field: keyof InnerCircleMember['scores'], val: number) => {
      setInnerCircle(prev => prev.map((m, i) => {
          if (i !== idx) return m;
          const newScores = { ...m.scores, [field]: val };
          const total = Object.values(newScores).reduce((a: number, b: number) => a + b, 0);
          return { ...m, scores: newScores, totalScore: total };
      }));
  };

  const finish = () => {
      const finalActiveGoals: Goal[] = refinedGoals.map(rg => {
          const validSteps = rg.nextSteps.filter(s => s.trim());
          return {
              id: crypto.randomUUID(),
              text: rg.text,
              metric: rg.metric,
              motivation: `Support: ${rg.support}`,
              nextStep: validSteps.join(', '), // For display summary
              keySupport: rg.support,
              leverage: [],
              obstacles: [],
              status: GoalStatus.ACTIVE,
              // Convert next steps to pre-filled milestones
              milestones: validSteps.map(s => ({
                  id: crypto.randomUUID(),
                  text: s,
                  completed: false,
                  completedAt: undefined
              })),
              createdAt: Date.now(),
              needsConfig: true
          };
      });

      const finalBacklogGoals: Goal[] = topTen
          .filter((_, i) => !selectedGoalIndices.includes(i))
          .map(text => ({
              id: crypto.randomUUID(),
              text,
              metric: 'Backlog',
              leverage: [],
              obstacles: [],
              status: GoalStatus.BACKLOG,
              milestones: [],
              createdAt: Date.now(),
              needsConfig: false
          }));

      const wb: WorkbookData = {
          year,
          keySuccess: keySuccessLines.filter(l => l.trim()).join('\n'),
          timeAudit,
          notWorking: notWorking.filter(x => x),
          working: working.filter(x => x),
          topTen,
          criticalThree: finalActiveGoals,
          momentum: momentum.filter(x => x.item),
          weaknesses: weaknesses.filter(x => x.weakness),
          strengths: [],
          easyMode: easyModes.filter(x => x.hard),
          innerCircle: innerCircle.filter(x => x.name),
          rulesProsper: rulesProsper.filter(x => x),
          rulesProtect: rulesProtect.filter(x => x),
          rulesLimit: rulesLimit.filter(x => x),
          insights: insights.filter(x => x),
          oneChange,
          revisitDate,
          signedAt: Date.now(),
          signatureName
      };

      onComplete(wb, finalActiveGoals, finalBacklogGoals);
  };

  // --- Render Steps ---
  return (
    <div className="fixed inset-0 bg-white z-[100] overflow-y-auto font-sans text-[#37352F]">
      <div className="max-w-3xl mx-auto py-16 px-6">
        
        {/* Header */}
        <div className="flex justify-between items-end border-b-2 border-black pb-4 mb-12">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">reThink Workbook</div>
            <h1 className="text-4xl font-serif font-medium">Annual Review {year}</h1>
          </div>
          <div className="font-serif italic text-xl">{step} / 11</div>
        </div>

        {/* STEP 1: L1 - Key to Success (Rows) */}
        {step === 1 && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4">
             <div>
                 <h2 className="text-3xl font-serif mb-4">The Key to Success</h2>
                 <p className="font-serif text-lg text-gray-600 mb-6">
                    Every breakthrough starts from knowing what you want to achieve.
                 </p>
                 <label className="font-bold block text-2xl font-serif mb-6">What I really want is...</label>
                 
                 <div className="space-y-6">
                    {keySuccessLines.map((line, i) => (
                        <div key={i} className="flex gap-4 items-end">
                            <span className="font-serif text-gray-300 text-2xl italic">{i + 1}.</span>
                            <input 
                                className="w-full bg-white text-xl font-serif border-b border-gray-300 outline-none pb-2 focus:border-black transition-colors"
                                value={line}
                                onChange={e => updateList(setKeySuccessLines, i, e.target.value)}
                                placeholder="I want to..."
                                autoFocus={i === 0}
                            />
                        </div>
                    ))}
                 </div>
             </div>
          </div>
        )}

        {/* STEP 2: L2 - Audit */}
        {step === 2 && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4">
             <div>
                 <h2 className="text-3xl font-serif mb-4">An Honest Audit</h2>
                 <p className="text-gray-800 leading-relaxed mb-8">
                    Imagine a world-class CEO just took over your life. You're not in charge anymore, they are. 
                 </p>
             </div>

             <div className="space-y-4">
                <label className="font-bold block">Time Audit</label>
                <p className="text-sm text-gray-500 mb-2">If they looked at your calendar, where are you spending your time?</p>
                <textarea className="w-full p-4 bg-white border border-gray-200 outline-none h-24 resize-none focus:border-black" 
                  value={timeAudit} onChange={e => setTimeAudit(e.target.value)} />
             </div>

             <div className="grid md:grid-cols-2 gap-12">
                 <div>
                     <label className="font-bold block mb-2">Eliminate (Not Working)</label>
                     {notWorking.map((val, i) => (
                         <div key={i} className="flex gap-2 mb-3">
                             <span className="text-gray-400 font-serif italic w-4">{i+1}.</span>
                             <input className="w-full bg-white border-b border-gray-300 outline-none pb-1 focus:border-black" value={val} onChange={e => updateList(setNotWorking, i, e.target.value)} />
                         </div>
                     ))}
                 </div>
                 <div>
                     <label className="font-bold block mb-2">Focus (Working)</label>
                     {working.map((val, i) => (
                         <div key={i} className="flex gap-2 mb-3">
                             <span className="text-gray-400 font-serif italic w-4">{i+1}.</span>
                             <input className="w-full bg-white border-b border-gray-300 outline-none pb-1 focus:border-black" value={val} onChange={e => updateList(setWorking, i, e.target.value)} />
                         </div>
                     ))}
                 </div>
             </div>
          </div>
        )}

        {/* STEP 3: L3 - Map Your Horizon (Max 10) */}
        {step === 3 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
             <div>
                <h2 className="text-3xl font-serif mb-4">Map Your Horizon</h2>
                <p className="font-serif text-lg text-gray-600 mb-6">
                    Even exceptional leaders face the challenge of too many opportunities.
                </p>
                <label className="font-bold block text-xl mb-4">List your top 10 goals for {year}:</label>
             </div>

             <div className="space-y-3">
                 {topTen.map((item, i) => (
                     <div key={i} className="flex items-center gap-4 p-3 bg-gray-50 border border-gray-200 group">
                         <span className="font-mono text-gray-400 w-6">{i+1}.</span>
                         <span className="flex-1 font-medium">{item}</span>
                         <button onClick={() => setTopTen(topTen.filter((_, idx) => idx !== i))} className="opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4 text-gray-400 hover:text-black"/></button>
                     </div>
                 ))}
                 
                 {topTen.length < 10 ? (
                     <div className="flex gap-2">
                        <span className="font-mono text-gray-400 w-6 py-3">{topTen.length + 1}.</span>
                        <input 
                            className="flex-1 p-3 border-b-2 border-black outline-none font-medium placeholder:text-gray-300 bg-white"
                            placeholder="Add a goal..." 
                            value={tempGoal} 
                            onChange={e => setTempGoal(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && addTopTen()}
                            autoFocus 
                        />
                        <button onClick={addTopTen} className="px-4 bg-black text-white font-bold text-sm hover:opacity-80">Add</button>
                     </div>
                 ) : (
                    <p className="text-sm text-gray-500 italic mt-4">Limit reached. Proceed to selection.</p>
                 )}
             </div>
          </div>
        )}

        {/* STEP 4: L4 - Do Less, Better (3 Goals + Milestones) */}
        {step === 4 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
             <div>
                <h2 className="text-3xl font-serif mb-4">Do Less, Better</h2>
                <p className="text-gray-800 mb-6">
                    <strong>Step 1:</strong> Select your top three goals. The remaining seven become your "avoid-at-all-costs" list.
                </p>
             </div>

             <div className="grid gap-3 mb-12">
                {topTen.map((goal, i) => {
                   const isSelected = selectedGoalIndices.includes(i);
                   const isDisabled = !isSelected && selectedGoalIndices.length >= 3;
                   return (
                      <div key={i} onClick={() => !isDisabled && toggleSelection(i)} 
                        className={`p-4 border-2 cursor-pointer flex items-center gap-4 transition-all rounded-lg ${isSelected ? 'border-black bg-gray-50' : 'border-gray-200 hover:border-black' + (isDisabled ? ' opacity-40 cursor-not-allowed border-transparent bg-gray-50' : '')}`}>
                          <div className={`w-5 h-5 border flex items-center justify-center ${isSelected ? 'border-black bg-black text-white' : 'border-black'}`}>
                             {isSelected && <Check className="w-3 h-3"/>}
                          </div>
                          <span className={`text-lg ${isSelected ? 'font-bold' : ''}`}>{goal}</span>
                      </div>
                   )
                })}
             </div>

             {selectedGoalIndices.length === 3 && (
                 <div className="animate-in fade-in space-y-12 pt-8 border-t border-gray-200">
                     <p className="text-gray-800 text-lg font-serif">
                        <strong>Step 2:</strong> Refine your Critical 3.
                     </p>
                     {refinedGoals.map((rg, i) => (
                         <div key={rg.id} className="bg-gray-50 p-8 border border-gray-200 space-y-6 relative">
                             <div className="absolute top-0 right-0 bg-black text-white px-3 py-1 text-xs font-bold uppercase tracking-widest">Goal {i+1}</div>
                             <h4 className="font-serif font-bold text-2xl pt-4">{rg.text}</h4>
                             
                             <div>
                                 <label className="text-xs font-bold uppercase block mb-1">Success metric(s)</label>
                                 <input className="w-full bg-white border border-gray-300 p-3 text-sm outline-none focus:border-black transition-colors" placeholder="How will you measure progress?" value={rg.metric} onChange={e => updateRefined(rg.id, 'metric', e.target.value)} />
                             </div>
                             
                             <div>
                                 <label className="text-xs font-bold uppercase block mb-2">Next Steps / Milestones (Up to 3)</label>
                                 <div className="space-y-2">
                                     {rg.nextSteps.map((step, sIdx) => (
                                         <div key={sIdx} className="flex gap-2">
                                            <span className="text-gray-400 font-mono text-sm py-2">{sIdx+1}.</span>
                                            <input 
                                                className="w-full bg-white border border-gray-300 p-2 text-sm outline-none focus:border-black transition-colors" 
                                                placeholder="Action step..." 
                                                value={step} 
                                                onChange={e => updateRefinedStep(rg.id, sIdx, e.target.value)} 
                                            />
                                         </div>
                                     ))}
                                     {rg.nextSteps.length < 3 && (
                                         <button onClick={() => addRefinedStep(rg.id)} className="text-xs font-bold text-gray-500 hover:text-black flex items-center gap-1 pl-6">
                                             <Plus className="w-3 h-3"/> Add Step
                                         </button>
                                     )}
                                 </div>
                             </div>

                             <div>
                                 <label className="text-xs font-bold uppercase block mb-1">Key support</label>
                                 <input className="w-full bg-white border border-gray-300 p-3 text-sm outline-none focus:border-black transition-colors" placeholder="Who or what do you need?" value={rg.support} onChange={e => updateRefined(rg.id, 'support', e.target.value)} />
                             </div>
                         </div>
                     ))}
                 </div>
             )}
          </div>
        )}

        {/* STEP 5: L5 - Momentum */}
        {step === 5 && (
           <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
              <div>
                <h2 className="text-3xl font-serif mb-4">Small Steps for Momentum</h2>
                <p className="font-serif text-lg text-gray-600 italic">
                    "Now is no time to think of what you do not have. Think of what you can do with what there is."
                </p>
              </div>
              <div className="space-y-6">
                 {momentum.map((m, i) => (
                    <div key={m.id} className="grid md:grid-cols-2 gap-8 border-b border-gray-200 pb-6">
                        <div>
                             <label className="font-bold block mb-2">I'm putting off</label>
                             <input className="w-full bg-white border-b border-gray-300 outline-none pb-1 focus:border-black" 
                               value={m.item} onChange={e => {
                                   const newArr = [...momentum];
                                   newArr[i].item = e.target.value;
                                   setMomentum(newArr);
                               }} />
                        </div>
                        <div>
                             <label className="font-bold block mb-2">Smallest first step</label>
                             <input className="w-full bg-white border-b border-gray-300 outline-none pb-1 focus:border-black" 
                               value={m.step} onChange={e => {
                                   const newArr = [...momentum];
                                   newArr[i].step = e.target.value;
                                   setMomentum(newArr);
                               }} />
                        </div>
                    </div>
                 ))}
              </div>
           </div>
        )}

        {/* STEP 6: L6 - Play to Strengths */}
        {step === 6 && (
           <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
              <div>
                 <h2 className="text-3xl font-serif mb-4">Play to Your Strengths</h2>
                 <p className="text-gray-800">
                    List three areas where others would say you're weak. For each one, write down a practical way to work around it.
                 </p>
              </div>
              
              <div className="space-y-6">
                 {weaknesses.map((w, i) => (
                    <div key={w.id} className="grid md:grid-cols-2 gap-8 border-b border-gray-200 pb-6">
                        <div>
                             <label className="font-bold block mb-2">Weakness</label>
                             <input className="w-full bg-white border-b border-gray-300 outline-none pb-1 focus:border-black" 
                               value={w.weakness} onChange={e => {
                                   const newArr = [...weaknesses];
                                   newArr[i].weakness = e.target.value;
                                   setWeaknesses(newArr);
                               }} />
                        </div>
                        <div>
                             <label className="font-bold block mb-2">Workaround</label>
                             <input className="w-full bg-white border-b border-gray-300 outline-none pb-1 focus:border-black" 
                               value={w.workaround} onChange={e => {
                                   const newArr = [...weaknesses];
                                   newArr[i].workaround = e.target.value;
                                   setWeaknesses(newArr);
                               }} />
                        </div>
                    </div>
                 ))}
              </div>
           </div>
        )}

        {/* STEP 7: L7 - Easy Mode */}
        {step === 7 && (
           <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
              <div>
                 <h2 className="text-3xl font-serif mb-4">Find Your Easy Mode</h2>
                 <p className="text-gray-800">
                    Identify three areas where you're choosing the difficult path by default. For each one, find and describe your easy mode.
                 </p>
              </div>
              
              <div className="space-y-6">
                 {easyModes.map((em, i) => (
                    <div key={em.id} className="grid md:grid-cols-2 gap-8 border-b border-gray-200 pb-6">
                        <div>
                             <label className="font-bold block mb-2">Hard mode</label>
                             <input className="w-full bg-white border-b border-gray-300 outline-none pb-1 focus:border-black" 
                               value={em.hard} onChange={e => {
                                   const newArr = [...easyModes];
                                   newArr[i].hard = e.target.value;
                                   setEasyModes(newArr);
                               }} />
                        </div>
                        <div>
                             <label className="font-bold block mb-2">Easy mode</label>
                             <input className="w-full bg-white border-b border-gray-300 outline-none pb-1 focus:border-black" 
                               value={em.easy} onChange={e => {
                                   const newArr = [...easyModes];
                                   newArr[i].easy = e.target.value;
                                   setEasyModes(newArr);
                               }} />
                        </div>
                    </div>
                 ))}
              </div>
           </div>
        )}

        {/* STEP 8: L8 - Inner Circle List */}
        {step === 8 && (
           <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
              <div>
                 <h2 className="text-3xl font-serif mb-4">The Inner Circle</h2>
                 <p className="text-gray-800 mb-6">
                    List the five people who have the most presence in your daily life.
                 </p>
              </div>
              
              <div className="space-y-4 max-w-md">
                 {innerCircle.map((member, i) => (
                    <div key={i} className="flex gap-4 items-center">
                        <span className="font-mono text-gray-400 w-4">{i+1}.</span>
                        <input className="flex-1 p-3 border border-gray-200 outline-none bg-white focus:border-black" 
                            placeholder={`Person ${i+1}`}
                            value={member.name} 
                            onChange={e => updateInnerName(i, e.target.value)} 
                        />
                    </div>
                 ))}
              </div>
           </div>
        )}

        {/* STEP 9: L9 - Inner Circle Score */}
        {step === 9 && (
           <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
              <div>
                 <h2 className="text-3xl font-serif mb-4">The Inner Circle</h2>
                 <p className="text-gray-800 mb-6">
                    Score each person (+1 for positive, 0 for neutral, -1 for negative).
                 </p>
              </div>
              
              <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                      <thead>
                          <tr className="border-b border-black">
                              <th className="text-left py-2 font-bold w-32">Person</th>
                              <th className="py-2 px-1 font-normal text-xs text-gray-500 w-24">Info Quality</th>
                              <th className="py-2 px-1 font-normal text-xs text-gray-500 w-24">Growth</th>
                              <th className="py-2 px-1 font-normal text-xs text-gray-500 w-24">Energy</th>
                              <th className="py-2 px-1 font-normal text-xs text-gray-500 w-24">Future</th>
                              <th className="py-2 px-1 font-normal text-xs text-gray-500 w-24">Values</th>
                              <th className="py-2 px-1 font-bold text-right w-16">Total</th>
                          </tr>
                      </thead>
                      <tbody>
                          {innerCircle.filter(m => m.name).map((member, i) => (
                              <tr key={i} className="border-b border-gray-200 hover:bg-gray-50">
                                  <td className="py-4 font-bold">{member.name}</td>
                                  {['info', 'growth', 'energy', 'future', 'values'].map((field) => (
                                      <td key={field} className="text-center">
                                          <input 
                                            type="number" min="-1" max="1"
                                            className="w-10 text-center border border-gray-200 py-1 outline-none bg-white"
                                            value={member.scores[field as keyof typeof member.scores]}
                                            onChange={e => updateInnerScore(i, field as any, parseInt(e.target.value) || 0)}
                                          />
                                      </td>
                                  ))}
                                  <td className="text-right font-mono font-bold text-lg">
                                      {member.totalScore > 0 ? `+${member.totalScore}` : member.totalScore}
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
           </div>
        )}

        {/* STEP 10: L10 - Rules (No Colors) */}
        {step === 10 && (
           <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
              <div>
                 <h2 className="text-3xl font-serif mb-4">Set the Rules</h2>
                 <p className="font-serif text-lg text-gray-600 italic mb-6">
                    "The secret to effective results is turning acquired knowledge into default behavior."
                 </p>
              </div>
              
              <div className="grid gap-8">
                  <div className="border border-gray-200 p-6 rounded-lg">
                      <h3 className="font-bold text-lg mb-2 flex items-center gap-2 uppercase tracking-wide"><Target className="w-4 h-4"/> Rules that prosper</h3>
                      <p className="text-sm text-gray-500 mb-4">Automate progress toward your goals.</p>
                      {rulesProsper.map((r, i) => (
                          <div key={i} className="flex gap-2 mb-2"><span className="text-gray-300 w-4">{i+1}.</span><input className="w-full bg-white border-b border-gray-200 outline-none pb-1 focus:border-black" value={r} onChange={e => updateList(setRulesProsper, i, e.target.value)} /></div>
                      ))}
                  </div>
                  <div className="border border-gray-200 p-6 rounded-lg">
                      <h3 className="font-bold text-lg mb-2 flex items-center gap-2 uppercase tracking-wide"><Shield className="w-4 h-4"/> Rules that protect</h3>
                      <p className="text-sm text-gray-500 mb-4">Guard your priorities and energy.</p>
                      {rulesProtect.map((r, i) => (
                          <div key={i} className="flex gap-2 mb-2"><span className="text-gray-300 w-4">{i+1}.</span><input className="w-full bg-white border-b border-gray-200 outline-none pb-1 focus:border-black" value={r} onChange={e => updateList(setRulesProtect, i, e.target.value)} /></div>
                      ))}
                  </div>
                  <div className="border border-gray-200 p-6 rounded-lg">
                      <h3 className="font-bold text-lg mb-2 flex items-center gap-2 uppercase tracking-wide"><Ban className="w-4 h-4"/> Rules that limit</h3>
                      <p className="text-sm text-gray-500 mb-4">Identify rules ready for retirement.</p>
                      {rulesLimit.map((r, i) => (
                          <div key={i} className="flex gap-2 mb-2"><span className="text-gray-300 w-4">{i+1}.</span><input className="w-full bg-white border-b border-gray-200 outline-none pb-1 focus:border-black" value={r} onChange={e => updateList(setRulesLimit, i, e.target.value)} /></div>
                      ))}
                  </div>
              </div>
           </div>
        )}

        {/* STEP 11: L11 - Commit */}
        {step === 11 && (
           <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4">
              <div>
                 <h2 className="text-4xl font-serif mb-4">Commit to Your Path</h2>
                 <p className="text-gray-800 text-lg mb-8">
                    Clear thinking leads to better decisions.
                 </p>
              </div>

              <div className="space-y-6">
                  <label className="font-bold block">What three insights from this review will most transform your next year?</label>
                  {insights.map((val, i) => (
                      <div key={i} className="flex gap-4">
                          <span className="font-mono text-gray-400">{i+1}.</span>
                          <input className="w-full bg-white border-b border-gray-300 outline-none pb-1 focus:border-black" value={val} onChange={e => updateList(setInsights, i, e.target.value)} />
                      </div>
                  ))}
              </div>

              <div className="space-y-2">
                  <label className="font-bold block">What one change will you implement immediately?</label>
                  <input className="w-full bg-white border-b border-gray-300 outline-none pb-1 focus:border-black" value={oneChange} onChange={e => setOneChange(e.target.value)} />
              </div>

              <div className="space-y-2">
                  <label className="font-bold block">When will you revisit these exercises to check your progress?</label>
                  <input className="w-full bg-white border-b border-gray-300 outline-none pb-1 focus:border-black" value={revisitDate} onChange={e => setRevisitDate(e.target.value)} />
              </div>

              <div className="pt-12 mt-12 border-t-2 border-black text-center">
                  <p className="font-serif italic text-xl max-w-2xl mx-auto mb-12">
                     "I commit to pursuing my chosen priorities..."
                  </p>
                  <input 
                    className="w-full max-w-md text-center text-2xl font-serif border-b-2 border-gray-300 outline-none bg-transparent py-2 placeholder:text-gray-200"
                    placeholder="Place, date, and signature"
                    value={signatureName}
                    onChange={e => setSignatureName(e.target.value)}
                  />
                  <br/>
                  <button onClick={finish} disabled={!signatureName} className="mt-12 px-10 py-4 bg-black text-white font-bold text-lg hover:scale-105 transition-transform disabled:opacity-50">
                      Sign Manifesto
                  </button>
              </div>
           </div>
        )}

        {/* Nav */}
        <div className="flex justify-between border-t pt-8 mt-16">
           <button onClick={() => step > 1 ? setStep(step - 1) : onCancel()} className="text-gray-400 hover:text-black font-medium">{step === 1 ? 'Cancel' : 'Back'}</button>
           {step < 11 && (
             <button 
                onClick={() => setStep(step + 1)} 
                disabled={(step === 3 && topTen.length !== 10) || (step === 4 && selectedGoalIndices.length !== 3)} 
                className="flex items-center gap-2 font-bold hover:underline disabled:opacity-30 disabled:no-underline"
             >
                Next <ArrowRight className="w-4 h-4"/>
             </button>
           )}
        </div>

      </div>
    </div>
  );
};

export default AnnualReview;