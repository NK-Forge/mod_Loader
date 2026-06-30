/**
 * @file electron/utils/platform.ts
 * Helpers for inferring which platform (Steam, Epic, or Xbox/Game Pass) an
 * install path belongs to.
 */

export type Platform = "steam" | "epic" | "xbox" | "unknown";

/**
 * Infer platform from a game install path.
 *
 * Heuristics:
 * - Xbox/Game Pass: path lives under XboxGames/WindowsApps/Packages and looks
 *   like Space Marine 2.
 * - Epic: path lives under an "Epic" / "EpicLibrary" root and contains
 *   "SpaceMarine2" or "Space Marine 2" / "Warhammer40000SpaceMarine2".
 * - Steam: path lives under "steamapps" and contains "Space Marine 2"
 *   (or the full "Warhammer 40,000 Space Marine 2" name).
 */
export function inferPlatformFromPath(p: string | undefined | null): Platform {
  if (!p) return "unknown";

  // Normalize slashes and case
  const n = p.replace(/\\/g, "/").toLowerCase();

  // Squished version to match "spacemarine2" and "warhammer40000spacemarine2"
  const squished = n.replace(/[^a-z0-9]/g, "");

  const looksLikeSm2 =
    squished.includes("spacemarine2") ||
    squished.includes("spacemarineii") ||
    squished.includes("warhammer40000spacemarine2");

  const inSteam =
    n.includes("steamapps") ||
    n.includes("/steam/") ||
    n.includes("/steamlibrary/");

  const inEpic = n.includes("epiclibrary") || n.includes("/epic games/");

  const inXbox =
    n.includes("/xboxgames/") ||
    n.includes("/windowsapps/") ||
    n.includes("/packages/");

  if (inXbox && looksLikeSm2) {
    return "xbox";
  }

  if (inEpic && looksLikeSm2) {
    return "epic";
  }

  if (inSteam && (looksLikeSm2 || n.includes("space marine 2"))) {
    return "steam";
  }

  return "unknown";
}
