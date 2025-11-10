/**
 * @file main.ts
 * @project Space Marine 2 Mod Loader
 * @phase 3A — Path Integration
 * @description
 *  Entry point for the Electron main process.
 *  Handles application lifecycle, configuration persistence, IPC bridging,
 *  and window creation. Configuration is cached in memory and persisted to disk
 *  to synchronize Wizard → App state without reloads.
 */

import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import fs from "fs";

let mainWindow: BrowserWindow | null = null;

/** ------------------------------
 *  AppConfig type definition
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

/** In-memory configuration store */
let config: AppConfig = {
  setupComplete: false,
  autoDetected: false,
  gameRoot: "",
  gameExe: "",
  activeModsPath: "",
  modsVaultPath: "",
  modPlayVaultPath: "",
  saveDataPath: "",
  installStrategy: "hardlink",
};

/** Path where configuration JSON is saved */
const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");

/**
 * Load configuration from disk into memory.
 * @remarks Creates default config if missing.
 */
function loadConfigFromDisk(): void {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, "utf-8");
      config = { ...config, ...JSON.parse(data) };
      console.log("[Config] Loaded existing configuration.");
    } else {
      saveConfigToDisk();
      console.log("[Config] Created default configuration file.");
    }
  } catch (err) {
    console.error("[Config] Failed to load:", err);
  }
}

/**
 * Persist current in-memory configuration to disk.
 */
function saveConfigToDisk(): void {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  } catch (err) {
    console.error("[Config] Failed to save:", err);
  }
}

/**
 * Replace in-memory configuration and persist changes.
 * @param next - New configuration object.
 */
function replaceConfig(next: Partial<AppConfig>): void {
  config = { ...config, ...next };
  saveConfigToDisk();
  mainWindow?.webContents.send("config:changed", config);
}

/** ------------------------------
 *  IPC Handlers
 * ------------------------------ */

/** Provide current config to renderer. */
ipcMain.handle("config:get", () => config);

/** Update configuration partially and persist. */
ipcMain.handle("config:set", (_e, next: Partial<AppConfig>) => {
  replaceConfig(next);
  return config;
});

/**
 * Finalize setup from the wizard.
 * @fires config:changed - Broadcasts updated configuration.
 */
ipcMain.handle("config:completeSetup", (_e, next: AppConfig) => {
  replaceConfig({ ...next, setupComplete: true });
  return config;
});

/** ------------------------------
 *  Window Creation / App Lifecycle
 * ------------------------------ */

/**
 * Creates the main BrowserWindow for the Mod Loader UI.
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  } else {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => (mainWindow = null));
}

/**
 * Application ready event:
 * - Loads configuration
 * - Creates main window
 */
app.whenReady().then(() => {
  loadConfigFromDisk();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

/**
 * Graceful shutdown — persist config and cleanup.
 */
app.on("window-all-closed", () => {
  saveConfigToDisk();
  if (process.platform !== "darwin") app.quit();
});
