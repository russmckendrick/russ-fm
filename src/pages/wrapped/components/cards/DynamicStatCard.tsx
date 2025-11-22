import { StatCardData, GridSize } from '@/types/wrapped';
import { Calendar, TrendingUp, Users, Music, Clock, Hash } from 'lucide-react';
import { MonthlyHeatGrid } from './MonthlyHeatGrid';

interface DynamicStatCardProps {
  stat: StatCardData;
  size: GridSize;
  index?: number;
}

export function DynamicStatCard({ stat, size, index = 0 }: DynamicStatCardProps) {
  // Get appropriate icon based on stat type
  const getIcon = () => {
    const iconSize = size === 'extra-wide' ? 'w-6 h-6' : size === 'large' ? 'w-8 h-8' : size === 'medium' ? 'w-6 h-6' : 'w-5 h-5';
    const iconClass = `${iconSize} text-white/70`;

    switch (stat.type) {
      case 'total':
        return <Hash className={iconClass} />;
      case 'peak':
        return <TrendingUp className={iconClass} />;
      case 'average':
        return <Clock className={iconClass} />;
      case 'unique':
        return <Users className={iconClass} />;
      case 'first':
      case 'last':
        return <Calendar className={iconClass} />;
      case 'decades':
      case 'timeline':
      case 'genre':
        return <Music className={iconClass} />;
      default:
        return <Hash className={iconClass} />;
    }
  };

  // Get background gradient based on stat type - unique colors for each
  const getBackgroundGradient = () => {
    switch (stat.type) {
      case 'total':
        return 'bg-gradient-to-br from-blue-600 to-blue-800';
      case 'peak':
        return 'bg-gradient-to-br from-emerald-600 to-green-700';
      case 'average':
        return 'bg-gradient-to-br from-violet-600 to-purple-800';
      case 'unique':
        return 'bg-gradient-to-br from-orange-600 to-amber-700';
      case 'first':
        return 'bg-gradient-to-br from-indigo-600 to-blue-700';
      case 'last':
        return 'bg-gradient-to-br from-rose-600 to-pink-700';
      case 'decades':
        return 'bg-gradient-to-br from-cyan-600 to-teal-700';
      case 'timeline':
        return 'bg-gradient-to-br from-red-600 to-orange-700';
      case 'genre':
        // Dynamic colors for genre cards based on count with better distribution
        const count = typeof stat.value === 'number' ? stat.value : 0;
        if (count >= 150) {
          return 'bg-gradient-to-br from-red-600 to-rose-700'; // Hot red for very high
        } else if (count >= 100) {
          return 'bg-gradient-to-br from-orange-600 to-red-700'; // Orange-red
        } else if (count >= 75) {
          return 'bg-gradient-to-br from-amber-600 to-orange-700'; // Amber-orange
        } else if (count >= 50) {
          return 'bg-gradient-to-br from-yellow-600 to-amber-700'; // Yellow-amber
        } else if (count >= 30) {
          return 'bg-gradient-to-br from-lime-600 to-green-700'; // Lime-green
        } else if (count >= 20) {
          return 'bg-gradient-to-br from-emerald-600 to-teal-700'; // Emerald-teal
        } else if (count >= 10) {
          return 'bg-gradient-to-br from-cyan-600 to-blue-700'; // Cyan-blue
        } else {
          return 'bg-gradient-to-br from-indigo-600 to-purple-700'; // Indigo-purple for low
        }
      default:
        return 'bg-gradient-to-br from-gray-600 to-gray-800';
    }
  };

  // Format value for display
  const formatValue = () => {
    if (typeof stat.value === 'number') {
      return stat.value.toLocaleString();
    }

    // Check if it's a date format (YYYY-MM-DD)
    if (typeof stat.value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(stat.value)) {
      // Split into separate lines for better fit
      const [year, month, day] = stat.value.split('-');
      return (
        <div className="flex flex-col leading-tight">
          <span className="text-4xl font-black text-white">{year}-</span>
          <span className="text-4xl font-black text-white">{month}-{day}</span>
        </div>
      );
    }

    return stat.value;
  };

  // Get text sizes based on card size - MUCH BIGGER for 1x1 cards
  const getTextSizes = () => {
    if (size === 'extra-wide') {
      return {
        title: 'text-lg',
        value: 'text-2xl',
        subtitle: 'text-base'
      };
    } else if (size === 'large') {
      return {
        title: 'text-lg',
        value: 'text-4xl',
        subtitle: 'text-base'
      };
    } else if (size === 'medium') {
      return {
        title: 'text-base',
        value: 'text-2xl',
        subtitle: 'text-sm'
      };
    } else {
      // Small (1x1) cards - make numbers MUCH bigger
      return {
        title: 'text-sm',
        value: 'text-5xl font-black', // Much bigger and bolder
        subtitle: 'text-xs'
      };
    }
  };

  const textSizes = getTextSizes();

  const isTimelineLayout = size === 'extra-wide' && stat.type === 'timeline';

  // Use the new heat grid for timeline visualization
  if (isTimelineLayout) {
    return <MonthlyHeatGrid stat={stat} size={size} />;
  }

  return (
    <div className={`
      relative w-full rounded-lg overflow-hidden 
      ${getBackgroundGradient()}
      transition-all duration-300 hover:shadow-xl hover:scale-105
      h-full group cursor-pointer
    `}
      style={{ transform: 'translateZ(0)' }}
    >
      {/* Animated background pattern overlay */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] bg-[length:24px_24px] animate-pulse" />
      </div>

      {/* Floating particles effect for genre cards */}
      {stat.type === 'genre' && (
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-4 -left-4 w-24 h-24 bg-white/10 rounded-full blur-xl animate-float" />
          <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-white/5 rounded-full blur-2xl animate-float-delayed" />
        </div>
      )}

      {/* Special glow effect for high values */}
      {typeof stat.value === 'number' && stat.value >= 100 && (
        <div className="absolute inset-0 animate-pulse">
          <div className="absolute inset-0 bg-gradient-to-t from-white/20 via-transparent to-transparent blur-lg" />
        </div>
      )}

      {/* Content */}
      <div className="relative h-full p-3">
        {/* Standard square layout for all cards (timeline now handled separately) */}
        <div className="h-full flex flex-col justify-between">
          {/* Header with icon */}
          <div className="flex items-start justify-between">
            <div className={`font-semibold text-white/90 ${textSizes.title} leading-tight transition-all duration-300 group-hover:text-white`}>
              {stat.title}
            </div>
            <div className="transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12">
              {getIcon()}
            </div>
          </div>

          {/* Main value with animation */}
          <div className="flex-1 flex items-center justify-center">
            {typeof formatValue() === 'string' ? (
              <div className={`
                  font-bold text-white ${textSizes.value} text-center leading-none
                  transition-all duration-300 group-hover:scale-110
                  ${size === 'small' ? 'group-hover:animate-bounce-subtle' : ''}
                `}>
                {formatValue()}
              </div>
            ) : (
              <div className="transition-all duration-300 group-hover:scale-110">
                {formatValue()}
              </div>
            )}
          </div>

          {/* Subtitle if available */}
          {stat.subtitle && (
            <div className={`text-white/80 ${textSizes.subtitle} text-center leading-tight transition-all duration-300 group-hover:text-white/90`}>
              {stat.subtitle}
            </div>
          )}
        </div>
      </div>

      {/* Shimmer effect on hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />

      {/* Hover effect overlay */}
      <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </div>
  );
}