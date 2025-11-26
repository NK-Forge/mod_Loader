// src/main/ipc/mods.ts
import path from "node:path";
import { promises as fs } from "node:fs";
import { BrowserWindow, ipcMain } from "electron";
import chokidar, { FSWatcher } from "chokidar";
import { safeHandle } from "./safeHandle";
import { AppConfig, getConfig } from "../state/configStore";

/** ---- Path resolvers (Phase 3A: flat keys with legacy tolerance) ---- */
function resolveActiveDir(cfg: AppConfig): string | undefined {
  if (cfg.activeModsPath) return cfg.activeModsPath;
  const legacy = (cfg as any)?.paths;
  return legacy?.active_mods_path ?? legacy?.activeModsPath ?? legacy?.mods;
}
function resolveVaultDir(cfg: AppConfig): string | undefined {
  if (cfg.modsVaultPath) return cfg.modsVaultPath;
  const legacy = (cfg as any)?.vaults;
  return legacy?.mods_vault;
}

/** ---- Safe fs helpers ---- */
async function readDirSafe(dir?: string) {
  if (!dir) return [];
  try { return await fs.readdir(dir, { withFileTypes: true }); }
  catch { return []; }
}
async function listModFolders(root?: string): Promise<{ id: string; dir: string }[]> {
  const entries = await readDirSafe(root);
  if (!root) return [];
  return entries.filter(e => e.isDirectory()).map(e => ({ id: e.name, dir: path.join(root, e.name) }));
}

/** ---- IPC: scanBoth ----
 * Return a FLAT ARRAY so renderer can rows.map(...)
 * Each row has: { id, dir, source: "active" | "vault" }
 */
safeHandle("mods:scanBoth", async () => {
  const cfg = getConfig();
  const activeRoot = resolveActiveDir(cfg);
  const vaultRoot  = resolveVaultDir(cfg);

  const [active, vault] = await Promise.all([
    listModFolders(activeRoot),
    listModFolders(vaultRoot),
  ]);

  const rows = [
    ...active.map(r => ({ ...r, source: "active" as const })),
    ...vault.map(r  => ({ ...r, source: "vault"  as const })),
  ];

  return rows; // <<< array, so rows.map(...) works
});

/** ---- Watchers (unchanged) ---- */
function emitToAllWindows(channel: string, payload: any) {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload);
}
