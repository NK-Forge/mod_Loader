/**
 * @file electron/preload.ts
 * Safe window.api bridge for renderer (Phase 4)
 */

import { contextBridge, ipcRenderer } from "electron";

// These are just for typing on the renderer side
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

  // Phase 4A.2 background support
  backgroundImagePath?: string;
};

type ModRow = { name: string; enabled: boolean; inVault: boolean };

type ImmutablePaths = {
  modsVaultPath: string;
  modPlayVaultPath: string;
};

// IPC channels actually implemented in main/ipc & main.ts
const CH = {
  // config
  CONFIG_GET: "config:get",
  CONFIG_SET: "config:update",
  EVT_CONFIG_CHANGED: "config:changed",

  // mods
  MODS_LIST: "mods:list",
  MODS_RECONCILE: "mods:reconcile",
  MODS_DELETE: "mods:delete",

  // play
  PLAY_CAN: "play:canLaunch",
  PLAY_LAUNCH: "play:launch",
  LAUNCH_MOD: "launchModPlay",
  LAUNCH_VAN: "launchVanillaPlay",
  MANUAL_SAVE: "manualGameDataSave",

  // background
  BG_GET: "bg:get",
  BG_CHOOSE: "bg:choose",
  BG_SET: "bg:set",
  BG_RESET: "bg:reset",

  // paths (immutable vault paths for Advanced Settings)
  PATHS_IMMUTABLE_GET: "paths:immutable:get",
} as const;

// Small helper so all invoke calls log consistently if something blows up
async function invoke<T = any>(channel: string, ...args: any[]): Promise<T> {
  try {
    return await ipcRenderer.invoke(channel, ...args);
  } catch (err) {
    console.error(`[PRELOAD] invoke failed: ${channel}`, err);
    throw err;
  }
}

contextBridge.exposeInMainWorld("api", {


  getConfig(): Promise<AppConfig> {
    return invoke<AppConfig>(CH.CONFIG_GET);
  },

  setConfig(next: Partial<AppConfig>): Promise<{ ok: boolean, message?: string }> {
    return invoke(CH.CONFIG_SET, next);
  },

  onConfigChanged(handler: (cfg: AppConfig) => void) {
    const fn = (_ev: any, payload: AppConfig) => handler(payload);
    ipcRenderer.on(CH.EVT_CONFIG_CHANGED, fn);
    return () => ipcRenderer.off(CH.EVT_CONFIG_CHANGED, fn);
  },

  // ----- Path detection for Setup Wizard -----
  detectPaths: () => invoke("paths:detect"),
  browseFolder: () => invoke("dialog:browseFolder"),
  testWrite: (path: string) => invoke("fs:testWrite", path),
  ensureDirs: (paths: string[]) => invoke("fs:ensureDirs", paths),
  completeSetup: (config: Partial<AppConfig>) => invoke("setup:complete", config),
  
  // ----- Window controls -----
  windowMinimize: () => ipcRenderer.invoke("window:minimize"),
  windowToggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
  windowClose: () => ipcRenderer.invoke("window:close"),
  isWindowMaximized: (): Promise<boolean> =>
    ipcRenderer.invoke("window:isMaximized"),


  // ----- Background (Phase 4A.2) -----
  bgGet: () => invoke(CH.BG_GET),
  bgChoose: () => invoke(CH.BG_CHOOSE),
  bgSet: (p: string) => invoke(CH.BG_SET, p),
  bgReset: () => invoke(CH.BG_RESET),

  // ----- Mods -----
  // List rows as provided by main.ts listMods()
  listMods(): Promise<{ ok: true; mods: ModRow[] } | { ok: false; message: string }> {
    // keep the old fallback for safety; your main currently only uses "mods:list"
    return invoke("mods:list").catch(() => invoke("mods:listBoth"));
  },

  reconcileMods(desired: string[]): Promise<{ ok: boolean; message?: string }> {
    return invoke(CH.MODS_RECONCILE, desired).catch(() => invoke("mods:apply", desired));
  },

  deleteMod(name: string): Promise<{ ok: boolean; message?: string }> {
    return invoke(CH.MODS_DELETE, name);
  },

  // ----- Play / Launch -----
  canLaunch(): Promise<{ isModPlay: boolean }> {
    return invoke(CH.PLAY_CAN);
  },

  launch(): Promise<{ ok: boolean; mode?: "mod" | "vanilla"; exitCode?: number; message?: string }> {
    return invoke(CH.PLAY_LAUNCH);
  },

  // Convenience wrappers you already call from the main UI
  launchModPlay(): Promise<{ ok: boolean; mode?: "mod"; exitCode?: number; message?: string }> {
    return invoke(CH.LAUNCH_MOD);
  },

  launchVanillaPlay(): Promise<{ ok: boolean; mode?: "vanilla"; exitCode?: number; message?: string }> {
    return invoke(CH.LAUNCH_VAN);
  },

  manualGameDataSave(): Promise<{ ok: boolean; files?: number; bytes?: number; error?: string }> {
    return invoke(CH.MANUAL_SAVE);
  },

  // ----- Immutable Managed Paths (Advanced Settings → Managed Paths) -----
  async getImmutablePaths(): Promise<ImmutablePaths> {
    const res = await invoke<any>(CH.PATHS_IMMUTABLE_GET);
    // main/src/main/ipc/paths.ts returns { ok, modsVaultPath, modPlayVaultPath, activeModsPath }
    if (!res || res.ok === false) {
      return { modsVaultPath: "", modPlayVaultPath: "" };
    }
    return {
      modsVaultPath: res.modsVaultPath ?? "",
      modPlayVaultPath: res.modPlayVaultPath ?? "",
    };
  },

  watchersSetPaths: (paths: { mods?: string; modPlay?: string; backup?: string }) =>
    ipcRenderer.invoke("watchers:setPaths", paths),

  watchersEnable: (domain: string) =>
    ipcRenderer.invoke("watchers:enable", domain),

  onWatcherEvent: (cb: (payload: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: any) => {
      cb(payload);
    };
    ipcRenderer.on("watchers:event", listener);
    return () => {
      ipcRenderer.removeListener("watchers:event", listener);
    };
  },

  // ----- Generic bridge (used by hooks like useVaultWatcher) -----
  invoke: (channel: string, ...args: any[]) => invoke(channel, ...args),
  on: (channel: string, listener: (e: any, payload: any) => void) =>
    ipcRenderer.on(channel, listener),
  removeListener: (channel: string, listener: any) =>
    ipcRenderer.removeListener(channel, listener),
});

// Handy debug in DevTools:
console.log(
  "[PRELOAD] Context bridge setup complete.",
  Object.keys((globalThis as any).window?.api || {})
);