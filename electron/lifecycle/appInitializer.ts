/**
 * @file electron/lifecycle/appInitializer.ts
 * @project Space Marine 2 Mod Loader
 * Application initialization and lifecycle management
 */

import { app, BrowserWindow } from "electron";
import { loadConfigFromDisk, getConfig, saveConfigToDisk } from "../config/configManager";
import { ensureDir } from "../../src/main/security/backup";
import {
  createWindow,
  getMainWindow,
  waitForWindowReady,
} from "./windowManager";
import { registerVaultWatcherIPC } from "../ipc/vaultWatcher";
import { watchRegistry } from "../watchRegistry";

export async function initializeApp(): Promise<void> {
  loadConfigFromDisk();
  const config = getConfig();

  // Ensure required directories exist
  await Promise.all([
    ensureDir(config.modsVaultPath),
    ensureDir(config.modPlayVaultPath),
    ensureDir(config.saveDataPath),
  ]);

  await createWindow();

  const mainWindow = getMainWindow();
  if (mainWindow) {
    // Wait until renderer is ready to receive events
    await waitForWindowReady(mainWindow);

    // Attach this window to the watcher registry / vault IPC
    registerVaultWatcherIPC(mainWindow);

    // Initial watcher paths – **vaults**, not active mods
    try {
      watchRegistry.setPaths({
        mods: config.modsVaultPath || "",
        modPlay: config.modPlayVaultPath || "",
        backup: config.saveDataPath || "",
      });
    } catch (err) {
      console.error("[Phase5] initial watchers:setPaths failed", err);
    }
  }
}

export function setupAppLifecycle(): void {
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on("before-quit", async () => {
    try {
      await (watchRegistry as any).disposeAll?.();
    } catch {}
  });

  app.on("window-all-closed", () => {
    saveConfigToDisk();
    if (process.platform !== "darwin") app.quit();
  });
}