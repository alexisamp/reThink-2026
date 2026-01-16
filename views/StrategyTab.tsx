import React from 'react';
import { AppData, GoalStatus } from '../types';
import ContributionGraph from '../components/ContributionGraph';
import { Layout, ChevronRight, Trash2 } from '../components/Icon';

interface StrategyTabProps {
  data: AppData;
  onPromoteGoal: (id: string) => void;
  onDeleteGoal: (id: string) => void;
}

const StrategyTab: React.FC<StrategyTabProps> = ({ data, onPromoteGoal, onDeleteGoal }) => {
  const backlogGoals = data.goals.filter(g => g.status === GoalStatus.BACKLOG);
  const allHabits = data.habits.filter(h => h.goalId !== 'global'); // Exclude non-negotiables for this view usually

  return (
    <div className="space-y-12 animate-fade-in">
      <div className="flex items-center gap-2 mb-6">
        <Layout className="w-5 h-5" />
        <h2 className="text-xl font-medium">Strategy & Momentum</h2>
      </div>

      {/* Consistency View */}
      <section>
        <h3 className="text-sm font-bold text-notion-dim uppercase tracking-wider mb-6 border-b border-notion-border pb-2">
          Habit Consistency (Last 90 Days)
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
          {allHabits.length === 0 && (
             <p className="text-sm text-notion-dim">No habits to display yet.</p>
          )}
        </div>
      </section>

      {/* Backlog */}
      <section>
        <h3 className="text-sm font-bold text-notion-dim uppercase tracking-wider mb-6 border-b border-notion-border pb-2">
          Goal Backlog
        </h3>
        {backlogGoals.length === 0 ? (
          <p className="text-sm text-notion-dim italic">
            Your backlog is empty. Add goals in the Focus tab (limit 3 active) to populate this.
          </p>
        ) : (
          <div className="space-y-3">
            {backlogGoals.map(goal => (
              <div key={goal.id} className="group flex justify-between items-center p-4 border border-notion-border rounded bg-white hover:bg-notion-sidebar transition-colors">
                <span className="text-sm font-medium">{goal.text}</span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => onPromoteGoal(goal.id)}
                    className="flex items-center gap-1 px-3 py-1 bg-white border border-notion-border rounded text-xs hover:border-black transition-colors"
                  >
                    Promote <ChevronRight className="w-3 h-3" />
                  </button>
                  <button 
                    onClick={() => onDeleteGoal(goal.id)}
                    className="p-1 text-notion-dim hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default StrategyTab;
