// electron/ipc/vaultWatcher.ts
import { ipcMain, BrowserWindow, app } from "electron";
import { watchRegistry, type VaultPaths, type Domain } from "../watchRegistry";

let watcherHandlersRegistered = false;
let lastAttachedWindowId: number | null = null;

/**
 * Register IPC handlers for the vault/watchers system.
 *
 * Called twice from ipcRegistry:
 *  - First with mainWindow = null (early, before window exists) so that
 *    watchers:* IPC channels are available as soon as the renderer boots.
 *  - Then again with the real BrowserWindow so watchRegistry can attach
 *    and start emitting watcher events.
 *
 * Handlers are only registered once; subsequent calls just update attach().
 */
export function registerVaultWatcherIPC(win: BrowserWindow | null) {
  if (win && !win.isDestroyed()) {
    console.log("[vaultWatcher] attaching watchRegistry to window id", win.id);
    watchRegistry.attach(win);
    lastAttachedWindowId = win.id;
  } else {
    console.log("[vaultWatcher] called with no window (IPC only)");
  }

  if (watcherHandlersRegistered) {
    console.log("[vaultWatcher] IPC handlers already registered, skipping");
    return;
  }
  watcherHandlersRegistered = true;

  console.log("[vaultWatcher] Registering watcher IPC handlers");

  ipcMain.handle("watchers:setPaths", (_e, paths: VaultPaths) => {
    console.log("[vaultWatcher] watchers:setPaths", paths);
    watchRegistry.setPaths(paths);
    return { ok: true };
  });

  ipcMain.handle("watchers:enable", async (_e, domain: Domain) => {
    console.log("[vaultWatcher] watchers:enable", domain);
    await watchRegistry.enable(domain);
    return { ok: true };
  });

  ipcMain.handle("watchers:disable", async (_e, domain: Domain) => {
    console.log("[vaultWatcher] watchers:disable", domain);
    await watchRegistry.disable(domain);
    return { ok: true };
  });

  ipcMain.handle("watchers:refreshAll", async () => {
    console.log("[vaultWatcher] watchers:refreshAll");
    await watchRegistry.refreshAll();
    return { ok: true };
  });
}

export async function teardownVaultWatchers() {
  console.log("[vaultWatcher] teardownVaultWatchers called");
  await watchRegistry.disposeAll();
  app.on("before-quit", async () => {
    try {
      await watchRegistry.disposeAll();
    } catch {
      // ignore
    }
  });
}
