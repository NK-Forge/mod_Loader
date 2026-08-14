/**
 * @file electron/ipc/supportHandlers.ts
 * @project Space Marine 2 Mod Loader
 * Opens the fixed NK-Forge support page in the user's default browser.
 */

import { app, ipcMain, shell } from "electron";

const NK_FORGE_SUPPORT_URL = "https://ko-fi.com/nkforge";

let handlersRegistered = false;

export function registerSupportHandlers(): void {
  if (handlersRegistered) return;

  ipcMain.handle("app:getVersion", async () => app.getVersion());

  ipcMain.handle("support:open", async () => {
    try {
      await shell.openExternal(NK_FORGE_SUPPORT_URL);
      return { ok: true };
    } catch (error: any) {
      console.error("[SUPPORT] Failed to open support page:", error);
      return {
        ok: false,
        message: error?.message || "Failed to open the NK-Forge support page.",
      };
    }
  });

  handlersRegistered = true;
}
