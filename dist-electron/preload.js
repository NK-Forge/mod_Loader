"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("api", {
  // Setup wizard
  detectPaths: () => electron.ipcRenderer.invoke("detect:paths"),
  ensureDirs: (dirs) => electron.ipcRenderer.invoke("fs:ensureDirs", dirs),
  testWrite: (dir) => electron.ipcRenderer.invoke("fs:testWrite", dir),
  completeSetup: (cfg) => electron.ipcRenderer.invoke("config:completeSetup", cfg),
  // Folder picker
  browseFolder: () => electron.ipcRenderer.invoke("browse:folder"),
  // Config (Phase-2)
  getConfig: () => electron.ipcRenderer.invoke("config:get"),
  setConfig: (cfg) => electron.ipcRenderer.invoke("config:set", cfg),
  // Mods – per your definitions (Phase-2)
  modsScan: () => electron.ipcRenderer.invoke("mods:scan"),
  enableMod: (name) => electron.ipcRenderer.invoke("mods:enable", name),
  disableMod: (name) => electron.ipcRenderer.invoke("mods:disable", name),
  deleteMod: (name) => electron.ipcRenderer.invoke("mods:delete", name),
  // Convenience batch ops
  listMods: () => electron.ipcRenderer.invoke("mods:scan").then((rows) => rows.map((r) => r.name)),
  applyMods: (enabled) => electron.ipcRenderer.invoke("mods:apply", enabled),
  launchWithModsTracked: (enabled) => electron.ipcRenderer.invoke("mods:launchTracked", enabled),
  // === Phase-3: Advanced Settings helpers ===
  // Open a folder in the OS
  revealPath: (p) => electron.ipcRenderer.invoke("paths:reveal", p),
  // Read copy events from main (JSONL parser lives in main/ipc/copylog.ts)
  listCopyEvents: (modPlayVault, lastDays) => electron.ipcRenderer.invoke("copylog:list", { modPlayVault, lastDays }),
  // Manual backup trigger behind "manual game data save" button
  manualGameDataSave: () => electron.ipcRenderer.invoke("saves:manualBackup"),
  // Map your existing config shape to the read-only “Managed Paths” shape
  // so we don’t need a new IPC endpoint.
  getImmutablePaths: async () => {
    const cfg = await electron.ipcRenderer.invoke("config:get");
    return {
      modPlayVault: cfg.modPlayVaultPath ?? "",
      modsVault: cfg.modsVaultPath ?? "",
      // Until a dedicated logs dir exists, reuse saveDataPath for both
      configRoot: cfg.saveDataPath ?? "",
      logsRoot: cfg.saveDataPath ?? ""
    };
  },
  // Optional: in case you broadcast config changes from main
  onConfigChanged: (cb) => {
    const ch = "config:changed";
    const handler = () => cb();
    electron.ipcRenderer.on(ch, handler);
    return () => electron.ipcRenderer.removeListener(ch, handler);
  },
  // Mods – scanning both active and vault locations
  listModsBoth: () => electron.ipcRenderer.invoke("mods:scanBoth"),
  startModsWatch: () => electron.ipcRenderer.invoke("mods:watchStart"),
  stopModsWatch: () => electron.ipcRenderer.invoke("mods:watchStop"),
  onModsChanged: (cb) => {
    const ch = "mods:changed";
    const handler = () => cb();
    electron.ipcRenderer.on(ch, handler);
    return () => electron.ipcRenderer.removeListener(ch, handler);
  }
});
