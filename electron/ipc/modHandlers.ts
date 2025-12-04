/**
 * @file electron/ipc/modHandlers.ts
 * @project Space Marine 2 Mod Loader
 * IPC handlers for mod management
 */

import { ipcMain } from "electron";
import { getConfig } from "../config/configManager";
import { listMods, reconcileMods, deleteMod } from "../../src/main/mods/fsMods";

export function registerModHandlers(): void {
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
      await reconcileMods(
        enabledMods,
        config.activeModsPath,
        config.modsVaultPath,
        config.installStrategy
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
      await deleteMod(
        config.activeModsPath,
        config.modsVaultPath,
        modName,
        config.installStrategy
      );
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: e?.message ?? "Failed to delete mod." };
    }
  });
}