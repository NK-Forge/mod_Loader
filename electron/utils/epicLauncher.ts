/**
 * @file electron/utils/epicLauncher.ts
 * Helpers for launching Space Marine 2 via Epic Games Launcher.
 *
 * This is intentionally self-contained and *not* wired into launch logic yet.
 * We'll integrate it from gameLauncher.ts after config/platform wiring is in.
 */

import fs from "fs";
import path from "path";

/**
 * Shape of Epic's LauncherInstalled.dat file (JSON).
 * Example (trimmed):
 *
 * {
 *   "InstallationList": [
 *     {
 *       "InstallLocation": "E:\\EpicLibrary\\Satisfactory\\Satisfactory",
 *       "NamespaceId": "crab",
 *       "ItemId": "...",
 *       "ArtifactId": "...",
 *       "AppVersion": "460533.512",
 *       "AppName": "CrabEA"
 *     }
 *   ]
 * }
 */
export interface EpicInstallEntry {
  InstallLocation: string;
  NamespaceId?: string;
  ItemId?: string;
  ArtifactId?: string;
  AppVersion?: string;
  AppName?: string;
}

export interface EpicLauncherInstalled {
  InstallationList?: EpicInstallEntry[];
}

/**
 * Default location of LauncherInstalled.dat on Windows.
 * We’ll allow overrides later if we ever need them.
 */
export function getDefaultLauncherInstalledPath(): string {
  const programData = process.env.PROGRAMDATA || "C:\\ProgramData";
  return path.join(
    programData,
    "Epic",
    "EpicGamesLauncher",
    "Data",
    "LauncherInstalled.dat"
  );
}

/**
 * Tries to read + parse LauncherInstalled.dat.
 * Returns `undefined` on any error; caller can decide how to handle that.
 */
export function readLauncherInstalled(
  filePath = getDefaultLauncherInstalledPath()
): EpicLauncherInstalled | undefined {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn("[Epic] LauncherInstalled.dat not found at", filePath);
      return undefined;
    }

    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as EpicLauncherInstalled;
    if (!parsed || !Array.isArray(parsed.InstallationList)) {
      console.warn("[Epic] LauncherInstalled.dat has no InstallationList array");
      return undefined;
    }

    return parsed;
  } catch (err) {
    console.error("[Epic] Failed to read/parse LauncherInstalled.dat:", err);
    return undefined;
  }
}

/**
 * Finds an Epic install entry whose InstallLocation *contains* the given fragment.
 *
 * Example call (later when we wire it up):
 *   findInstallByLocationFragment("Warhammer40000SpaceMarine2")
 */
export function findInstallByLocationFragment(
  fragment: string,
  filePath = getDefaultLauncherInstalledPath()
): EpicInstallEntry | undefined {
  const data = readLauncherInstalled(filePath);
  if (!data?.InstallationList) return undefined;

  const needle = fragment.toLowerCase();

  const match = data.InstallationList.find((entry) => {
    const loc = entry.InstallLocation || "";
    return loc.toLowerCase().includes(needle);
  });

  if (!match) {
    console.warn(
      `[Epic] No install entry found with InstallLocation containing "${fragment}"`
    );
  }

  return match;
}

/**
 * Builds a com.epicgames.launcher:// URI for a given install entry.
 *
 * We primarily prefer NamespaceId, which is what we successfully tested
 * with Satisfactory / Palia. If that is missing, we fall back to AppName.
 */
export function buildEpicLaunchUri(entry: EpicInstallEntry): string | undefined {
  const id = entry.NamespaceId || entry.AppName;
  if (!id) {
    console.warn(
      "[Epic] Cannot build launch URI - no NamespaceId or AppName on entry:",
      entry
    );
    return undefined;
  }

  // Silent launch; Epic spins up the game using this identifier.
  return `com.epicgames.launcher://apps/${id}?action=launch&silent=true`;
}

/**
 * Convenience helper we’ll likely use from gameLauncher.ts:
 * given a fragment of the install path (e.g. "Warhammer40000SpaceMarine2"),
 * find the matching entry and return a ready-to-use Epic launch URI.
 */
export function getEpicLaunchUriForGameByPathFragment(
  fragment: string,
  filePath = getDefaultLauncherInstalledPath()
): string | undefined {
  const entry = findInstallByLocationFragment(fragment, filePath);
  if (!entry) return undefined;
  return buildEpicLaunchUri(entry);
}
