import React, { useState } from 'react';
import { Goal, GoalStatus, WorkbookData } from '../types';
import { ArrowRight, Check, Trash2, Plus, Ban, Zap, AlertTriangle } from '../components/Icon';

interface AnnualReviewProps {
  onComplete: (workbook: WorkbookData, activeGoals: Goal[], backlogGoals: Goal[]) => void;
  onCancel: () => void;
  initialYear?: string;
}

const AnnualReview: React.FC<AnnualReviewProps> = ({ onComplete, onCancel, initialYear = "2026" }) => {
  const [step, setStep] = useState(1);
  const [year] = useState(initialYear);

  // --- L1 & L2: Audit ---
  const [keySuccess, setKeySuccess] = useState('');
  const [stupidestDecision, setStupidestDecision] = useState('');
  const [smartestDecision, setSmartestDecision] = useState('');
  const [timeAudit, setTimeAudit] = useState('');

  // --- L3 & L4: Lists ---
  const [rawLongList, setRawLongList] = useState<{id: string, text: string}[]>([]);
  const [tempLongItem, setTempLongItem] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // --- L5: Momentum ---
  const [momentum, setMomentum] = useState([
      {id: '1', item: '', smallStep: ''}, 
      {id: '2', item: '', smallStep: ''}, 
      {id: '3', item: '', smallStep: ''}
  ]);

  // --- L6: Identity ---
  const [strengths, setStrengths] = useState<{ id: string; strength: string; application: string }[]>([]);
  const [weaknesses, setWeaknesses] = useState<{ id: string; weakness: string; workaround: string }[]>([]);
  const [tempS, setTempS] = useState({ title: '', body: '' });
  const [tempW, setTempW] = useState({ title: '', body: '' });

  // --- L7, L8, L9: Models ---
  const [easyMode, setEasyMode] = useState('');
  const [inversion, setInversion] = useState('');
  const [secondOrder, setSecondOrder] = useState('');

  // --- L10: Rules ---
  const [prescriptions, setPrescriptions] = useState<string[]>([]);
  const [antiGoals, setAntiGoals] = useState<string[]>([]);
  const [tempP, setTempP] = useState('');
  const [tempA, setTempA] = useState('');

  // --- L11: Contract ---
  const [signatureName, setSignatureName] = useState('');

  // --- Helpers ---
  const addLongItem = () => {
    if (!tempLongItem.trim()) return;
    setRawLongList([...rawLongList, { id: crypto.randomUUID(), text: tempLongItem }]);
    setTempLongItem('');
  };

  const toggleSelection = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(x => x !== id));
    } else {
      if (selectedIds.length >= 3) return; // Strict limit UI
      setSelectedIds([...selectedIds, id]);
    }
  };

  const updateMomentum = (idx: number, field: 'item' | 'smallStep', val: string) => {
    const arr = [...momentum];
    arr[idx] = { ...arr[idx], [field]: val };
    setMomentum(arr);
  };

  const finish = () => {
    const wb: WorkbookData = {
      year,
      keySuccess, stupidestDecision, smartestDecision, timeAudit,
      momentum, strengths, weaknesses,
      easyMode, inversion, secondOrder,
      prescriptions, antiGoals,
      signedAt: Date.now(),
      signatureName
    };

    const activeGoals: Goal[] = [];
    const backlogGoals: Goal[] = [];

    rawLongList.forEach(i => {
      const isActive = selectedIds.includes(i.id);
      const goal: Goal = {
        id: i.id,
        text: i.text,
        metric: 'To be defined',
        status: isActive ? GoalStatus.ACTIVE : GoalStatus.BACKLOG,
        milestones: [],
        leverage: [],
        obstacles: [],
        createdAt: Date.now(),
        needsConfig: isActive // Active goals need systemization
      };
      if (isActive) activeGoals.push(goal);
      else backlogGoals.push(goal);
    });

    onComplete(wb, activeGoals, backlogGoals);
  };

  // --- Steps UI ---
  return (
    <div className="fixed inset-0 bg-white z-[100] overflow-y-auto">
      <div className="max-w-3xl mx-auto py-16 px-6">
        
        {/* Header */}
        <div className="flex justify-between items-end border-b-2 border-black pb-4 mb-12">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">reThink Workbook</div>
            <h1 className="text-4xl font-serif font-medium">Annual Review {year}</h1>
          </div>
          <div className="font-serif italic text-xl">{step} / 10</div>
        </div>

        {/* Step 1: Audit */}
        {step === 1 && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4">
             <div className="space-y-4">
                <label className="text-2xl font-serif">What was the key to your success this year?</label>
                <textarea className="w-full p-4 bg-gray-50 border-l-4 border-black outline-none min-h-[120px]" 
                  value={keySuccess} onChange={e => setKeySuccess(e.target.value)} />
             </div>
             <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-2">
                   <label className="font-serif text-lg font-bold">Stupidest Decision</label>
                   <textarea className="w-full p-4 bg-gray-50 border border-gray-200 outline-none h-32" 
                     value={stupidestDecision} onChange={e => setStupidestDecision(e.target.value)} />
                </div>
                <div className="space-y-2">
                   <label className="font-serif text-lg font-bold">Smartest Decision</label>
                   <textarea className="w-full p-4 bg-gray-50 border border-gray-200 outline-none h-32" 
                     value={smartestDecision} onChange={e => setSmartestDecision(e.target.value)} />
                </div>
             </div>
             <div className="space-y-2">
                <label className="font-serif text-lg font-bold">Time Audit (Reality vs Perception)</label>
                <textarea className="w-full p-4 bg-gray-50 border border-gray-200 outline-none h-32" 
                  value={timeAudit} onChange={e => setTimeAudit(e.target.value)} />
             </div>
          </div>
        )}

        {/* Step 2: Long List */}
        {step === 2 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
             <div>
                <h2 className="text-3xl font-serif mb-4">The Long List</h2>
                <p className="font-serif text-lg text-gray-600">Write down everything you want to accomplish. Don't filter. Aim for 25 items.</p>
             </div>
             <div className="flex gap-2">
                <input className="flex-1 p-4 border-b-2 border-black outline-none text-lg font-medium placeholder:text-gray-300"
                  placeholder="I want to..." 
                  value={tempLongItem} 
                  onChange={e => setTempLongItem(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addLongItem()}
                  autoFocus 
                />
                <button onClick={addLongItem} className="px-6 bg-black text-white font-bold hover:opacity-80">Add</button>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {rawLongList.map((item, i) => (
                   <div key={item.id} className="p-3 bg-gray-50 flex justify-between group border border-transparent hover:border-gray-200">
                      <span className="font-medium">{(i+1).toString().padStart(2,'0')}. {item.text}</span>
                      <button onClick={() => setRawLongList(rawLongList.filter(x => x.id !== item.id))} className="opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4 text-gray-400"/></button>
                   </div>
                ))}
             </div>
          </div>
        )}

        {/* Step 3: The Cut */}
        {step === 3 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
             <div>
                <h2 className="text-3xl font-serif mb-4">The Critical Three</h2>
                <p className="font-serif text-lg text-gray-600">Select exactly 3 items. Everything else becomes your "Avoid-At-All-Costs" list.</p>
             </div>
             <div className="grid gap-3">
                {rawLongList.map(item => {
                   const isSelected = selectedIds.includes(item.id);
                   const isDisabled = !isSelected && selectedIds.length >= 3;
                   return (
                      <div key={item.id} onClick={() => !isDisabled && toggleSelection(item.id)} 
                        className={`p-4 border-2 cursor-pointer flex items-center gap-4 transition-all ${isSelected ? 'border-black bg-black text-white' : 'border-gray-100 hover:border-black' + (isDisabled ? ' opacity-50 cursor-not-allowed' : '')}`}>
                          <div className={`w-6 h-6 border flex items-center justify-center ${isSelected ? 'border-white' : 'border-black'}`}>
                             {isSelected && <Check className="w-4 h-4"/>}
                          </div>
                          <span className="text-lg font-bold">{item.text}</span>
                      </div>
                   )
                })}
             </div>
             <div className="text-right font-bold uppercase tracking-widest text-sm">Selected: {selectedIds.length} / 3</div>
          </div>
        )}

        {/* Step 4: Momentum */}
        {step === 4 && (
           <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
              <div>
                <h2 className="text-3xl font-serif mb-4">Small Steps for Momentum</h2>
                <p className="font-serif text-lg text-gray-600">Identify 3 things you are procrastinating on. Define the smallest possible step.</p>
              </div>
              <div className="space-y-6">
                 {momentum.map((m, i) => (
                    <div key={m.id} className="bg-gray-50 p-6 border border-gray-200">
                       <div className="grid md:grid-cols-2 gap-6">
                          <div>
                             <label className="text-xs font-bold uppercase mb-1 block">Procrastination Item</label>
                             <input className="w-full bg-transparent border-b border-gray-300 focus:border-black outline-none py-1" 
                               value={m.item} onChange={e => updateMomentum(i, 'item', e.target.value)} />
                          </div>
                          <div>
                             <label className="text-xs font-bold uppercase mb-1 block">Smallest Step</label>
                             <input className="w-full bg-transparent border-b border-gray-300 focus:border-black outline-none py-1" 
                               value={m.smallStep} onChange={e => updateMomentum(i, 'smallStep', e.target.value)} />
                          </div>
                       </div>
                    </div>
                 ))}
              </div>
           </div>
        )}

        {/* Step 5: Identity */}
        {step === 5 && (
           <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4">
              <div>
                 <h2 className="text-3xl font-serif mb-2">Play to Your Strengths</h2>
                 <p className="mb-4 text-gray-600">List 3 strengths and how to apply them.</p>
                 <div className="flex gap-2 mb-4">
                    <input className="flex-1 p-3 border border-gray-200 outline-none" placeholder="Strength" value={tempS.title} onChange={e => setTempS({...tempS, title: e.target.value})} />
                    <input className="flex-1 p-3 border border-gray-200 outline-none" placeholder="Application" value={tempS.body} onChange={e => setTempS({...tempS, body: e.target.value})} />
                    <button onClick={() => { if(tempS.title){ setStrengths([...strengths, {id:crypto.randomUUID(), strength:tempS.title, application:tempS.body}]); setTempS({title:'',body:''}); }}} className="px-4 bg-black text-white font-bold">Add</button>
                 </div>
                 <ul className="space-y-2">{strengths.map(s => <li key={s.id} className="bg-gray-50 p-3 flex justify-between"><span className="font-medium">{s.strength} <span className="text-gray-400 font-normal">→ {s.application}</span></span> <button onClick={() => setStrengths(strengths.filter(x=>x.id!==s.id))}><Trash2 className="w-4 h-4 text-gray-400"/></button></li>)}</ul>
              </div>
              <div className="border-t pt-12">
                 <h2 className="text-3xl font-serif mb-2">Mitigate Weaknesses</h2>
                 <p className="mb-4 text-gray-600">List 3 weaknesses and workarounds.</p>
                 <div className="flex gap-2 mb-4">
                    <input className="flex-1 p-3 border border-gray-200 outline-none" placeholder="Weakness" value={tempW.title} onChange={e => setTempW({...tempW, title: e.target.value})} />
                    <input className="flex-1 p-3 border border-gray-200 outline-none" placeholder="Workaround" value={tempW.body} onChange={e => setTempW({...tempW, body: e.target.value})} />
                    <button onClick={() => { if(tempW.title){ setWeaknesses([...weaknesses, {id:crypto.randomUUID(), weakness:tempW.title, workaround:tempW.body}]); setTempW({title:'',body:''}); }}} className="px-4 bg-black text-white font-bold">Add</button>
                 </div>
                 <ul className="space-y-2">{weaknesses.map(s => <li key={s.id} className="bg-gray-50 p-3 flex justify-between"><span className="font-medium">{s.weakness} <span className="text-gray-400 font-normal">→ {s.workaround}</span></span> <button onClick={() => setWeaknesses(weaknesses.filter(x=>x.id!==s.id))}><Trash2 className="w-4 h-4 text-gray-400"/></button></li>)}</ul>
              </div>
           </div>
        )}

        {/* Step 6: Easy Mode */}
        {step === 6 && (
           <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <h2 className="text-3xl font-serif">Find Your Easy Mode</h2>
              <p className="text-lg text-gray-600">Where are you making things harder than needed? What is the path of least resistance?</p>
              <textarea className="w-full p-6 bg-gray-50 border-l-4 border-black outline-none min-h-[400px] text-lg font-serif" 
                value={easyMode} onChange={e => setEasyMode(e.target.value)} placeholder="Journal..." />
           </div>
        )}

        {/* Step 7: Inversion */}
        {step === 7 && (
           <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <h2 className="text-3xl font-serif">Inversion</h2>
              <p className="text-lg text-gray-600">What would guarantee failure? List everything that ensures you fail.</p>
              <textarea className="w-full p-6 bg-gray-50 border-l-4 border-black outline-none min-h-[400px] text-lg font-serif" 
                value={inversion} onChange={e => setInversion(e.target.value)} placeholder="How to fail..." />
           </div>
        )}

        {/* Step 8: Second Order */}
        {step === 8 && (
           <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <h2 className="text-3xl font-serif">Second-Order Thinking</h2>
              <p className="text-lg text-gray-600">"And then what?" Ensure short-term gains don't cause long-term pain.</p>
              <textarea className="w-full p-6 bg-gray-50 border-l-4 border-black outline-none min-h-[400px] text-lg font-serif" 
                value={secondOrder} onChange={e => setSecondOrder(e.target.value)} placeholder="Consequences of consequences..." />
           </div>
        )}

        {/* Step 9: Rules */}
        {step === 9 && (
           <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4">
              <h2 className="text-3xl font-serif">Rules of Engagement</h2>
              <div className="bg-gray-50 p-8 border border-gray-200">
                 <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><Check className="w-5 h-5"/> Prescriptions (Always)</h3>
                 <div className="flex gap-2 mb-4">
                    <input className="flex-1 p-3 bg-white border border-gray-200 outline-none" value={tempP} onChange={e => setTempP(e.target.value)} onKeyDown={e => e.key === 'Enter' && (setPrescriptions([...prescriptions, tempP]), setTempP(''))} />
                    <button onClick={() => { if(tempP) { setPrescriptions([...prescriptions, tempP]); setTempP(''); }}} className="px-4 bg-black text-white font-bold">Add</button>
                 </div>
                 <ul className="list-disc pl-5 space-y-2">{prescriptions.map((p,i) => <li key={i} className="text-lg font-serif">{p}</li>)}</ul>
              </div>
              <div className="bg-gray-50 p-8 border border-gray-200">
                 <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><Ban className="w-5 h-5"/> Anti-Goals (Never)</h3>
                 <div className="flex gap-2 mb-4">
                    <input className="flex-1 p-3 bg-white border border-gray-200 outline-none" value={tempA} onChange={e => setTempA(e.target.value)} onKeyDown={e => e.key === 'Enter' && (setAntiGoals([...antiGoals, tempA]), setTempA(''))} />
                    <button onClick={() => { if(tempA) { setAntiGoals([...antiGoals, tempA]); setTempA(''); }}} className="px-4 bg-black text-white font-bold">Add</button>
                 </div>
                 <ul className="list-disc pl-5 space-y-2">{antiGoals.map((p,i) => <li key={i} className="text-lg font-serif">{p}</li>)}</ul>
              </div>
           </div>
        )}

        {/* Step 10: Contract */}
        {step === 10 && (
           <div className="space-y-12 text-center py-24 animate-in fade-in slide-in-from-bottom-4">
              <h2 className="text-4xl font-serif mb-8">The Contract</h2>
              <p className="text-2xl font-serif italic max-w-2xl mx-auto leading-relaxed">
                 "I commit to executing this plan. I accept that I cannot do everything, but I can do anything if I focus."
              </p>
              <div className="max-w-md mx-auto space-y-2">
                 <input className="w-full text-center text-3xl font-serif border-b-2 border-black outline-none bg-transparent py-2 placeholder:text-gray-200" 
                    placeholder="Sign Name" value={signatureName} onChange={e => setSignatureName(e.target.value)} />
                 <div className="text-xs uppercase tracking-widest text-gray-400">Dated: {new Date().toLocaleDateString()}</div>
              </div>
              <button onClick={finish} disabled={!signatureName} className="mt-12 px-10 py-4 bg-black text-white font-bold text-lg hover:scale-105 transition-transform disabled:opacity-50">Sign Manifesto</button>
           </div>
        )}

        {/* Nav */}
        <div className="flex justify-between border-t pt-8 mt-16">
           <button onClick={() => step > 1 ? setStep(step - 1) : onCancel()} className="text-gray-400 hover:text-black font-medium">{step === 1 ? 'Cancel' : 'Back'}</button>
           {step < 10 && (
             <button onClick={() => setStep(step + 1)} disabled={step === 3 && selectedIds.length !== 3} 
               className="flex items-center gap-2 font-bold hover:underline disabled:opacity-30 disabled:no-underline">Next <ArrowRight className="w-4 h-4"/></button>
           )}
        </div>

      </div>
    </div>
  );
};

export default AnnualReview;