import { useEffect } from 'react';

export function usePageTitle(title: string) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    // Restore the previous title when the component unmounts
    return () => {
      document.title = previousTitle;
    };
  }, [title]);
}