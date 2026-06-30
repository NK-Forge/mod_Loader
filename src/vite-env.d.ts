// src/vite-env.d.ts

/// <reference types="vite/client" />

type InstallStrategy = "hardlink" | "symlink" | "copy";
type Platform = "steam" | "epic" | "xbox" | "unknown";

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
  platform: Platform;
  launchUri?: string;
  steamAppId?: string;
  epicAppName?: string;
  epicNamespaceId?: string;
  epicItemId?: string;
  epicArtifactId?: string;
  epicLaunchUri?: string;
  xboxAumid?: string;
  xboxLaunchUri?: string;
  xboxStoreProductId?: string;
  selectedStorefrontId?: string;
};

declare global {
  interface Window {
    api: {
      // Setup wizard
      detectPaths(): Promise<any>;
      ensureDirs(dirs: string[]): Promise<boolean>;
      testWrite(dir: string): Promise<boolean>;
      completeSetup(cfg: Partial<AppConfig>): Promise<{ ok: boolean; message?: string }>;

      // Browsing
      browseFolder(): Promise<string | null>;

      // Config
      getConfig(): Promise<AppConfig>;
      setConfig(cfg: Partial<AppConfig>): Promise<{ ok: boolean; message?: string }>;

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
