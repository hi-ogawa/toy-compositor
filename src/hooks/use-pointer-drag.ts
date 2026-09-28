import { useCallback, useEffectEvent } from "react";
import {
  listenPointerDrag,
  type PointerDragOptions,
} from "../utils/pointer-drag";

export function usePointerDrag<T>({ onStart, onMove }: PointerDragOptions<T>) {
  const start = useEffectEvent(onStart);
  const move = useEffectEvent(onMove);
  return useCallback((element: HTMLElement | null) => {
    if (!element) {
      return;
    }
    return listenPointerDrag({ element, onStart: start, onMove: move });
  }, []);
}
