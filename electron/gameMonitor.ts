/**
 * @file electron/gameMonitor.ts
 * @project Space Marine 2 Mod Loader
 *
 * Monitors the Space Marine 2 game process on Windows and waits for it to
 * appear and later exit. Brokered storefront launches can create short-lived
 * helper processes, so launch success is only trusted after the real game image
 * appears in tasklist for a stable streak.
 */

import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { getConfig } from "./config/configManager";
import { MONITORING_CONFIG } from "./config/monitoringConfig";

const execAsync = promisify(exec);

// Broad but game-specific patterns to look for in tasklist output.
// These are matched case-insensitively against each CSV line.
const DEFAULT_GAME_PROCESS_PATTERNS = [
  "warhammer 40000 space marine 2",
  "warhammer 40,000 space marine 2",
  "space marine 2",
  "spacemarine2.exe",
  "warhammer40000spacemarine2.exe",
];

// Known manifest-only/protected decoys that should not count as the real game.
// Do not filter the generic word "protected"; the Game Pass build may use
// protected-launch naming in legitimate rows.
const DECOY_PROCESS_TOKENS = ["start.protected.game"];

// Avoid turning generic MicrosoftGame.config names like "Game.exe" into broad
// substring matches that could accidentally match GameBar/GamingServices/helper
// rows and falsely report a successful launch.
const MIN_CONFIGURED_PROCESS_STEM_LENGTH = 6;

const {
  GAME_APPEAR_TIMEOUT_MS,
  POLL_INTERVAL_MS,
  MAX_POLL_ATTEMPTS,
  RUNNING_STABLE_CHECKS,
  EXIT_STABLE_CHECKS,
} = MONITORING_CONFIG;

