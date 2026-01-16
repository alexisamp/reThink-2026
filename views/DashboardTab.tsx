import React from 'react';
import { AppData, GoalStatus } from '../types';
import ContributionGraph from '../components/ContributionGraph';
import { BarChart2, Check, Target, Sparkles } from '../components/Icon';

interface DashboardTabProps {
  data: AppData;
}

const DashboardTab: React.FC<DashboardTabProps> = ({ data }) => {
  const allHabits = data.habits.filter(h => h.goalId !== 'global');
  
  // Calculate "Day Ratings" distribution
  const goldDays = data.reviews.filter(r => r.dayRating === 'GOLD').length;
  const greenDays = data.reviews.filter(r => r.dayRating === 'GREEN').length;

  // Timeline: Combine completed Goals and Todos
  const timelineItems = [
      ...data.goals.filter(g => g.status === GoalStatus.COMPLETED).map(g => ({...g, type: 'GOAL', date: g.completedAt || 0})),
      ...data.todos.filter(t => t.completed && t.completedAt).map(t => ({...t, type: 'TODO', date: t.completedAt || 0}))
  ].sort((a, b) => b.date - a.date).slice(0, 20); // Last 20 items

  return (
    <div className="animate-fade-in space-y-12 pb-20">
      
      <div className="flex items-center gap-2 mb-6">
        <BarChart2 className="w-6 h-6" />
        <h2 className="text-2xl font-serif">Results & Metrics</h2>
      </div>

      {/* High Level Stats */}
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

      {/* Habit Heatmaps */}
      <section>
        <h3 className="text-sm font-bold text-notion-dim uppercase tracking-wider mb-6 border-b border-notion-border pb-2">
          Habit Consistency
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

      {/* Timeline of Achievements */}
      <section>
        <h3 className="text-sm font-bold text-notion-dim uppercase tracking-wider mb-6 border-b border-notion-border pb-2">
          Timeline of Wins
        </h3>
        <div className="relative border-l border-notion-border ml-3 space-y-6">
            {timelineItems.map((item, idx) => (
                <div key={idx} className="pl-6 relative">
                    <div className={`absolute -left-1.5 top-1.5 w-3 h-3 rounded-full border-2 border-white ${item.type === 'GOAL' ? 'bg-black' : 'bg-notion-dim'}`}></div>
                    <div className="text-xs text-notion-dim mb-1 font-mono">
                        {new Date(item.date).toLocaleDateString()}
                    </div>
                    <div className={`text-sm ${item.type === 'GOAL' ? 'font-bold text-lg' : 'text-notion-text'}`}>
                        {item.type === 'GOAL' && <Target className="inline w-4 h-4 mr-2" />}
                        {item.text}
                    </div>
                </div>
            ))}
            {timelineItems.length === 0 && (
                <div className="pl-6 text-notion-dim italic">Complete tasks and goals to see your history here.</div>
            )}
        </div>
      </section>

    </div>
  );
};

export default DashboardTab;
