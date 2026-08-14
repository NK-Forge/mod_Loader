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
  launchHelperPath?: string;
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

export interface XboxGamePassPackageEvidence {
  source: "AppxPackage";
  name?: string;
  packageFullName?: string;
  packageFamilyName?: string;
  installLocation?: string;
  manifestAppIds: string[];
  unverifiedAumids: string[];
  storeUri: string;
  score: number;
}

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

function looksLikeKnownSm2XboxPackage(value: string): boolean {
  const s = squish(value);
  return (
    looksLikeSpaceMarine2(value) || s.includes("focushomeinteractivesamagnus")
  );
}

/**
 * DLC/add-on packages (e.g. FocusHomeInteractiveSA.SpaceMarine2-DLC4) match the
 * base-game name heuristics and ship their own gamelaunchhelper.exe under
 * WindowsApps, but launching that helper never starts the base game. Detect
 * them so scoring, evidence selection, and root/helper resolution can exclude
 * them. The DLC token is matched on the raw value (not squished) so a letter
 * sequence inside a publisher hash cannot false-positive.
 */
export function looksLikeDlcOrAddonPackage(
  value: string | undefined | null,
): boolean {
  const raw = String(value || "");
  if (!raw) return false;
  return (
    /(^|[^a-z])dlc(\d|[^a-z]|$)/i.test(raw) ||
    /season[\s_-]*pass/i.test(raw) ||
    /add[\s_-]?on/i.test(raw) ||
    /expansion/i.test(raw) ||
    /pre[\s_-]?order/i.test(raw) ||
    /bonus[\s_-]*content/i.test(raw)
  );
}

/**
 * WindowsApps package folders are never the correct XboxGames content root for
 * launch/mod purposes: the base game's package path is protected, and any
 * readable gamelaunchhelper.exe found there belongs to a DLC/stub package.
 */
export function isWindowsAppsPath(value: string | undefined | null): boolean {
  const raw = String(value || "");
  if (!raw) return false;
  return /[\\/]windowsapps[\\/]/i.test(raw);
}

export function isSm2ProtectedLaunchApplicationId(
  value: string | undefined | null,
): boolean {
  const s = String(value || "").toLowerCase();
  if (!s) return false;
  const appId = s.includes("!") ? s.split("!").pop() || "" : s;
  return appId === "start.protected.game";
}

export function isBlockedXboxApplicationId(
  value: string | undefined | null,
): boolean {
  const s = String(value || "").toLowerCase();
  if (!s) return true;

  // Space Marine 2's Game Pass build has been observed launching successfully
  // through this protected manifest AUMID even when explorer.exe reports a
  // command failure. It must be verified by process appearance, not rejected.
  if (isSm2ProtectedLaunchApplicationId(s)) return false;

  // Do not block the generic word "protected"; protected GDK launch IDs can be
  // legitimate. Only reject known anti-cheat/helper style IDs that should not be
  // launched directly.
  return s.includes("eac") || s.includes("easyanticheat");
}

export function isBlockedXboxLaunchUri(
  value: string | undefined | null,
): boolean {
  const uri = String(value || "").trim();
  if (!uri) return true;
  if (!uri.toLowerCase().startsWith("shell:appsfolder\\")) return true;

  const aumid = uri.replace(/^shell:AppsFolder\\/i, "");
  if (looksLikeDlcOrAddonPackage(aumid)) return true;
  return !aumid.includes("!") || isBlockedXboxApplicationId(aumid);
}

function scoreCandidate(candidate: RawXboxCandidate): number {
  const text = combinedCandidateText(candidate);
  const s = squish(text);
  let score = 0;

  if (looksLikeKnownSm2XboxPackage(text)) score += 100;
  if (s.includes("warhammer40000") || s.includes("warhammer40k")) score += 20;
  if (s.includes("spacemarine")) score += 20;
  if (s.includes("focus") || s.includes("saber")) score += 5;
  if (candidate.Source === "StartApps") score += 10; // directly launchable shortcut/AUMID
  if (candidate.AUMID) score += 10;
  if (candidate.InstallLocation) score += 3;

  // DLC/add-on packages must never outrank (or stand in for) the base game.
  if (looksLikeDlcOrAddonPackage(text)) score -= 300;

  return score;
}

