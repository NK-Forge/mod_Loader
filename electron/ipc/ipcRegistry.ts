/**
 * @file electron/ipc/ipcRegistry.ts
 * @project Space Marine 2 Mod Loader
 * Central registry for all IPC handlers
 */

import { BrowserWindow } from "electron";
import { registerConfigHandlers } from "./configHandlers";
import { registerModHandlers } from "./modHandlers";
import { registerLaunchHandlers } from "./launchHandlers";
import { registerBackgroundHandlers } from "./backgroundHandlers";
import { registerSetupHandlers } from "./setupHandlers";
import { registerVaultWatcherIPC } from "./vaultWatcher";

export function registerAllIpcHandlers(mainWindow: BrowserWindow | null): void {
  console.log("[IPC] Registering all handlers (mainWindow =", mainWindow ? mainWindow.id : "null", ")");

  // Config and core app IPC
  registerConfigHandlers(mainWindow);
  registerModHandlers();
  registerLaunchHandlers();
  registerBackgroundHandlers(mainWindow);
  registerSetupHandlers(mainWindow);

  // Watchers: always call this. First call (null) sets up IPC handlers;
  // second call (with window) attaches the registry to that window.
  registerVaultWatcherIPC(mainWindow);

  console.log("[IPC] All handlers registered");
}
