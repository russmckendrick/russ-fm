import { memo } from 'react';
import { Music, Music2, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface PlayerToggleProps {
  isVisible: boolean;
  onToggle: (visible: boolean) => void;
  availableServices: ('spotify' | 'apple_music' | 'youtube')[];
  className?: string;
  compact?: boolean;
}

/**
 * Toggle component for controlling music player visibility
 * Provides accessible controls with clear visual indicators
 */
export const PlayerToggle = memo(function PlayerToggle({
  isVisible,
  onToggle,
  availableServices,
  className,
  compact = false
}: PlayerToggleProps) {
  const hasSpotify = availableServices.includes('spotify');
  const hasAppleMusic = availableServices.includes('apple_music');
  const hasYouTube = availableServices.includes('youtube');
  const hasAnyService = hasSpotify || hasAppleMusic || hasYouTube;

  if (!hasAnyService) {
    return null;
  }

  const names = [hasAppleMusic && 'Apple Music', hasSpotify && 'Spotify', hasYouTube && 'YouTube'].filter(Boolean) as string[];
  const serviceText = names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}` : names[0] ?? '';

  const ariaLabel = isVisible
    ? `Hide ${serviceText} player${availableServices.length > 1 ? 's' : ''}`
    : `Show ${serviceText} player${availableServices.length > 1 ? 's' : ''}`;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onToggle(!isVisible)}
              className={className}
              aria-label={ariaLabel}
              aria-pressed={isVisible}
            >
              {isVisible ? (
                <X className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Music className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{ariaLabel}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="flex items-center gap-2 flex-1">
        <div className="flex items-center gap-1">
          {hasSpotify && (
            <Music className="h-4 w-4 text-green-600 dark:text-green-400" aria-hidden="true" />
          )}
          {hasAppleMusic && (
            <Music2 className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden="true" />
          )}
        </div>
        <span className="text-sm font-medium">
          {serviceText} Player{availableServices.length > 1 ? 's' : ''}
        </span>
      </div>
      <Switch
        checked={isVisible}
        onCheckedChange={onToggle}
        aria-label={ariaLabel}
        className="data-[state=checked]:bg-primary"
      />
    </div>
  );
});

/**
 * Standalone toggle button variant for header/navigation use
 */
export const PlayerToggleButton = memo(function PlayerToggleButton({
  isVisible,
  onToggle,
  availableServices,
  className
}: Omit<PlayerToggleProps, 'compact'>) {
  const hasAnyService = availableServices.length > 0;

  if (!hasAnyService) {
    return null;
  }

  const label = isVisible ? 'Hide Players' : 'Show Players';
  const Icon = isVisible ? X : Music;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => onToggle(!isVisible)}
      className={cn('gap-2', className)}
      aria-label={`${label} (${availableServices.join(' & ')})`}
      aria-pressed={isVisible}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
      {availableServices.length > 1 && (
        <span 
          className="ml-1 text-xs text-muted-foreground"
          aria-hidden="true"
        >
          ({availableServices.length})
        </span>
      )}
    </Button>
  );
});