import { createStore } from "./store.ts";

/** A store kept in one localStorage entry, read once and written on each update. */
export class LocalStorageStore<State extends object> {
  readonly store;
  private readonly key: string;

  constructor({ key, defaults }: { key: string; defaults: State }) {
    this.key = key;
    this.store = createStore<State>(() => {
      // Storage can be unavailable, such as in a private window, and then the
      // store starts at its defaults. Defaults also fill keys added by a later
      // build.
      try {
        return {
          ...defaults,
          ...JSON.parse(localStorage.getItem(key) ?? "{}"),
        };
      } catch {
        return defaults;
      }
    });
  }

  update(update: Partial<State>): void {
    this.store.update(update);
    try {
      localStorage.setItem(this.key, JSON.stringify(this.store.get()));
    } catch {}
  }
}
