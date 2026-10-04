import { useEffect, useEffectEvent } from "react";

/**
 * The handler goes through useEffectEvent, so callers need not memoize it.
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
