/**
 * @file electron/preload.ts
 * Exposes a typed window.api bridge.
 */

import { contextBridge, ipcRenderer } from "electron";

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

type ModRow = { name: string; enabled: boolean; inVault: boolean };

type ImmutablePaths = {
  modsVaultPath: string;
  modPlayVaultPath: string;
};

const CH = {
  CONFIG_GET: "config:get",
  CONFIG_SET: "config:set",
  CONFIG_COMPLETE: "config:completeSetup",
  CONFIG_IMMUTABLE: "config:getImmutablePaths",

  BROWSE_FOLDER: "browse:folder",
  FS_ENSURE_DIRS: "fs:ensureDirs",
  FS_TEST_WRITE: "fs:testWrite",

  DETECT_PATHS: "detect:paths",

  MODS_LIST_BOTH: "mods:listBoth",
  MODS_APPLY: "mods:apply",
  MODS_DELETE: "mods:delete",
  MODS_MANUAL_SAVE: "mods:manualGameDataSave",

  GAME_LAUNCH_MOD: "game:launchModPlay",
  GAME_LAUNCH_VAN: "game:launchVanilla",

  EVT_CONFIG_CHANGED: "config:changed",
  EVT_MODS_CHANGED: "mods:changed",
} as const;

contextBridge.exposeInMainWorld("api", {
  // Config
  getConfig(): Promise<AppConfig> { return ipcRenderer.invoke(CH.CONFIG_GET); },
  setConfig(next: Partial<AppConfig>): Promise<AppConfig> { return ipcRenderer.invoke(CH.CONFIG_SET, next); },
  completeSetup(next: AppConfig): Promise<AppConfig> { return ipcRenderer.invoke(CH.CONFIG_COMPLETE, next); },
  getImmutablePaths(): Promise<ImmutablePaths> { return ipcRenderer.invoke(CH.CONFIG_IMMUTABLE); },

  // FS
  browseFolder(): Promise<string | null> { return ipcRenderer.invoke(CH.BROWSE_FOLDER); },
  ensureDirs(dirs: string[]): Promise<boolean> { return ipcRenderer.invoke(CH.FS_ENSURE_DIRS, dirs); },
  testWrite(dir: string): Promise<boolean> { return ipcRenderer.invoke(CH.FS_TEST_WRITE, dir); },

  // Detect
  detectPaths(): Promise<Partial<AppConfig>> { return ipcRenderer.invoke(CH.DETECT_PATHS); },

  // Mods
  listModsBoth(): Promise<ModRow[]> { return ipcRenderer.invoke(CH.MODS_LIST_BOTH); },
  applyMods(enabledNames: string[]): Promise<{ ok: boolean; message?: string }> {
    return ipcRenderer.invoke(CH.MODS_APPLY, enabledNames);
  },
  deleteMod(name: string): Promise<{ ok: boolean; message?: string }> {
    return ipcRenderer.invoke(CH.MODS_DELETE, name);
  },
  manualGameDataSave(): Promise<{ files: number; bytes: number; error?: string }> {
    return ipcRenderer.invoke(CH.MODS_MANUAL_SAVE);
  },

  // Launch
  launchModPlay(): Promise<{ ok: boolean; pid?: number; message?: string }> {
    return ipcRenderer.invoke(CH.GAME_LAUNCH_MOD);
  },
  launchVanillaPlay(): Promise<{ ok: boolean; pid?: number; message?: string }> {
    return ipcRenderer.invoke(CH.GAME_LAUNCH_VAN);
  },

  // Events
  onConfigChanged(handler: (cfg: AppConfig) => void) {
    const fn = (_: any, payload: AppConfig) => handler(payload);
    ipcRenderer.on(CH.EVT_CONFIG_CHANGED, fn);
    return () => ipcRenderer.off(CH.EVT_CONFIG_CHANGED, fn);
  },
  onModsChanged(handler: () => void) {
    const fn = () => handler();
    ipcRenderer.on(CH.EVT_MODS_CHANGED, fn);
    return () => ipcRenderer.off(CH.EVT_MODS_CHANGED, fn);
  },

  // Generic IPC bridge needed by hooks like useVaultWatcher
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, listener: (e: any, payload: any) => void) =>
    ipcRenderer.on(channel, listener),
  removeListener: (channel: string, listener: any) =>
    ipcRenderer.removeListener(channel, listener),
});
