/**
 * @file electron/main.ts
 * @project Space Marine 2 Mod Loader
 * Main entry point - refactored for modularity
 * 
 * FIXED VERSION - Forces attach() to be called
 */

import { app, ipcMain } from "electron";
import { initializeApp, setupAppLifecycle } from "./lifecycle/appInitializer";
import { registerAllIpcHandlers } from "./ipc/ipcRegistry";
import { getMainWindow } from "./lifecycle/windowManager";
import { loadConfigFromDisk } from "./config/configManager";
import { watchRegistry } from "./watchRegistry";

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
  
  try {
    // Load config from disk into memory
    loadConfigFromDisk();
    console.log("[MAIN] Config loaded");
    
    // Register window + core IPC BEFORE window creation.
    registerWindowControlHandlers();
    registerAllIpcHandlers(null); // <-- first pass, IPC only
    console.log("[MAIN] Core IPC handlers registered (no window)");
    
    // Create window (preload loads, handlers already exist)
    console.log("[MAIN] Calling initializeApp()...");
    await initializeApp();
    console.log("[MAIN] initializeApp() returned successfully");
    
    // FIXED: Force attach() immediately after window creation
    console.log("[MAIN] Getting main window...");
    const mainWindow = getMainWindow();
    
    if (!mainWindow) {
      console.error("[MAIN] CRITICAL: No main window after initializeApp()");
      return;
    }
    
    console.log("[MAIN] Main window obtained, ID:", mainWindow.id);
    
    // FIXED: Attach window directly before calling registerAllIpcHandlers
    console.log("[MAIN] FIXED: Attaching window to watchRegistry directly");
    watchRegistry.attach(mainWindow);
    console.log("[MAIN] Window attached successfully");
    
    // Update handlers with window reference
    console.log("[MAIN] Calling registerAllIpcHandlers with window...");
    registerAllIpcHandlers(mainWindow);
    console.log("[MAIN] IPC handlers registered with window");
    
    console.log("[MAIN] ========================================");
    console.log("[MAIN] Initialization complete!");
    console.log("[MAIN] ========================================");
    
  } catch (error) {
    console.error("[MAIN] FATAL ERROR during initialization:", error);
    if (error instanceof Error) {
      console.error("[MAIN] Stack trace:", error.stack);
    }
  }
});

setupAppLifecycle();
console.log("[MAIN] setupAppLifecycle() called");