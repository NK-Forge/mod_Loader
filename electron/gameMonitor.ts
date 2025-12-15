/**
 * @file electron/gameMonitor.ts
 * @project Space Marine 2 Mod Loader
 *
 * Monitors the Space Marine 2 game process on Windows and waits
 * for it to start and later exit.
 *
 * This version:
 * - Uses pattern-based matching (not config.gameExe)
 * - Ignores any "protected" processes in tasklist output
 * - Uses "stable" running/exit streaks to avoid tiny blips
 */

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Broad but game-specific patterns to look for in tasklist output.
// These are matched case-insensitively against each CSV line.
const GAME_PROCESS_PATTERNS = [
  "warhammer 40000 space marine 2",
  "space marine 2",
  "spacemarine2.exe",
];

// Timeouts / polling settings
const APPEAR_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes to see the game once
const POLL_INTERVAL_MS = 2_000;          // 2 seconds between checks
const MAX_CHECKS = 18_000;               // ~10 hours max (safety upper bound)

// How many consecutive checks do we require before considering
// the game "stably running" or "stably exited".
const RUNNING_STABLE_CHECKS = 2;   // 2 * 2s = ~4 seconds
const EXIT_STABLE_CHECKS = 2;      // 2 * 2s = ~4 seconds

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check whether any Space Marine 2–related game process appears to be running.
 *
 * - Scans full tasklist CSV output
 * - Filters out lines containing "protected"
 * - Matches GAME_PROCESS_PATTERNS against remaining lines
 */
async function isGameProcessRunning(): Promise<boolean> {
  if (process.platform !== "win32") {
    return false;
  }

  try {
    const { stdout } = await execAsync(`tasklist /FO CSV /NH`, {
      windowsHide: true,
    });

    const rawLines = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // Filter out any "protected" processes
    const filteredLines = rawLines.filter(
      (line) => !line.toLowerCase().includes("protected")
    );

    // Optional debug: show what we filtered (can comment out later)
    if (rawLines.length !== filteredLines.length) {
      const ignored = rawLines.filter((l) => !filteredLines.includes(l));
      console.log("[GameMonitor] Ignoring 'protected' tasklist rows:", ignored);
    }

    const haystack = filteredLines.join("\n").toLowerCase();

    const found = GAME_PROCESS_PATTERNS.some((pattern) =>
      haystack.includes(pattern.toLowerCase())
    );

    console.log(
      "[GameMonitor] Process check =>",
      found ? "RUNNING" : "NOT RUNNING"
    );

    return found;
  } catch (err) {
    console.error("[GameMonitor] tasklist failed:", err);
    // Fail-safe: assume not running so we don't hang forever.
    return false;
  }
}

/**
 * Wait for the Space Marine 2 game process to appear and then exit.
 *
 * Phase 1: Wait up to APPEAR_TIMEOUT_MS for the process to show up and be
 *          stably running (RUNNING_STABLE_CHECKS in a row).
 * Phase 2: Once seen "stably running", poll until it's stably not running
 *          (EXIT_STABLE_CHECKS in a row).
 */
export async function waitForGameProcessToExit(
  logPrefix: string = "[GameMonitor]"
): Promise<void> {
  if (process.platform !== "win32") {
    console.log(`${logPrefix} Non-Windows platform; skipping game monitor.`);
    return;
  }

  console.log(
    `${logPrefix} Monitoring tasklist for patterns:`,
    GAME_PROCESS_PATTERNS.join(", ")
  );

  const startTime = Date.now();
  let runningStable = false;
  let runningStreak = 0;

  // ---- Phase 1: Wait for game to appear and be "stably running" ----
  console.log(`${logPrefix} Phase 1: Waiting for game to start...`);

  while (Date.now() - startTime < APPEAR_TIMEOUT_MS) {
    const running = await isGameProcessRunning();

    if (running) {
      runningStreak++;
      if (!runningStable && runningStreak >= RUNNING_STABLE_CHECKS) {
        runningStable = true;
        const elapsedSec = Math.round((Date.now() - startTime) / 1000);
        console.log(
          `${logPrefix} Game detected as stably running after ${elapsedSec}s`
        );
        break;
      }
    } else {
      runningStreak = 0; // reset streak if we see a gap
    }

    await sleep(POLL_INTERVAL_MS);
  }

  if (!runningStable) {
    console.warn(
      `${logPrefix} Game never reached a stable running state within ${APPEAR_TIMEOUT_MS}ms - aborting monitor`
    );
    return;
  }

  // ---- Phase 2: Wait for game to be "stably not running" ----
  console.log(`${logPrefix} Phase 2: Game running, monitoring for exit...`);

  let checks = 0;
  let notRunningStreak = 0;

  while (checks < MAX_CHECKS) {
    const running = await isGameProcessRunning();
    checks++;

    if (!running) {
      notRunningStreak++;
      if (notRunningStreak >= EXIT_STABLE_CHECKS) {
        const elapsedSec = Math.round((Date.now() - startTime) / 1000);
        console.log(
          `${logPrefix} Game appears to have stably exited after ~${elapsedSec}s, stopping monitor`
        );
        return;
      }
    } else {
      notRunningStreak = 0; // reset exit streak when we see it running again
    }

    // Log heartbeat every 30 checks (~60 seconds)
    if (checks % 30 === 0) {
      const elapsedMin = Math.round((Date.now() - startTime) / 1000 / 60);
      console.log(
        `${logPrefix} Still monitoring (about ${elapsedMin} min elapsed)...`
      );
    }

    await sleep(POLL_INTERVAL_MS);
  }

  console.warn(
    `${logPrefix} Max checks reached (${MAX_CHECKS}), stopping monitor loop`
  );
}
