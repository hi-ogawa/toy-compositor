import { useSyncExternalStore, type SetStateAction } from "react";
import type { LocalStorageStore } from "../utils/local-storage-store";

/** Like useState, for one value of a localStorage store, which stores each change. */
export function useStorageState<State extends object, Key extends keyof State>(
  storage: LocalStorageStore<State>,
  key: Key,
) {
  const value = useSyncExternalStore(
    storage.store.subscribe,
    () => storage.store.get()[key],
  );

  function setValue(next: SetStateAction<State[Key]>) {
    const current = storage.store.get()[key];
    const update: Partial<State> = {};
    update[key] =
      typeof next === "function"
        ? (next as (value: State[Key]) => State[Key])(current)
        : next;
    storage.update(update);
  }

  return [value, setValue] as const;
}

export type WithStorageState<State extends object> =
  LocalStorageStore<State> & {
    /** useStorageState for this storage. */
    useValue<Key extends keyof State>(
      key: Key,
    ): readonly [State[Key], (next: SetStateAction<State[Key]>) => void];
  };

/** Adds `useValue(key)` to a storage, so call sites read `storage.useValue("key")`. */
export function withStorageState<State extends object>(
  storage: LocalStorageStore<State>,
): WithStorageState<State> {
  return Object.assign(storage, {
    useValue: <Key extends keyof State>(key: Key) =>
      useStorageState(storage, key),
  });
}
