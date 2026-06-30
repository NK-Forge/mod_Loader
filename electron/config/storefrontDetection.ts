/**
 * @file electron/config/storefrontDetection.ts
 * @project Space Marine 2 Mod Loader
 *
 * Storefront resolver used by the first-run setup wizard.
 *
 * Product rule:
 * The wizard scans every supported storefront itself, builds the launch target
 * internally, then presents detected candidates to the user. Normal users should
 * never need to run PowerShell snippets, inspect Epic manifests, or uninstall one
 * store build to test another.
 */

import fs from "fs";
import path from "path";
import type { Platform } from "./configManager";
import {
  detectEpicSpaceMarine2Install,
  getDefaultEpicManifestDir,
  getDefaultLauncherInstalledPath,
} from "../utils/epicLauncher";
import {
  detectXboxAppInstall,
  detectXboxGamePassGameRoot,
  detectXboxGamePassInstall,
  detectXboxGamePassSaveDataPath,
  SM2_XBOX_STORE_PRODUCT_ID,
  SM2_XBOX_STORE_URI,
  type XboxGamePassInstall,
} from "../utils/xboxGamePass";

export const SM2_STEAM_APP_ID = "2183900";

export type StorefrontStatus = "installed" | "launcher_only" | "not_found";
export type StorefrontConfidence = "high" | "medium" | "low" | "none";

export interface StorefrontCandidate {
  id: string;
  platform: Platform;
  label: string;
  status: StorefrontStatus;
  confidence: StorefrontConfidence;
  source: string;
  canLaunch: boolean;
  gameRoot: string;
  gameExe: string;
  activeModsPath: string;
  saveDataPath: string;
  launchUri: string;
  notes: string[];
  steamAppId?: string;
  storeProductId?: string;
  epic?: {
    appName?: string;
    namespaceId?: string;
    itemId?: string;
    artifactId?: string;
    installLocation?: string;
    manifestLocation?: string;
  };
  xbox?: {
    aumid?: string;
    packageFamilyName?: string;
    packageFullName?: string;
    appId?: string;
    installLocation?: string;
    xboxAppAumid?: string;
  };
}

export interface StorefrontScanResult {
  candidates: StorefrontCandidate[];
  checks: StorefrontCandidate[];
  selected?: StorefrontCandidate;
  storeFallbackUri: string;
}

function exists(p: string | undefined | null): p is string {
  if (!p) return false;
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function unique(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))];
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\\\/g, "\\");
}

function defaultActiveModsPath(gameRoot: string): string {
  return gameRoot ? path.join(gameRoot, "client_pc", "root", "mods") : "";
}

function findGameExe(gameRoot: string): string {
  const candidates = [
    path.join(gameRoot, "Warhammer 40000 Space Marine 2.exe"),
    path.join(gameRoot, "Warhammer 40,000 Space Marine 2.exe"),
    path.join(gameRoot, "SpaceMarine2.exe"),
  ];

  return candidates.find(exists) || "";
}

function looksLikeSm2Path(value: string): boolean {
  const squished = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    squished.includes("spacemarine2") ||
    squished.includes("spacemarineii") ||
    squished.includes("warhammer40000spacemarine") ||
    squished.includes("warhammer40kspacemarine")
  );
}

function driveRoots(): string[] {
  if (process.platform !== "win32") return [];

  const roots = new Set<string>();
  const systemDrive = process.env.SystemDrive;
  if (systemDrive) roots.add(`${systemDrive.replace(/[\\/]+$/g, "")}\\`);

  for (let code = "C".charCodeAt(0); code <= "Z".charCodeAt(0); code++) {
    roots.add(`${String.fromCharCode(code)}:\\`);
  }

  return [...roots].filter(exists);
}

