// electron/gameMonitor.ts
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// We match by substring, because the real process name can be
// "Warhammer 40,000: Space Marine 2" or a CLIENT exe under it.
const GAME_PROCESS_KEY = "Space Marine 2";

async function isGameProcessRunning(): Promise<boolean> {
  try {
    // Get all processes in CSV format, no header
    const { stdout } = await execAsync(
      `tasklist /FO CSV /NH`,
      { windowsHide: true }
    );

    const haystack = stdout.toLowerCase();
    const key = GAME_PROCESS_KEY.toLowerCase();

    const found = haystack.includes(key);
    console.log("[GameMonitor] isGameProcessRunning =", found);
    return found;
  } catch (err) {
    console.error("[GameMonitor] tasklist failed:", err);
    // Fail-safe: if we can't check, pretend it's not running so we don't hang
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait until the actual Space Marine 2 game process fully exits.
 * Phase 1: wait for the process to appear (Steam may take a bit).
 * Phase 2: once seen, wait until it disappears.
 */
export async function waitForGameProcessToExit(
  logPrefix: string = "[GameMonitor]"
): Promise<void> {
  const appearTimeoutMs = 60000; // up to 60s for game to appear
  const pollIntervalMs = 2000;

  console.log(`${logPrefix} waiting for game process to appear...`);

  const start = Date.now();
  let seenOnce = false;

  // ---- Phase 1: wait for game to start ----
  while (Date.now() - start < appearTimeoutMs) {
    const running = await isGameProcessRunning();
    console.log(`${logPrefix} appear check ->`, running);

    if (running) {
      seenOnce = true;
      console.log(`${logPrefix} game process detected, monitoring until exit...`);
      break;
    }

    await sleep(pollIntervalMs);
  }

  if (!seenOnce) {
    console.log(
      `${logPrefix} game process never appeared within ${appearTimeoutMs}ms; skipping exit wait.`
    );
    return;
  }

  // ---- Phase 2: wait for game to exit ----
  let checks = 0;
  while (true) {
    const running = await isGameProcessRunning();
    checks += 1;

    if (!running) {
      console.log(
        `${logPrefix} game process is NOT running anymore (checks=${checks}); exiting monitor.`
      );
      return;
    }

    await sleep(pollIntervalMs);
  }
}
