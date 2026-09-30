import { useSyncExternalStore } from "react";

// Tracks whether any API request has been waiting unusually long.
//
// The API runs on a free tier that sleeps after 15 idle minutes, and waking it takes
// ~40 seconds. That wait is unavoidable, but it shouldn't look like a broken page. Every
// request goes through api(), so it's the one place that can notice "this is slow" — no
// component has to remember to handle it.
//
// This is a tiny external store: plain module state plus subscribe/getSnapshot, read by
// React through useSyncExternalStore. React state wouldn't work here because api() isn't a
// component and runs outside any render.

export const SLOW_AFTER_MS = 3000;

let slowCount = 0;
const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};

/** Call when a request starts; call the returned function when it settles. */
export function trackRequest(): () => void {
  let slow = false;
  const timer = setTimeout(() => {
    slow = true;
    slowCount += 1;
    notify();
  }, SLOW_AFTER_MS);
  return () => {
    clearTimeout(timer);
    if (slow) {
      slowCount -= 1;
      notify();
    }
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while at least one request has been pending longer than SLOW_AFTER_MS. */
export function useSlowRequests(): boolean {
  return useSyncExternalStore(subscribe, () => slowCount > 0);
}
