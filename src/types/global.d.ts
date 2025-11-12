// src/types/global.d.ts
// Type declarations for `window.api` additions used by Advanced Settings.
export {};

declare global {
  interface Window {
    api: {
      // existing methods from your app (we don't retype them here)
      [key: string]: any;

      // new ones added by our preload changes
      revealPath: (p: string) => Promise<void>;
      getImmutablePaths: () => {
        modPlayVault: string;
        modsVault: string;
        configRoot: string;
        logsRoot: string;
      };
      onConfigChanged?: (cb: ()=>void) => () => void;
      listCopyEvents: (modPlayVault: string, lastDays: number) => Promise<Array<{
        ts: string; src: string; dest: string; files: number; bytes: number; ms: number; result: 'ok'|'error';
      }>>;
    };
  }
}
