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
let activeWatcher: FSWatcher | null = null;
let vaultWatcher:  FSWatcher | null = null;

function emitToAllWindows(channel: string, payload: any) {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload);
}

safeHandle("mods:watchStart", async () => {
  const cfg = getConfig();
  const activeRoot = resolveActiveDir(cfg);
  const vaultRoot  = resolveVaultDir(cfg);

  await Promise.all([
    activeWatcher?.close().catch(() => {}),
    vaultWatcher?.close().catch(() => {}),
  ]);
  activeWatcher = null;
  vaultWatcher  = null;

  if (activeRoot) {
    activeWatcher = chokidar.watch(activeRoot, { ignoreInitial: true, depth: 2 })
      .on("add",      p => emitToAllWindows("mods:fs", { scope: "active", type: "add", p }))
      .on("addDir",   p => emitToAllWindows("mods:fs", { scope: "active", type: "addDir", p }))
      .on("unlink",   p => emitToAllWindows("mods:fs", { scope: "active", type: "unlink", p }))
      .on("unlinkDir",p => emitToAllWindows("mods:fs", { scope: "active", type: "unlinkDir", p }))
      .on("change",   p => emitToAllWindows("mods:fs", { scope: "active", type: "change", p }))
      .on("error",    e => emitToAllWindows("mods:fs", { scope: "active", type: "error",  e: String(e) }));
  }
  if (vaultRoot) {
    vaultWatcher = chokidar.watch(vaultRoot, { ignoreInitial: true, depth: 2 })
      .on("add",      p => emitToAllWindows("mods:fs", { scope: "vault", type: "add", p }))
      .on("addDir",   p => emitToAllWindows("mods:fs", { scope: "vault", type: "addDir", p }))
      .on("unlink",   p => emitToAllWindows("mods:fs", { scope: "vault", type: "unlink", p }))
      .on("unlinkDir",p => emitToAllWindows("mods:fs", { scope: "vault", type: "unlinkDir", p }))
      .on("change",   p => emitToAllWindows("mods:fs", { scope: "vault", type: "change", p }))
      .on("error",    e => emitToAllWindows("mods:fs", { scope: "vault", type: "error",  e: String(e) }));
  }

  emitToAllWindows("mods:fs", { type: "watch:ready", activeRoot, vaultRoot });
  return { activeRoot, vaultRoot, watching: true };
});

safeHandle("mods:watchStop", async () => {
  await Promise.all([
    activeWatcher?.close().catch(() => {}),
    vaultWatcher?.close().catch(() => {}),
  ]);
  activeWatcher = null;
  vaultWatcher  = null;
  emitToAllWindows("mods:fs", { type: "watch:stopped" });
  return true;
});

ipcMain.on("mods:emit", (_evt, payload) => emitToAllWindows("mods:fs", payload));
