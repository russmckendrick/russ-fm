import { StatCardData, GridSize } from '@/types/wrapped';
import { Calendar } from 'lucide-react';
import { useState } from 'react';

interface MonthlyHeatGridProps {
  stat: StatCardData;
  size: GridSize;
}

export function MonthlyHeatGrid({ stat }: MonthlyHeatGridProps) {
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const timelineData = stat.data as Array<{ month: string; count: number; releases: Array<{ date_added: string; release_name: string; release_artist: string }> }>;
  
  if (!timelineData || !Array.isArray(timelineData)) {
    return null;
  }

  // Extract the year from the stat data
  const year = new Date(timelineData[0]?.releases[0]?.date_added || new Date()).getFullYear();
  
  // Create maps for daily data
  const dailyCounts = new Map<string, number>();
  const dailyReleases = new Map<string, Array<{ name: string; artist: string }>>();
  let maxDailyCount = 0;
  
  timelineData.forEach(monthData => {
    if (monthData.releases && Array.isArray(monthData.releases)) {
      monthData.releases.forEach(release => {
        const date = release.date_added.split('T')[0]; // Get YYYY-MM-DD
        const count = (dailyCounts.get(date) || 0) + 1;
        dailyCounts.set(date, count);
        maxDailyCount = Math.max(maxDailyCount, count);
        
        // Store release details
        if (!dailyReleases.has(date)) {
          dailyReleases.set(date, []);
        }
        dailyReleases.get(date)!.push({
          name: release.release_name,
          artist: release.release_artist
        });
      });
    }
  });

  const totalCount = timelineData.reduce((sum, m) => sum + m.count, 0);

  // Get the first day of the year and calculate the offset
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const startDayOfWeek = yearStart.getDay();
  
  // Generate grid data based on actual calendar
  const gridData: Array<{ date: string; count: number; dayOfWeek: number }[]> = [];
  let currentWeek: Array<{ date: string; count: number; dayOfWeek: number }> = [];
  
  // Add empty cells for the beginning of the first week
  for (let i = 0; i < startDayOfWeek; i++) {
    currentWeek.push({ date: '', count: 0, dayOfWeek: i });
  }
  
  // Fill in all days of the year
  const currentDate = new Date(yearStart);
  while (currentDate <= yearEnd) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const dayCount = dailyCounts.get(dateStr) || 0;
    
    currentWeek.push({
      date: dateStr,
      count: dayCount,
      dayOfWeek: currentDate.getDay()
    });
    
    // Start new week on Sunday
    if (currentDate.getDay() === 6) {
      gridData.push(currentWeek);
      currentWeek = [];
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  // Add the last week if it has any days
  if (currentWeek.length > 0) {
    // Pad the last week
    while (currentWeek.length < 7) {
      currentWeek.push({ date: '', count: 0, dayOfWeek: currentWeek.length });
    }
    gridData.push(currentWeek);
  }

  // GitHub color levels
  const getLevel = (count: number) => {
    if (count === 0) return 0;
    if (count === 1) return 1;
    if (count === 2) return 2;
    if (count === 3) return 3;
    return 4;
  };

  // GitHub-style color scheme with light/dark mode support
  const getLevelColor = (level: number) => {
    switch (level) {
      case 0: return 'bg-gray-200 dark:bg-gray-800';
      case 1: return 'bg-emerald-200 dark:bg-emerald-900/80';
      case 2: return 'bg-emerald-400 dark:bg-emerald-700/80';
      case 3: return 'bg-emerald-600 dark:bg-emerald-600/80';
      case 4: return 'bg-emerald-800 dark:bg-emerald-500';
      default: return 'bg-gray-200 dark:bg-gray-800';
    }
  };

  // Track which months we've already shown
  const shownMonths = new Set<string>();
  
  // Month labels - only show at the start of each month
  const getMonthLabel = (weekIndex: number) => {
    if (weekIndex >= gridData.length) return '';
    const week = gridData[weekIndex];
    for (const day of week) {
      if (day.date) {
        const date = new Date(day.date);
        const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
        if (!shownMonths.has(monthKey)) {
          shownMonths.add(monthKey);
          return date.toLocaleDateString('en-US', { month: 'short' });
        }
      }
    }
    return '';
  };

  const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

  return (
    <>
      {/* Tooltip rendered outside the main container */}
      {hoveredDate && (
        <div 
          className="fixed px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-xs rounded-lg pointer-events-none shadow-xl"
          style={{
            left: '50%',
            top: '200px',
            transform: 'translateX(-50%)',
            zIndex: 99999
          }}
        >
          <div className="font-semibold mb-1">
            {new Date(hoveredDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
          <div className="text-gray-700 dark:text-gray-300 mb-1">
            {dailyCounts.get(hoveredDate) || 0} {(dailyCounts.get(hoveredDate) || 0) === 1 ? 'addition' : 'additions'}
          </div>
          {dailyReleases.get(hoveredDate) && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-1 mt-1 space-y-1">
              {dailyReleases.get(hoveredDate)!.slice(0, 5).map((release, idx) => (
                <div key={idx} className="text-[11px]">
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">{release.name}</span>
                  <span className="text-gray-500 dark:text-gray-400"> by </span>
                  <span className="text-gray-700 dark:text-gray-300">{release.artist}</span>
                </div>
              ))}
              {dailyReleases.get(hoveredDate)!.length > 5 && (
                <div className="text-[11px] text-gray-500">...and {dailyReleases.get(hoveredDate)!.length - 5} more</div>
              )}
            </div>
          )}
        </div>
      )}
      
      <div className="relative w-full h-full rounded-lg bg-gray-100 dark:bg-gray-950 p-4 overflow-visible">
        <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-4 h-4 text-gray-600 dark:text-gray-500" />
          <h3 className="text-sm font-medium text-gray-800 dark:text-gray-300">
            {totalCount} additions in {year}
          </h3>
        </div>

        {/* GitHub-style contribution graph */}
        <div className="flex-1 flex justify-center items-center py-2 overflow-visible">
          <div className="w-full max-w-full overflow-visible">
            <div className="flex gap-[2px] overflow-visible">
              {/* Day labels */}
              <div className="flex flex-col justify-around text-[10px] text-gray-600 dark:text-gray-500 pr-2 w-8">
                {dayLabels.map((day, i) => (
                  <span key={i} className="h-[15px] flex items-center">{day}</span>
                ))}
              </div>

              {/* Grid container */}
              <div className="flex-1 overflow-x-auto overflow-y-visible scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                <div className="inline-flex flex-col gap-[2px] overflow-visible">
                  {/* Month labels */}
                  <div className="flex text-[10px] text-gray-600 dark:text-gray-500 h-5 mb-1">
                    {gridData.map((_, weekIndex) => {
                      const label = getMonthLabel(weekIndex);
                      return (
                        <div key={weekIndex} className="w-[13px] mr-[2px]">
                          {label && <span className="block -ml-4">{label}</span>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Contribution grid */}
                  <div className="flex gap-[2px] overflow-visible">
                    {gridData.map((week, weekIndex) => (
                      <div key={weekIndex} className="flex flex-col gap-[2px] overflow-visible">
                        {week.map((day, dayIndex) => {
                          const level = getLevel(day.count);
                          const isHovered = hoveredDate === day.date;
                          
                          return (
                            <div
                              key={`${weekIndex}-${dayIndex}`}
                              data-date={day.date}
                              onMouseEnter={() => day.date && setHoveredDate(day.date)}
                              onMouseLeave={() => setHoveredDate(null)}
                              className={`
                                w-[13px] h-[15px] rounded-sm relative
                                ${day.date ? 'cursor-pointer' : ''}
                                ${getLevelColor(level)}
                                ${isHovered ? 'ring-1 ring-gray-600 dark:ring-gray-400' : ''}
                                transition-all duration-150
                              `}
                            >
                            </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 mt-4 text-[11px] text-gray-600 dark:text-gray-500">
          <span>Less</span>
          <div className="flex gap-[2px]">
            {[0, 1, 2, 3, 4].map((level) => (
              <div
                key={level}
                className={`w-[13px] h-[15px] rounded-sm ${getLevelColor(level)}`}
              />
            ))}
          </div>
          <span>More</span>
        </div>

        {/* Stats */}
        <div className="mt-3 text-[11px] text-gray-700 dark:text-gray-600">
          Most active: {maxDailyCount} additions in a single day
        </div>

      </div>
    </div>
    </>
  );
}
