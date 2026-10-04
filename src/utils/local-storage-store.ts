import { useSyncExternalStore, type SetStateAction } from "react";
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

  /** Like useState, for one value of the store, which stores each change. */
  useValue<Key extends keyof State>(
    key: Key,
  ): readonly [State[Key], (next: SetStateAction<State[Key]>) => void] {
    const value = useSyncExternalStore(
      this.store.subscribe,
      () => this.store.get()[key],
    );
    const setValue = (next: SetStateAction<State[Key]>) => {
      const current = this.store.get()[key];
      const update: Partial<State> = {};
      update[key] =
        typeof next === "function"
          ? (next as (value: State[Key]) => State[Key])(current)
          : next;
      this.update(update);
    };
    return [value, setValue];
  }
}
