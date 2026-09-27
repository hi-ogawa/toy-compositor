export function createStore<State>(initialize: (get: () => State) => State) {
  let state: State;
  const listeners = new Set<() => void>();

  const get = (): State => state;
  state = initialize(get);

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const subscribeWithSelector = <Selection>({
    selector,
    listener,
  }: {
    selector: (state: State) => Selection;
    listener: () => void;
  }): (() => void) => {
    let selection = selector(state);
    const storeListener = () => {
      const nextSelection = selector(state);
      if (Object.is(selection, nextSelection)) {
        return;
      }
      selection = nextSelection;
      listener();
    };
    listeners.add(storeListener);
    return () => listeners.delete(storeListener);
  };

  const update = (update: Partial<State>): void => {
    state = { ...state, ...update };
    for (const listener of listeners) {
      listener();
    }
  };

  return { get, subscribe, subscribeWithSelector, update };
}
