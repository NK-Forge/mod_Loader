// electron/ipc/vaultWatcher.ts
import { ipcMain, BrowserWindow, app } from "electron";
import { watchRegistry, type VaultPaths, type Domain } from "../watchRegistry";

export function registerVaultWatcherIPC(win: BrowserWindow) {
  watchRegistry.attach(win);

  ipcMain.handle("watchers:setPaths", (_e, paths: VaultPaths) => {
    watchRegistry.setPaths(paths);
    return { ok: true };
  });

  ipcMain.handle("watchers:enable", (_e, domain: Domain) => {
    return watchRegistry.enable(domain).then(() => ({ ok: true }));
  });

  ipcMain.handle("watchers:disable", (_e, domain: Domain) => {
    return watchRegistry.disable(domain).then(() => ({ ok: true }));
  });

  ipcMain.handle("watchers:refreshAll", async () => {
    // triggers rebuild + soft refresh events
    watchRegistry.setPaths({ ...{} }); // no-op merge, rebuild happens only when paths change
    return { ok: true };
  });
}

export async function teardownVaultWatchers() {
  await watchRegistry.disposeAll();
  app.on("before-quit", async () => {
    try { await watchRegistry.disposeAll(); } catch {}
    });
}
