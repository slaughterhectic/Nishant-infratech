import { useEffect, useRef } from 'react';

/**
 * Keeps a page's data live without a manual reload: re-runs `callback` on an
 * interval, and immediately whenever the tab/window regains focus or becomes
 * visible again (covers the common case of switching back from another app/tab
 * after someone else changed something server-side).
 */
export function useAutoRefresh(callback: () => void, intervalMs = 8000) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const timer = setInterval(() => callbackRef.current(), intervalMs);
    const onFocus = () => callbackRef.current();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') callbackRef.current();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);
}