interface ProcessPatternConfig {
  /** Exact tasklist image names, compared only against CSV column 1. */
  exactImageNames: string[];
  /** Broad, game-specific fallback patterns, matched against full rows. */
  broadPatterns: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function parseTasklistImageName(row: string): string {
  const trimmed = row.trim();
  if (!trimmed) return "";

  // tasklist /FO CSV rows usually start like: "Image Name","PID",...
  if (trimmed.startsWith('"')) {
    let value = "";
    for (let i = 1; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (ch === '"') {
        if (trimmed[i + 1] === '"') {
          value += '"';
          i++;
          continue;
        }
        return value;
      }
      value += ch;
    }
    return value;
  }

  return trimmed.split(",")[0] ?? "";
}

function configuredGameProcessPatterns(): ProcessPatternConfig {
  const config = getConfig() as any;
  const gameExe = typeof config?.gameExe === "string" ? config.gameExe : "";
  const exeName = gameExe ? path.basename(gameExe).toLowerCase() : "";
  const exeStem = exeName ? exeName.replace(/\.exe$/i, "") : "";

  const exactImageNames = unique([exeName]);
  const configuredBroadPatterns =
    exeStem.length >= MIN_CONFIGURED_PROCESS_STEM_LENGTH ? [exeStem] : [];

  return {
    exactImageNames,
    broadPatterns: unique([
      ...configuredBroadPatterns,
      ...DEFAULT_GAME_PROCESS_PATTERNS,
    ]).map((pattern) => pattern.toLowerCase()),
  };
}

function describeProcessPatterns(patterns: ProcessPatternConfig): string {
  const exact = patterns.exactImageNames.length
    ? `exact images: ${patterns.exactImageNames.join(", ")}`
    : "exact images: none";
  const broad = patterns.broadPatterns.length
    ? `broad patterns: ${patterns.broadPatterns.join(", ")}`
    : "broad patterns: none";
  return `${exact}; ${broad}`;
}

function filterTasklistRows(rawLines: string[]): string[] {
  return rawLines.filter((line) => {
    const lower = line.toLowerCase();
    return !DECOY_PROCESS_TOKENS.some((token) => lower.includes(token));
  });
}

/**
 * Check whether any Space Marine 2-related game process appears to be running.
 *
 * - Scans full tasklist CSV output
 * - Ignores only known protected decoy tokens such as start.protected.game
 * - Matches setup-derived image names exactly against tasklist column 1
 * - Uses broad fallback patterns only when they are game-specific enough
 */
export async function isGameProcessRunning(
  logPrefix: string = "[GameMonitor]",
): Promise<boolean> {
  if (process.platform !== "win32") {
    return false;
  }

  try {
    const { stdout } = await execAsync("tasklist /FO CSV /NH", {
      windowsHide: true,
    });

    const rawLines = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const filteredLines = filterTasklistRows(rawLines);

    if (rawLines.length !== filteredLines.length) {
      const ignored = rawLines.filter((l) => !filteredLines.includes(l));
      console.log(`${logPrefix} Ignoring known decoy tasklist rows:`, ignored);
    }

    const patterns = configuredGameProcessPatterns();
    const imageNames = filteredLines
      .map((line) => parseTasklistImageName(line).toLowerCase())
      .filter(Boolean);

    const exactFound = patterns.exactImageNames.some((name) =>
      imageNames.includes(name),
    );

    const haystack = filteredLines.join("\n").toLowerCase();
    const broadFound = patterns.broadPatterns.some(
      (pattern) =>
        pattern.length >= MIN_CONFIGURED_PROCESS_STEM_LENGTH &&
        haystack.includes(pattern),
    );

    const found = exactFound || broadFound;

    console.log(`${logPrefix} Process check =>`, found ? "RUNNING" : "NOT RUNNING");

    return found;
  } catch (err) {
    console.error(`${logPrefix} tasklist failed:`, err);
    // Fail-safe: assume not running so we don't hang forever.
    return false;
  }
}

/**
 * Wait only for the game process to appear. Used to verify brokered launches
 * before reporting success back to the renderer/user.
 */
export async function waitForGameProcessToAppear(
  timeoutMs: number = GAME_APPEAR_TIMEOUT_MS,
  logPrefix: string = "[GameMonitor]",
): Promise<boolean> {
  if (process.platform !== "win32") {
    console.log(`${logPrefix} Non-Windows platform; skipping appear probe.`);
    return false;
  }

  const startTime = Date.now();
  let runningStreak = 0;

  console.log(
    `${logPrefix} Waiting up to ${Math.round(timeoutMs / 1000)}s for game process to appear...`,
  );

  while (Date.now() - startTime < timeoutMs) {
    const running = await isGameProcessRunning(logPrefix);

    if (running) {
      runningStreak++;
      if (runningStreak >= RUNNING_STABLE_CHECKS) {
        const elapsedSec = Math.round((Date.now() - startTime) / 1000);
        console.log(`${logPrefix} Game appeared after ${elapsedSec}s`);
        return true;
      }
    } else {
      runningStreak = 0;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  console.warn(`${logPrefix} Game process never appeared within ${timeoutMs}ms`);
  return false;
}

/**
 * Wait for the Space Marine 2 game process to appear and then exit.
 */
export async function waitForGameProcessToExit(
  logPrefix: string = "[GameMonitor]",
): Promise<void> {
  if (process.platform !== "win32") {
    console.log(`${logPrefix} Non-Windows platform; skipping game monitor.`);
    return;
  }

  const patterns = configuredGameProcessPatterns();
  console.log(
    `${logPrefix} Monitoring tasklist for patterns:`,
    describeProcessPatterns(patterns),
  );

  const startTime = Date.now();
  const appeared = await waitForGameProcessToAppear(
    GAME_APPEAR_TIMEOUT_MS,
    logPrefix,
  );

  if (!appeared) {
    console.warn(
      `${logPrefix} Game never reached a stable running state within ${GAME_APPEAR_TIMEOUT_MS}ms - aborting monitor`,
    );
    return;
  }

  console.log(`${logPrefix} Phase 2: Game running, monitoring for exit...`);

  let checks = 0;
  let notRunningStreak = 0;

  while (checks < MAX_POLL_ATTEMPTS) {
    const running = await isGameProcessRunning(logPrefix);
    checks++;

    if (!running) {
      notRunningStreak++;
      if (notRunningStreak >= EXIT_STABLE_CHECKS) {
        const elapsedSec = Math.round((Date.now() - startTime) / 1000);
        console.log(
          `${logPrefix} Game appears to have stably exited after ~${elapsedSec}s, stopping monitor`,
        );
        return;
      }
    } else {
      notRunningStreak = 0;
    }

    // Log heartbeat every 30 checks (~60 seconds)
    if (checks % 30 === 0) {
      const elapsedMin = Math.round((Date.now() - startTime) / 1000 / 60);
      console.log(
        `${logPrefix} Still monitoring (about ${elapsedMin} min elapsed)...`,
      );
    }

    await sleep(POLL_INTERVAL_MS);
  }

  console.warn(
    `${logPrefix} Max checks reached (${MAX_POLL_ATTEMPTS}), stopping monitor loop`,
  );
}
