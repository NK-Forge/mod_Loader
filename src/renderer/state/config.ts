// src/renderer/state/config.ts
import { useEffect, useState } from "react";

export type ImmutablePaths = {
  modsVaultPath: string;
  modPlayVaultPath: string;
};

/**
 * useImmutablePaths()
 * Hook to access read-only paths managed by the main process.
 * Syncs with Electron's IPC via window.api.getImmutablePaths()
 * and automatically refreshes when the config changes.
 */
export function useImmutablePaths() {
  const api = (window as any).api;
  const [paths, setPaths] = useState<ImmutablePaths>({
    modsVaultPath: "",
    modPlayVaultPath: "",
  });

  // Load paths on mount
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const next = await api.getImmutablePaths();
        if (mounted && next) setPaths(next);
      } catch (err) {
        console.warn("[useImmutablePaths] failed to fetch immutable paths:", err);
      }
    };

    load();

    // Subscribe to config changes and reload
    const off = api.onConfigChanged?.(() => load());

    return () => {
      mounted = false;
      off && off();
    };
  }, []);

  return paths;
}
