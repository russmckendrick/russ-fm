import { useEffect, useRef, useState } from 'react';
import { X, Search, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMobileSearch } from '@/hooks/useSearch';
import { SearchResults } from './SearchResults';

interface MobileSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileSearchModal({ 
  isOpen, 
  onClose
}: MobileSearchModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [touchStart, setTouchStart] = useState(0);
  const modalRef = useRef<HTMLDivElement>(null);
  const [localSearchTerm, setLocalSearchTerm] = useState('');

  // Use search hook for Fuse.js powered search
  const {
    setQuery,
    results, 
    isLoading, 
    isIndexing, 
    error 
  } = useMobileSearch();

  // Clear search when modal closes
  useEffect(() => {
    if (!isOpen) {
      setLocalSearchTerm('');
      setQuery('');
    }
  }, [isOpen, setQuery]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Delay to ensure modal animation completes (200ms) plus small buffer
      const timeoutId = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          // On iOS, sometimes we need to trigger the keyboard explicitly
          if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
            inputRef.current.click();
          }
        }
      }, 250);
      
      return () => clearTimeout(timeoutId);
    }
  }, [isOpen]);

  // Minimal focus management - only for cases where focus is completely lost
  useEffect(() => {
    if (!isOpen) return;

    const handleVisibilityChange = () => {
      // Refocus when returning to the page
      if (!document.hidden && isOpen && inputRef.current) {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isOpen]);

  // Handle swipe down to close
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEnd = e.changedTouches[0].clientY;
    const swipeDistance = touchEnd - touchStart;
    
    // If swiped down more than 50px, close modal
    if (swipeDistance > 50) {
      onClose();
    }
  };

  // Handle back button on Android
  useEffect(() => {
    if (!isOpen) return;

    const handlePopState = () => {
      onClose();
    };

    // Push a new state when modal opens
    window.history.pushState({ modal: true }, '');
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Go back if modal is closing
      if (window.history.state?.modal) {
        window.history.back();
      }
    };
  }, [isOpen, onClose]);

  const handleClear = () => {
    setLocalSearchTerm('');
    setQuery('');
    inputRef.current?.focus();
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 md:hidden",
        "transition-[opacity,visibility] duration-200 ease-out",
        isOpen ? "visible" : "invisible"
      )}
    >
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-[rgba(8,8,7,0.35)]",
          "transition-opacity duration-200",
          isOpen ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        className={cn(
          "absolute inset-x-0 bottom-0 top-0 flex flex-col bg-paper",
          "transform transition-transform duration-200 ease-out",
          isOpen ? "translate-y-0" : "translate-y-full"
        )}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Swipe indicator */}
        <div className="flex justify-center pb-1 pt-2">
          <div className="h-1 w-12 bg-rule-strong" />
        </div>

        {/* Header */}
        <div className="border-b border-rule-strong px-4 pb-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close search"
              className="flex h-10 w-10 shrink-0 items-center justify-center border border-rule-strong bg-paper text-ink transition-colors hover:bg-paper-2"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            <label className="relative flex flex-1 items-center gap-2 border border-rule-strong bg-paper px-3 focus-within:border-ink">
              <Search className="h-4 w-4 shrink-0 text-ink-dim" aria-hidden />
              <input
                ref={inputRef}
                type="search"
                inputMode="search"
                placeholder="Search albums or artists…"
                value={localSearchTerm}
                onChange={(e) => {
                  const v = e.target.value;
                  setLocalSearchTerm(v);
                  setQuery(v);
                }}
                className="h-10 w-full min-w-0 bg-transparent font-grot text-[16px] text-ink placeholder:text-ink-dim focus:outline-none"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                enterKeyHint="search"
              />
              {localSearchTerm && (
                <button
                  type="button"
                  onClick={handleClear}
                  aria-label="Clear search"
                  className="shrink-0 text-ink-dim transition-colors hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </label>
          </div>
        </div>

        {/* Search results */}
        <div className="pb-safe flex-1 overflow-y-auto overscroll-contain px-4 pt-3">
          <SearchResults
            results={results}
            isLoading={isLoading}
            isIndexing={isIndexing}
            error={error}
            searchTerm={localSearchTerm}
            onResultClick={() => {
              onClose();
              setLocalSearchTerm('');
              setQuery('');
            }}
            layout="list"
            showLimitMessage
            showViewAllLink
          />
        </div>
      </div>
    </div>
  );
}
