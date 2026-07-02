/**
 * @file electron/utils/gameLauncher.ts
 * @project Space Marine 2 Mod Loader
 *
 * Unified platform-based launcher for Steam, Epic, and Xbox/Game Pass PC.
 * All paths use brokered URI-style launching and return immediately (no child
 * game process handle), so the monitor tracks the real game process separately.
 */

import { shell, dialog } from "electron";
import fs from "fs";
import path from "path";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { getConfig } from "../config/configManager";
import { getEpicLaunchUriForSpaceMarine2 } from "./epicLauncher";
import {
  buildXboxLaunchUriFromMicrosoftGameConfig,
  detectXboxGamePassGameRoot,
  detectXboxGamePassInstall,
  detectXboxGamePassPackageEvidence,
  findXboxGamePassLaunchHelper,
  isBlockedXboxLaunchUri,
  isWindowsAppsPath,
  SM2_XBOX_STORE_URI,
} from "./xboxGamePass";
import { isGameProcessRunning, waitForGameProcessToAppear } from "../gameMonitor";
import { MONITORING_CONFIG } from "../config/monitoringConfig";

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

  const steamUri = cached.startsWith("steam://")
    ? cached
    : `steam://run/${steamAppId}`;
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

  const cached =
    stringConfigValue("epicLaunchUri") || stringConfigValue("launchUri");
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
  const cached =
    stringConfigValue("xboxLaunchUri") || stringConfigValue("launchUri");
  if (!cached.startsWith("shell:AppsFolder\\")) return "";

  if (isBlockedXboxLaunchUri(cached)) {
    console.warn(
      "[GameLauncher] Ignoring unsafe/unverified Xbox launch URI from config:",
      cached,
    );
    return "";
  }

  return cached;
}

function cachedXboxLaunchHelperPath(): string {
  const helper = stringConfigValue("xboxLaunchHelperPath");
  if (!helper) return "";

  // Self-heal configs poisoned by earlier detection versions that persisted a
  // DLC package's helper from WindowsApps (e.g. ...SpaceMarine2-DLC4_...).
  // Launching that helper never starts the base game; ignore it so the launch
  // chain falls through to fresh detection against the XboxGames root.
  if (isWindowsAppsPath(helper)) {
    console.warn(
      "[GameLauncher] Ignoring WindowsApps (DLC/stub) Xbox launch helper path from config:",
      helper,
    );
    return "";
  }

  try {
    if (fs.existsSync(helper)) return helper;
  } catch {
    // Ignore inaccessible/stale configured helpers.
  }

  console.warn(
    "[GameLauncher] Ignoring stale Xbox launch helper path from config:",
    helper,
  );
  return "";
}

async function verifyXboxLaunchAppeared(
  method: string,
  detail?: string,
  timeoutMs: number = MONITORING_CONFIG.GAME_APPEAR_TIMEOUT_MS,
): Promise<LaunchResult> {
  const appeared = await waitForGameProcessToAppear(timeoutMs, "[GameLauncher]");
  if (appeared) return { ok: true };

  const timeoutSec = Math.round(timeoutMs / 1000);
  const detailSuffix = detail ? `\n\nLaunch detail: ${detail}` : "";
  return {
    ok: false,
    message:
      `The Xbox/Game Pass launch request was sent via ${method}, but Space Marine 2 did not appear within ${timeoutSec} seconds. ` +
      "Confirm the Xbox app is signed in, the Game Pass/Store license is present, and Gaming Services is healthy, then retry. " +
      `Store page: ${SM2_XBOX_STORE_URI}${detailSuffix}`,
  };
}

