// src/renderer/hooks/useVaultWatcher.ts
import * as React from "react";

type WatchEvent = {
  domain: "mods" | "modPlay" | "backup";
  type: "added" | "removed" | "changed" | "renamed" | "refresh";
  file: string;
  at: number;
};

type Api = {
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  on: (channel: string, listener: (_: any, payload: any) => void) => void;
  removeListener: (channel: string, listener: (_: any, payload: any) => void) => void;
};

function getApi(): Api | null {
  // Works for common preload bridges: window.api, window.electron, etc.
  const w = window as any;
  if (w.api?.invoke && w.api?.on) return w.api as Api;
  if (w.electron?.ipcRenderer?.invoke) {
    const ir = w.electron.ipcRenderer;
    return {
      invoke: ir.invoke.bind(ir),
      on: ir.on.bind(ir),
      removeListener: ir.removeListener.bind(ir),
    };
  }
  // Last resort (non-isolated env)
  try {
    const { ipcRenderer } = (window as any).require?.("electron") ?? {};
    if (ipcRenderer) {
      return {
        invoke: ipcRenderer.invoke.bind(ipcRenderer),
        on: ipcRenderer.on.bind(ipcRenderer),
        removeListener: ipcRenderer.removeListener.bind(ipcRenderer),
      };
    }
  } catch {}
  return null;
}

export function useVaultWatcher() {
  const [lastEvent, setLastEvent] = React.useState<WatchEvent | null>(null);
  const api = React.useMemo(getApi, []);

  React.useEffect(() => {
    if (!api) return;
    const handler = (_: any, evt: WatchEvent) => setLastEvent(evt);
    api.on("watchers:event", handler);
    return () => {
      api.removeListener?.("watchers:event", handler);
    };
  }, [api]);

  const setPaths = React.useCallback(
    async (paths: { mods?: string; modPlay?: string; backup?: string }) => {
      if (!api) return;
      await api.invoke("watchers:setPaths", paths);
    },
    [api]
  );

  const enable = React.useCallback(async (domain: "mods" | "modPlay" | "backup") => {
    if (!api) return;
    await api.invoke("watchers:enable", domain);
  }, [api]);

  const disable = React.useCallback(async (domain: "mods" | "modPlay" | "backup") => {
    if (!api) return;
    await api.invoke("watchers:disable", domain);
  }, [api]);

  return { lastEvent, setPaths, enable, disable };
}
