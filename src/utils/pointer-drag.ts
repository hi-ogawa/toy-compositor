export type PointerDragOptions<T> = {
  onStart: (event: PointerEvent) => T;
  onMove: (options: { event: PointerEvent; data: T; deltaX: number }) => void;
};

export function listenPointerDrag<T>({
  element,
  onStart,
  onMove,
}: PointerDragOptions<T> & { element: HTMLElement }) {
  let drag: { pointerId: number; startX: number; data: T } | undefined;
  const start = (event: PointerEvent) => {
    if (event.button !== 0 || drag) {
      return;
    }
    event.preventDefault();
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      data: onStart(event),
    };
    element.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (drag?.pointerId === event.pointerId) {
      onMove({ event, data: drag.data, deltaX: event.clientX - drag.startX });
    }
  };
  const end = (event: PointerEvent) => {
    if (drag?.pointerId === event.pointerId) {
      drag = undefined;
    }
  };
  element.addEventListener("pointerdown", start);
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", end);
  element.addEventListener("pointercancel", end);
  element.addEventListener("lostpointercapture", end);
  return () => {
    element.removeEventListener("pointerdown", start);
    element.removeEventListener("pointermove", move);
    element.removeEventListener("pointerup", end);
    element.removeEventListener("pointercancel", end);
    element.removeEventListener("lostpointercapture", end);
  };
}