function normalizeCandidate(
  candidate: RawXboxCandidate,
): XboxGamePassInstall | null {
  const text = combinedCandidateText(candidate);
  if (!looksLikeKnownSm2XboxPackage(text)) return null;
  if (looksLikeDlcOrAddonPackage(text)) return null;

  const packageFamilyName = candidate.PackageFamilyName || "";
  const appId = candidate.AppId || "";
  const aumid =
    candidate.AUMID ||
    (packageFamilyName && appId ? `${packageFamilyName}!${appId}` : "");

  if (!aumid || !aumid.includes("!") || isBlockedXboxApplicationId(aumid)) {
    return null;
  }

  // Get-StartApps remains the strongest source when Windows exposes it, but SM2
  // Game Pass can launch from the Appx manifest's start.protected.game AUMID
  // even when Get-StartApps returns nothing. Treat that base-game manifest ID as
  // launch-capable and let gameLauncher verify success by watching the process.
  const isStartAppsAumid = candidate.Source === "StartApps";
  const isSm2ProtectedManifestAumid =
    candidate.Source === "AppxPackage" &&
    isSm2ProtectedLaunchApplicationId(aumid);

  if (!isStartAppsAumid && !isSm2ProtectedManifestAumid) return null;

  const normalizedPackageFamilyName = packageFamilyName || aumid.split("!")[0];
  const normalizedAppId = appId || aumid.split("!")[1];

  return {
    source: candidate.Source === "AppxPackage" ? "AppxPackage" : "StartApps",
    name: candidate.Name,
    packageFullName: candidate.PackageFullName,
    packageFamilyName: normalizedPackageFamilyName,
    installLocation: candidate.InstallLocation,
    appId: normalizedAppId,
    aumid,
    launchUri: `shell:AppsFolder\\${aumid}`,
    storeUri: SM2_XBOX_STORE_URI,
    score: scoreCandidate(candidate),
  };
}

function normalizePackageEvidence(
  raw: RawXboxCandidate[],
): XboxGamePassPackageEvidence | null {
  const packageRows = raw
    .filter((candidate) => candidate.Source === "AppxPackage")
    .filter((candidate) =>
      looksLikeKnownSm2XboxPackage(combinedCandidateText(candidate)),
    )
    .sort((a, b) => scoreCandidate(b) - scoreCandidate(a));

  // Base-game rows only: DLC packages (e.g. SpaceMarine2-DLC4) also match the
  // SM2 name heuristics, but their installLocation points at a WindowsApps DLC
  // folder whose gamelaunchhelper.exe cannot launch the base game.
  const baseRows = packageRows.filter(
    (candidate) => !looksLikeDlcOrAddonPackage(combinedCandidateText(candidate)),
  );

  const best = baseRows[0] || packageRows[0];
  if (!best) return null;

  if (!baseRows.length) {
    console.warn(
      "[XboxGamePass] Only DLC/add-on package evidence was found; base-game package was not visible.",
      { name: best.Name, packageFamilyName: best.PackageFamilyName },
    );
  }

  const relatedRows = packageRows.filter((candidate) =>
    candidate.PackageFamilyName && best.PackageFamilyName
      ? candidate.PackageFamilyName === best.PackageFamilyName
      : candidate.PackageFullName === best.PackageFullName,
  );

  const manifestAppIds = [
    ...new Set(relatedRows.map((row) => row.AppId).filter(Boolean) as string[]),
  ];
  const unverifiedAumids = [
    ...new Set(relatedRows.map((row) => row.AUMID).filter(Boolean) as string[]),
  ];

  return {
    source: "AppxPackage",
    name: best.Name,
    packageFullName: best.PackageFullName,
    packageFamilyName: best.PackageFamilyName,
    installLocation: best.InstallLocation,
    manifestAppIds,
    unverifiedAumids,
    storeUri: SM2_XBOX_STORE_URI,
    score: scoreCandidate(best),
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
  $_.Name -match 'Warhammer|SpaceMarine|Space.Marine|Magnus|FocusHomeInteractiveSA' -or
  $_.PackageFullName -match 'Warhammer|SpaceMarine|Space.Marine|Magnus|FocusHomeInteractiveSA' -or
  $_.PackageFamilyName -match 'Warhammer|SpaceMarine|Space.Marine|Magnus|FocusHomeInteractiveSA' -or
  $_.InstallLocation -match 'Warhammer|Space Marine|SpaceMarine|Magnus|FocusHomeInteractiveSA'
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
  $_.Name -match 'Warhammer|Space\\s*Marine|SpaceMarine|Magnus|FocusHomeInteractiveSA' -or
  $_.AppID -match 'Warhammer|SpaceMarine|Space.Marine|Magnus|FocusHomeInteractiveSA'
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
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ],
      {
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      },
    );

    return parsePowerShellJson(stdout);
  } catch (err) {
    console.warn(
      "[XboxGamePass] PowerShell package/AUMID detection failed:",
      err,
    );
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
    console.log(
      "[XboxGamePass] No Space Marine 2 Xbox/Game Pass package detected",
    );
  }

  return best;
}

