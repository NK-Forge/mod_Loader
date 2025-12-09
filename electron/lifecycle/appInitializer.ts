/**
 * @file electron/lifecycle/appInitializer.ts
 * @project Space Marine 2 Mod Loader
 * Application initialization and lifecycle management
 * 
 * DIAGNOSTIC VERSION - with extensive logging
 */

import { app, BrowserWindow } from "electron";
import { loadConfigFromDisk, getConfig, saveConfigToDisk } from "../config/configManager";
import { ensureDir } from "../../src/main/security/backup";
import {
  createWindow,
  getMainWindow,
  waitForWindowReady,
} from "./windowManager";
import { watchRegistry } from "../watchRegistry";

export async function initializeApp(): Promise<void> {
  console.log("[appInit] START - initializeApp called");
  
  try {
    console.log("[appInit] Loading config from disk...");
    loadConfigFromDisk();
    const config = getConfig();
    console.log("[appInit] Config loaded successfully");

    // Ensure required directories exist
    console.log("[appInit] Ensuring directories exist...");
    await Promise.all([
      ensureDir(config.modsVaultPath),
      ensureDir(config.modPlayVaultPath),
      ensureDir(config.saveDataPath),
    ]);
    console.log("[appInit] Directories ensured");

    console.log("[appInit] Creating window...");
    await createWindow();
    console.log("[appInit] Window creation completed");

    const mainWindow = getMainWindow();
    console.log("[appInit] getMainWindow returned:", mainWindow ? `Window ID ${mainWindow.id}` : "null");
    
    if (mainWindow) {
      // NOTE: Not waiting for window ready because the renderer boots independently
      // and the IPC handlers are already registered. The renderer will call setPaths
      // via IPC when it's ready, which will be properly deferred until attach() is called.
      console.log("[appInit] Main window available, continuing initialization");
      console.log("[appInit] Skipping direct watchRegistry.setPaths() call (handled by renderer)");
    } else {
      console.warn("[appInit] No main window available after createWindow()");
    }
    
    console.log("[appInit] END - initializeApp completed successfully");
  } catch (err) {
    console.error("[appInit] ERROR in initializeApp:", err);
    throw err; // Re-throw so caller knows something went wrong
  }
}

export function setupAppLifecycle(): void {
  console.log("[appInit] Setting up app lifecycle handlers");
  
  app.on("activate", () => {
    console.log("[appInit] App activated");
    if (BrowserWindow.getAllWindows().length === 0) {
      console.log("[appInit] No windows, creating new window");
      createWindow();
    }
  });

  app.on("before-quit", async () => {
    console.log("[appInit] App before-quit event");
    try {
      await (watchRegistry as any).disposeAll?.();
      console.log("[appInit] Watchers disposed successfully");
    } catch (err) {
      console.error("[appInit] Error disposing watchers:", err);
    }
  });

  app.on("window-all-closed", () => {
    console.log("[appInit] All windows closed");
    saveConfigToDisk();
    console.log("[appInit] Config saved to disk");
    if (process.platform !== "darwin") {
      console.log("[appInit] Quitting app (non-macOS)");
      app.quit();
    }
  });
  
  console.log("[appInit] App lifecycle handlers registered");
}