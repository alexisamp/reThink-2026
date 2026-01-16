import React from 'react';
import { AppData, GoalStatus } from '../types';
import ContributionGraph from '../components/ContributionGraph';
import { BarChart2, Check, Target, Sparkles, Map } from '../components/Icon';

interface DashboardTabProps {
  data: AppData;
}

const DashboardTab: React.FC<DashboardTabProps> = ({ data }) => {
  const allHabits = data.habits.filter(h => h.goalId !== 'global');
  
  // Calculate Stats
  const goldDays = data.reviews.filter(r => r.dayRating === 'GOLD').length;
  const greenDays = data.reviews.filter(r => r.dayRating === 'GREEN').length;

  // Timeline Preparation
  // Group completed todos by Date
  const completedTodos = data.todos
    .filter(t => t.completed && t.completedAt)
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

  const historyByDate: {[date: string]: typeof completedTodos} = {};
  
  completedTodos.forEach(todo => {
      const dateStr = new Date(todo.completedAt!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      if (!historyByDate[dateStr]) historyByDate[dateStr] = [];
      historyByDate[dateStr].push(todo);
  });

  const dates = Object.keys(historyByDate);

  return (
    <div className="animate-fade-in space-y-12 pb-20">
      
      <div className="flex items-center gap-2 mb-6">
        <BarChart2 className="w-6 h-6" />
        <h2 className="text-2xl font-serif">Results & Metrics</h2>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-lg text-center">
            <div className="text-3xl font-bold text-yellow-800 mb-1">{goldDays}</div>
            <div className="text-xs uppercase tracking-wider text-yellow-700 flex items-center justify-center gap-1">
                <Sparkles className="w-3 h-3" /> Gold Days
            </div>
        </div>
        <div className="bg-green-50 border border-green-200 p-6 rounded-lg text-center">
            <div className="text-3xl font-bold text-green-800 mb-1">{greenDays}</div>
            <div className="text-xs uppercase tracking-wider text-green-700">Green Days</div>
        </div>
      </div>

      {/* Enhanced Timeline */}
      <section>
        <h3 className="text-sm font-bold text-notion-dim uppercase tracking-wider mb-6 border-b border-notion-border pb-2">
          Action Log
        </h3>
        
        <div className="space-y-8 pl-2">
            {dates.map(dateLabel => (
                <div key={dateLabel} className="relative border-l border-gray-200 pl-6 pb-2">
                    <div className="absolute -left-1.5 top-0 w-3 h-3 bg-gray-200 rounded-full border-2 border-white"></div>
                    <div className="text-xs font-bold text-notion-dim uppercase tracking-wider mb-3">{dateLabel}</div>
                    
                    <div className="space-y-3">
                        {historyByDate[dateLabel].map(todo => {
                            const goal = data.goals.find(g => g.id === todo.goalId);
                            const milestone = goal?.milestones?.find(m => m.id === todo.milestoneId);

                            return (
                                <div key={todo.id} className="bg-gray-50 p-3 rounded border border-gray-100">
                                    <div className="flex items-start justify-between">
                                        <div className="font-medium text-notion-text">{todo.text}</div>
                                        <Check className="w-4 h-4 text-green-600 mt-0.5" />
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-notion-dim">
                                        <span className="flex items-center gap-1">
                                            <Target className="w-3 h-3" /> {goal?.text || 'Unknown Goal'}
                                        </span>
                                        {milestone && (
                                            <span className="flex items-center gap-1 text-gray-400">
                                                <Map className="w-3 h-3" /> {milestone.text}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
            {dates.length === 0 && <p className="text-gray-400 italic pl-6">No completed actions yet.</p>}
        </div>
      </section>

      {/* Habit Heatmaps */}
      <section>
        <h3 className="text-sm font-bold text-notion-dim uppercase tracking-wider mb-6 border-b border-notion-border pb-2">
          System Consistency
        </h3>
        <div className="grid grid-cols-1 gap-6">
          {allHabits.map(habit => (
            <div key={habit.id} className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="w-48 shrink-0">
                <div className="font-medium text-sm">{habit.text}</div>
                <div className="text-xs text-notion-dim mt-1 truncate">
                  {data.goals.find(g => g.id === habit.goalId)?.text}
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                <ContributionGraph data={habit.contributions} />
              </div>
            </div>
          ))}
          {allHabits.length === 0 && <p className="text-notion-dim italic">No habits tracked yet.</p>}
        </div>
      </section>

    </div>
  );
};

export default DashboardTab;
