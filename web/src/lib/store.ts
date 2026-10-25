import type { StoreApi } from 'zustand/vanilla'
/** Svelte's readable contract over a framework-independent, persisted store. */
export function readable<T>(store: StoreApi<T>) {
  return {
    subscribe(run: (value: T) => void) {
      run(store.getState())
      return store.subscribe(run)
    },
  }
}
