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
 * `onFulfilled` runs after the state is fulfilled, so it can read the value.
 */
export function trackPromise<T>({
  promise,
  onFulfilled,
}: {
  promise: Promise<T>;
  onFulfilled: (value: T) => void;
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
    },
  );
  return tracked;
}
