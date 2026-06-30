/**
 * @file electron/utils/xboxGamePass.ts
 * @project Space Marine 2 Mod Loader
 *
 * Xbox / Microsoft Store detection + launch helpers for the PC Game Pass build.
 *
 * Why this exists:
 * - Game Pass games should not be launched by holding a child-process handle to
 *   the game executable. Gaming Services can broker/relaunch the real process.
 * - The stable launch target is the Windows AppUserModelID (AUMID), activated via
 *   the shell AppsFolder URI.
 */

import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const SM2_XBOX_STORE_PRODUCT_ID = "9N9PCZWHVP2L";
export const SM2_XBOX_STORE_URI = `ms-windows-store://pdp/?ProductId=${SM2_XBOX_STORE_PRODUCT_ID}`;

export interface XboxGamePassInstall {
  source: "StartApps" | "AppxPackage" | "Config";
  name?: string;
  packageFullName?: string;
  packageFamilyName?: string;
  installLocation?: string;
  appId?: string;
  aumid: string;
  launchUri: string;
  storeUri: string;
  score: number;
}

type RawXboxCandidate = {
  Source?: string;
  Name?: string;
  PackageFullName?: string;
  PackageFamilyName?: string;
  InstallLocation?: string;
  AppId?: string;
  AUMID?: string;
};

function squish(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function combinedCandidateText(candidate: RawXboxCandidate): string {
  return [
    candidate.Name,
    candidate.PackageFullName,
    candidate.PackageFamilyName,
    candidate.InstallLocation,
    candidate.AppId,
    candidate.AUMID,
  ]
    .filter(Boolean)
    .join(" ");
}

function looksLikeSpaceMarine2(value: string): boolean {
  const s = squish(value);
  return (
    s.includes("spacemarine2") ||
    s.includes("spacemarineii") ||
    (s.includes("warhammer40000") && s.includes("spacemarine")) ||
    (s.includes("warhammer40k") && s.includes("spacemarine"))
  );
}

function scoreCandidate(candidate: RawXboxCandidate): number {
  const text = combinedCandidateText(candidate);
  const s = squish(text);
  let score = 0;

  if (looksLikeSpaceMarine2(text)) score += 100;
  if (s.includes("warhammer40000") || s.includes("warhammer40k")) score += 20;
  if (s.includes("spacemarine")) score += 20;
  if (s.includes("focus") || s.includes("saber")) score += 5;
  if (candidate.Source === "StartApps") score += 10; // directly launchable shortcut/AUMID
  if (candidate.AUMID) score += 10;
  if (candidate.InstallLocation) score += 3;

  return score;
}

function normalizeCandidate(candidate: RawXboxCandidate): XboxGamePassInstall | null {
  const text = combinedCandidateText(candidate);
  if (!looksLikeSpaceMarine2(text)) return null;

  const aumid = candidate.AUMID || "";
  if (!aumid || !aumid.includes("!")) return null;

  const packageFamilyName = candidate.PackageFamilyName || aumid.split("!")[0];
  const appId = candidate.AppId || aumid.split("!")[1];

  return {
    source: candidate.Source === "StartApps" ? "StartApps" : "AppxPackage",
    name: candidate.Name,
    packageFullName: candidate.PackageFullName,
    packageFamilyName,
    installLocation: candidate.InstallLocation,
    appId,
    aumid,
    launchUri: `shell:AppsFolder\\${aumid}`,
    storeUri: SM2_XBOX_STORE_URI,
    score: scoreCandidate(candidate),
  };
}

function parsePowerShellJson(stdout: string): RawXboxCandidate[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];

  const parsed = JSON.parse(trimmed);
  if (Array.isArray(parsed)) return parsed;
  return [parsed];
}

