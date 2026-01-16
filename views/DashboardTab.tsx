import React, { useState } from 'react';
import { AppData, GoalStatus } from '../types';
import ContributionGraph from '../components/ContributionGraph';
import { BarChart2, Check, Target, Sparkles, Map, AlertTriangle, PlayCircle } from '../components/Icon';

interface DashboardTabProps {
  data: AppData;
}

const DashboardTab: React.FC<DashboardTabProps> = ({ data }) => {
  const activeGoals = data.goals.filter(g => g.status === GoalStatus.ACTIVE);
  const [auditResult, setAuditResult] = useState<string | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);

  const runCEOAudit = () => {
    setIsAuditing(true);
    setAuditResult(null);
    
    // Simulate AI Latency
    setTimeout(() => {
        // Logic for "Simulated AI" analysis
        const totalActive = activeGoals.length;
        const totalHabits = data.habits.filter(h => data.goals.find(g => g.id === h.goalId)?.status === GoalStatus.ACTIVE).length;
        const completedMilestones = activeGoals.reduce((acc, g) => acc + g.milestones.filter(m => m.completed).length, 0);
        
        let feedback = "";
        
        if (totalActive < 3) {
            feedback += "CRITICAL: You are operating below capacity. Define 3 clear strategic objectives immediately. ";
        }
        
        if (totalHabits < totalActive * 2) {
            feedback += "SYSTEM FAILURE: Your goals lack sufficient daily habits. A goal without a system is just a wish. Fix this in Strategy tab. ";
        }

        if (completedMilestones === 0) {
            feedback += "STAGNATION DETECTED: No milestones completed. You are planning, not executing. Move the needle today. ";
        } else {
            feedback += `PROGRESS NOTED: ${completedMilestones} milestones secured. Good, but don't get comfortable. What's the next kill? `;
        }

        feedback += "\n\nVERDICT: " + (completedMilestones > 0 && totalHabits > 3 ? "OPERATIONAL." : "BELOW STANDARD.");
        
        setAuditResult(feedback);
        setIsAuditing(false);
    }, 1500);
  };

  return (
    <div className="animate-fade-in space-y-12 pb-20">
      
      <div className="flex justify-between items-center mb-8 border-b border-gray-200 pb-4">
        <div>
             <h2 className="text-3xl font-serif text-notion-text">Executive Health Monitor</h2>
             <p className="text-notion-dim font-serif italic">Real-time performance telemetry.</p>
        </div>
        <div className="flex gap-2">
            <button 
                onClick={runCEOAudit}
                disabled={isAuditing}
                className="bg-black text-white px-4 py-2 rounded text-sm font-medium flex items-center gap-2 hover:opacity-80 disabled:opacity-50 shadow-lg"
            >
                {isAuditing ? "Analyzing..." : "👮 Run CEO Audit"}
            </button>
        </div>
      </div>

      {/* AUDIT MODAL / AREA */}
      {auditResult && (
          <div className="bg-red-50 border border-red-100 p-6 rounded-xl animate-in fade-in slide-in-from-top-4 mb-8">
              <div className="flex items-center gap-2 text-red-700 font-bold uppercase tracking-widest text-xs mb-2">
                  <AlertTriangle className="w-4 h-4" /> Audit Report
              </div>
              <p className="font-mono text-sm leading-relaxed text-red-900 whitespace-pre-wrap">
                  {auditResult}
              </p>
          </div>
      )}

      {/* HEALTH CARDS */}
      <div className="space-y-8">
          {activeGoals.map(goal => {
              const habits = data.habits.filter(h => h.goalId === goal.id);
              
              return (
                  <div key={goal.id} className="bg-white border border-notion-border rounded-xl shadow-sm overflow-hidden">
                      {/* Header */}
                      <div className="bg-notion-sidebar/50 p-4 border-b border-notion-border flex justify-between items-center">
                          <div>
                              <div className="text-[10px] font-bold uppercase tracking-widest text-notion-dim mb-1">{goal.type}</div>
                              <h3 className="text-xl font-serif font-medium">{goal.text}</h3>
                          </div>
                          <div className="text-xs font-mono bg-white px-2 py-1 rounded border border-gray-200 text-notion-dim">
                              {goal.metric}
                          </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2">
                          {/* Left: Timeline */}
                          <div className="p-6 border-r border-notion-border">
                              <h4 className="text-xs font-bold uppercase tracking-widest text-notion-dim mb-4 flex items-center gap-2">
                                  <Map className="w-3 h-3" /> Milestone Roadmap
                              </h4>
                              <div className="space-y-4 relative pl-2">
                                  {/* Line */}
                                  <div className="absolute left-[11px] top-2 bottom-2 w-px bg-gray-200" />
                                  
                                  {goal.milestones.length === 0 && <span className="text-xs text-gray-400 italic">No milestones defined.</span>}

                                  {goal.milestones.map((m, i) => (
                                      <div key={m.id} className="relative flex items-start gap-4">
                                          <div className={`relative z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center bg-white ${m.completed ? 'border-black text-black' : 'border-gray-300'}`}>
                                              {m.completed && <div className="w-2 h-2 bg-black rounded-full" />}
                                          </div>
                                          <div className="flex-1">
                                              <div className={`text-sm ${m.completed ? 'line-through text-gray-400' : 'text-notion-text'}`}>{m.text}</div>
                                              {m.completed && m.completedAt && (
                                                  <div className="text-[10px] text-notion-dim mt-0.5">
                                                      Completed on {new Date(m.completedAt).toLocaleDateString()}
                                                  </div>
                                              )}
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          </div>

                          {/* Right: Consistency */}
                          <div className="p-6 bg-gray-50/50">
                              <h4 className="text-xs font-bold uppercase tracking-widest text-notion-dim mb-4 flex items-center gap-2">
                                  <BarChart2 className="w-3 h-3" /> Habit Consistency
                              </h4>
                              <div className="space-y-6">
                                  {habits.map(h => (
                                      <div key={h.id}>
                                          <div className="text-xs font-medium mb-2 flex justify-between">
                                              <span>{h.text}</span>
                                          </div>
                                          <ContributionGraph data={h.contributions} colorBase={h.type === 'NON_NEGOTIABLE' ? 'bg-red-500' : 'bg-black'} />
                                      </div>
                                  ))}
                                  {habits.length === 0 && <span className="text-xs text-gray-400 italic">No habits linked to this goal.</span>}
                              </div>
                          </div>
                      </div>
                  </div>
              );
          })}
          
          {activeGoals.length === 0 && (
              <div className="text-center py-20 text-notion-dim">
                  <Target className="w-12 h-12 mx-auto mb-4 stroke-1 opacity-20" />
                  <p className="font-serif italic text-lg">No active strategies detected.</p>
              </div>
          )}
      </div>

    </div>
  );
};

export default DashboardTab;