function steamRootFromGameRoot(gameRoot?: string): string[] {
  if (!gameRoot) return [];
  const normalized = gameRoot.replace(/\\/g, "/");
  const marker = "/steamapps/common/";
  const idx = normalized.toLowerCase().indexOf(marker);
  if (idx < 0) return [];
  return [normalized.slice(0, idx).replace(/\//g, path.sep)];
}

function steamRootCandidates(existingGameRoot?: string): string[] {
  const envCandidates = [
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "Steam") : "",
    process.env["ProgramFiles(x86)"]
      ? path.join(process.env["ProgramFiles(x86)"] as string, "Steam")
      : "",
    String.raw`C:\Program Files (x86)\Steam`,
    String.raw`C:\Program Files\Steam`,
    String.raw`C:\Steam`,
    String.raw`D:\Steam`,
    String.raw`E:\Steam`,
  ];

  const libraryRoots = driveRoots().flatMap((drive) => [
    path.join(drive, "SteamLibrary"),
    path.join(drive, "Games", "SteamLibrary"),
  ]);

  return unique([...steamRootFromGameRoot(existingGameRoot), ...envCandidates, ...libraryRoots]).filter(exists);
}

function parseSteamLibraryFolders(steamRoot: string): string[] {
  const vdf = path.join(steamRoot, "steamapps", "libraryfolders.vdf");
  if (!exists(vdf)) return [];

  try {
    const raw = fs.readFileSync(vdf, "utf8");
    const paths = [...raw.matchAll(/"path"\s+"([^"]+)"/gi)].map((m) =>
      normalizeSlashes(m[1])
    );

    // Older libraryfolders.vdf files can contain direct numbered string values.
    const legacyPaths = [...raw.matchAll(/"\d+"\s+"([A-Z]:\\\\?[^"]+)"/gi)].map(
      (m) => normalizeSlashes(m[1])
    );

    return unique(paths.concat(legacyPaths)).filter(exists);
  } catch (err) {
    console.warn("[StorefrontDetection] Failed to parse Steam libraryfolders.vdf:", err);
    return [];
  }
}

function parseSteamInstallDir(manifestPath: string): string {
  try {
    const raw = fs.readFileSync(manifestPath, "utf8");
    const match = raw.match(/"installdir"\s+"([^"]+)"/i);
    return match?.[1] || "Space Marine 2";
  } catch {
    return "Space Marine 2";
  }
}

function detectSteamCandidate(existingGameRoot?: string, existingSaveDataPath?: string): StorefrontCandidate {
  const roots = unique(
    steamRootCandidates(existingGameRoot).flatMap((root) => [root, ...parseSteamLibraryFolders(root)])
  );

  const manifestHits = roots
    .map((root) => ({ root, manifest: path.join(root, "steamapps", `appmanifest_${SM2_STEAM_APP_ID}.acf`) }))
    .filter((hit) => exists(hit.manifest));

  const hit = manifestHits[0];
  if (!hit) {
    return {
      id: "steam:not-found",
      platform: "steam",
      label: "Steam",
      status: "not_found",
      confidence: "none",
      source: "Steam library scan",
      canLaunch: false,
      gameRoot: "",
      gameExe: "",
      activeModsPath: "",
      saveDataPath: existingSaveDataPath || detectSaberSaveDataPath("steam"),
      launchUri: `steam://run/${SM2_STEAM_APP_ID}`,
      steamAppId: SM2_STEAM_APP_ID,
      notes: ["Steam was checked, but appmanifest_2183900.acf was not found."],
    };
  }

  const installDir = parseSteamInstallDir(hit.manifest);
  const gameRoot = path.join(hit.root, "steamapps", "common", installDir);
  const gameExe = findGameExe(gameRoot);

  return {
    id: `steam:${SM2_STEAM_APP_ID}`,
    platform: "steam",
    label: "Steam",
    status: "installed",
    confidence: exists(gameRoot) ? "high" : "medium",
    source: hit.manifest,
    canLaunch: true,
    gameRoot,
    gameExe,
    activeModsPath: defaultActiveModsPath(gameRoot),
    saveDataPath: existingSaveDataPath || detectSaberSaveDataPath("steam"),
    launchUri: `steam://run/${SM2_STEAM_APP_ID}`,
    steamAppId: SM2_STEAM_APP_ID,
    notes: [
      exists(gameRoot)
        ? "Steam manifest matched Space Marine 2."
        : "Steam manifest matched Space Marine 2, but the install folder was not visible at scan time.",
    ],
  };
}

