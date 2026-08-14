// src/types/window-api.d.ts

export {};

declare global {
  interface Window {
    api: {
      // keep the existing methods; we don’t list them, we’re just adding:
      revealConfiguredPath: (
        key: "activeMods" | "modsVault" | "modPlayVault"
      ) => Promise<{ ok: boolean; message?: string }>;
      getImmutablePaths: () => {
        modPlayVault: string;
        modsVault: string;
        configRoot: string;
        logsRoot: string;
      };
      onConfigChanged?: (cb: () => void) => () => void;
    };
  }
}
