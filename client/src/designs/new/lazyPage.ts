import { lazy, type ComponentType } from "react";

export type PreloadablePage<P> = ReturnType<typeof lazy<ComponentType<P>>> & { preload: () => Promise<unknown> };

type LazyInternals = { _init?: (payload: unknown) => unknown; _payload?: unknown };

/**
 * `React.lazy` plus a `preload()` that starts the chunk download early.
 * PermissionGate calls it while the permission check is still in flight, so
 * the page's code and its permissions arrive together instead of one after
 * the other.
 *
 * Downloading early is not enough on its own: the first render of a lazy
 * component still suspends until React has resolved it, and React then holds
 * the fallback for its ~300 ms reveal throttle. So once the chunk arrives we
 * run the lazy initializer ahead of time; by the time the page renders, React
 * already has the module and renders it without suspending.
 */
export function lazyPage<P>(load: () => Promise<{ default: ComponentType<P> }>): PreloadablePage<P> {
  let pending: Promise<{ default: ComponentType<P> }> | undefined;
  const component = lazy(() => (pending ??= load()));
  const preload = () => {
    pending ??= load();
    return pending.then(() => {
      const internals = component as unknown as LazyInternals;
      try {
        internals._init?.(internals._payload);
      } catch {
        // Expected: the initializer throws its promise until it settles (a
        // microtask later). Rendering falls back to normal lazy behaviour.
      }
    });
  };
  return Object.assign(component, { preload });
}
