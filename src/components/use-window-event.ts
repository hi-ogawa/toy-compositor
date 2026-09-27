import { useEffect, useEffectEvent } from "react";

/**
 * Thin wrapper for window event listeners.
 * Uses useEffectEvent for stable callbacks - no deps needed.
 */
export function useWindowEvent<K extends keyof WindowEventMap>(
  type: K,
  handler: (e: WindowEventMap[K]) => void,
) {
  const onEvent = useEffectEvent(handler);

  useEffect(() => {
    window.addEventListener(type, onEvent);
    return () => window.removeEventListener(type, onEvent);
  }, []); // type assumed static
}
