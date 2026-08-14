// src/types/global.d.ts
// Type declarations for `window.api` additions used by Advanced Settings.
export {};

declare global {
  interface Window {
    api: {
      // existing methods from your app (we don't retype them here)
      [key: string]: any;

      // new ones added by our preload changes
      revealConfiguredPath: (
        key: "activeMods" | "modsVault" | "modPlayVault"
      ) => Promise<{ ok: boolean; message?: string }>;
      getImmutablePaths: () => {
        modPlayVault: string;
        modsVault: string;
        configRoot: string;
        logsRoot: string;
      };
      onConfigChanged?: (cb: ()=>void) => () => void;
    };
  }
}

declare module "*.png" {
  const src: string;
  export default src;
}