export type PromiseState<T> =
  | { status: "pending"; promise: Promise<T> }
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; error: unknown };

/**
 * Returns a promise's pending state, and hands its settled state to
 * `onSettled`, so the caller can keep each state as immutable data.
 */
export function trackPromise<T>({
  promise,
  onSettled,
}: {
  promise: Promise<T>;
  onSettled: (state: Exclude<PromiseState<T>, { status: "pending" }>) => void;
}): PromiseState<T> {
  void promise.then(
    (value) => onSettled({ status: "fulfilled", value }),
    (error: unknown) => onSettled({ status: "rejected", error }),
  );
  return { status: "pending", promise };
}
