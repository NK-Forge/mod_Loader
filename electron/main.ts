/**
 * @file electron/main.ts
 * @project Space Marine 2 Mod Loader
 * Main entry point - refactored for modularity
 */

import { app, ipcMain } from "electron";
import { initializeApp, setupAppLifecycle } from "./lifecycle/appInitializer";
import { registerAllIpcHandlers } from "./ipc/ipcRegistry";
import { getMainWindow } from "./lifecycle/windowManager";
import { loadConfigFromDisk } from "./config/configManager";

// Import side-effect modules (legacy paths IPC)
import "../src/main/ipc/paths";

/**
 * Register window control handlers EARLY (before window exists).
 * These are used by the preload bridge for the custom titlebar.
 */
function registerWindowControlHandlers() {
  console.log("[WINDOW] Registering window control handlers");
  
  ipcMain.handle("window:minimize", async () => {
    const win = getMainWindow();
    if (win) win.minimize();
  });

  ipcMain.handle("window:toggle-maximize", async () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  ipcMain.handle("window:close", async () => {
    const win = getMainWindow();
    if (win) win.close();
  });

  ipcMain.handle("window:isMaximized", async () => {
    const win = getMainWindow();
    return win ? win.isMaximized() : false;
  });
  
  console.log("[WINDOW] Window control handlers registered");
}

app.whenReady().then(async () => {
  console.log("[MAIN] App ready, starting initialization...");
  
  // Step 1: Load config from disk into memory
  loadConfigFromDisk();
  console.log("[MAIN] Config loaded");
  
  // Step 2: Register window + core IPC BEFORE window creation.
  // This ensures channels like config:get and watchers:setPaths exist
  // by the time the renderer + preload boot.
  registerWindowControlHandlers();
  registerAllIpcHandlers(null); // <-- first pass, IPC only
  console.log("[MAIN] Core IPC handlers registered (no window)");
  
  // Step 3: Create window (preload loads, handlers already exist)
  await initializeApp();
  console.log("[MAIN] Window created");
  
  // Step 4: Update handlers with window reference and attach watchers
  const mainWindow = getMainWindow();
  if (!mainWindow) {
    console.error("[MAIN] No main window after initializeApp");
    return;
  }
  registerAllIpcHandlers(mainWindow);
  console.log('[MAIN] IPC handlers registered');
});

setupAppLifecycle();
