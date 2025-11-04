/// <reference types="vite/client" />

declare global {
  interface Window {
    api: {
      getConfig(): Promise<{
        gameRoot: string;
        gameExe: string;
        activeModsPath: string;
        modsVaultPath: string;
        modPlayVaultPath: string;
        saveDataPath: string;
        installStrategy: "hardlink" | "symlink" | "copy";
        autoDetected: boolean;
      }>;
      setConfig(cfg: any): Promise<boolean>;
      listMods(): Promise<string[]>;
      applyMods(enabled: string[]): Promise<boolean>;
      launchWithModsTracked(enabled: string[]): Promise<boolean>;
      browseFolder(): Promise<string | null>;
    };
  }
}

export {};
