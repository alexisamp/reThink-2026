import React, { useMemo } from 'react';
import { ContributionMap } from '../types';

interface ContributionGraphProps {
  data: ContributionMap;
  colorBase?: string; // e.g. 'bg-black' or 'bg-red-500'
}

const ContributionGraph: React.FC<ContributionGraphProps> = ({ data, colorBase = 'bg-black' }) => {
  // Generate last 100 days for the visual (Strategy View)
  const days = useMemo(() => {
    const d = [];
    const today = new Date();
    // 14 weeks approx
    for (let i = 90; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const key = date.toISOString().split('T')[0];
      d.push({
        key,
        date,
        value: data[key] || 0
      });
    }
    return d;
  }, [data]);

  // Group by weeks for the grid layout
  const weeks = useMemo(() => {
    const w = [];
    let currentWeek: typeof days = [];
    
    days.forEach((day) => {
      if (day.date.getDay() === 0 && currentWeek.length > 0) {
        w.push(currentWeek);
        currentWeek = [];
      }
      currentWeek.push(day);
    });
    if (currentWeek.length > 0) w.push(currentWeek);
    return w;
  }, [days]);

  const getOpacity = (value: number) => {
    if (value === 0) return 'opacity-100 bg-notion-sidebar'; // Empty
    if (value >= 5) return 'opacity-100';
    if (value === 4) return 'opacity-80';
    if (value === 3) return 'opacity-60';
    if (value === 2) return 'opacity-40';
    return 'opacity-20'; // Value 1
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1 overflow-x-auto hide-scrollbar pb-2">
        {weeks.map((week, wIndex) => (
          <div key={wIndex} className="flex flex-col gap-1">
            {week.map((day) => (
              <div
                key={day.key}
                title={`${day.key}: ${day.value}`}
                className={`w-2.5 h-2.5 rounded-[2px] transition-all duration-200 ${
                  day.value > 0 ? colorBase : 'bg-notion-sidebar'
                } ${day.value > 0 ? getOpacity(day.value) : ''}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ContributionGraph;
