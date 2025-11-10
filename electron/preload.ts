/**
 * @file preload.ts
 * @project Space Marine 2 Mod Loader
 * @phase 3A — Path Integration
 * @description
 *  Secure renderer bridge. Exposes a minimal, typed API for the renderer
 *  to interact with the main process via IPC. All functions are developer-facing
 *  and intended to be stable contracts across phases.
 *
 *  Notes:
 *  - Only whitelisted methods are exposed; there is no direct Node access.
 *  - Event subscriptions return an unsubscribe function for cleanup.
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

/** ------------------------------
 *  Types (keep in sync with main)
 * ------------------------------ */
type InstallStrategy = "hardlink" | "symlink" | "copy";

export interface AppConfig {
  setupComplete: boolean;
  autoDetected: boolean;
  gameRoot: string;
  gameExe: string;
  activeModsPath: string;
  modsVaultPath: string;
  modPlayVaultPath: string;
  saveDataPath: string;
  installStrategy: InstallStrategy;
}

export type ModRow = { name: string; enabled: boolean; inVault: boolean };

/** ------------------------------
 *  IPC channel constants
 * ------------------------------ */
const CH = {
  // Config
  CONFIG_GET: "config:get",
  CONFIG_SET: "config:set",
  CONFIG_COMPLETE: "config:completeSetup",
  CONFIG_CHANGED: "config:changed",

  // FS / Paths
  BROWSE_FOLDER: "browse:folder",
  FS_ENSURE_DIRS: "fs:ensureDirs",
  FS_TEST_WRITE: "fs:testWrite",
  DETECT_PATHS: "detect:paths",

  // Mods
  MODS_LIST_BOTH: "mods:listBoth",
  MODS_APPLY: "mods:apply",
  MODS_LAUNCH_TRACKED: "mods:launchTracked",
  MODS_MANUAL_SAVE: "mods:manualGameDataSave",
  MODS_START_WATCH: "mods:startWatch",
  MODS_STOP_WATCH: "mods:stopWatch",
  MODS_CHANGED: "mods:changed",
} as const;

/** Utility: wrap `ipcRenderer.on` with a typed unsubscribe */
function subscribe(channel: string, cb: (...args: any[]) => void) {
  const handler = (_evt: IpcRendererEvent, ...args: any[]) => cb(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

/** ------------------------------
 *  Exposed API surface
 * ------------------------------ */
const api = {
  /**
   * Get the current application configuration.
   * @returns Promise<AppConfig>
   */
  getConfig(): Promise<AppConfig> {
    return ipcRenderer.invoke(CH.CONFIG_GET);
  },

  /**
   * Partially update configuration and persist it.
   * @param next Partial<AppConfig>
   * @returns Promise<AppConfig> resolved with updated config
   */
  setConfig(next: Partial<AppConfig>): Promise<AppConfig> {
    return ipcRenderer.invoke(CH.CONFIG_SET, next);
  },

  /**
   * Complete initial setup from the wizard and mark as setupComplete.
   * @param cfg AppConfig
   * @returns Promise<AppConfig> resolved with finalized config
   * @fires config:changed
   */
  completeSetup(cfg: AppConfig): Promise<AppConfig> {
    return ipcRenderer.invoke(CH.CONFIG_COMPLETE, cfg);
  },

  /**
   * Subscribe to config changes broadcast by main.
   * @param cb (cfg: AppConfig) => void
   * @returns unsubscribe function
   */
  onConfigChanged(cb: (cfg: AppConfig) => void): () => void {
    return subscribe(CH.CONFIG_CHANGED, cb);
  },

  /* ---------- Paths / FS helpers ---------- */

  /**
   * Show a folder picker dialog (directory only).
   * @returns Promise<string | null> selected absolute path or null if canceled
   */
  browseFolder(): Promise<string | null> {
    return ipcRenderer.invoke(CH.BROWSE_FOLDER);
  },

  /**
   * Ensure a list of directories exist (mkdir -p).
   * @param dirs string[]
   * @returns Promise<boolean>
   */
  ensureDirs(dirs: string[]): Promise<boolean> {
    return ipcRenderer.invoke(CH.FS_ENSURE_DIRS, dirs);
  },

  /**
   * Test write access to a directory by writing/removing a temp file.
   * @param dir string
   * @returns Promise<boolean>
   */
  testWrite(dir: string): Promise<boolean> {
    return ipcRenderer.invoke(CH.FS_TEST_WRITE, dir);
  },

  /**
   * Attempt to auto-detect common install and data paths.
   * @returns Promise<Partial<AppConfig>> subset with discovered paths
   */
  detectPaths(): Promise<Partial<AppConfig>> {
    return ipcRenderer.invoke(CH.DETECT_PATHS);
  },

  /* ---------- Mods API ---------- */

  /**
   * List a merged view of Active Mods + Mods Vault.
   * Enabled = present in active; inVault = present in vault.
   * @returns Promise<ModRow[]>
   */
  listModsBoth(): Promise<ModRow[]> {
    return ipcRenderer.invoke(CH.MODS_LIST_BOTH);
  },

  /**
   * Apply currently enabled mods using selected install strategy.
   * Phase 3A: implementation may be a stub.
   * @param enabled string[] names
   * @returns Promise<{ ok: boolean }>
   */
  applyMods(enabled: string[]): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(CH.MODS_APPLY, enabled);
  },

  /**
   * Launch the game with tracking enabled.
   * Phase 3A: implementation may be a stub.
   * @param enabled string[]
   * @returns Promise<{ ok: boolean }>
   */
  launchWithModsTracked(enabled: string[]): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(CH.MODS_LAUNCH_TRACKED, enabled);
  },

  /**
   * Manually snapshot game data to the mod_play_vault.
   * Phase 3A: implementation may be a stub.
   * @returns Promise<{ files: number, bytes: number }>
   */
  manualGameDataSave(): Promise<{ files: number; bytes: number }> {
    return ipcRenderer.invoke(CH.MODS_MANUAL_SAVE);
  },

  /**
   * Start file watchers (debounced). Phase 3A: lightweight.
   * @returns Promise<boolean>
   */
  startModsWatch(): Promise<boolean> {
    return ipcRenderer.invoke(CH.MODS_START_WATCH);
  },

  /**
   * Stop file watchers.
   * @returns Promise<boolean>
   */
  stopModsWatch(): Promise<boolean> {
    return ipcRenderer.invoke(CH.MODS_STOP_WATCH);
  },

  /**
   * Subscribe to debounced mod-change notifications.
   * @param cb () => void
   * @returns unsubscribe
   */
  onModsChanged(cb: () => void): () => void {
    return subscribe(CH.MODS_CHANGED, cb);
  },
} as const;

/** Augment `window` with a typed `api` namespace for the renderer. */
declare global {
  interface Window {
    api: typeof api;
  }
}

contextBridge.exposeInMainWorld("api", api);
