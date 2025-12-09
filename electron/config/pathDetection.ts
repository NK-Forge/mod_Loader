/**
 * @file electron/config/pathDetection.ts
 * @project Space Marine 2 Mod Loader
 * Auto-detection of game paths
 */

import fs from "fs";
import path from "path";
import { getConfig } from "./configManager";
import { Platform } from "../config/configManager";
import { inferPlatformFromPath } from "../utils/platform";

interface DetectedPaths {
  gameRoot: string;
  gameExe: string;
  activeModsPath: string;
  saveDataPath: string;
  platform?: Platform;
}

export async function detectPaths(): Promise<DetectedPaths> {
  const config = getConfig();
  const result: DetectedPaths = {
    gameRoot: "",
    gameExe: "",
    activeModsPath: "",
    saveDataPath: "",
    platform: "unknown",
  };

  // 1) Prefer any existing config values that are valid
  if (config.gameRoot && fs.existsSync(config.gameRoot)) {
    result.gameRoot = config.gameRoot;
  }

  if (config.gameExe && fs.existsSync(config.gameExe)) {
    result.gameExe = config.gameExe;
  }

  if (config.activeModsPath && fs.existsSync(config.activeModsPath)) {
    result.activeModsPath = config.activeModsPath;
  }

  if (config.saveDataPath && fs.existsSync(config.saveDataPath)) {
    result.saveDataPath = config.saveDataPath;
  }

  // 2) If we still don't have a game root, try common SM2 install paths
  const candidateRoots = [
    result.gameRoot,
    config.gameRoot,
    "E:\\Steam\\steamapps\\common\\Space Marine 2",
    "C:\\Steam\\steamapps\\common\\Space Marine 2",
    "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Space Marine 2",
  ].filter((p): p is string => !!p);

  if (!result.gameRoot) {
    for (const root of candidateRoots) {
      if (fs.existsSync(root)) {
        result.gameRoot = root;
        break;
      }
    }
  }

  // 3) Game EXE under gameRoot
  if (!result.gameExe && result.gameRoot) {
    const exe = path.join(
      result.gameRoot,
      "Warhammer 40000 Space Marine 2.exe"
    );
    if (fs.existsSync(exe)) {
      result.gameExe = exe;
    }
  }

  // 4) Active mods folder under gameRoot
  if (!result.activeModsPath && result.gameRoot) {
    const mods = path.join(result.gameRoot, "client_pc", "root", "mods");
    if (fs.existsSync(mods)) {
      result.activeModsPath = mods;
    }
  }

  // 5) Save data path in AppData\Saber\Space Marine 2\storage\steam\<id>\Main\config
  if (!result.saveDataPath) {
    result.saveDataPath = await detectSaveDataPath();
  }

  // 6) 🔹 Infer platform from gameRoot or activeModsPath
  result.platform = inferPlatformFromPath(
    result.gameRoot || result.activeModsPath
  );

  return result;
}


async function detectSaveDataPath(): Promise<string> {
  const userRoot = process.env.USERPROFILE || process.env.HOME;
  if (!userRoot) return "";

  const steamRoot = path.join(
    userRoot,
    "AppData",
    "Local",
    "Saber",
    "Space Marine 2",
    "storage",
    "steam"
  );

  if (!fs.existsSync(steamRoot)) return "";

  const level1 = fs
    .readdirSync(steamRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const d1 of level1) {
    const first = path.join(steamRoot, d1);

    // Case A: ...\steam\<entry>\Main\config
    let candidate = path.join(first, "Main", "config");
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    // Case B: ...\steam\user\<steamId>\Main\config
    const subdirs = fs
      .readdirSync(first, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const d2 of subdirs) {
      candidate = path.join(first, d2, "Main", "config");
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return "";
}