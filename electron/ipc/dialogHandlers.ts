// electron/ipc/dialogHandlers.ts

import { ipcMain, dialog, BrowserWindow } from "electron";

let handlersRegistered = false;
let cachedMainWindow: BrowserWindow | null = null;

export function registerDialogHandlers(mainWindow: BrowserWindow | null) {
  if (mainWindow) cachedMainWindow = mainWindow;
  if (handlersRegistered) return;

  ipcMain.handle("dialog:browseFolder", async () => {
    const win = cachedMainWindow ?? undefined;

    const result = await dialog.showOpenDialog(win as any, {
      properties: ["openDirectory", "createDirectory"],
    });

    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  handlersRegistered = true;
}
