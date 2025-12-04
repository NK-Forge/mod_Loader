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
  // Unified launch handler
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
    if (!result.ok || !result.child) {
      showLaunchError(result.message || "Could not start game.");
      return { ok: false, message: result.message || "Launch error" };
    }

    // The spawned child is usually the Steam bootstrapper; it exits early.
    // We wait for it to close, THEN monitor the real game process.
    return await new Promise((resolve) => {
      result.child!.on("close", async (code: number) => {
        console.log("[play:launch] launcher process closed with code", code);

        if (isModPlay) {
          try {
            console.log(
              "[play:launch] Monitoring real game process for exit..."
            );
            await waitForGameProcessToExit("[play:launch]");
            console.log(
              "[play:launch] Real game exited, mirroring FROM game saves INTO vault"
            );
            await mirrorSavesIntoVault();
          } catch (err) {
            console.error("[play:launch] Auto-mirror failed:", err);
          }
        } else {
          console.log(
            "[play:launch] Skipping post-exit mirror (vanilla or no active mods)"
          );
        }

        resolve({
          ok: true,
          mode: isModPlay ? "mod" : "vanilla",
          exitCode: code ?? 0,
        });
      });
    });
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

  // Launch (Vanilla): no mirrors, just spawn
  ipcMain.handle("launchVanillaPlay", async () => {
    const result = launchGameExe();
    if (!result.ok || !result.child) {
      return {
        ok: false,
        message: result.message || "Could not launch (Vanilla)",
      };
    }
    return await new Promise((resolve) => {
      result.child!.on("close", (code: number) => {
        resolve({ ok: true, mode: "vanilla", exitCode: code ?? 0 });
      });
    });
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
      if (!result.ok || !result.child) {
        console.log("[launchModPlay] spawn failed:", result.message);
        return {
          ok: false,
          message: result.message || "Could not launch (Mod Play)",
        };
      }

      // Wait for the Steam launcher/bootstrapper to exit,
      // then monitor the real game process until it fully closes.
      return await new Promise((resolve) => {
        result.child!.on("close", async (code: number) => {
          console.log(
            "[launchModPlay] launcher process closed with code",
            code
          );

          try {
            console.log(
              "[launchModPlay] Monitoring real game process for exit..."
            );
            await waitForGameProcessToExit("[launchModPlay]");
            console.log(
              "[launchModPlay] Real game exited, mirroring FROM game saves INTO vault"
            );
            await mirrorSavesIntoVault();
            console.log("[launchModPlay] Auto-mirror completed.");
          } catch (err) {
            console.error("[launchModPlay] Auto-mirror failed:", err);
          }

          resolve({ ok: true, mode: "mod", exitCode: code ?? 0 });
        });
      });
    } catch (e: any) {
      console.error("[launchModPlay] exception:", e);
      return { ok: false, message: e?.message || "Launch (Mod Play) failed" };
    }
  });
  handlersRegistered = true;
}