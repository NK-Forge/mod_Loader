/**
 * @file backup.ts
 * @project Space Marine 2 Mod Loader
 * @phase 3B — Safety & Security
 * @description
 *  Backup helpers ensuring operations are reversible. All destructive actions
 *  must call backup first. Backups are timestamped subdirectories.
 */

import fs from "fs";
import fsp from "fs/promises";
import path from "path";

/** mkdir -p */
export async function ensureDir(dir?: string | null): Promise<void> {
  // 🚫 No-op for empty / missing paths
  if (!dir || !dir.trim()) {
    return;
  }

  try {
    await fsp.mkdir(dir, { recursive: true });
  } catch (err: any) {
    // If it already exists, we're good; otherwise bubble up
    if (err && err.code === "EEXIST") {
      return;
    }
    console.error("[ensureDir] failed for", dir, err);
    throw err;
  }
}

/** Create a timestamped subfolder (e.g., 20251110-101523-label) and return its path. */
export async function timestampedSubdir(root: string, label: string): Promise<string> {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14); // YYYYMMDDHHMMSS
  const dest = path.join(root, `${stamp}-${label}`);
  await ensureDir(dest);
  return dest;
}

/**
 * Recursively copy a directory tree.
 * @returns { files, bytes, dest } counters + destination path
 */
export async function backupDir(src: string, destRoot: string): Promise<{ files: number; bytes: number; dest: string }> {
  await ensureDir(destRoot);
  const dest = await timestampedSubdir(destRoot, "backup");

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
      } else {
        const st = await fsp.stat(sp);
        await fsp.copyFile(sp, dp);
        files += 1;
        bytes += st.size;
      }
    }
  }

  if (fs.existsSync(src)) {
    await copyTree(src, dest);
  }

  return { files, bytes, dest };
}

/**
 * Backup target to backupRoot, then delete target folder.
 * Returns the backup location for reference.
 */
export async function safeDeleteDir(target: string, backupRoot: string): Promise<{ backup: string }> {
  const { dest } = await backupDir(target, backupRoot);
  if (fs.existsSync(target)) {
    await fsp.rm(target, { recursive: true, force: true });
  }
  return { backup: dest };
}
