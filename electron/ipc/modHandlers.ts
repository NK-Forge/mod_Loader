/**
 * @file electron/ipc/modHandlers.ts
 * @project Space Marine 2 Mod Loader
 * IPC handlers for mod management
 */

import { ipcMain } from "electron";
import path from "path";
import { getConfig } from "../config/configManager";
import { listMods, reconcileMods, deleteMod } from "../../src/main/mods/fsMods";

let handlersRegistered = false;

/**
 * Keep pre-reconcile snapshots beside the configured Mods Vault rather than
 * resolving a relative path from the process working directory. This makes
 * the backup location deterministic for dev and packaged builds and follows
 * the user's manager-data location when the Mods Vault is relocated.
 */
function getBackupRoot(modsVaultPath: string): string {
  const normalizedVaultPath = modsVaultPath?.trim();
  if (!normalizedVaultPath) {
    throw new Error(
      "Mods Vault path is not configured; cannot resolve backup location.",
    );
  }
  if (!path.isAbsolute(normalizedVaultPath)) {
    throw new Error(
      "Mods Vault path must be absolute; refusing to create backups relative to the process working directory.",
    );
  }

  return path.join(path.dirname(normalizedVaultPath), "backups");
}

export function registerModHandlers(): void {
  if (handlersRegistered) return;
  // --- Mods: list ---
  ipcMain.handle("mods:list", async () => {
    try {
      const config = getConfig();
      const mods = await listMods(
        config.activeModsPath,
        config.modsVaultPath
      );
      return { ok: true, mods };
    } catch (e: any) {
      return { ok: false, message: e?.message ?? "Failed to list mods." };
    }
  });

  // --- Mods: reconcile ---
  ipcMain.handle("mods:reconcile", async (_e, enabledMods: string[]) => {
    try {
      const config = getConfig();
      const backupRoot = getBackupRoot(config.modsVaultPath);
      await reconcileMods(
        enabledMods,
        config.activeModsPath,
        config.modsVaultPath,
        backupRoot,
        config.maxPreReconcileBackups
      );
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: e?.message ?? "Failed to reconcile mods." };
    }
  });

  // --- Mods: delete ---
  ipcMain.handle("mods:delete", async (_e, modName: string) => {
    try {
      const config = getConfig();
      const backupRoot = getBackupRoot(config.modsVaultPath);
      await deleteMod(
        config.activeModsPath,
        config.modsVaultPath,
        modName,
        backupRoot
      );
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: e?.message ?? "Failed to delete mod." };
    }
  });
  handlersRegistered = true;
}