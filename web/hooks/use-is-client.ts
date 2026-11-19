import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** false during SSR and hydration, true on the client afterwards. No effect + setState needed. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
