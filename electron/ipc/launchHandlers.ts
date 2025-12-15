/**
 * @file electron/ipc/launchHandlers.ts
 * @project Space Marine 2 Mod Loader
 *
 * Game launch + monitor + save-mirror pipeline.
 * Uses platform-based URI launches (Steam/Epic).
 * For Mod Play:
 *   - mirror vault → saves before launch
 *   - launch via URI
 *   - wait for real game process to appear + exit
 *   - mirror saves → vault after exit
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

type LaunchMode = "mod" | "vanilla";

/**
 * Core launch pipeline used by all IPC handlers.
 * - If forceMode is provided, it overrides the auto-detection.
 */
async function handlePlayLaunch(forceMode?: LaunchMode) {
  console.log("=== [play:launch] UNIFIED HANDLER invoked ===");
  const config = getConfig();
  console.log("[play:launch] activeModsPath =", config.activeModsPath);

  // Determine if we're in mod play mode
  const modsEmpty = await dirIsEmpty(config.activeModsPath);

  let isModPlay: boolean;
  if (forceMode === "mod") {
    isModPlay = true;
  } else if (forceMode === "vanilla") {
    isModPlay = false;
  } else {
    isModPlay = !modsEmpty;
  }

  console.log("[play:launch] isModPlay =", isModPlay);

  // Pre-launch mirroring (only for mod play)
  if (isModPlay) {
    console.log("[play:launch] Pre-launch mirror: vault → game saves");
    try {
      await mirrorVaultIntoGameSavesIfPresent();
    } catch (err) {
      console.error("[play:launch] Pre-launch mirror failed:", err);
      return {
        ok: false as const,
        mode: "mod" as const,
        message: `Failed to prepare save files: ${(err as Error).message}`,
      };
    }
  }

  // Launch game via platform-specific URI (Steam/Epic)
  console.log("[play:launch] Launching game via URI...");
  const result = launchGameExe();
  if (!result.ok) {
    const msg = result.message || "Could not start game.";
    showLaunchError(msg);
    return {
      ok: false as const,
      mode: isModPlay ? ("mod" as const) : ("vanilla" as const),
      message: msg,
    };
  }

  console.log("[play:launch] Game launch initiated successfully");

  // Vanilla mode: no monitoring or mirroring needed
  if (!isModPlay) {
    console.log("[play:launch] Vanilla mode - no monitoring/mirroring");
    return { ok: true as const, mode: "vanilla" as const, exitCode: 0 };
  }

  // Mod Play: monitor AFTER launch, until real game exits
  console.log("[play:launch] Mod Play mode - starting game process monitor");

  try {
    const monitorStart = Date.now();
    console.log("[play:launch] Waiting for game process to appear and exit...");

    await waitForGameProcessToExit("[play:launch]");

    const monitorDurationSec = Math.round((Date.now() - monitorStart) / 1000);
    console.log(
      `[play:launch] Game exited after ~${monitorDurationSec}s, mirroring saves back to vault...`
    );

    await mirrorSavesIntoVault();

    console.log("[play:launch] Auto-mirror completed successfully");

    return {
      ok: true as const,
      mode: "mod" as const,
      exitCode: 0,
    };
  } catch (err) {
    const errorMsg = (err as Error)?.message || "Unknown error";
    console.error("[play:launch] Monitor/mirror pipeline failed:", {
      error: errorMsg,
      stack: (err as Error)?.stack,
    });

    return {
      ok: false as const,
      mode: "mod" as const,
      message: `Auto-mirror failed: ${errorMsg}`,
    };
  }
}

export function registerLaunchHandlers(): void {
  if (handlersRegistered) {
    console.warn("[LaunchHandlers] Already registered, skipping");
    return;
  }

  // Used by renderer to decide which button/mode is valid
  ipcMain.handle("play:canLaunch", async () => {
    const config = getConfig();
    const modsEmpty = await dirIsEmpty(config.activeModsPath);
    const isModPlay = !modsEmpty;
    console.log("[play:canLaunch] isModPlay =", isModPlay);
    return { isModPlay };
  });

  // Primary unified launch handler used by preload's api.launch()
  ipcMain.handle("play:launch", async () => {
    return handlePlayLaunch();
  });

  // Back-compat wrappers for api.launchModPlay() / api.launchVanillaPlay()
  // (preload.ts maps CH.LAUNCH_MOD / CH.LAUNCH_VAN to these channels)
  ipcMain.handle("launchModPlay", async () => {
    console.log("=== [launchModPlay] wrapper -> play:launch (mod) ===");
    return handlePlayLaunch("mod");
  });

  ipcMain.handle("launchVanillaPlay", async () => {
    console.log("=== [launchVanillaPlay] wrapper -> play:launch (vanilla) ===");
    return handlePlayLaunch("vanilla");
  });

  // Manual save button in UI
  ipcMain.handle("manualGameDataSave", async () => {
    console.log("[manual-save] Manual save triggered");
    try {
      await mirrorSavesIntoVault();
      console.log("[manual-save] Manual save completed");
      // If you later track stats (files/bytes), return them here. i.e.: return { ok: true, files: 0, bytes: 0 };
      return { ok: true };
    } catch (e: any) {
      console.error("[manual-save] Failed:", e);
      return {
        ok: false,
        error: e?.message || "Manual save failed",
      };
    }
  });

  handlersRegistered = true;
  console.log("[LaunchHandlers] Handlers registered successfully");
}