/**
 * Detect package evidence without claiming that it is launch-ready.
 * Used by the setup wizard to explain cases where the game package exists but
 * no verified Start-menu AUMID was found for shell activation.
 */
export async function detectXboxGamePassPackageEvidence(): Promise<XboxGamePassPackageEvidence | null> {
  const raw = await queryInstalledXboxCandidates();
  const evidence = normalizePackageEvidence(raw);

  if (evidence) {
    console.log(
      "[XboxGamePass] Found Space Marine 2 package evidence without verified launch AUMID:",
      {
        name: evidence.name,
        packageFamilyName: evidence.packageFamilyName,
        manifestAppIds: evidence.manifestAppIds,
        installLocation: evidence.installLocation,
        score: evidence.score,
      },
    );
  }

  return evidence;
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
  return (
    looksLikeKnownSm2XboxPackage(dirName) &&
    !looksLikeDlcOrAddonPackage(dirName)
  );
}

/**
 * Strong markers prove this folder contains the actual base-game content.
 * DLC/stub packages never carry these.
 */
function hasStrongGameRootMarkers(candidate: string): boolean {
  try {
    return (
      fs.existsSync(path.join(candidate, "client_pc")) ||
      fs.existsSync(
        path.join(candidate, "Warhammer 40000 Space Marine 2.exe"),
      ) ||
      fs.existsSync(path.join(candidate, "Warhammer 40,000 Space Marine 2.exe"))
    );
  } catch {
    return false;
  }
}

/**
 * Broker markers only prove "some GDK package lives here" - DLC packages ship
 * MicrosoftGame.config and gamelaunchhelper.exe too. Sufficient inside a
 * user-visible XboxGames tree; NOT sufficient inside WindowsApps.
 */
function hasBrokerMarkers(candidate: string): boolean {
  try {
    return (
      fs.existsSync(path.join(candidate, "MicrosoftGame.config")) ||
      fs.existsSync(path.join(candidate, "gamelaunchhelper.exe"))
    );
  } catch {
    return false;
  }
}

function hasGameRootMarkers(candidate: string): boolean {
  if (hasStrongGameRootMarkers(candidate)) return true;

  // Inside WindowsApps, broker markers alone identify DLC/stub packages, not
  // the launchable base game (see: SpaceMarine2-DLC4 shipping its own
  // gamelaunchhelper.exe). Require strong markers there.
  if (isWindowsAppsPath(candidate)) return false;

  return hasBrokerMarkers(candidate);
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
  // mods directory under it. Never accept a WindowsApps package folder this way;
  // the accessible root lives under XboxGames and the drive scan will find it.
  if (
    !isWindowsAppsPath(candidate) &&
    candidateLooksLikeSm2Folder(path.basename(candidate))
  ) {
    return fs.existsSync(content) ? content : candidate;
  }

  return null;
}


export interface XboxMicrosoftGameConfigInfo {
  configPath: string;
  identityName?: string;
  executableName?: string;
  executableId?: string;
}

function parseXmlAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function microsoftGameConfigCandidates(gameRoot?: string): string[] {
  if (!gameRoot) return [];
  return [
    path.join(gameRoot, "MicrosoftGame.config"),
    path.join(path.dirname(gameRoot), "MicrosoftGame.config"),
  ];
}

