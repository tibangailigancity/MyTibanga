import { useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook that calls a function at a regular interval.
 * Pauses while the tab is hidden; runs an immediate tick when the tab is shown again.
 *
 * @param {Function} callback - The function to call on each interval tick
 * @param {number}   delay    - Interval in milliseconds (default 10 000 = 10s)
 * @param {boolean}  enabled  - Whether polling is active (default true)
 *
 * Set NEXT_PUBLIC_DISABLE_DEV_POLLING=1 in .env.local only if you want to turn off
 * polling during local development (e.g. to reduce API traffic).
 */
export function usePolling(callback, delay = 10000, enabled = true) {
    const savedCallback = useRef(callback);
    const isDev = process.env.NODE_ENV === 'development';
    const devPollingOff = process.env.NEXT_PUBLIC_DISABLE_DEV_POLLING === '1';
    const effectiveEnabled = enabled && (!isDev || !devPollingOff);
    const effectiveDelay = Math.max(delay, 1000);

    // Always keep the latest callback
    useEffect(() => {
        savedCallback.current = callback;
    }, [callback]);

    // Stable fetch function
    const tick = useCallback(() => {
        savedCallback.current();
    }, []);

    useEffect(() => {
        if (!effectiveEnabled) return;

        const id = setInterval(tick, effectiveDelay);

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                tick();
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            clearInterval(id);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [tick, effectiveDelay, effectiveEnabled]);
}
