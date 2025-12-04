/**
 * @file electron/utils/gameLauncher.ts
 * @project Space Marine 2 Mod Loader
 * Game launching functionality
 */

import { spawn, ChildProcess } from "child_process";
import { dialog } from "electron";
import { getConfig } from "../config/configManager";

export interface LaunchResult {
  ok: boolean;
  message?: string;
  child?: ChildProcess;
}

export function launchGameExe(): LaunchResult {
  const config = getConfig();
  
  if (!config.gameExe) {
    return {
      ok: false,
      message: "Game executable not configured. Please run setup again.",
    };
  }

  try {
    const child = spawn(config.gameExe, [], {
      detached: true,
      stdio: "ignore",
      shell: false,
    });

    child.unref();
    console.log(`[GameLauncher] Launched game at ${config.gameExe}`);
    return { ok: true, child };
  } catch (err: any) {
    console.error("[GameLauncher] Launch error:", err);
    return { ok: false, message: err?.message || "Unknown launch error" };
  }
}

export function showLaunchError(message: string): void {
  dialog.showErrorBox("Launch Failed", message);
}