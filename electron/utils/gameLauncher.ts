/**
 * @file electron/utils/gameLauncher.ts
 * @project Space Marine 2 Mod Loader
 *
 * Unified platform-based launcher for Steam + Epic.
 * Both paths use URI launching and return immediately (no child process).
 */

import { shell, dialog } from "electron";
import { getConfig } from "../config/configManager";
import { getEpicLaunchUriForGameByPathFragment } from "./epicLauncher";

/** Default Steam App ID for Space Marine 2 */
const DEFAULT_STEAM_APP_ID = "2183900";

/** Used for Epic URI discovery; matches Space Marine 2 install name */
const EPIC_PATH_FRAGMENT = "Space Marine 2";

export type Platform = "steam" | "epic";

export interface LaunchResult {
  ok: boolean;
  message?: string;
}

/**
 * Launch Space Marine 2 via platform-specific URI.
 * This is a fire-and-forget operation: no child process is returned.
 */
export function launchGameExe(): LaunchResult {
  const config = getConfig() as any;

  // Default to Steam unless config explicitly sets Epic
  const platform: Platform = config?.platform === "epic" ? "epic" : "steam";

  console.log(`[GameLauncher] Requested platform = ${platform}`);

  try {
    if (platform === "epic") {
      return launchViaEpic();
    }

    // default: Steam
    return launchViaSteam();
  } catch (err: any) {
    console.error("[GameLauncher] Launch threw unexpected error:", err);
    return {
      ok: false,
      message: err?.message || "Unknown launch error",
    };
  }
}

/**
 * Launch via Steam URI: steam://run/APP_ID
 */
function launchViaSteam(): LaunchResult {
  const config = getConfig() as any;

  const steamAppId: string =
    (config?.steamAppId && String(config.steamAppId)) || DEFAULT_STEAM_APP_ID;

  const steamUri = `steam://run/${steamAppId}`;
  console.log("[GameLauncher] Launching via Steam URI:", steamUri);

  try {
    shell.openExternal(steamUri);
    return { ok: true };
  } catch (err: any) {
    console.error("[GameLauncher] Steam Launch Error:", err);
    return {
      ok: false,
      message: err?.message || "Steam launch failed",
    };
  }
}

/**
 * Launch via Epic URI.
 * Uses the validated path-fragment search that you confirmed correct.
 */
function launchViaEpic(): LaunchResult {
  console.log("[GameLauncher] Resolving Epic launch URI...");

  const uri = getEpicLaunchUriForGameByPathFragment(EPIC_PATH_FRAGMENT);

  if (!uri) {
    console.error("[GameLauncher] Could not determine Epic launch URI.");
    return {
      ok: false,
      message: "Could not determine Epic launch URI for Space Marine 2.",
    };
  }

  console.log("[GameLauncher] Launching via Epic URI:", uri);

  try {
    shell.openExternal(uri);
    return { ok: true };
  } catch (err: any) {
    console.error("[GameLauncher] Epic Launch Error:", err);
    return {
      ok: false,
      message: err?.message || "Epic launch failed",
    };
  }
}

/** Standard launch error dialog */
export function showLaunchError(message: string): void {
  console.error("[GameLauncher] Launch error:", message);
  try {
    dialog.showErrorBox("Launch Failed", message);
  } catch {
    // swallow dialog errors
  }
}
