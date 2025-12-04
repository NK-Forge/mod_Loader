/**
 * @file electron/ipc/configHandlers.ts
 * @project Space Marine 2 Mod Loader
 * IPC handlers for configuration management
 */

import { ipcMain, BrowserWindow } from "electron";
import { getConfig, replaceConfig } from "../config/configManager";
import { detectPaths } from "../config/pathDetection";
import type { AppConfig } from "../config/configManager";

export function registerConfigHandlers(mainWindow: BrowserWindow | null): void {
  ipcMain.handle("config:get", async () => {
    return { ok: true, config: getConfig() };
  });

  ipcMain.handle("config:update", async (_e, update: Partial<AppConfig>) => {
    try {
      replaceConfig(update, mainWindow);
      return { ok: true, config: getConfig() };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Update failed" };
    }
  });

  ipcMain.handle("config:detectPaths", async () => {
    try {
      const detected = await detectPaths();
      return { ok: true, ...detected };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Detection failed" };
    }
  });
}