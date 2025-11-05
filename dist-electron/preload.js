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
  // Config
  getConfig: () => electron.ipcRenderer.invoke("config:get"),
  setConfig: (cfg) => electron.ipcRenderer.invoke("config:set", cfg),
  // Mods – per your definitions
  modsScan: () => electron.ipcRenderer.invoke("mods:scan"),
  enableMod: (name) => electron.ipcRenderer.invoke("mods:enable", name),
  disableMod: (name) => electron.ipcRenderer.invoke("mods:disable", name),
  deleteMod: (name) => electron.ipcRenderer.invoke("mods:delete", name),
  // Convenience batch ops
  listMods: () => electron.ipcRenderer.invoke("mods:scan").then((rows) => rows.map((r) => r.name)),
  applyMods: (enabled) => electron.ipcRenderer.invoke("mods:apply", enabled),
  launchWithModsTracked: (enabled) => electron.ipcRenderer.invoke("mods:launchTracked", enabled)
});