function detectEpicCandidate(existingSaveDataPath?: string): StorefrontCandidate {
  const epic = detectEpicSpaceMarine2Install();
  if (epic?.launchUri) {
    const gameRoot = epic.InstallLocation || "";
    return {
      id: `epic:${epic.AppName || epic.ArtifactId || epic.ItemId || "space-marine-2"}`,
      platform: "epic",
      label: "Epic Games",
      status: "installed",
      confidence: epic.InstallLocation && looksLikeSm2Path(epic.InstallLocation) ? "high" : "medium",
      source: epic.source,
      canLaunch: true,
      gameRoot,
      gameExe: gameRoot ? findGameExe(gameRoot) : "",
      activeModsPath: gameRoot ? defaultActiveModsPath(gameRoot) : "",
      saveDataPath: existingSaveDataPath || detectSaberSaveDataPath("epic"),
      launchUri: epic.launchUri,
      epic: {
        appName: epic.AppName,
        namespaceId: epic.NamespaceId,
        itemId: epic.ItemId,
        artifactId: epic.ArtifactId,
        installLocation: epic.InstallLocation,
        manifestLocation: epic.ManifestLocation,
      },
      notes: ["Epic installed-game records matched Space Marine 2."],
    };
  }

  const epicRecordsExist = exists(getDefaultLauncherInstalledPath()) || exists(getDefaultEpicManifestDir());
  return {
    id: epicRecordsExist ? "epic:launcher-only" : "epic:not-found",
    platform: "epic",
    label: "Epic Games",
    status: epicRecordsExist ? "launcher_only" : "not_found",
    confidence: "none",
    source: epicRecordsExist ? "Epic launcher records" : "Epic manifest scan",
    canLaunch: false,
    gameRoot: "",
    gameExe: "",
    activeModsPath: "",
    saveDataPath: existingSaveDataPath || detectSaberSaveDataPath("epic"),
    launchUri: "",
    notes: [
      epicRecordsExist
        ? "Epic launcher records were found, but Space Marine 2 was not listed as installed."
        : "Epic launcher records were not found on this machine.",
    ],
  };
}

async function detectXboxCandidate(existingSaveDataPath?: string): Promise<StorefrontCandidate> {
  const xbox = await detectXboxGamePassInstall();
  const xboxApp = xbox ? null : await detectXboxAppInstall();

  if (xbox) {
    const gameRoot = detectXboxGamePassGameRoot(xbox.installLocation);
    return {
      id: `xbox:${xbox.aumid}`,
      platform: "xbox",
      label: "Xbox / PC Game Pass / Microsoft Store",
      status: "installed",
      confidence: xbox.source === "StartApps" ? "high" : "medium",
      source: xbox.source,
      canLaunch: true,
      gameRoot,
      gameExe: gameRoot ? findGameExe(gameRoot) : "",
      activeModsPath: gameRoot ? defaultActiveModsPath(gameRoot) : "",
      saveDataPath:
        existingSaveDataPath || detectXboxGamePassSaveDataPath(xbox.packageFamilyName),
      launchUri: xbox.launchUri,
      storeProductId: SM2_XBOX_STORE_PRODUCT_ID,
      xbox: {
        aumid: xbox.aumid,
        packageFamilyName: xbox.packageFamilyName,
        packageFullName: xbox.packageFullName,
        appId: xbox.appId,
        installLocation: xbox.installLocation,
      },
      notes: [
        gameRoot
          ? "Windows app detection matched Space Marine 2 and an accessible XboxGames root was found."
          : "Windows app detection matched Space Marine 2. Launch is available, but the mod folder may need manual confirmation if the package path is protected.",
      ],
    };
  }

  return {
    id: xboxApp ? "xbox:launcher-only" : "xbox:not-found",
    platform: "xbox",
    label: "Xbox / PC Game Pass / Microsoft Store",
    status: xboxApp ? "launcher_only" : "not_found",
    confidence: "none",
    source: xboxApp ? "Get-StartApps" : "Windows app scan",
    canLaunch: false,
    gameRoot: "",
    gameExe: "",
    activeModsPath: "",
    saveDataPath: existingSaveDataPath || "",
    launchUri: "",
    storeProductId: SM2_XBOX_STORE_PRODUCT_ID,
    xbox: xboxApp
      ? {
          xboxAppAumid: xboxApp.aumid,
        }
      : undefined,
    notes: [
      xboxApp
        ? "Xbox app is installed, but Space Marine 2 was not found as an Xbox/Game Pass/Store app."
        : "Xbox/Game Pass/Store app scan did not find Space Marine 2.",
      `Store fallback: ${SM2_XBOX_STORE_URI}`,
    ],
  };
}

