/**
 * @file electron/utils/epicLauncher.ts
 * Helpers for detecting and launching Space Marine 2 via Epic Games Launcher.
 */

import fs from "fs";
import path from "path";

/**
 * Shape of Epic's LauncherInstalled.dat InstallationList entries.
 */
export interface EpicInstallEntry {
  InstallLocation: string;
  NamespaceId?: string;
  ItemId?: string;
  ArtifactId?: string;
  AppVersion?: string;
  AppName?: string;
  DisplayName?: string;
  LaunchExecutable?: string;
  ManifestLocation?: string;
}

export interface EpicLauncherInstalled {
  InstallationList?: EpicInstallEntry[];
}

/**
 * Shape of Epic's per-game .item manifest files.
 * Epic does not guarantee a stable public schema, so all fields are optional.
 */
export interface EpicManifestEntry {
  InstallLocation?: string;
  NamespaceId?: string;
  CatalogNamespace?: string;
  ItemId?: string;
  CatalogItemId?: string;
  ArtifactId?: string;
  AppName?: string;
  MainGameAppName?: string;
  DisplayName?: string;
  LaunchExecutable?: string;
  ManifestLocation?: string;
  StagingLocation?: string;
}

export interface EpicDetectedInstall extends EpicInstallEntry {
  launchUri?: string;
  source: "LauncherInstalled.dat" | ".item manifest";
}

const SM2_MATCH_FRAGMENTS = [
  "warhammer 40,000 space marine 2",
  "warhammer 40000 space marine 2",
  "warhammer 40k space marine 2",
  "space marine 2",
  "spacemarine2",
  "warhammer40000spacemarine2",
];

function programDataRoot(): string {
  return process.env.PROGRAMDATA || "C:\\ProgramData";
}

/**
 * Default location of LauncherInstalled.dat on Windows.
 */
export function getDefaultLauncherInstalledPath(): string {
  return path.join(
    programDataRoot(),
    "Epic",
    "EpicGamesLauncher",
    "Data",
    "LauncherInstalled.dat"
  );
}

/**
 * Default location for Epic's per-game .item manifests.
 */
export function getDefaultEpicManifestDir(): string {
  return path.join(
    programDataRoot(),
    "Epic",
    "EpicGamesLauncher",
    "Data",
    "Manifests"
  );
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[\\/_:,-]+/g, " ").replace(/\s+/g, " ").trim();
}

