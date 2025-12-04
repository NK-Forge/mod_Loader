/**
 * @file electron/ipc/setupHandlers.ts
 * @project Space Marine 2 Mod Loader
 * IPC handlers for setup wizard
 */

import { ipcMain, BrowserWindow } from "electron";
import { replaceConfig } from "../config/configManager";
import type { AppConfig } from "../config/configManager";

export function registerSetupHandlers(mainWindow: BrowserWindow | null): void {
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
}