/**
 * @file electron/utils/gameLauncher.ts
 * @project Space Marine 2 Mod Loader
 * Game launching functionality (Steam + Epic via URI)
 */

import { dialog, shell } from "electron";
import { getConfig, Platform } from "../config/configManager";
import { getEpicLaunchUriForGameByPathFragment } from "./epicLauncher";

export interface LaunchResult {
  ok: boolean;
  message?: string;
}

const STEAM_APP_ID = "2183900";
const EPIC_PATH_FRAGMENT = "warhammer40000spacemarine2"; // used to locate Epic install entry

export function launchGameExe(): LaunchResult {
  const config = getConfig();
  const platform: Platform = config.platform ?? "steam";

  try {
    if (platform === "epic") {
      // 🔹 Epic branch – use LauncherInstalled.dat to build URI
      const uri = getEpicLaunchUriForGameByPathFragment(EPIC_PATH_FRAGMENT);
      if (!uri) {
        return {
          ok: false,
          message:
            "Could not determine Epic launch URI for Space Marine 2. Check your Epic installation path.",
        };
      }

      console.log("[GameLauncher] Launching Space Marine 2 via Epic URI:", uri);
      shell.openExternal(uri);
      return { ok: true };
    }

    // 🔹 Default / Steam branch – use Steam URI, no double-launch stub
    const steamUri = `steam://run/${STEAM_APP_ID}`;
    console.log("[GameLauncher] Launching Space Marine 2 via Steam URI:", steamUri);
    shell.openExternal(steamUri);
    return { ok: true };
  } catch (err: any) {
    console.error("[GameLauncher] Launch error:", err);
    return { ok: false, message: err?.message || "Unknown launch error" };
  }
}

export function showLaunchError(message: string): void {
  dialog.showErrorBox("Launch Failed", message);
}
