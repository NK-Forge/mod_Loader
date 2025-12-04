/**
 * @file electron/config/configManager.ts
 * @project Space Marine 2 Mod Loader
 * Configuration management and persistence
 */

import { app, BrowserWindow } from "electron";
import path from "path";
import fs from "fs";
import { patchConfig as syncConfigStore } from "../../src/main/state/configStore";

export type InstallStrategy = "hardlink" | "symlink" | "copy";

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
  backgroundImagePath?: string;
}

const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");

let config: AppConfig = {
  setupComplete: false,
  autoDetected: false,
  gameRoot: "",
  gameExe: "",
  activeModsPath: "",
  modsVaultPath: path.join(app.getPath("userData"), "mods_vault"),
  modPlayVaultPath: path.join(app.getPath("userData"), "mod_play_vault"),
  saveDataPath: "",
  installStrategy: "hardlink",
  backgroundImagePath: "",
};

export function getConfig(): AppConfig {
  return config;
}

export function loadConfigFromDisk(): void {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
      config = { ...config, ...data };
      syncConfigStore(config);
    } else {
      // first run: persist defaults and sync
      saveConfigToDisk();
      syncConfigStore(config);
    }
  } catch (err) {
    console.error("[Config] load error:", err);
  }
}

export function saveConfigToDisk(): void {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  } catch (err) {
    console.error("[Config] save error:", err);
  }
}

export function replaceConfig(
  next: Partial<AppConfig>,
  mainWindow?: BrowserWindow | null
): void {
  config = { ...config, ...next };
  saveConfigToDisk();
  syncConfigStore(config);
  mainWindow?.webContents.send("config:changed", config);
}