// src/main/services/SaveFileManager.ts
import * as path from "node:path";
import { promises as fs } from "node:fs";
import { ensureDir, safeJoin, isInside } from "./PathGuards";

export type CopyEvent = {
  ts: string;            // ISO timestamp
  srcRoot: string;
  destRoot: string;
  files: number;
  bytes: number;
  ms: number;
  result: "ok" | "error";
  error?: string;
};

const LOG_FILE = ".copylog.jsonl";

export async function backupToVault(sourceRoot: string, vaultRoot: string): Promise<CopyEvent> {
  const t0 = Date.now();
  const ev: CopyEvent = {
    ts: new Date().toISOString(),
    srcRoot: sourceRoot,
    destRoot: vaultRoot,
    files: 0,
    bytes: 0,
    ms: 0,
    result: "ok",
  };

  // basic checks
  if (!sourceRoot || !vaultRoot) {
    ev.result = "error";
    ev.error = "Missing sourceRoot or vaultRoot";
    return ev;
  }
  const srcAbs = path.resolve(sourceRoot);
  const vaultAbs = path.resolve(vaultRoot);

  // create timestamped destination
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z").replace("T", "-");
  const destAbs = safeJoin(vaultAbs, stamp);
  await ensureDir(destAbs);

  try {
    const { files, bytes } = await copyTreeVerify(srcAbs, destAbs);
    ev.files = files;
    ev.bytes = bytes;
  } catch (e: any) {
    ev.result = "error";
    ev.error = String(e?.message || e);
  } finally {
    ev.ms = Date.now() - t0;
    await appendCopyEvent(vaultAbs, ev);
  }
  return ev;
}

async function copyTreeVerify(srcRoot: string, destRoot: string) {
  let files = 0;
  let bytes = 0;

  // Walk
  async function walk(dir: string, rel = ""): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const srcPath = path.join(dir, e.name);
      const relPath = path.join(rel, e.name);
      const dstPath = safeJoin(destRoot, relPath);

      if (e.isDirectory()) {
        await ensureDir(dstPath);
        await walk(srcPath, relPath);
      } else if (e.isFile()) {
        await ensureDir(path.dirname(dstPath));
        // copy
        await fs.copyFile(srcPath, dstPath);
        // verify bytes
        const [sStat, dStat] = await Promise.all([fs.stat(srcPath), fs.stat(dstPath)]);
        if (sStat.size !== dStat.size) {
          // clean up bad copy
          await fs.rm(dstPath, { force: true });
          throw new Error(`Copy verify failed for ${relPath} (${sStat.size} != ${dStat.size})`);
        }
        files += 1;
        bytes += dStat.size;
      } // (symlinks etc. skipped on purpose)
    }
  }

  await walk(srcRoot, "");
  return { files, bytes };
}

export async function appendCopyEvent(vaultRoot: string, ev: CopyEvent) {
  const file = path.join(vaultRoot, LOG_FILE);
  await ensureDir(vaultRoot);
  const line = JSON.stringify(ev) + "\n";
  await fs.appendFile(file, line, "utf8");
}

export async function readCopyEvents(vaultRoot: string, lastDays: number): Promise<CopyEvent[]> {
  const file = path.join(vaultRoot, LOG_FILE);
  let data = "";
  try {
    data = await fs.readFile(file, "utf8");
  } catch {
    return [];
  }
  const now = Date.now();
  const min = now - lastDays * 24 * 60 * 60 * 1000;
  const rows: CopyEvent[] = [];
  for (const line of data.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      const ev = JSON.parse(t) as CopyEvent;
      if (!ev?.ts) continue;
      const ts = Date.parse(ev.ts);
      if (!Number.isFinite(ts)) continue;
      if (ts >= min) rows.push(ev);
    } catch {
      // ignore bad lines
    }
  }
  // newest first
  rows.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return rows;
}