function candidateRank(candidate: StorefrontCandidate): number {
  if (candidate.status !== "installed") return 0;

  const platformRank = candidate.platform === "steam" ? 30 : candidate.platform === "epic" ? 20 : 10;
  const confidenceRank = candidate.confidence === "high" ? 100 : candidate.confidence === "medium" ? 60 : 20;
  const pathRank = candidate.gameRoot ? 5 : 0;
  const savedLaunchRank = candidate.launchUri ? 5 : 0;

  return confidenceRank + platformRank + pathRank + savedLaunchRank;
}

function selectBestCandidate(
  checks: StorefrontCandidate[],
  preferredPlatform?: Platform,
  preferredLaunchUri?: string
): StorefrontCandidate | undefined {
  const installed = checks.filter((candidate) => candidate.status === "installed");
  if (!installed.length) return undefined;

  const preferred = installed.find((candidate) => {
    if (preferredLaunchUri && candidate.launchUri === preferredLaunchUri) return true;
    if (preferredPlatform && preferredPlatform !== "unknown" && candidate.platform === preferredPlatform) return true;
    return false;
  });

  if (preferred) return preferred;

  return [...installed].sort((a, b) => candidateRank(b) - candidateRank(a))[0];
}

export async function scanStorefronts(options: {
  preferredPlatform?: Platform;
  preferredLaunchUri?: string;
  existingGameRoot?: string;
  existingSaveDataPath?: string;
} = {}): Promise<StorefrontScanResult> {
  const checks: StorefrontCandidate[] = [
    detectSteamCandidate(options.existingGameRoot, options.existingSaveDataPath),
    detectEpicCandidate(options.existingSaveDataPath),
    await detectXboxCandidate(options.existingSaveDataPath),
  ];

  const candidates = checks.filter((candidate) => candidate.status === "installed");
  const selected = selectBestCandidate(
    checks,
    options.preferredPlatform,
    options.preferredLaunchUri
  );

  return {
    candidates,
    checks,
    selected,
    storeFallbackUri: SM2_XBOX_STORE_URI,
  };
}

function readSaberConfigCandidate(root: string): string {
  if (!exists(root)) return "";

  const queue = [root];
  const maxVisited = 250;
  let visited = 0;

  while (queue.length && visited < maxVisited) {
    const current = queue.shift()!;
    visited++;

    const candidate = path.join(current, "Main", "config");
    if (exists(candidate)) return candidate;

    let children: fs.Dirent[] = [];
    try {
      children = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const child of children) {
      if (!child.isDirectory()) continue;
      queue.push(path.join(current, child.name));
    }
  }

  return "";
}

export function detectSaberSaveDataPath(platformHint?: Platform): string {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return "";

  const storageRoot = path.join(localAppData, "Saber", "Space Marine 2", "storage");
  if (!exists(storageRoot)) return "";

  const priority = platformHint === "epic" ? ["epic", "steam"] : ["steam", "epic"];
  for (const store of priority) {
    const hit = readSaberConfigCandidate(path.join(storageRoot, store));
    if (hit) return hit;
  }

  let children: fs.Dirent[] = [];
  try {
    children = fs.readdirSync(storageRoot, { withFileTypes: true });
  } catch {
    return "";
  }

  for (const child of children) {
    if (!child.isDirectory()) continue;
    const hit = readSaberConfigCandidate(path.join(storageRoot, child.name));
    if (hit) return hit;
  }

  return "";
}
