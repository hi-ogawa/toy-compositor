import { createStore } from "./store.ts";

export type LocalStorageStore<State extends object> = ReturnType<
  typeof createLocalStorageStore<State>
>;

/** A store kept in one localStorage entry, read once and written on each update. */
export function createLocalStorageStore<State extends object>({
  key,
  defaults,
}: {
  key: string;
  defaults: State;
}) {
  const store = createStore<State>(() => {
    // Storage can be unavailable, such as in a private window, and then the
    // store starts at its defaults. Defaults also fill keys added by a later
    // build.
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(key) ?? "{}") };
    } catch {
      return defaults;
    }
  });

  function update(update: Partial<State>): void {
    store.update(update);
    try {
      localStorage.setItem(key, JSON.stringify(store.get()));
    } catch {}
  }

  return { store, update };
}
