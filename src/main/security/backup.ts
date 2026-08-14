/**
 * @file backup.ts
 * @project Space Marine 2 Mod Loader
 * @phase 3B — Safety & Security
 * @description
 *  Backup helpers ensuring operations are reversible. Completed backups are
 *  promoted atomically from manager-owned temp directories so partial copies
 *  are never mistaken for valid snapshots.
 */

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";

const TEMP_BACKUP_RE = /^\.tmp-\d{17}-[a-f0-9]{12}-backup$/;
const MAX_COLLISION_RETRIES = 1000;
const ORPHAN_TEMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

let lastBackupStamp = "";
let lastBackupSequence = -1;

/** mkdir -p */
export async function ensureDir(dir?: string | null): Promise<void> {
  // No-op for empty / missing paths
  if (!dir || !dir.trim()) {
    return;
  }

  await fsp.mkdir(dir, { recursive: true });
}

/** Fixed-width local-independent timestamp including milliseconds. */
function backupTimestamp(date = new Date()): string {
  return date
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 17); // YYYYMMDDHHMMSSmmm
}

/** Reserve a monotonic slot for backups started within the same millisecond. */
function nextBackupSlot(): { stamp: string; sequence: number } {
  const stamp = backupTimestamp();
  if (stamp === lastBackupStamp) {
    lastBackupSequence += 1;
  } else {
    lastBackupStamp = stamp;
    lastBackupSequence = 0;
  }
  return { stamp, sequence: lastBackupSequence };
}

/**
 * Remove only stale manager-owned orphan temp backup directories.
 * A hard kill can leave one behind, but temp names are never retention slots.
 * The age guard prevents a concurrent in-progress backup from being removed.
 */
async function cleanupOrphanedTempBackups(root: string): Promise<void> {
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch (err: any) {
    if (err?.code === "ENOENT") return;
    throw err;
  }

  const now = Date.now();
  for (const entry of entries) {
    if (!entry.isDirectory() || !TEMP_BACKUP_RE.test(entry.name)) continue;

    const tempPath = path.join(root, entry.name);
    const stat = await fsp.stat(tempPath).catch(() => null);
    if (!stat || now - stat.mtimeMs < ORPHAN_TEMP_MAX_AGE_MS) continue;

    await fsp.rm(tempPath, { recursive: true, force: true });
  }
}

/**
 * Create a unique timestamped subfolder.
 * Uses exclusive mkdir so collisions are detected rather than silently merged.
 */
export async function timestampedSubdir(
  root: string,
  label: string
): Promise<string> {
  await ensureDir(root);
  const { stamp, sequence } = nextBackupSlot();

  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt += 1) {
    const slot = sequence + attempt;
    const suffix = slot === 0 ? "" : `-${slot}`;
    const dest = path.join(root, `${stamp}-${label}${suffix}`);
    try {
      await fsp.mkdir(dest, { recursive: false });
      return dest;
    } catch (err: any) {
      if (err?.code === "EEXIST") continue;
      throw err;
    }
  }

  throw new Error(`Unable to create a unique ${label} directory.`);
}

/** Create a unique manager-owned temp directory for an in-progress backup. */
async function createTempBackupDir(root: string, stamp: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt += 1) {
    const nonce = crypto.randomBytes(6).toString("hex");
    const temp = path.join(root, `.tmp-${stamp}-${nonce}-backup`);
    try {
      await fsp.mkdir(temp, { recursive: false });
      return temp;
    } catch (err: any) {
      if (err?.code === "EEXIST") continue;
      throw err;
    }
  }

  throw new Error("Unable to create a unique temporary backup directory.");
}

/**
 * Atomically promote a completed temp directory to a retention-visible backup.
 * If another backup already claimed the same millisecond, retry with a suffix.
 */
async function promoteTempBackup(
  temp: string,
  root: string,
  stamp: string,
  sequence: number
): Promise<string> {
  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt += 1) {
    const slot = sequence + attempt;
    const suffix = slot === 0 ? "" : `-${slot}`;
    const dest = path.join(root, `${stamp}-backup${suffix}`);

    try {
      await fsp.rename(temp, dest);
      return dest;
    } catch (err: any) {
      const collision =
        ["EEXIST", "ENOTEMPTY", "EPERM"].includes(err?.code) &&
        fs.existsSync(dest);
      if (collision) continue;
      throw err;
    }
  }

  throw new Error("Unable to promote backup after repeated name collisions.");
}

/**
 * Recursively copy a directory tree into a temp directory, then atomically
 * promote it to a completed timestamped backup.
 *
 * A failed copy removes its temp directory and never becomes a retention slot.
 */
export async function backupDir(
  src: string,
  destRoot: string
): Promise<{ files: number; bytes: number; dest: string }> {
  await ensureDir(destRoot);
  await cleanupOrphanedTempBackups(destRoot);

  const { stamp, sequence } = nextBackupSlot();
  const temp = await createTempBackupDir(destRoot, stamp);

  let files = 0;
  let bytes = 0;

  async function copyTree(s: string, d: string) {
    const entries = await fsp.readdir(s, { withFileTypes: true });
    await ensureDir(d);
    for (const e of entries) {
      const sp = path.join(s, e.name);
      const dp = path.join(d, e.name);
      if (e.isDirectory()) {
        await copyTree(sp, dp);
      } else if (e.isFile()) {
        const st = await fsp.stat(sp);
        await fsp.copyFile(sp, dp);
        files += 1;
        bytes += st.size;
      }
    }
  }

  try {
    if (fs.existsSync(src)) {
      await copyTree(src, temp);
    }

    const dest = await promoteTempBackup(temp, destRoot, stamp, sequence);
    return { files, bytes, dest };
  } catch (err) {
    await fsp.rm(temp, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  }
}

/**
 * Backup target to backupRoot, then delete target folder.
 * Returns the backup location for reference.
 */
export async function safeDeleteDir(
  target: string,
  backupRoot: string
): Promise<{ backup: string }> {
  const { dest } = await backupDir(target, backupRoot);
  if (fs.existsSync(target)) {
    await fsp.rm(target, { recursive: true, force: true });
  }
  return { backup: dest };
}
