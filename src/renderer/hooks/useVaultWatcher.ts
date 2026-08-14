// src/renderer/hooks/useVaultWatcher.ts
import * as React from "react";

export type WatcherDomain = "mods" | "modPlay" | "backup" | string;

export interface WatcherEvent {
  ts: number;
  domain: WatcherDomain;
  type: string;
  file?: string;
  detail?: string;
  raw?: any;
}

type Api = {
  watchersSetPaths?: (paths: { mods?: string; modPlay?: string; backup?: string }) => Promise<any>;
  watchersEnable?: (domain: string) => Promise<any>;
  watchersDisable?: (domain: string) => Promise<any>;
  onWatcherEvent?: (cb: (payload: any) => void) => () => void;
};

const getApi = (): Api | undefined => {
  return (window as any).api as Api | undefined;
};

export function useVaultWatcher() {
  const [events, setEvents] = React.useState<WatcherEvent[]>([]);
  const [lastEvent, setLastEvent] = React.useState<WatcherEvent | null>(null);

  // DEBUG: Log state changes
  React.useEffect(() => {
    console.log("[useVaultWatcher] events state updated, length:", events.length);
  }, [events]);

  React.useEffect(() => {
    console.log("[useVaultWatcher] lastEvent state updated:", lastEvent);
  }, [lastEvent]);

  // Subscribe once to watcher events exposed by the narrow preload API.
  React.useEffect(() => {
    const api = getApi();

    if (!api?.onWatcherEvent) {
      console.warn("[useVaultWatcher] api.onWatcherEvent not available");
      return;
    }

    const handler = (payload: any) => {
      console.log("[watchers:event] payload from main:", payload);

      const normalized: WatcherEvent = {
        ts:
          typeof payload?.ts === "number"
            ? payload.ts
            : typeof payload?.at === "number"
            ? payload.at
            : Date.now(),
        domain: String(payload?.domain ?? "unknown"),
        type: String(payload?.type ?? "unknown"),
        file: payload?.file,
        detail: payload?.detail,
        raw: payload,
      };

      console.log("[watchers:event] normalized event:", normalized);
      
      setLastEvent((prev) => {
        console.log("[watchers:event] setLastEvent called, prev:", prev, "new:", normalized);
        return normalized;
      });
      
      setEvents((prev) => {
        console.log("[watchers:event] setEvents called, prev length:", prev.length);
        const next = [normalized, ...prev];
        const sliced = next.slice(0, 200);
        console.log("[watchers:event] new events length:", sliced.length);
        return sliced;
      });
    };

    const unsubscribe = api.onWatcherEvent(handler);
    console.log("[useVaultWatcher] Listener registered");

    return () => {
      try {
        unsubscribe?.();
        console.log("[useVaultWatcher] Listener removed");
      } catch (e) {
        console.warn("[useVaultWatcher] error removing listener", e);
      }
    };
  }, []);

  const setPaths = React.useCallback(
    (paths: { mods?: string; modPlay?: string; backup?: string }) => {
      const api = getApi();
      if (!api?.watchersSetPaths) return;
      api
        .watchersSetPaths(paths)
        .catch((e) =>
          console.warn("[useVaultWatcher] watchers:setPaths failed:", e)
        );
    },
    []
  );

  const enable = React.useCallback(
    (domain: WatcherDomain) => {
      const api = getApi();
      if (!api?.watchersEnable) return;
      api
        .watchersEnable(domain)
        .catch((e) =>
          console.warn("[useVaultWatcher] watchers:enable failed:", e)
        );
    },
    []
  );

  const disable = React.useCallback(
    (domain: WatcherDomain) => {
      const api = getApi();
      if (!api?.watchersDisable) return;
      api
        .watchersDisable(domain)
        .catch((e) =>
          console.warn("[useVaultWatcher] watchers:disable failed:", e)
        );
    },
    []
  );

  const clear = React.useCallback(() => {
    console.log("[useVaultWatcher] clear() called");
    setEvents([]);
    setLastEvent(null);
  }, []);

  return { events, lastEvent, setPaths, enable, disable, clear };
}