/**
 * Read MicrosoftGame.config from an XboxGames Content folder when available.
 * This gives us the shipped executable image name for process monitoring and,
 * when non-protected, a possible ApplicationId for shell activation.
 */
export function readXboxMicrosoftGameConfig(
  gameRoot?: string,
): XboxMicrosoftGameConfigInfo | null {
  for (const configPath of microsoftGameConfigCandidates(gameRoot)) {
    try {
      if (!fs.existsSync(configPath)) continue;

      const raw = fs.readFileSync(configPath, "utf8");
      const identityTag = raw.match(/<Identity\b[^>]*>/i)?.[0] || "";
      const identityName = parseXmlAttributes(identityTag).Name;

      let executableName = "";
      let executableId = "";

      for (const match of raw.matchAll(/<Executable\b[^>]*>/gi)) {
        const attrs = parseXmlAttributes(match[0]);
        const name = attrs.Name || attrs.ExecutableName || "";
        const id = attrs.Id || attrs.ID || "";
        const haystack = `${name} ${id}`;

        if (!executableName || looksLikeKnownSm2XboxPackage(haystack)) {
          executableName = name || executableName;
          executableId = id || executableId;
        }

        if (looksLikeKnownSm2XboxPackage(haystack)) break;
      }

      return {
        configPath,
        identityName,
        executableName: executableName || undefined,
        executableId: executableId || undefined,
      };
    } catch (err) {
      console.warn("[XboxGamePass] Failed to parse MicrosoftGame.config:", err);
    }
  }

  return null;
}

export function buildXboxLaunchUriFromMicrosoftGameConfig(
  packageFamilyName?: string,
  gameRoot?: string,
): string {
  if (!packageFamilyName) return "";

  const config = readXboxMicrosoftGameConfig(gameRoot);
  const executableId = config?.executableId;
  if (!executableId || isBlockedXboxApplicationId(executableId)) return "";

  const uri = `shell:AppsFolder\\${packageFamilyName}!${executableId}`;
  return isBlockedXboxLaunchUri(uri) ? "" : uri;
}

/**
 * Modern Xbox PC installs commonly place a Microsoft-provided
 * gamelaunchhelper.exe beside the installed game content. When Windows does
 * not expose a Start-menu AUMID for a title, this helper is the safest
 * no-manual-input fallback because it still routes through Gaming Services
 * instead of spawning the protected game executable directly.
 */
export function findXboxGamePassLaunchHelper(gameRoot?: string): string {
  if (!gameRoot) return "";

  const candidates = [
    path.join(gameRoot, "gamelaunchhelper.exe"),
    path.join(path.dirname(gameRoot), "gamelaunchhelper.exe"),
  ];

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;

      // A helper inside WindowsApps belongs to a DLC/stub package and cannot
      // launch the base game. The launchable helper lives under XboxGames.
      if (isWindowsAppsPath(candidate)) {
        console.warn(
          "[XboxGamePass] Ignoring WindowsApps gamelaunchhelper.exe (DLC/stub package):",
          candidate,
        );
        continue;
      }

      return candidate;
    } catch {
      // ignore inaccessible candidates
    }
  }

  return "";
}

/**
 * Find the accessible XboxGames install root. Modern Xbox PC installs usually
 * live under <drive>:\XboxGames\<Game>\Content, which is much more useful for
 * mod paths than the protected WindowsApps package path.
 */
export function detectXboxGamePassGameRoot(installLocation?: string): string {
  const direct = installLocation
    ? normalizePotentialGameRoot(installLocation)
    : null;
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

      const normalized = normalizePotentialGameRoot(
        path.join(xboxGamesRoot, child.name),
      );
      if (normalized) return normalized;
    }
  }

  return "";
}

/**
 * Game Pass / Store saves commonly live under the app package's wgs folder.
 * This is deliberately conservative and only returns a path that already exists.
 */
export function detectXboxGamePassSaveDataPath(
  packageFamilyName?: string,
): string {
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

    const candidate = path.join(
      packagesRoot,
      child.name,
      "SystemAppData",
      "wgs",
    );
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
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ],
      {
        windowsHide: true,
        maxBuffer: 128 * 1024,
      },
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