async function queryInstalledXboxCandidates(): Promise<RawXboxCandidate[]> {
  if (process.platform !== "win32") return [];

  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$rows = @()

$packageCandidates = Get-AppxPackage | Where-Object {
  $_.Name -match 'Warhammer|SpaceMarine|Space.Marine|Focus|Saber' -or
  $_.PackageFullName -match 'Warhammer|SpaceMarine|Space.Marine|Focus|Saber' -or
  $_.PackageFamilyName -match 'Warhammer|SpaceMarine|Space.Marine|Focus|Saber' -or
  $_.InstallLocation -match 'Warhammer|Space Marine|SpaceMarine|Focus|Saber'
}

foreach ($pkg in $packageCandidates) {
  $appIds = @()
  try {
    $manifest = Get-AppxPackageManifest -Package $pkg.PackageFullName
    $appIds = @($manifest.Package.Applications.Application.Id)
  } catch {}

  if ($appIds.Count -eq 0) { $appIds = @('App') }

  foreach ($id in $appIds) {
    $rows += [PSCustomObject]@{
      Source = 'AppxPackage'
      Name = $pkg.Name
      PackageFullName = $pkg.PackageFullName
      PackageFamilyName = $pkg.PackageFamilyName
      InstallLocation = $pkg.InstallLocation
      AppId = $id
      AUMID = "$($pkg.PackageFamilyName)!$id"
    }
  }
}

$startCandidates = Get-StartApps | Where-Object {
  $_.Name -match 'Warhammer|Space\\s*Marine|SpaceMarine|Focus|Saber' -or
  $_.AppID -match 'Warhammer|SpaceMarine|Space.Marine|Focus|Saber'
}

foreach ($app in $startCandidates) {
  $pfm = $null
  $appId = $null
  if ($app.AppID -match '(.+)!(.+)') {
    $pfm = $matches[1]
    $appId = $matches[2]
  }

  $rows += [PSCustomObject]@{
    Source = 'StartApps'
    Name = $app.Name
    PackageFullName = $null
    PackageFamilyName = $pfm
    InstallLocation = $null
    AppId = $appId
    AUMID = $app.AppID
  }
}

$rows | ConvertTo-Json -Depth 4 -Compress
`;

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      }
    );

    return parsePowerShellJson(stdout);
  } catch (err) {
    console.warn("[XboxGamePass] PowerShell package/AUMID detection failed:", err);
    return [];
  }
}

/**
 * Detect an installed PC Game Pass / Microsoft Store copy of Space Marine 2.
 */
export async function detectXboxGamePassInstall(): Promise<XboxGamePassInstall | null> {
  const raw = await queryInstalledXboxCandidates();
  const candidates = raw
    .map(normalizeCandidate)
    .filter((candidate): candidate is XboxGamePassInstall => !!candidate)
    .sort((a, b) => b.score - a.score);

  const best = candidates[0] || null;

  if (best) {
    console.log("[XboxGamePass] Detected Space Marine 2 package:", {
      source: best.source,
      name: best.name,
      packageFamilyName: best.packageFamilyName,
      aumid: best.aumid,
      installLocation: best.installLocation,
      score: best.score,
    });
  } else {
    console.log("[XboxGamePass] No Space Marine 2 Xbox/Game Pass package detected");
  }

  return best;
}

function driveRoots(): string[] {
  if (process.platform !== "win32") return [];

  const roots = new Set<string>();
  const systemDrive = process.env.SystemDrive;
  if (systemDrive) roots.add(`${systemDrive.replace(/[\\/]+$/g, "")}\\`);

  for (let code = "C".charCodeAt(0); code <= "Z".charCodeAt(0); code++) {
    roots.add(`${String.fromCharCode(code)}:\\`);
  }

  return [...roots].filter((root) => {
    try {
      return fs.existsSync(root);
    } catch {
      return false;
    }
  });
}

function candidateLooksLikeSm2Folder(dirName: string): boolean {
  return looksLikeSpaceMarine2(dirName);
}

function hasGameRootMarkers(candidate: string): boolean {
  try {
    return (
      fs.existsSync(path.join(candidate, "client_pc")) ||
      fs.existsSync(path.join(candidate, "Warhammer 40000 Space Marine 2.exe")) ||
      fs.existsSync(path.join(candidate, "Warhammer 40,000 Space Marine 2.exe"))
    );
  } catch {
    return false;
  }
}

function normalizePotentialGameRoot(candidate: string): string | null {
  if (!candidate || !fs.existsSync(candidate)) return null;

  const content = path.join(candidate, "Content");
  if (fs.existsSync(content) && hasGameRootMarkers(content)) {
    return content;
  }

  if (hasGameRootMarkers(candidate)) {
    return candidate;
  }

  // If the folder name is clearly the game but markers are not visible yet, keep
  // the Content path when present. The setup wizard can still propose/create the
  // mods directory under it.
  if (candidateLooksLikeSm2Folder(path.basename(candidate))) {
    return fs.existsSync(content) ? content : candidate;
  }

  return null;
}

/**
 * Find the accessible XboxGames install root. Modern Xbox PC installs usually
 * live under <drive>:\XboxGames\<Game>\Content, which is much more useful for
 * mod paths than the protected WindowsApps package path.
 */
export function detectXboxGamePassGameRoot(installLocation?: string): string {
  const direct = installLocation ? normalizePotentialGameRoot(installLocation) : null;
  if (direct) return direct;

  for (const drive of driveRoots()) {
    const xboxGamesRoot = path.join(drive, "XboxGames");
    if (!fs.existsSync(xboxGamesRoot)) continue;

    let children: fs.Dirent[] = [];
    try {
      children = fs.readdirSync(xboxGamesRoot, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const child of children) {
      if (!child.isDirectory()) continue;
      if (!candidateLooksLikeSm2Folder(child.name)) continue;

      const normalized = normalizePotentialGameRoot(path.join(xboxGamesRoot, child.name));
      if (normalized) return normalized;
    }
  }

  return "";
}

/**
 * Game Pass / Store saves commonly live under the app package's wgs folder.
 * This is deliberately conservative and only returns a path that already exists.
 */
export function detectXboxGamePassSaveDataPath(packageFamilyName?: string): string {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return "";

  const packagesRoot = path.join(localAppData, "Packages");
  if (!fs.existsSync(packagesRoot)) return "";

  const exact = packageFamilyName
    ? path.join(packagesRoot, packageFamilyName, "SystemAppData", "wgs")
    : "";

  if (exact && fs.existsSync(exact)) return exact;

  let children: fs.Dirent[] = [];
  try {
    children = fs.readdirSync(packagesRoot, { withFileTypes: true });
  } catch {
    return "";
  }

  for (const child of children) {
    if (!child.isDirectory()) continue;
    if (!candidateLooksLikeSm2Folder(child.name)) continue;

    const candidate = path.join(packagesRoot, child.name, "SystemAppData", "wgs");
    if (fs.existsSync(candidate)) return candidate;
  }

  return "";
}

export interface XboxAppInstall {
  name: string;
  aumid: string;
  launchUri: string;
}

/**
 * Detect only the Xbox shell app. This is not a Space Marine 2 install; it is
 * used by setup diagnostics so the wizard can honestly say "Xbox app is here,
 * but the game package is not." Users should not have to run Get-StartApps.
 */
export async function detectXboxAppInstall(): Promise<XboxAppInstall | null> {
  if (process.platform !== "win32") return null;

  const script = `
$ErrorActionPreference = 'SilentlyContinue'
Get-StartApps |
  Where-Object { $_.AppID -eq 'Microsoft.GamingApp_8wekyb3d8bbwe!Microsoft.Xbox.App' -or $_.Name -eq 'Xbox' } |
  Select-Object -First 1 Name, AppID |
  ConvertTo-Json -Compress
`;

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        windowsHide: true,
        maxBuffer: 128 * 1024,
      }
    );

    const trimmed = stdout.trim();
    if (!trimmed) return null;

    const parsed = JSON.parse(trimmed) as { Name?: string; AppID?: string };
    if (!parsed?.AppID) return null;

    return {
      name: parsed.Name || "Xbox",
      aumid: parsed.AppID,
      launchUri: `shell:AppsFolder\\${parsed.AppID}`,
    };
  } catch (err) {
    console.warn("[XboxGamePass] Xbox app detection failed:", err);
    return null;
  }
}
