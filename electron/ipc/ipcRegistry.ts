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

export function registerAllIpcHandlers(mainWindow: BrowserWindow | null): void {
  console.log('[IPC] Registering all handlers...');
  
  registerConfigHandlers(mainWindow);
  registerModHandlers();
  registerLaunchHandlers();
  registerBackgroundHandlers(mainWindow);
  registerSetupHandlers(mainWindow);
  
  console.log('[IPC] All handlers registered');
}