function squish(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function entryText(entry: Partial<EpicInstallEntry & EpicManifestEntry>): string {
  return [
    entry.DisplayName,
    entry.AppName,
    entry.MainGameAppName,
    entry.InstallLocation,
    entry.LaunchExecutable,
    entry.ManifestLocation,
  ]
    .filter((v): v is string => Boolean(v))
    .join(" ");
}

export function looksLikeSpaceMarine2EpicEntry(
  entry: Partial<EpicInstallEntry & EpicManifestEntry>
): boolean {
  const text = entryText(entry);
  const normalized = normalizeForMatch(text);
  const compact = squish(text);

  return SM2_MATCH_FRAGMENTS.some((fragment) => {
    const normalizedFragment = normalizeForMatch(fragment);
    const compactFragment = squish(fragment);
    return (
      normalized.includes(normalizedFragment) ||
      compact.includes(compactFragment)
    );
  });
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

export function readEpicManifestFiles(
  manifestDir = getDefaultEpicManifestDir()
): EpicManifestEntry[] {
  try {
    if (!fs.existsSync(manifestDir)) {
      console.warn("[Epic] Manifest directory not found at", manifestDir);
      return [];
    }

    return fs
      .readdirSync(manifestDir)
      .filter((name) => name.toLowerCase().endsWith(".item"))
      .flatMap((name) => {
        const filePath = path.join(manifestDir, name);
        try {
          const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as EpicManifestEntry;
          return [{ ...parsed, ManifestLocation: parsed.ManifestLocation || filePath }];
        } catch (err) {
          console.warn("[Epic] Failed to parse manifest", filePath, err);
          return [];
        }
      });
  } catch (err) {
    console.error("[Epic] Failed to read manifest directory:", err);
    return [];
  }
}

function toInstallEntry(
  entry: EpicInstallEntry | EpicManifestEntry,
  source: EpicDetectedInstall["source"]
): EpicDetectedInstall {
  const manifestEntry = entry as EpicManifestEntry;
  const namespaceId = entry.NamespaceId || manifestEntry.CatalogNamespace;
  const itemId = entry.ItemId || manifestEntry.CatalogItemId;
  const appName = entry.AppName || manifestEntry.MainGameAppName;

  const detected: EpicDetectedInstall = {
    InstallLocation: entry.InstallLocation || "",
    NamespaceId: namespaceId,
    ItemId: itemId,
    ArtifactId: entry.ArtifactId,
    AppVersion: (entry as EpicInstallEntry).AppVersion,
    AppName: appName,
    DisplayName: entry.DisplayName,
    LaunchExecutable: entry.LaunchExecutable,
    ManifestLocation: entry.ManifestLocation,
    source,
  };

  detected.launchUri = buildEpicLaunchUri(detected);
  return detected;
}

/**
 * Finds a Space Marine 2 Epic install from Epic's installed-game records.
 * Prefer LauncherInstalled.dat when present, then fall back to per-game .item manifests.
 */
export function detectEpicSpaceMarine2Install(
  launcherInstalledPath = getDefaultLauncherInstalledPath(),
  manifestDir = getDefaultEpicManifestDir()
): EpicDetectedInstall | undefined {
  const launcherInstalled = readLauncherInstalled(launcherInstalledPath);
  const installedMatch = launcherInstalled?.InstallationList?.find(
    looksLikeSpaceMarine2EpicEntry
  );

  if (installedMatch) {
    return toInstallEntry(installedMatch, "LauncherInstalled.dat");
  }

  const manifestMatch = readEpicManifestFiles(manifestDir).find(
    looksLikeSpaceMarine2EpicEntry
  );

  if (manifestMatch) {
    return toInstallEntry(manifestMatch, ".item manifest");
  }

  console.warn("[Epic] No Space Marine 2 install entry found in Epic manifests");
  return undefined;
}

/**
 * Finds an Epic install entry whose InstallLocation *contains* the given fragment.
 * Kept for compatibility with older launch logic.
 */
export function findInstallByLocationFragment(
  fragment: string,
  filePath = getDefaultLauncherInstalledPath()
): EpicInstallEntry | undefined {
  const data = readLauncherInstalled(filePath);
  if (!data?.InstallationList) return undefined;

  const needle = normalizeForMatch(fragment);
  const compactNeedle = squish(fragment);

  const match = data.InstallationList.find((entry) => {
    const loc = entry.InstallLocation || "";
    return (
      normalizeForMatch(loc).includes(needle) ||
      squish(loc).includes(compactNeedle)
    );
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
 * Epic shortcut URLs are commonly AppName-based, but newer launcher URLs may
 * use NamespaceId:ItemId:ArtifactId. Prefer the full installed-game identity
 * when all three pieces are available, then fall back to AppName.
 */
export function buildEpicLaunchUri(entry: Partial<EpicInstallEntry>): string | undefined {
  const namespaceId = entry.NamespaceId;
  const itemId = entry.ItemId;
  const artifactId = entry.ArtifactId;
  const legacyAppName = entry.AppName;

  const id =
    namespaceId && itemId && artifactId
      ? `${namespaceId}:${itemId}:${artifactId}`
      : legacyAppName || namespaceId;

  if (!id) {
    console.warn(
      "[Epic] Cannot build launch URI - no full Epic identity or AppName on entry:",
      entry
    );
    return undefined;
  }

  return `com.epicgames.launcher://apps/${encodeURIComponent(id)}?action=launch&silent=true`;
}

/**
 * Convenience helper: resolve Space Marine 2 and return a ready-to-use Epic URI.
 */
export function getEpicLaunchUriForSpaceMarine2(): string | undefined {
  const entry = detectEpicSpaceMarine2Install();
  return entry?.launchUri;
}

/**
 * Backward-compatible helper:
 * given a fragment of the install path, find the matching entry and return a URI.
 */
export function getEpicLaunchUriForGameByPathFragment(
  fragment: string,
  filePath = getDefaultLauncherInstalledPath()
): string | undefined {
  const entry = findInstallByLocationFragment(fragment, filePath);
  if (!entry) return undefined;
  return buildEpicLaunchUri(entry);
}
