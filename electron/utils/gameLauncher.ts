/**
 * @file electron/utils/gameLauncher.ts
 * @project Space Marine 2 Mod Loader
 *
 * Unified platform-based launcher for Steam, Epic, and Xbox/Game Pass PC.
 * All paths use brokered URI-style launching and return immediately (no child
 * game process handle), so the monitor tracks the real game process separately.
 */

import { shell, dialog } from "electron";
import { execFile } from "child_process";
import { promisify } from "util";
import { getConfig } from "../config/configManager";
import { getEpicLaunchUriForSpaceMarine2 } from "./epicLauncher";
import {
  detectXboxGamePassInstall,
  SM2_XBOX_STORE_URI,
} from "./xboxGamePass";

const execFileAsync = promisify(execFile);

/** Default Steam App ID for Space Marine 2 */
const DEFAULT_STEAM_APP_ID = "2183900";

function stringConfigValue(name: string): string {
  const config = getConfig() as any;
  const value = config?.[name];
  return typeof value === "string" ? value : "";
}

export type Platform = "steam" | "epic" | "xbox";

export interface LaunchResult {
  ok: boolean;
  message?: string;
}

/**
 * Launch Space Marine 2 via platform-specific URI.
 * This is a fire-and-forget operation: no child game process is returned.
 */
export async function launchGameExe(): Promise<LaunchResult> {
  const config = getConfig() as any;

  // Default to Steam unless config explicitly sets another platform.
  const platform: Platform =
    config?.platform === "epic"
      ? "epic"
      : config?.platform === "xbox"
        ? "xbox"
        : "steam";

  console.log(`[GameLauncher] Requested platform = ${platform}`);

  try {
    if (platform === "epic") {
      return launchViaEpic();
    }

    if (platform === "xbox") {
      return await launchViaXboxGamePass();
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

  const cached = stringConfigValue("launchUri");
  const steamAppId: string =
    (config?.steamAppId && String(config.steamAppId)) || DEFAULT_STEAM_APP_ID;

  const steamUri = cached.startsWith("steam://") ? cached : `steam://run/${steamAppId}`;
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

  const cached = stringConfigValue("epicLaunchUri") || stringConfigValue("launchUri");
  const uri = cached.startsWith("com.epicgames.launcher://")
    ? cached
    : getEpicLaunchUriForSpaceMarine2();

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

function cachedXboxLaunchUri(): string {
  const cached = stringConfigValue("xboxLaunchUri") || stringConfigValue("launchUri");
  return cached.startsWith("shell:AppsFolder\\") ? cached : "";
}

async function openShellAppsFolderUri(uri: string): Promise<LaunchResult> {
  try {
    await shell.openExternal(uri);
    return { ok: true };
  } catch (shellErr: any) {
    console.warn(
      "[GameLauncher] shell.openExternal failed for AppsFolder URI; falling back to explorer.exe:",
      shellErr
    );
  }

  if (process.platform !== "win32") {
    return {
      ok: false,
      message: "Xbox/Game Pass launch is only supported on Windows.",
    };
  }

  try {
    await execFileAsync("explorer.exe", [uri], { windowsHide: true });
    return { ok: true };
  } catch (explorerErr: any) {
    console.error("[GameLauncher] explorer.exe AppsFolder launch failed:", explorerErr);
    return {
      ok: false,
      message: explorerErr?.message || "Xbox/Game Pass launch failed",
    };
  }
}

/**
 * Launch via Windows AppUserModelID activation:
 *   shell:AppsFolder\<PackageFamilyName>!<ApplicationId>
 *
 * This avoids taking a fragile child-process dependency on Gaming Services or
 * the game executable. The monitor separately waits for the real game process.
 */
async function launchViaXboxGamePass(): Promise<LaunchResult> {
  console.log("[GameLauncher] Resolving Xbox/Game Pass launch URI...");

  let uri = cachedXboxLaunchUri();

  if (!uri) {
    const detected = await detectXboxGamePassInstall();
    uri = detected?.launchUri || "";
  }

  if (!uri) {
    console.error("[GameLauncher] Could not determine Xbox/Game Pass launch URI.");
    return {
      ok: false,
      message:
        "Could not determine Xbox/Game Pass launch URI for Space Marine 2. " +
        `Install or repair the game from the Microsoft Store/Xbox app: ${SM2_XBOX_STORE_URI}`,
    };
  }

  console.log("[GameLauncher] Launching via Xbox/Game Pass URI:", uri);
  return openShellAppsFolderUri(uri);
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
