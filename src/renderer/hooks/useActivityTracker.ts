import { useEffect, useRef, useCallback } from 'react';
import type { Session } from '../types';

const ACTIVITY_TIMEOUT_MS = 60000; // 1 minute of inactivity = idle
const TICK_INTERVAL_MS = 1000; // Update every second
const BATCH_UPDATE_INTERVAL_MS = 30000; // Batch updates every 30 seconds to reduce re-renders

export interface UseActivityTrackerReturn {
  onActivity: () => void; // Call this when user activity is detected
}

/**
 * Hook to track user activity and update session's activeTimeMs.
 * When the user is active (touched keyboard/mouse in the last minute),
 * time is added to the active session.
 *
 * Note: To avoid causing re-renders every second (which can reset scroll positions
 * in virtualized lists), we accumulate time locally and only batch-update the
 * session state every 30 seconds.
 */
export function useActivityTracker(
  activeSessionId: string | null,
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>
): UseActivityTrackerReturn {
  const lastActivityRef = useRef<number>(Date.now());
  const isActiveRef = useRef<boolean>(false);
  const accumulatedTimeRef = useRef<number>(0);
  const lastBatchUpdateRef = useRef<number>(Date.now());

  // Mark activity occurred
  const onActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    isActiveRef.current = true;
  }, []);

  // Tick every second to accumulate time, but only update state every 30 seconds
  // Pauses when window is hidden to save CPU
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivityRef.current;

      // Check if still active (activity within the last minute)
      if (timeSinceLastActivity < ACTIVITY_TIMEOUT_MS && isActiveRef.current) {
        // Accumulate time locally instead of updating state every second
        accumulatedTimeRef.current += TICK_INTERVAL_MS;

        // Only batch-update state every 30 seconds to avoid causing re-renders
        const timeSinceLastBatchUpdate = now - lastBatchUpdateRef.current;
        if (timeSinceLastBatchUpdate >= BATCH_UPDATE_INTERVAL_MS && activeSessionId) {
          const accumulatedTime = accumulatedTimeRef.current;
          accumulatedTimeRef.current = 0;
          lastBatchUpdateRef.current = now;

          setSessions(prev => prev.map(session => {
            if (session.id === activeSessionId) {
              return {
                ...session,
                activeTimeMs: (session.activeTimeMs || 0) + accumulatedTime
              };
            }
            return session;
          }));
        }
      } else {
        // Mark as inactive if timeout exceeded
        isActiveRef.current = false;
      }
    };

    const startInterval = () => {
      if (!interval) {
        interval = setInterval(tick, TICK_INTERVAL_MS);
      }
    };

    const stopInterval = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopInterval();
      } else {
        startInterval();
      }
    };

    // Start interval if visible
    if (!document.hidden) {
      startInterval();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopInterval();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Flush any accumulated time when effect cleans up (e.g., session change)
      if (accumulatedTimeRef.current > 0 && activeSessionId) {
        const accumulatedTime = accumulatedTimeRef.current;
        accumulatedTimeRef.current = 0;
        setSessions(prev => prev.map(session => {
          if (session.id === activeSessionId) {
            return {
              ...session,
              activeTimeMs: (session.activeTimeMs || 0) + accumulatedTime
            };
          }
          return session;
        }));
      }
    };
  }, [activeSessionId, setSessions]);

  // Listen to global activity events
  useEffect(() => {
    const handleActivity = () => {
      lastActivityRef.current = Date.now();
      isActiveRef.current = true;
    };

    // Listen for various user interactions
    // Note: mousemove is intentionally excluded - it fires hundreds of times per second
    // and would cause excessive CPU usage. mousedown/keydown are sufficient for activity detection.
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('mousedown', handleActivity);
    window.addEventListener('wheel', handleActivity);
    window.addEventListener('touchstart', handleActivity);

    return () => {
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('wheel', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
    };
  }, []);

  return { onActivity };
}
