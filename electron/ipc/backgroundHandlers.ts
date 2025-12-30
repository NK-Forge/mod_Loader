/**
 * @file electron/ipc/backgroundHandlers.ts
 * @project Space Marine 2 Mod Loader
 * IPC handlers for background image management
 * TODO: Implement background image management 
 */

import { ipcMain, dialog, BrowserWindow } from "electron";
import path from "path";
import fse from "fs-extra";
import { getConfig, replaceConfig } from "../config/configManager";
import {
  bgStorageDir,
  bgDestFor,
  toFileUrl,
} from "../utils/backgroundUtils";

let cachedMainWindow: BrowserWindow | null = null;
let handlersRegistered = false;

export function registerBackgroundHandlers(
  mainWindow: BrowserWindow | null
): void {
  if (mainWindow) cachedMainWindow = mainWindow;
  if (handlersRegistered) return;
  ipcMain.handle("bg:get", async () => {
    const config = getConfig();
    const p = config.backgroundImagePath || "";
    return { ok: true, path: p, fileUrl: p ? toFileUrl(p) : "" };
  });

  ipcMain.handle("bg:choose", async () => {
    const res = await dialog.showOpenDialog({
      title: "Choose background image",
      properties: ["openFile"],
      filters: [
        { name: "Images", extensions: ["jpg", "jpeg", "png", "webp"] },
      ],
    });
    if (res.canceled || res.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    return { ok: true, path: res.filePaths[0] };
  });

  ipcMain.handle("bg:set", async (_e, srcAbs: string) => {
    try {
      if (!srcAbs) return { ok: false, message: "No file selected." };
      const allowed = [".jpg", ".jpeg", ".png", ".webp"];
      const ext = path.extname(srcAbs).toLowerCase();
      if (!allowed.includes(ext)) {
        return { ok: false, message: "Unsupported format." };
      }
      await fse.ensureDir(bgStorageDir());
      const dst = bgDestFor(srcAbs);
      await fse.copy(srcAbs, dst, { overwrite: true });
      replaceConfig({ backgroundImagePath: dst }, mainWindow);
      return { ok: true, path: dst, fileUrl: toFileUrl(dst) };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Failed to set background." };
    }
  });

  ipcMain.handle("bg:reset", async () => {
    replaceConfig({ backgroundImagePath: "" }, mainWindow);
    return { ok: true };
  });
  handlersRegistered = true;
}