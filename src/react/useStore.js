// @ts-check
import { useCallback, useRef, useSyncExternalStore } from 'react';

/**
 * Re-renders on every store 'change'. The store mutates its state in place, so the snapshot React compares is a
 * change counter.
 * @param {EventTarget} store
 * @returns {number}
 */
export function useStore(store) {
  const version = useRef(0);
  const subscribe = useCallback(
    (/** @type {() => void} */ onChange) => {
      const handler = () => {
        version.current += 1;
        onChange();
      };
      store.addEventListener('change', handler);
      return () => store.removeEventListener('change', handler);
    },
    [store],
  );
  return useSyncExternalStore(subscribe, () => version.current);
}
