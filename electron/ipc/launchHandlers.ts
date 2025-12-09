/**
 * @file electron/ipc/launchHandlers.ts
 * @project Space Marine 2 Mod Loader
 * IPC handlers for game launching (vanilla and mod play)
 */

import { ipcMain } from "electron";
import { getConfig } from "../config/configManager";
import { launchGameExe, showLaunchError } from "../utils/gameLauncher";
import {
  mirrorVaultIntoGameSavesIfPresent,
  mirrorSavesIntoVault,
} from "../utils/saveDataManager";
import { dirIsEmpty } from "../utils/fileSystemUtils";
import { waitForGameProcessToExit } from "../gameMonitor";

let handlersRegistered = false;

export function registerLaunchHandlers(): void {
  if (handlersRegistered) return;

  // Unified launch handler (auto decides mod vs vanilla based on activeModsPath)
  ipcMain.handle("play:launch", async () => {
    console.log("=== [play:launch] invoked ===");
    const config = getConfig();
    console.log("[play:launch] activeModsPath =", config.activeModsPath);

    const modsEmpty = await dirIsEmpty(config.activeModsPath);
    console.log("[play:launch] dirIsEmpty(activeModsPath) =", modsEmpty);

    const isModPlay = !modsEmpty;
    console.log("[play:launch] isModPlay =", isModPlay);

    // Pre-launch behavior: only for Mod Play
    if (isModPlay) {
      console.log("[play:launch] Pre-launch mirror FROM vault INTO game saves");
      await mirrorVaultIntoGameSavesIfPresent();
    } else {
      console.log(
        "[play:launch] Skipping pre-launch mirror (vanilla or no active mods)"
      );
    }

    const result = launchGameExe();
    if (!result.ok) {
      showLaunchError(result.message || "Could not start game.");
      return { ok: false, message: result.message || "Launch error" };
    }

    if (!isModPlay) {
      // Vanilla: no monitoring/mirroring required
      console.log("[play:launch] Launched vanilla play (no monitoring).");
      return { ok: true, mode: "vanilla", exitCode: 0 };
    }

    // Mod Play: monitor real game process until exit, then mirror back
    try {
      console.log("[play:launch] Monitoring real game process for exit...");
      await waitForGameProcessToExit("[play:launch]");
      console.log(
        "[play:launch] Real game exited, mirroring FROM game saves INTO vault"
      );
      await mirrorSavesIntoVault();
      console.log("[play:launch] Auto-mirror completed.");
    } catch (err) {
      console.error("[play:launch] Auto-mirror failed:", err);
      return {
        ok: false,
        mode: "mod",
        message: (err as any)?.message || "Auto-mirror failed",
      };
    }

    return {
      ok: true,
      mode: "mod",
      exitCode: 0,
    };
  });

  // Manual save: copy game config → mod_play_vault (overwrites)
  ipcMain.handle("manualGameDataSave", async () => {
    try {
      await mirrorSavesIntoVault();
      return { ok: true, files: 0, bytes: 0 };
    } catch (e: any) {
      return { ok: false, error: e?.message || "manualGameDataSave failed" };
    }
  });

  // Launch (Vanilla): no mirrors, no monitoring; just launch
  ipcMain.handle("launchVanillaPlay", async () => {
    console.log("=== [launchVanillaPlay] invoked ===");
    const result = launchGameExe();
    if (!result.ok) {
      console.log("[launchVanillaPlay] launch failed:", result.message);
      return {
        ok: false,
        message: result.message || "Could not launch (Vanilla)",
      };
    }

    console.log("[launchVanillaPlay] Launched vanilla play via URI.");
    // We don't monitor or mirror in vanilla mode
    return { ok: true, mode: "vanilla", exitCode: 0 };
  });

  // Launch (Mod Play): pre-mirror (vault→config if vault has data), then post-mirror (config→vault)
  ipcMain.handle("launchModPlay", async () => {
    console.log("=== [launchModPlay] invoked ===");
    const config = getConfig();
    console.log("[launchModPlay] saveDataPath =", config.saveDataPath);
    console.log("[launchModPlay] modPlayVaultPath =", config.modPlayVaultPath);

    try {
      console.log(
        "[launchModPlay] Pre-launch mirror FROM vault INTO game saves"
      );
      await mirrorVaultIntoGameSavesIfPresent();

      const result = launchGameExe();
      if (!result.ok) {
        console.log("[launchModPlay] launch failed:", result.message);
        return {
          ok: false,
          message: result.message || "Could not launch (Mod Play)",
        };
      }

      // 🔹 New flow: no child, no 30s delay, no stub.
      // We directly monitor the real SM2 process by name until it exits.
      console.log(
        "[launchModPlay] Monitoring real game process for exit..."
      );
      await waitForGameProcessToExit("[launchModPlay]");
      console.log(
        "[launchModPlay] Real game exited, mirroring FROM game saves INTO vault"
      );
      await mirrorSavesIntoVault();
      console.log("[launchModPlay] Auto-mirror completed.");

      return { ok: true, mode: "mod", exitCode: 0 };
    } catch (e: any) {
      console.error("[launchModPlay] exception:", e);
      return {
        ok: false,
        message: e?.message || "Launch (Mod Play) failed",
      };
    }
  });

  handlersRegistered = true;
}
