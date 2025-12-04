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
import { watchRegistry } from "./watchRegistry";

// Import side-effect modules
import "../src/main/ipc/paths";

// Register window control handlers EARLY (before window exists)
function registerWindowControlHandlers() {
  console.log('[WINDOW] Registering window control handlers');
  
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
  
  console.log('[WINDOW] Window control handlers registered');
}

// Register watcher handlers EARLY (before window exists)
function registerWatcherHandlersEarly() {
  console.log('[WATCHERS] Registering watcher handlers (early)');
  
  ipcMain.handle("watchers:setPaths", (_e, paths) => {
    watchRegistry.setPaths(paths);
    return { ok: true };
  });

  ipcMain.handle("watchers:enable", (_e, domain) => {
    return watchRegistry.enable(domain).then(() => ({ ok: true }));
  });

  ipcMain.handle("watchers:disable", (_e, domain) => {
    return watchRegistry.disable(domain).then(() => ({ ok: true }));
  });

  ipcMain.handle("watchers:refreshAll", async () => {
    watchRegistry.setPaths({ ...{} });
    return { ok: true };
  });
  
  console.log('[WATCHERS] Watcher handlers registered');
}

app.whenReady().then(async () => {
  console.log('[MAIN] App ready, starting initialization...');
  
  // Step 1: Load config from disk
  loadConfigFromDisk();
  console.log('[MAIN] Config loaded');
  
  // Step 2: Register ALL handlers BEFORE window creation
  registerWindowControlHandlers();
  registerWatcherHandlersEarly();
  registerAllIpcHandlers(null);
  console.log('[MAIN] All handlers registered');
  
  // Step 3: Create window (preload loads, handlers already exist)
  await initializeApp();
  console.log('[MAIN] Window created');
  
  // Step 4: Update handlers with window reference and attach watchers
  const mainWindow = getMainWindow();
  if (mainWindow) {
    registerAllIpcHandlers(mainWindow);
    
    // Attach window to watch registry for event broadcasting
    watchRegistry.attach(mainWindow);
    
    console.log('[MAIN] Handlers updated with window reference');
  }
});

setupAppLifecycle();