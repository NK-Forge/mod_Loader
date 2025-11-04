// electron/preload.ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  // Config
  getConfig: () => ipcRenderer.invoke("config:get") as Promise<{
    gameRoot: string;
    gameExe: string;
    activeModsPath: string;
    modsVaultPath: string;
    modPlayVaultPath: string;
    saveDataPath: string;
    installStrategy: "hardlink" | "symlink" | "copy";
    autoDetected: boolean;
  }>,
  setConfig: (cfg: any) => ipcRenderer.invoke("config:set", cfg) as Promise<boolean>,

  // Mods
  listMods: () => ipcRenderer.invoke("mods:list") as Promise<string[]>,
  applyMods: (enabled: string[]) => ipcRenderer.invoke("mods:apply", enabled) as Promise<boolean>,

  // Launch (tracked save workflow)
  launchWithModsTracked: (enabled: string[]) =>
    ipcRenderer.invoke("mods:launchTracked", enabled) as Promise<boolean>,

  // Folder browsing
  browseFolder: () => ipcRenderer.invoke("browse:folder") as Promise<string | null>,
});
