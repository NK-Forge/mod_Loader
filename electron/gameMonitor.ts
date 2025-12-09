/**
 * @file electron/gameMonitor.ts
 * @project Space Marine 2 Mod Loader
 *
 * Detects the Space Marine 2 game process on Windows and waits
 * for it to start and later exit.
 */

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Patterns to match the game process in `tasklist` output.
// Kept broad enough to catch variations but not random processes.
const GAME_PROCESS_PATTERNS = [
  "Warhammer 40,000: Space Marine 2",
  "Warhammer 40,000: Space Marine II",
  "Space Marine 2",
  "SpaceMarine2.exe",
] as const;

// Monitoring config (could be moved to a separate config module later)
const APPEAR_TIMEOUT_MS = 60_000;   // 60 seconds for the game to appear
const POLL_INTERVAL_MS = 2_000;     // 2 seconds between checks
const MAX_CHECKS = 18_000;          // ~10 hours max (safety upper bound)

async function isGameProcessRunning(): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`tasklist /FO CSV /NH`, {
      windowsHide: true,
    });

    const haystack = stdout.toLowerCase();
    const found = GAME_PROCESS_PATTERNS.some((pattern) =>
      haystack.includes(pattern.toLowerCase())
    );

    console.log("[GameMonitor] Process check:", found ? "RUNNING" : "NOT RUNNING");
    return found;
  } catch (err) {
    console.error("[GameMonitor] tasklist failed:", err);
    // Fail-safe: assume not running so we don't hang.
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for the Space Marine 2 game process to appear and then exit.
 *
 * Phase 1: Wait up to APPEAR_TIMEOUT_MS for the process to show up.
 * Phase 2: Once seen at least once, poll until it disappears.
 */
export async function waitForGameProcessToExit(
  logPrefix: string = "[GameMonitor]"
): Promise<void> {
  console.log(`${logPrefix} Phase 1: Waiting for game to start...`);

  const startTime = Date.now();
  let seenOnce = false;

  // ---- Phase 1: Wait for game to appear ----
  while (Date.now() - startTime < APPEAR_TIMEOUT_MS) {
    const running = await isGameProcessRunning();

    if (running) {
      seenOnce = true;
      const elapsedSec = Math.round((Date.now() - startTime) / 1000);
      console.log(`${logPrefix} Game detected after ${elapsedSec}s`);
      break;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  if (!seenOnce) {
    console.warn(
      `${logPrefix} Game never appeared within ${APPEAR_TIMEOUT_MS}ms - aborting monitor`
    );
    return;
  }

  // ---- Phase 2: Wait for game to exit ----
  console.log(`${logPrefix} Phase 2: Game running, monitoring for exit...`);

  let checks = 0;
  while (checks < MAX_CHECKS) {
    const running = await isGameProcessRunning();
    checks++;

    if (!running) {
      console.log(`${logPrefix} Game exited (checked ${checks} times)`);
      return;
    }

    // Log heartbeat every 30 checks (~60 seconds)
    if (checks % 30 === 0) {
      const elapsedMin = Math.round((Date.now() - startTime) / 1000 / 60);
      console.log(`${logPrefix} Still monitoring (about ${elapsedMin} min elapsed)...`);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  console.warn(
    `${logPrefix} Max checks reached (${MAX_CHECKS}), stopping monitor loop`
  );
}
