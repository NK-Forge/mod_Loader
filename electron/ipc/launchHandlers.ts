/**
 * @file electron/ipc/launchHandlers.ts
 * @project Space Marine 2 Mod Loader
 *
 * Game launch + monitor + save-mirror pipeline.
 * Uses platform-based URI launches (Steam/Epic/Xbox).
 * For Mod Play:
 *   - mirror vault → saves before launch
 *   - launch via URI/helper
 *   - wait for real game process to appear + exit
 *   - mirror saves → vault after exit
 */

import { BrowserWindow, ipcMain } from "electron";
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
type LaunchPhase = "launching" | "monitoring" | "mirroring" | "failed";

function getLaunchStatusWindow(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows().find((win) => !win.isDestroyed());
}

function emitLaunchStatus(
  phase: LaunchPhase,
  mode: LaunchMode,
  message: string,
): void {
  const payload = {
    phase,
    mode,
    message,
    timestamp: Date.now(),
  };

  console.log("[play:launch] status:", payload);

  try {
    getLaunchStatusWindow()?.webContents.send("launch:status", payload);
  } catch (err) {
    console.warn("[play:launch] Failed to emit launch status:", err);
  }
}

function emitLaunchComplete(
  ok: boolean,
  mode: LaunchMode,
  startedAt: number,
  message?: string,
): void {
  const payload = {
    ok,
    mode,
    message,
    timestamp: Date.now(),
    durationMs: Date.now() - startedAt,
  };

  console.log("[play:launch] complete:", payload);

  try {
    getLaunchStatusWindow()?.webContents.send("launch:complete", payload);
  } catch (err) {
    console.warn("[play:launch] Failed to emit launch completion:", err);
  }
}

/**
 * Core launch pipeline used by all IPC handlers.
 * - If forceMode is provided, it overrides the auto-detection.
 */
async function handlePlayLaunch(forceMode?: LaunchMode) {
  console.log("=== [play:launch] UNIFIED HANDLER invoked ===");
  const startedAt = Date.now();
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

  const launchMode: LaunchMode = isModPlay ? "mod" : "vanilla";
  console.log("[play:launch] isModPlay =", isModPlay);

  emitLaunchStatus(
    "launching",
    launchMode,
    isModPlay
      ? "Preparing Mod Play saves before launch…"
      : "Requesting game launch…",
  );

  // Pre-launch mirroring (only for mod play)
  if (isModPlay) {
    console.log("[play:launch] Pre-launch mirror: vault → game saves");
    try {
      await mirrorVaultIntoGameSavesIfPresent();
    } catch (err) {
      console.error("[play:launch] Pre-launch mirror failed:", err);
      const message = `Failed to prepare save files: ${(err as Error).message}`;
      emitLaunchStatus("failed", launchMode, message);
      emitLaunchComplete(false, launchMode, startedAt, message);
      return {
        ok: false as const,
        mode: "mod" as const,
        message,
      };
    }
  }

  // Launch game via platform-specific URI/helper (Steam/Epic/Xbox)
  console.log("[play:launch] Launching game via storefront broker...");
  emitLaunchStatus(
    "launching",
    launchMode,
    "Launch requested. Waiting for the game process to appear…",
  );

  const result = await launchGameExe();
  if (!result.ok) {
    const msg = result.message || "Could not start game.";
    showLaunchError(msg);
    emitLaunchStatus("failed", launchMode, msg);
    emitLaunchComplete(false, launchMode, startedAt, msg);
    return {
      ok: false as const,
      mode: launchMode,
      message: msg,
    };
  }

  console.log("[play:launch] Game launch initiated successfully");

  // Vanilla mode: no monitoring or mirroring needed
  if (!isModPlay) {
    console.log("[play:launch] Vanilla mode - no monitoring/mirroring");
    emitLaunchComplete(true, "vanilla", startedAt, "Vanilla launch requested.");
    return { ok: true as const, mode: "vanilla" as const, exitCode: 0 };
  }

  // Mod Play: monitor AFTER launch, until real game exits
  console.log("[play:launch] Mod Play mode - starting game process monitor");

  try {
    const monitorStart = Date.now();
    console.log("[play:launch] Waiting for game process to appear and exit...");
    emitLaunchStatus(
      "monitoring",
      "mod",
      "Game launch verified. Waiting for the game to exit before mirroring saves…",
    );

    await waitForGameProcessToExit("[play:launch]");

    const monitorDurationSec = Math.round((Date.now() - monitorStart) / 1000);
    console.log(
      `[play:launch] Game exited after ~${monitorDurationSec}s, mirroring saves back to vault...`,
    );

    emitLaunchStatus(
      "mirroring",
      "mod",
      "Game closed. Mirroring saves back to Mod Play Vault…",
    );
    await mirrorSavesIntoVault();

    console.log("[play:launch] Auto-mirror completed successfully");

    emitLaunchComplete(
      true,
      "mod",
      startedAt,
      "Mod Play session complete; saves mirrored back to vault.",
    );
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

    const message = `Auto-mirror failed: ${errorMsg}`;
    emitLaunchStatus("failed", "mod", message);
    emitLaunchComplete(false, "mod", startedAt, message);

    return {
      ok: false as const,
      mode: "mod" as const,
      message,
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
      // If we decide later to track stats (files/bytes), return them here. i.e.: return { ok: true, files: 0, bytes: 0 };
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
