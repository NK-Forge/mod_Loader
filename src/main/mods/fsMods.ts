/**
 * @file src/main/mods/fsMods.ts
 * @project Space Marine 2 Mod Loader
 * @phase 3B — Safety & Security (with “magic” apply + delete)
 *
 * Supports BOTH folder-per-mod and loose files (except ignored extensions).
 * - listMods(): merges Active + Vault as rows { name, enabled, inVault }
 * - reconcileMods(): moves entries Active<->Vault based on enabled set
 * - deleteMod(): backs up then removes a mod from Active/Vault
 */

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { ensureDir, backupDir, timestampedSubdir } from "../security/backup";
import { assertInside, validateModList } from "../security/validators";

export type ModRow = { name: string; enabled: boolean; inVault: boolean };

// Add more as needed (e.g., ".md", ".log", ".bak")
const IGNORE_EXTS = new Set<string>([".txt"]);

/** Split directory entries into directories and files (filtered). */
async function listDirAndFiles(p: string): Promise<{ dirs: string[]; files: string[] }> {
  if (!fs.existsSync(p)) return { dirs: [], files: [] };
  const entries = await fsp.readdir(p, { withFileTypes: true });
  const dirs: string[] = [];
  const files: string[] = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      dirs.push(e.name);
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (!IGNORE_EXTS.has(ext)) files.push(e.name);
    }
  }
  return { dirs, files };
}

/** Public: list Active + Vault into ModRow[] (names include dir names and file names). */
export async function listMods(activeDir: string, vaultDir: string): Promise<ModRow[]> {
  const [a, v] = await Promise.all([listDirAndFiles(activeDir), listDirAndFiles(vaultDir)]);
  const activeNames = new Set<string>([...a.dirs, ...a.files]);
  const vaultNames  = new Set<string>([...v.dirs, ...v.files]);
  const all = new Set<string>([...activeNames, ...vaultNames]);

  const rows: ModRow[] = [];
  for (const name of all) {
    rows.push({
      name,
      enabled: activeNames.has(name),
      inVault: vaultNames.has(name),
    });
  }
  return rows.sort((x, y) => x.name.localeCompare(y.name));
}

/** Copy directory recursively. */
async function copyDir(src: string, dst: string) {
  const entries = await fsp.readdir(src, { withFileTypes: true });
  await ensureDir(dst);
  for (const e of entries) {
    const sp = path.join(src, e.name);
    const dp = path.join(dst, e.name);
    if (e.isDirectory()) await copyDir(sp, dp);
    else if (e.isFile()) await fsp.copyFile(sp, dp);
  }
}

/** Move with cross-device fallback (copy+delete). Works for file or dir. */
async function moveEntry(src: string, dst: string): Promise<void> {
  await ensureDir(path.dirname(dst));
  try {
    await fsp.rename(src, dst);
  } catch {
    const st = await fsp.stat(src);
    if (st.isDirectory()) {
      await copyDir(src, dst);
      await fsp.rm(src, { recursive: true, force: true });
    } else {
      await fsp.copyFile(src, dst);
      await fsp.unlink(src);
    }
  }
}

/** Backup Active then clear it (keeps operations reversible). */
async function resetActiveWithBackup(activeDir: string, backupRoot: string) {
  
  
  await backupDir(activeDir, backupRoot);
  if (fs.existsSync(activeDir)) await fsp.rm(activeDir, { recursive: true, force: true });
  await ensureDir(activeDir);
}

/**
 * Reconcile desired enabled set → perform MOVES so each mod lives in exactly one place.
 * - If enabled: ensure in Active (move from Vault→Active if needed).
 * - If disabled: ensure in Vault (move from Active→Vault if needed).
 */
export async function reconcileMods(
  enabled: string[],
  activeDir: string,
  vaultDir: string,
  backupRoot: string
): Promise<{ ok: true }> {
  const want = new Set(validateModList(enabled));

  // Safety assertions
  assertInside(activeDir, activeDir);
  assertInside(vaultDir, vaultDir);
  assertInside(backupRoot, backupRoot);

  // 1) Backup Active for reversibility, but DO NOT clear it.
  await backupDir(activeDir, path.join(backupRoot, "pre-reconcile"));

  // 2) Snapshot current entries
  const [a, v] = await Promise.all([listDirAndFiles(activeDir), listDirAndFiles(vaultDir)]);
  const presentActive = new Set<string>([...a.dirs, ...a.files]);
  const presentVault  = new Set<string>([...v.dirs, ...v.files]);

  // 3) Move items that SHOULD NOT be active → Vault (unchecked)
  //    (only if they currently exist in Active)
  for (const name of presentActive) {
    if (!want.has(name)) {
      const aPath = path.join(activeDir, name);
      const vPath = path.join(vaultDir,  name);
      assertInside(activeDir, aPath);
      assertInside(vaultDir,  vPath);
      await ensureDir(vaultDir);
      await moveEntry(aPath, vPath);
      // reflect state change
      presentVault.add(name);
    }
  }

  // Ensure items that SHOULD be active are there:
  // If in Vault and not in Active → move Vault → Active
  for (const name of want) {
    const aPath = path.join(activeDir, name);
    const vPath = path.join(vaultDir,  name);
    const inActive = fs.existsSync(aPath);
    const inVault  = fs.existsSync(vPath);

    if (!inActive && inVault) {
      assertInside(vaultDir, vPath);
      assertInside(activeDir, aPath);
      await moveEntry(vPath, aPath);
    }
  }

  // Resolve duplicates consistently:
  //  - If want Active and both exist → keep Active, remove Vault copy
  //  - If NOT want Active and both exist → keep Vault, remove Active copy
  const union = new Set<string>([...presentActive, ...presentVault, ...want]);
  for (const name of union) {
    const aPath = path.join(activeDir, name);
    const vPath = path.join(vaultDir,  name);
    const inActive = fs.existsSync(aPath);
    const inVault  = fs.existsSync(vPath);
    const shouldBeActive = want.has(name);

    if (inActive && inVault) {
      if (shouldBeActive) {
        // Prefer Active; remove Vault duplicate
        await fsp.rm(vPath, { recursive: true, force: true });
      } else {
        // Prefer Vault; remove Active duplicate
        await fsp.rm(aPath, { recursive: true, force: true });
      }
    }
  }

  return { ok: true };
}

/** Permanently delete a mod from BOTH locations (no backup, fails if locked). */
export async function deleteMod(
  name: string,
  activeDir: string,
  vaultDir: string,
  _backupRoot: string // unused; kept for IPC compatibility
): Promise<{ ok: true }> {
  const safe = validateModList([name])[0];
  if (!safe) throw new Error("Invalid mod name.");

  const aPath = path.join(activeDir, safe);
  const vPath = path.join(vaultDir,  safe);

  assertInside(activeDir, aPath);
  assertInside(vaultDir,  vPath);

  try {
    // Try to delete — if the game or OS locks the file, it will throw
    if (fs.existsSync(aPath)) {
      const stat = await fsp.stat(aPath);
      if (stat.isDirectory()) {
        await fsp.rm(aPath, { recursive: true, force: false }); // no "force"
      } else {
        await fsp.unlink(aPath);
      }
    }

    if (fs.existsSync(vPath)) {
      const stat = await fsp.stat(vPath);
      if (stat.isDirectory()) {
        await fsp.rm(vPath, { recursive: true, force: false });
      } else {
        await fsp.unlink(vPath);
      }
    }

    return { ok: true };
  } catch (err: any) {
    throw new Error(
      `Delete failed: ${String(err?.message || err)}.\n` +
      `This usually means the game or another process is still using the file.`
    );
  }
}


