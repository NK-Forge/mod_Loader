/**
 * @file electron/ipc/configHandlers.ts
 * @project Space Marine 2 Mod Loader
 * IPC handlers for configuration management
 */

import { ipcMain, BrowserWindow } from "electron";
import { getConfig, replaceConfig } from "../config/configManager";
import { detectPaths } from "../config/pathDetection";
import type { AppConfig } from "../config/configManager";
import { ensureDirSync } from "../utils/fileSystemUtils";

let cachedMainWindow: BrowserWindow | null = null;
let handlersRegistered = false;

export function registerConfigHandlers(mainWindow: BrowserWindow | null): void {
  // Update cached window reference
  if (mainWindow) {
    cachedMainWindow = mainWindow;
  }
  
  // Only register handlers once
  if (handlersRegistered) {
    console.log('[CONFIG] Handlers already registered, just updating window reference');
    return;
  }
  
  console.log('[CONFIG] Registering config handlers');
  
  ipcMain.handle("config:get", async () => {
    console.log('[CONFIG] config:get invoked');
    return getConfig();
  });

  ipcMain.handle("config:update", async (_e, update: Partial<AppConfig>) => {
    try {
      // Use cached window if available
      replaceConfig(update, cachedMainWindow);
      return { ok: true };
    } catch (e: any) {
      console.error('[CONFIG] config:update failed:', e);
      return { ok: false, message: e?.message || "Update failed" };
    }
  });

  ipcMain.handle("config:detectPaths", async () => {
    try {
      const detected = await detectPaths();
      return { ok: true, detected };
    } catch (e: any) {
      console.error('[CONFIG] config:detectPaths failed:', e);
      return { ok: false, message: e?.message || "Detection failed" };
    }
  });

    ipcMain.handle("paths:detect", async () => {
    try {
      const detected = await detectPaths();
      console.log("[PATHS] detectPaths result =", detected);
      return { ok: true, detected };
    } catch (e: any) {
      console.error("[PATHS] paths:detect failed:", e);
      return {
        ok: false,
        message: e?.message || "Path detection failed",
      };
    }
  });

    // Ensure one or more directories exist (used by Setup Wizard to create vault dirs)
  ipcMain.handle("fs:ensureDirs", async (_event, dirs: string[]) => {
    try {
      if (!Array.isArray(dirs)) {
        throw new Error("dirs must be an array of paths");
      }

      for (const dir of dirs) {
        if (!dir || typeof dir !== "string") continue;
        await ensureDirSync(dir);
      }

      return { ok: true };
    } catch (e: any) {
      console.error("[FS] fs:ensureDirs failed:", e);
      return {
        ok: false,
        message: e?.message || "Failed to ensure directories exist",
      };
    }
  });

  
  handlersRegistered = true;
  console.log('[CONFIG] Config handlers registered');
}