export type PromiseState<T> =
  | { status: "pending"; promise: Promise<T> }
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; error: unknown };

/** A promise whose current state reads synchronously. */
export interface TrackedPromise<T> {
  state: PromiseState<T>;
}

/**
 * Mirrors a promise's settlement into a state that reads synchronously.
 * Each callback runs after the state settles, so it reads the settled state.
 */
export function trackPromise<T>({
  promise,
  onFulfilled,
  onRejected,
}: {
  promise: Promise<T>;
  onFulfilled: (value: T) => void;
  onRejected: (error: unknown) => void;
}): TrackedPromise<T> {
  const tracked: TrackedPromise<T> = {
    state: { status: "pending", promise },
  };
  void promise.then(
    (value) => {
      tracked.state = { status: "fulfilled", value };
      onFulfilled(value);
    },
    (error: unknown) => {
      tracked.state = { status: "rejected", error };
      onRejected(error);
    },
  );
  return tracked;
}
