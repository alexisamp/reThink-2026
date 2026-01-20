import React, { useMemo, useState } from 'react';
import { AppData, GoalStatus, HabitType } from '../types';
import ContributionGraph from '../components/ContributionGraph';
import { Target, Map, BarChart2, Share2, Award, Zap, Check, Clock, Brain, Layout, CheckSquare } from '../components/Icon';

interface DashboardTabProps {
  data: AppData;
}

const DashboardTab: React.FC<DashboardTabProps> = ({ data }) => {
  const [filter, setFilter] = useState<string>('ALL'); // 'ALL' or goalId
  const activeGoals = data.goals.filter(g => g.status === GoalStatus.ACTIVE);
  const currentYear = new Date().getFullYear().toString();

  // --- 1. CORE STATS CALCULATION ---
  const stats = useMemo(() => {
      const allHabits = data.habits.filter(h => {
        const goal = data.goals.find(g => g.id === h.goalId);
        return goal?.status === GoalStatus.ACTIVE;
      });

      let totalReps = 0;
      let totalOpportunities = 0; 
      let perfectDays = 0;
      let currentStreak = 0;

      // Filter habits if specific goal selected
      const filteredHabits = filter === 'ALL' ? allHabits : allHabits.filter(h => h.goalId === filter);

      // Total Reps
      filteredHabits.forEach(h => {
          totalReps += (Object.values(h.contributions) as number[]).filter(v => v > 0).length;
      });

      // Consistency (Last 30 days)
      const today = new Date();
      for(let i=0; i<30; i++) {
          const d = new Date();
          d.setDate(today.getDate() - i);
          const key = d.toISOString().split('T')[0];
          
          let dayHits = 0;
          let dayHabits = 0;
          
          filteredHabits.forEach(h => {
              if (h.frequency === 'DAILY') {
                  dayHabits++;
                  if ((h.contributions[key] || 0) > 0) dayHits++;
              }
          });

          if (dayHabits > 0) {
              totalOpportunities += dayHabits;
              if (dayHits === dayHabits) perfectDays++;
          }
      }
      
      const winRate = totalOpportunities > 0 ? Math.round((totalReps / (totalOpportunities * 3)) * 100) : 0; 

      // Global Streak (Based on filtered habits)
      if (filteredHabits.length > 0) {
        let streakDate = new Date();
        streakDate.setHours(0,0,0,0);
        
        const todayKey = streakDate.toISOString().split('T')[0];
        const todayHasActivity = filteredHabits.some(h => (h.contributions[todayKey] || 0) > 0);
        
        if (!todayHasActivity) {
            streakDate.setDate(streakDate.getDate() - 1);
        }

        while (true) {
            const key = streakDate.toISOString().split('T')[0];
            const hasActivity = filteredHabits.some(h => (h.contributions[key] || 0) > 0);
            if (hasActivity) {
                currentStreak++;
                streakDate.setDate(streakDate.getDate() - 1);
            } else {
                break;
            }
        }
      }

      return { totalReps, winRate, currentStreak, perfectDays };
  }, [data, filter]);


  // --- 2. EXECUTION ANALYTICS (Tasks Data) ---
  const analytics = useMemo(() => {
    const relevantTodos = data.todos.filter(t => {
        if (filter === 'ALL') return true;
        return t.goalId === filter;
    });

    // A. Peak Performance (Hourly Heatmap)
    const hourlyCounts = new Array(24).fill(0);
    relevantTodos.forEach(t => {
        if (t.completed && t.completedAt) {
            const hour = new Date(t.completedAt).getHours();
            hourlyCounts[hour]++;
        }
    });
    const maxHourCount = Math.max(...hourlyCounts, 1); // Avoid div by zero

    // B. Say/Do Ratio (Planned vs Done)
    // We count all tasks. Completed vs Total.
    const totalTasks = relevantTodos.length;
    const completedTasks = relevantTodos.filter(t => t.completed).length;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // C. Deep Work Ratio
    const completedList = relevantTodos.filter(t => t.completed);
    const deepCount = completedList.filter(t => t.effort === 'DEEP').length;
    const shallowCount = completedList.length - deepCount;
    const deepRatio = completedList.length > 0 ? Math.round((deepCount / completedList.length) * 100) : 0;

    return { hourlyCounts, maxHourCount, completionRate, totalTasks, completedTasks, deepRatio, deepCount, shallowCount };
  }, [data.todos, filter]);


  return (
    <div className="animate-fade-in pb-20 max-w-4xl mx-auto">
      
      {/* --- HEADER --- */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 border-b border-black pb-6 gap-6">
          <div>
            <h1 className="text-4xl font-serif font-bold text-black mb-1">Performance</h1>
            <p className="text-notion-dim font-serif italic text-sm">Year-to-Date • {currentYear}</p>
          </div>
          
          {/* TABS */}
          <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0 hide-scrollbar">
              <button 
                  onClick={() => setFilter('ALL')}
                  className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${filter === 'ALL' ? 'bg-black text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              >
                  All Focus
              </button>
              {activeGoals.map((g, i) => (
                  <button 
                    key={g.id}
                    onClick={() => setFilter(g.id)}
                    className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${filter === g.id ? 'bg-black text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                    Goal {i+1}
                </button>
              ))}
          </div>
      </div>

      {/* --- STATS ROW (NYT Style) --- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="text-center">
              <div className="text-4xl md:text-5xl font-serif font-bold text-black mb-2">{stats.totalReps}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-notion-dim">Total Reps</div>
          </div>
          <div className="text-center">
              <div className="text-4xl md:text-5xl font-serif font-bold text-black mb-2">{stats.winRate}%</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-notion-dim">Consistency</div>
          </div>
          <div className="text-center">
              <div className="text-4xl md:text-5xl font-serif font-bold text-black mb-2">{stats.currentStreak}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-notion-dim">Day Streak</div>
          </div>
          <div className="text-center">
              <div className="text-4xl md:text-5xl font-serif font-bold text-black mb-2">{stats.perfectDays}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-notion-dim">Perfect Days</div>
          </div>
      </div>

      {/* --- NEW SECTION: EXECUTION PROTOCOL --- */}
      <div className="mb-16 grid md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-6 duration-700">
          
          {/* 1. Peak Performance Window */}
          <div className="bg-notion-sidebar border border-notion-border p-6 rounded-xl flex flex-col justify-between">
              <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-4 h-4 text-notion-dim" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-notion-dim">Productivity Window</span>
              </div>
              <div className="flex items-end gap-[2px] h-24 w-full">
                  {analytics.hourlyCounts.map((count, h) => {
                      const heightPct = (count / analytics.maxHourCount) * 100;
                      return (
                          <div key={h} className="flex-1 flex flex-col items-center group relative">
                              <div 
                                className={`w-full rounded-t-[1px] transition-all duration-500 ${count > 0 ? 'bg-black' : 'bg-gray-200'}`} 
                                style={{ height: `${Math.max(heightPct, 5)}%` }}
                              />
                              {/* Tooltip on hover */}
                              <div className="absolute -top-8 bg-black text-white text-[9px] px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap">
                                  {h}:00 - {count} tasks
                              </div>
                          </div>
                      );
                  })}
              </div>
              <div className="flex justify-between text-[9px] text-notion-dim mt-2 font-mono uppercase">
                  <span>12am</span>
                  <span>6am</span>
                  <span>12pm</span>
                  <span>6pm</span>
              </div>
          </div>

          {/* 2. Say/Do Ratio */}
          <div className="bg-notion-sidebar border border-notion-border p-6 rounded-xl flex flex-col justify-between">
              <div className="flex items-center gap-2 mb-2">
                  <CheckSquare className="w-4 h-4 text-notion-dim" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-notion-dim">Execution Rate</span>
              </div>
              <div>
                  <div className="text-3xl font-serif font-bold mb-1">{analytics.completionRate}%</div>
                  <div className="text-xs text-notion-dim mb-4">
                      You've completed <strong>{analytics.completedTasks}</strong> of <strong>{analytics.totalTasks}</strong> planned tasks.
                  </div>
                  <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-black transition-all duration-1000" style={{ width: `${analytics.completionRate}%` }} />
                  </div>
              </div>
          </div>

          {/* 3. Deep Work Ratio */}
          <div className="bg-notion-sidebar border border-notion-border p-6 rounded-xl flex flex-col justify-between">
              <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-4 h-4 text-notion-dim" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-notion-dim">Deep Work Ratio</span>
              </div>
              <div>
                  <div className="text-3xl font-serif font-bold mb-1">{analytics.deepRatio}%</div>
                  <div className="text-xs text-notion-dim mb-4">
                     <strong>{analytics.deepCount}</strong> Deep vs <strong>{analytics.shallowCount}</strong> Shallow tasks.
                  </div>
                  <div className="flex h-2 w-full rounded-full overflow-hidden">
                      <div className="h-full bg-black transition-all duration-1000" style={{ width: `${analytics.deepRatio}%` }} />
                      <div className="h-full bg-gray-300 transition-all duration-1000" style={{ width: `${100 - analytics.deepRatio}%` }} />
                  </div>
              </div>
          </div>

      </div>

      {/* --- GOAL CARDS --- */}
      <div className="space-y-12">
          {activeGoals
            .filter(g => filter === 'ALL' || g.id === filter)
            .map((goal, index) => {
              const habits = data.habits.filter(h => h.goalId === goal.id);
              const totalMilestones = goal.milestones.length;
              const completedMilestones = goal.milestones.filter(m => m.completed).length;
              const nextMilestone = goal.milestones.find(m => !m.completed);

              // Correct Index for Display if filtered
              const displayIndex = filter === 'ALL' ? index + 1 : activeGoals.findIndex(g => g.id === goal.id) + 1;

              return (
                  <div key={goal.id} className="bg-white border border-notion-border rounded-xl p-8 shadow-sm animate-in fade-in slide-in-from-bottom-8">
                      
                      {/* Card Header */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b border-gray-100 pb-6">
                          <div>
                              <div className="flex items-center gap-2 mb-2">
                                  <span className="text-[10px] font-bold uppercase tracking-widest bg-black text-white px-2 py-0.5 rounded">
                                      Goal {displayIndex}
                                  </span>
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-notion-dim">
                                      {goal.metric}
                                  </span>
                              </div>
                              <h3 className="text-2xl font-serif font-bold text-notion-text">{goal.text}</h3>
                          </div>
                          
                          {/* Mini Progress */}
                          <div className="text-right">
                              <div className="text-3xl font-serif font-bold text-black">
                                  {completedMilestones}<span className="text-gray-300">/</span>{totalMilestones}
                              </div>
                              <div className="text-[10px] font-bold uppercase tracking-widest text-notion-dim">Milestones</div>
                          </div>
                      </div>

                      {/* Content Grid */}
                      <div className="grid lg:grid-cols-3 gap-10">
                          
                          {/* Left: Habits (The Grind) */}
                          <div className="lg:col-span-2 space-y-8">
                              <h4 className="text-xs font-bold uppercase tracking-widest text-notion-dim mb-4 flex items-center gap-2">
                                  <Zap className="w-4 h-4" /> System Consistency
                              </h4>
                              
                              {habits.length === 0 && (
                                  <div className="p-4 bg-gray-50 border border-gray-100 rounded text-center text-sm text-gray-400 italic">
                                      No habits defined yet.
                                  </div>
                              )}

                              {habits.map(h => (
                                  <div key={h.id}>
                                      <div className="flex justify-between items-end mb-2">
                                          <span className="text-sm font-bold text-notion-text">{h.text}</span>
                                          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                              {h.frequency || 'DAILY'}
                                          </span>
                                      </div>
                                      <ContributionGraph 
                                        data={h.contributions} 
                                        frequency={h.frequency} 
                                        year={currentYear}
                                      />
                                  </div>
                              ))}
                          </div>

                          {/* Right: Milestones (The Badges) */}
                          <div className="lg:col-span-1 border-l border-gray-100 pl-0 lg:pl-10">
                               <h4 className="text-xs font-bold uppercase tracking-widest text-notion-dim mb-6 flex items-center gap-2">
                                  <Award className="w-4 h-4" /> Badge Progress
                               </h4>
                               
                               <div className="relative space-y-0">
                                   {/* Vertical Line */}
                                   <div className="absolute left-[15px] top-2 bottom-4 w-px bg-gray-200"></div>

                                   {goal.milestones.map((m, i) => {
                                       const isNext = nextMilestone?.id === m.id;
                                       return (
                                           <div key={m.id} className={`relative flex gap-4 pb-8 group ${m.completed ? 'opacity-50' : 'opacity-100'}`}>
                                               {/* Dot */}
                                               <div className={`relative z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center bg-white transition-colors ${
                                                   m.completed ? 'border-black bg-black text-white' : 
                                                   isNext ? 'border-black animate-pulse' : 'border-gray-200'
                                               }`}>
                                                   {m.completed ? <Check className="w-4 h-4" /> : <span className="text-[10px] font-bold text-gray-400">{i+1}</span>}
                                               </div>
                                               
                                               <div className="flex-1 pt-1">
                                                   <div className="flex justify-between items-start">
                                                       <span className={`text-sm font-medium ${m.completed ? 'line-through' : ''}`}>
                                                           {m.text}
                                                       </span>
                                                       {m.targetMonth && (
                                                           <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                                               m.completed ? 'bg-gray-100 text-gray-500' : 'bg-black text-white'
                                                           }`}>
                                                               {m.targetMonth}
                                                           </span>
                                                       )}
                                                   </div>
                                                   {m.completed && m.completedAt && (
                                                       <div className="text-[10px] text-gray-400 mt-1">
                                                           Completed {new Date(m.completedAt).toLocaleDateString()}
                                                       </div>
                                                   )}
                                               </div>
                                           </div>
                                       );
                                   })}
                                   {goal.milestones.length === 0 && <div className="text-xs text-gray-400 italic pl-10">No milestones set.</div>}
                               </div>
                          </div>
                      </div>

                  </div>
              );
          })}

          {activeGoals.length === 0 && (
             <div className="text-center py-24 bg-notion-sidebar rounded-xl border border-notion-border border-dashed">
                 <Target className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                 <p className="font-serif italic text-gray-400">Define your Strategy to see performance data.</p>
             </div>
          )}
      </div>

    </div>
  );
};

export default DashboardTab;