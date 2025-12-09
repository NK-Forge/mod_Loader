// electron/ipc/vaultWatcher.ts
import { ipcMain, BrowserWindow, app } from "electron";
import { watchRegistry, type VaultPaths, type Domain } from "../watchRegistry";

let handlersRegistered = false;
let teardownRegistered = false;

/**
 * Register watcher IPC handlers and (optionally) attach a window
 * to receive "watchers:event" broadcasts.
 *
 * Safe call pattern:
 *   - First call early with `null` to register IPC
 *   - Call again later with the BrowserWindow to attach it
 */
export function registerVaultWatcherIPC(win: BrowserWindow | null) {
  // Register IPC handlers exactly once
  if (!handlersRegistered) {
    console.log("[vaultWatcher] registering IPC handlers");

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

    // Debug endpoint: introspect watcher state
    ipcMain.handle("watchers:getState", () => {
      console.log("[vaultWatcher] watchers:getState");
      return watchRegistry.getWatcherState();
    });

    handlersRegistered = true;
    console.log("[vaultWatcher] IPC handlers registered");
  }

  // Attach window if provided
  if (win) {
    watchRegistry.attach(win);
  }

  // ensure teardown hook is registered once
  registerTeardownOnBeforeQuit();
}

/**
 * Register a single before-quit hook that disposes all watchers.
 * This does not immediately dispose; it only wires cleanup for app shutdown.
 */
function registerTeardownOnBeforeQuit() {
  if (teardownRegistered) return;
  teardownRegistered = true;

  console.log("[vaultWatcher] registering before-quit teardown hook");
  app.on("before-quit", async () => {
    console.log("[vaultWatcher] before-quit: disposing all watchers");
    try {
      await watchRegistry.disposeAll();
    } catch (err) {
      console.error("[vaultWatcher] error during watcher disposal on quit:", err);
    }
  });
}

/**
 * Legacy helper kept for API compatibility. In practice, you can simply rely
 * on the before-quit hook; this function just ensures the hook is in place.
 */
export async function teardownVaultWatchers() {
  console.log("[vaultWatcher] teardownVaultWatchers called");
  registerTeardownOnBeforeQuit();
}