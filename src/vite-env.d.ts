/// <reference types="vite/client" />

type InstallStrategy = "hardlink" | "symlink" | "copy";

type AppConfig = {
  setupComplete: boolean;
  autoDetected: boolean;
  gameRoot: string;
  gameExe: string;
  activeModsPath: string;
  modsVaultPath: string;
  modPlayVaultPath: string;
  saveDataPath: string;
  installStrategy: InstallStrategy;
};

declare global {
  interface Window {
    api: {
      // Setup wizard
      detectPaths(): Promise<Partial<Pick<AppConfig, "gameRoot" | "gameExe" | "activeModsPath" | "saveDataPath">>>;
      ensureDirs(dirs: string[]): Promise<boolean>;
      testWrite(dir: string): Promise<boolean>;
      completeSetup(cfg: Partial<AppConfig>): Promise<AppConfig>;

      // Browsing
      browseFolder(): Promise<string | null>;

      // Config
      getConfig(): Promise<AppConfig>;
      setConfig(cfg: AppConfig): Promise<boolean>;

      // Mods (rich)
      modsScan(): Promise<Array<{ name: string; inMods: boolean; inVault: boolean }>>;
      enableMod(name: string): Promise<boolean>;
      disableMod(name: string): Promise<boolean>;
      deleteMod(name: string): Promise<boolean>;

      // Convenience (used by some UI buttons)
      listMods(): Promise<string[]>;
      applyMods(enabled: string[]): Promise<boolean>;
      launchWithModsTracked(enabled: string[]): Promise<boolean>;
    };
  }
}

export {};
