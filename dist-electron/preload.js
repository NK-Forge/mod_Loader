"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("api", {
  // Config
  getConfig: () => electron.ipcRenderer.invoke("config:get"),
  setConfig: (cfg) => electron.ipcRenderer.invoke("config:set", cfg),
  // Mods
  listMods: () => electron.ipcRenderer.invoke("mods:list"),
  applyMods: (enabled) => electron.ipcRenderer.invoke("mods:apply", enabled),
  // Launch (tracked save workflow)
  launchWithModsTracked: (enabled) => electron.ipcRenderer.invoke("mods:launchTracked", enabled),
  // Folder browsing
  browseFolder: () => electron.ipcRenderer.invoke("browse:folder")
});
