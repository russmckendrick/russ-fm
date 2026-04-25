import { ReactNode, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface PageTransitionProps {
  children: ReactNode;
  key?: string | number;
  className?: string;
}

export function PageTransition({ children, className }: PageTransitionProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Small delay to ensure smooth transition
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 50);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={cn(
        'transform transition-[opacity,transform] duration-500 ease-out',
        isVisible 
          ? 'translate-y-0 opacity-100' 
          : 'translate-y-4 opacity-0',
        className
      )}
    >
      {children}
    </div>
  );
}
