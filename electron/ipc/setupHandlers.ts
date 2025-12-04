/**
 * @file electron/ipc/setupHandlers.ts
 * @project Space Marine 2 Mod Loader
 * IPC handlers for setup wizard
 */

import { ipcMain, BrowserWindow } from "electron";
import { replaceConfig } from "../config/configManager";
import type { AppConfig } from "../config/configManager";

let cachedMainWindow: BrowserWindow | null = null;
let handlersRegistered = false;

export function registerSetupHandlers(mainWindow: BrowserWindow | null): void {
  if (mainWindow) cachedMainWindow = mainWindow;
  if (handlersRegistered) return;
  ipcMain.handle(
    "setup:complete",
    async (_event, configUpdate: Partial<AppConfig>) => {
      try {
        replaceConfig(
          {
            ...configUpdate,
            setupComplete: true,
          },
          mainWindow
        );

        return { ok: true };
      } catch (error) {
        console.error("Setup completion failed:", error);
        const err = error as Error;
        return { ok: false, message: err.message };
      }
    }
  );
  handlersRegistered = true;
}