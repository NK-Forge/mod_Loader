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
  invoke?: (channel: string, ...args: any[]) => Promise<any>;
  on?: (
    channel: string,
    listener: (_event: any, payload: any) => void
  ) => void;
  removeListener?: (
    channel: string,
    listener: (_event: any, payload: any) => void
  ) => void;
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

  // Subscribe once to "watchers:event" from watchRegistry.broadcast(...)
  React.useEffect(() => {
    const api = getApi();
    
    if (!api?.on || !api?.removeListener) {
      console.warn("[useVaultWatcher] api.on/removeListener not available");
      return;
    }

    const handler = (_event: any, payload: any) => {
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

    api.on("watchers:event", handler);
    console.log("[useVaultWatcher] Listener registered");

    return () => {
      try {
        api.removeListener!("watchers:event", handler);
        console.log("[useVaultWatcher] Listener removed");
      } catch (e) {
        console.warn("[useVaultWatcher] error removing listener", e);
      }
    };
  }, []);

  const setPaths = React.useCallback(
    (paths: { mods?: string; modPlay?: string; backup?: string }) => {
      const api = getApi();
      if (!api?.invoke) return;
      api
        .invoke("watchers:setPaths", paths)
        .catch((e) =>
          console.warn("[useVaultWatcher] watchers:setPaths failed:", e)
        );
    },
    []
  );

  const enable = React.useCallback(
    (domain: WatcherDomain) => {
      const api = getApi();
      if (!api?.invoke) return;
      api
        .invoke("watchers:enable", domain)
        .catch((e) =>
          console.warn("[useVaultWatcher] watchers:enable failed:", e)
        );
    },
    []
  );

  const disable = React.useCallback(
    (domain: WatcherDomain) => {
      const api = getApi();
      if (!api?.invoke) return;
      api
        .invoke("watchers:disable", domain)
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