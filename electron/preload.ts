// electron/preload.ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  // Setup wizard
  detectPaths: () => ipcRenderer.invoke("detect:paths"),
  ensureDirs: (dirs: string[]) => ipcRenderer.invoke("fs:ensureDirs", dirs),
  testWrite: (dir: string) => ipcRenderer.invoke("fs:testWrite", dir),
  completeSetup: (cfg: any) => ipcRenderer.invoke("config:completeSetup", cfg),

  // Folder picker
  browseFolder: () => ipcRenderer.invoke("browse:folder"),

  // Config
  getConfig: () => ipcRenderer.invoke("config:get"),
  setConfig: (cfg: any) => ipcRenderer.invoke("config:set", cfg),

  // Mods – per your definitions
  modsScan: () => ipcRenderer.invoke("mods:scan"),
  enableMod: (name: string) => ipcRenderer.invoke("mods:enable", name),
  disableMod: (name: string) => ipcRenderer.invoke("mods:disable", name),
  deleteMod: (name: string) => ipcRenderer.invoke("mods:delete", name),

  // Convenience batch ops
  listMods: () => ipcRenderer.invoke("mods:scan").then((rows: any[]) => rows.map(r => r.name)),
  applyMods: (enabled: string[]) => ipcRenderer.invoke("mods:apply", enabled),
  launchWithModsTracked: (enabled: string[]) => ipcRenderer.invoke("mods:launchTracked", enabled),
});