async function launchViaExecutableHelper(
  helperPath: string,
): Promise<LaunchResult> {
  if (await isGameProcessRunning("[GameLauncher]")) {
    console.log(
      "[GameLauncher] Game process is already running; verifying before launching helper again.",
    );
    return verifyXboxLaunchAppeared("existing game process", helperPath);
  }

  try {
    const child = spawn(helperPath, [], {
      cwd: path.dirname(helperPath),
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    console.log("[GameLauncher] Launched Xbox helper:", helperPath);
  } catch (err: any) {
    console.error("[GameLauncher] Xbox launch helper failed:", err);
    return {
      ok: false,
      message: err?.message || "Xbox/Game Pass launch helper failed",
    };
  }

  return verifyXboxLaunchAppeared("gamelaunchhelper.exe", helperPath);
}

async function openShellAppsFolderUri(
  uri: string,
  timeoutMs: number = MONITORING_CONFIG.GAME_APPEAR_TIMEOUT_MS,
): Promise<LaunchResult> {
  let launchDetail = "";

  try {
    await shell.openExternal(uri);
    return verifyXboxLaunchAppeared("AppsFolder URI", uri, timeoutMs);
  } catch (shellErr: any) {
    launchDetail = shellErr?.message || String(shellErr);
    console.warn(
      "[GameLauncher] shell.openExternal failed for AppsFolder URI; falling back to explorer.exe:",
      shellErr,
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
  } catch (explorerErr: any) {
    // Explorer's exit code is not a reliable launch signal for AppsFolder URIs.
    // The beta.1 protected SM2 AUMID could start the game while explorer.exe
    // still reported a command failure. Log it, but let process appearance
    // decide whether launch actually succeeded.
    launchDetail = explorerErr?.message || String(explorerErr);
    console.warn(
      "[GameLauncher] explorer.exe AppsFolder call reported an error; verifying by process monitor:",
      explorerErr,
    );
  }

  return verifyXboxLaunchAppeared(
    "explorer.exe AppsFolder URI",
    launchDetail || uri,
    timeoutMs,
  );
}

/**
 * Launch via Windows AppUserModelID activation:
 *   shell:AppsFolder\<PackageFamilyName>!<ApplicationId>
 *
 * This avoids taking a fragile child-process dependency on Gaming Services or
 * the game executable. The monitor separately waits for the real game process.
 */
async function launchViaXboxGamePass(): Promise<LaunchResult> {
  console.log("[GameLauncher] Resolving Xbox/Game Pass launch target...");

  const triedUris = new Set<string>();
  let lastLaunchAttempt: LaunchResult | null = null;

  const tryAppsFolderUri = async (
    uri: string,
    label: string,
    timeoutMs: number = MONITORING_CONFIG.GAME_APPEAR_TIMEOUT_MS,
  ): Promise<LaunchResult | null> => {
    if (!uri || triedUris.has(uri)) return null;
    triedUris.add(uri);

    if (isBlockedXboxLaunchUri(uri)) {
      console.warn(`[GameLauncher] Skipping blocked Xbox AUMID (${label}):`, uri);
      return null;
    }

    console.log(`[GameLauncher] Trying Xbox/Game Pass AUMID (${label}):`, uri);
    const result = await openShellAppsFolderUri(uri, timeoutMs);
    lastLaunchAttempt = result;
    if (result.ok) return result;

    console.warn(
      `[GameLauncher] Xbox/Game Pass AUMID did not produce the game process (${label}); falling through.`,
      result.message,
    );
    return null;
  };

  // Restore beta.1's successful protected AUMID path as the primary route.
  // explorer.exe may report an error for this URI, so success is verified only
  // by waiting for the real game process to appear.
  const cachedUriResult = await tryAppsFolderUri(
    cachedXboxLaunchUri(),
    "cached config",
  );
  if (cachedUriResult?.ok) return cachedUriResult;

  const detected = await detectXboxGamePassInstall();
  const detectedUriResult = await tryAppsFolderUri(
    detected?.launchUri || "",
    detected?.source === "AppxPackage"
      ? "AppxPackage protected AUMID"
      : "detected StartApps AUMID",
  );
  if (detectedUriResult?.ok) return detectedUriResult;

  const evidence = await detectXboxGamePassPackageEvidence();
  const packageFamilyName =
    detected?.packageFamilyName || evidence?.packageFamilyName || "";
  const gameRoot = detectXboxGamePassGameRoot(
    detected?.installLocation || evidence?.installLocation,
  );

  const configUri = buildXboxLaunchUriFromMicrosoftGameConfig(
    packageFamilyName,
    gameRoot,
  );
  const configUriResult = await tryAppsFolderUri(
    configUri,
    "MicrosoftGame.config AUMID",
  );
  if (configUriResult?.ok) return configUriResult;

  // Helper remains the fallback broker, but DLC/WindowsApps helpers are rejected
  // by cachedXboxLaunchHelperPath() and findXboxGamePassLaunchHelper().
  const cachedHelperPath = cachedXboxLaunchHelperPath();
  if (cachedHelperPath) {
    console.log(
      "[GameLauncher] Falling back to cached XboxGames helper:",
      cachedHelperPath,
    );
    const result = await launchViaExecutableHelper(cachedHelperPath);
    if (result.ok) return result;
    lastLaunchAttempt = result;
  }

  const detectedHelperPath = findXboxGamePassLaunchHelper(gameRoot);
  if (detectedHelperPath) {
    console.log(
      "[GameLauncher] Falling back to detected XboxGames helper:",
      detectedHelperPath,
    );
    const result = await launchViaExecutableHelper(detectedHelperPath);
    if (result.ok) return result;
    lastLaunchAttempt = result;
  }

  if (lastLaunchAttempt) return lastLaunchAttempt;

  console.error(
    "[GameLauncher] Could not determine Xbox/Game Pass launch target.",
  );
  return {
    ok: false,
    message:
      "Could not determine a verified Xbox/Game Pass launch target for Space Marine 2. " +
      "Run setup again so the wizard can re-detect the protected AUMID and XboxGames helper, " +
      "or launch from the Xbox app manually. " +
      `Store page: ${SM2_XBOX_STORE_URI}`,
  };
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
