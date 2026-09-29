export type PromiseState<T> =
  | { status: "pending"; promise: Promise<T> }
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; error: unknown };

/** Reports a promise's state as it changes, so a store can hold it as plain data. */
export function watchPromise<T>(
  promise: Promise<T>,
  onChange: (state: PromiseState<T>) => void,
): void {
  onChange({ status: "pending", promise });
  promise.then(
    (value) => onChange({ status: "fulfilled", value }),
    (error: unknown) => onChange({ status: "rejected", error }),
  );
}
