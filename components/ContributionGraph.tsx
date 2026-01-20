import React, { useMemo } from 'react';
import { ContributionMap } from '../types';

interface ContributionGraphProps {
  data: ContributionMap;
  frequency?: 'DAILY' | 'WEEKLY';
  year?: string;
}

const ContributionGraph: React.FC<ContributionGraphProps> = ({ 
  data, 
  frequency = 'DAILY',
  year = new Date().getFullYear().toString() 
}) => {
  
  // Helper: Get week number
  const getWeekNumber = (d: Date) => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  // --- WEEKLY VIEW (52 Blocks in a row) ---
  if (frequency === 'WEEKLY') {
    const weeks = useMemo(() => {
        const w = [];
        const currentYear = parseInt(year);
        // Generate 52 weeks
        for (let i = 1; i <= 52; i++) {
            // Check if any contribution exists in this week
            // This is an approximation since data keys are YYYY-MM-DD. 
            // Realistically, we scan the data keys to see if they fall in week i.
            let filled = false;
            Object.keys(data).forEach(key => {
                const d = new Date(key);
                if(d.getFullYear() === currentYear && getWeekNumber(d) === i && data[key] > 0) {
                    filled = true;
                }
            });
            w.push({ week: i, filled });
        }
        return w;
    }, [data, year]);

    return (
        <div className="flex gap-[2px] w-full">
            {weeks.map((w) => (
                <div 
                    key={w.week}
                    title={`Week ${w.week}`}
                    className={`h-4 flex-1 rounded-[1px] ${w.filled ? 'bg-black' : 'bg-gray-100'}`}
                />
            ))}
        </div>
    );
  }

  // --- DAILY VIEW (365 Blocks Grid) ---
  // We want a full year grid, columns are weeks, rows are days (Mon-Sun or Sun-Sat)
  const fullYearData = useMemo(() => {
      const days = [];
      const startOfYear = new Date(parseInt(year), 0, 1);
      const endOfYear = new Date(parseInt(year), 11, 31);
      
      // Align start to the previous Monday to keep grid clean
      const startDate = new Date(startOfYear);
      const day = startDate.getDay();
      const diff = startDate.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
      startDate.setDate(diff);

      const loopDate = new Date(startDate);
      
      while (loopDate <= endOfYear || days.length % 7 !== 0) {
          const key = loopDate.toISOString().split('T')[0];
          days.push({
              key,
              value: data[key] || 0,
              inYear: loopDate.getFullYear() === parseInt(year)
          });
          loopDate.setDate(loopDate.getDate() + 1);
      }
      return days;
  }, [data, year]);

  // Group into weeks (columns)
  const weeks = useMemo(() => {
      const w = [];
      for (let i = 0; i < fullYearData.length; i += 7) {
          w.push(fullYearData.slice(i, i + 7));
      }
      return w;
  }, [fullYearData]);

  return (
    <div className="flex flex-col gap-1 w-full overflow-hidden">
      <div className="flex gap-[2px]">
        {weeks.map((week, i) => (
          <div key={i} className="flex flex-col gap-[2px] flex-1">
            {week.map((day) => (
              <div
                key={day.key}
                title={`${day.key}: ${day.value}`}
                className={`w-full aspect-square rounded-[1px] ${
                   !day.inYear 
                    ? 'opacity-0' 
                    : day.value > 0 ? 'bg-black' : 'bg-gray-100'
                }`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ContributionGraph;