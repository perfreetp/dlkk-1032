import { useState, useEffect, useRef } from 'react';

type QueryFn<T> = () => T | Promise<T>;

export function useLiveQuery<T>(
  queryFn: QueryFn<T>,
  deps: any[] = [],
  defaultResult?: T
): T {
  const [result, setResult] = useState<T>(defaultResult as T);
  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;

  useEffect(() => {
    let canceled = false;
    let mounted = true;

    const wrappedRun = async () => {
      try {
        const r = await queryFnRef.current();
        if (mounted && !canceled) {
          setResult(r as T);
        }
      } catch (err) {
        if (mounted) console.error('Live query error:', err);
      }
    };

    wrappedRun();
    const timeout = setInterval(wrappedRun, 15000);

    const forceRefresh = () => {
      if (mounted) wrappedRun();
    };

    (window as any).__babyCareRefresh = forceRefresh;

    return () => {
      canceled = true;
      mounted = false;
      clearInterval(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return result;
}

export function triggerRefresh() {
  if ((window as any).__babyCareRefresh) {
    (window as any).__babyCareRefresh();
  }
}
