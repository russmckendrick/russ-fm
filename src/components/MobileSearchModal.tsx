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
  } = useMobileSearch(isOpen);

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
        "fixed inset-0 z-50 xl:hidden",
        "transition-[visibility] duration-300",
        isOpen ? "visible" : "invisible"
      )}
      aria-hidden={!isOpen}
    >
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-black/60",
          "transition-opacity duration-300 motion-reduce:transition-none",
          isOpen ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search the collection"
        className={cn(
          "absolute inset-x-0 bottom-0 top-0 flex flex-col bg-[var(--ground)] text-[color:var(--cream)]",
          "transform transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none",
          isOpen ? "translate-y-0" : "translate-y-full"
        )}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Swipe indicator */}
        <div className="flex justify-center pb-2 pt-3" aria-hidden>
          <div className="h-1 w-12 rounded-full bg-[var(--cream-rule)]" />
        </div>

        {/* Header */}
        <div className="px-4 pb-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close search"
              className="icon-btn h-12 w-12 bg-[var(--ground-2)] text-[color:var(--cream)]"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </button>

            <label className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-full border-2 border-[color:var(--cream-rule)] bg-[var(--ground-2)] px-4 transition-colors focus-within:border-[color:var(--cream)]">
              <Search className="h-[18px] w-[18px] shrink-0 text-[color:var(--cream-dim)]" aria-hidden />
              <input
                ref={inputRef}
                type="search"
                inputMode="search"
                placeholder="Search the collection"
                aria-label="Search the collection"
                value={localSearchTerm}
                onChange={(e) => {
                  const v = e.target.value;
                  setLocalSearchTerm(v);
                  setQuery(v);
                }}
                className="h-full w-full min-w-0 bg-transparent text-[16px] text-[color:var(--cream)] placeholder:text-[color:var(--cream-dim)] focus:outline-none [&::-webkit-search-cancel-button]:hidden"
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
                  className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--cream-dim)] transition-colors hover:text-[color:var(--cream)]"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              )}
            </label>
          </div>
        </div>

        {/* Search results */}
        <div className="flex-1 pb-[max(2rem,env(safe-area-inset-bottom))] overflow-y-auto overscroll-contain border-t border-[color:var(--cream-rule)] px-2 pt-5">
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
