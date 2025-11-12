/**
 * @file electron/main.ts
 * @project Space Marine 2 Mod Loader
 * Phase 3B additions: Launch (Mod Play / Vanilla) + save mirroring
 */

import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";

import { ensureDir, backupDir } from "../src/main/security/backup";
import { listMods, reconcileMods, deleteMod } from "../src/main/mods/fsMods";

// ----------------------- App Config -----------------------
type InstallStrategy = "hardlink" | "symlink" | "copy";
export interface AppConfig {
  setupComplete: boolean;
  autoDetected: boolean;
  gameRoot: string;
  gameExe: string;
  activeModsPath: string;
  modsVaultPath: string;
  modPlayVaultPath: string;
  saveDataPath: string;
  installStrategy: InstallStrategy;
}

let mainWindow: BrowserWindow | null = null;

const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");
let config: AppConfig = {
  setupComplete: false,
  autoDetected: false,
  gameRoot: "",
  gameExe: "",
  activeModsPath: "",
  modsVaultPath: path.join(app.getPath("userData"), "mods_vault"),
  modPlayVaultPath: path.join(app.getPath("userData"), "mod_play_vault"),
  saveDataPath: "",
  installStrategy: "hardlink",
};

function loadConfigFromDisk(): void {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
      config = { ...config, ...data };
    } else {
      saveConfigToDisk();
    }
  } catch (err) {
    console.error("[Config] load error:", err);
  }
}

function saveConfigToDisk(): void {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  } catch (err) {
    console.error("[Config] save error:", err);
  }
}

function replaceConfig(next: Partial<AppConfig>): void {
  config = { ...config, ...next };
  saveConfigToDisk();
  mainWindow?.webContents.send("config:changed", config);
}

// ----------------------- Utility (copy/mirror) -----------------------
async function dirIsEmpty(p: string): Promise<boolean> {
  try {
    const entries = await fsp.readdir(p);
    return entries.length === 0;
  } catch {
    return true;
  }
}

async function copyDirCount(src: string, dst: string): Promise<{ files: number; bytes: number }> {
  let files = 0, bytes = 0;
  await ensureDir(dst);
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const sp = path.join(src, e.name);
    const dp = path.join(dst, e.name);
    if (e.isDirectory()) {
      const sub = await copyDirCount(sp, dp);
      files += sub.files; bytes += sub.bytes;
    } else if (e.isFile()) {
      await ensureDir(path.dirname(dp));
      const st = await fsp.stat(sp);
      await fsp.copyFile(sp, dp);
      files += 1; bytes += st.size;
    }
  }
  return { files, bytes };
}

/** Replace target directory contents with source contents (hard overwrite). */
async function replaceDirContents(fromDir: string, toDir: string): Promise<{ files: number; bytes: number }> {
  if (fs.existsSync(toDir)) {
    await fsp.rm(toDir, { recursive: true, force: true });
  }
  await ensureDir(toDir);
  if (!fs.existsSync(fromDir)) return { files: 0, bytes: 0 };
  return copyDirCount(fromDir, toDir);
}

async function mirrorVaultIntoSavesIfNonEmpty(): Promise<void> {
  const from = config.modPlayVaultPath;
  const to   = config.saveDataPath;
  if (!from || !to) return;
  if (await dirIsEmpty(from)) return; // first-time safety: don't clobber user's saves
  await replaceDirContents(from, to);
}

async function mirrorSavesIntoVault(): Promise<void> {
  const from = config.saveDataPath;
  const to   = config.modPlayVaultPath;
  if (!from || !to) return;
  await replaceDirContents(from, to);
}

function launchGameExe(): { ok: boolean; pid?: number; message?: string; child?: ReturnType<typeof spawn> } {
  const exe = config.gameExe;
  if (!exe || !fs.existsSync(exe)) return { ok: false, message: "Game executable not set or missing." };
  try {
    // we want to listen for exit, so don't ignore stdio
    const child = spawn(exe, { cwd: path.dirname(exe), detached: false, stdio: "pipe" });
    return { ok: true, pid: child.pid, child };
  } catch (err: any) {
    return { ok: false, message: String(err?.message || err) };
  }
}

// ----------------------- IPC: Config -----------------------
ipcMain.handle("config:get", () => config);

ipcMain.handle("config:set", (_e, next: Partial<AppConfig>) => {
  replaceConfig(next);
  return config;
});

ipcMain.handle("config:completeSetup", (_e, next: AppConfig) => {
  replaceConfig({ ...next, setupComplete: true });
  return config;
});

ipcMain.handle("config:getImmutablePaths", () => ({
  modsVaultPath: config.modsVaultPath,
  modPlayVaultPath: config.modPlayVaultPath,
}));

// ----------------------- IPC: FS Helpers -----------------------
ipcMain.handle("browse:folder", async () => {
  if (!mainWindow) return null;
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"],
  });
  return res.canceled ? null : res.filePaths[0] || null;
});

ipcMain.handle("fs:ensureDirs", async (_e, dirs: string[]) => {
  for (const d of dirs ?? []) if (typeof d === "string" && d.trim()) await ensureDir(d);
  return true;
});

ipcMain.handle("fs:testWrite", async (_e, dir: string) => {
  try {
    const testFile = path.join(dir, `.write_test_${Date.now()}.tmp`);
    await ensureDir(dir);
    fs.writeFileSync(testFile, "ok", "utf-8");
    fs.unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
});

// ----------------------- IPC: Detection (best-effort) -----------------------
ipcMain.handle("detect:paths", async () => {
  const candidates: string[] = [];
  if (process.platform === "win32") {
    const pf86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
    const pf = process.env["PROGRAMFILES"] || "C:\\Program Files";
    const home = app.getPath("home");
    candidates.push(path.join(pf86, "Steam", "steamapps", "common"));
    candidates.push(path.join(pf,   "Steam", "steamapps", "common"));
    candidates.push("C:\\SteamLibrary\\steamapps\\common");
    candidates.push(path.join(home, "SteamLibrary", "steamapps", "common"));
  } else {
    const home = app.getPath("home");
    candidates.push(path.join(home, ".steam", "steam", "steamapps", "common"));
    candidates.push(path.join(home, ".local", "share", "Steam", "steamapps", "common"));
  }

  let gameRoot = "";
  for (const c of candidates) {
    const guess = path.join(c, "Space Marine 2");
    if (fs.existsSync(guess)) { gameRoot = guess; break; }
  }

  const gameExe = process.platform === "win32"
    ? (gameRoot ? path.join(gameRoot, "Warhammer 40000 Space Marine 2.exe") : "")
    : (gameRoot ? path.join(gameRoot, "SpaceMarine2") : "");

  const activeModsPath = gameRoot ? path.join(gameRoot, "client_pc", "root", "mods") : "";

  const saveDataPath = process.platform === "win32"
    ? path.join(app.getPath("home"), "AppData", "Local", "Saber", "Space Marine 2", "storage", "steam", "user", "<id>", "Main", "config")
    : "";

  return {
    gameRoot: fs.existsSync(gameRoot) ? gameRoot : "",
    gameExe: fs.existsSync(gameExe) ? gameExe : "",
    activeModsPath: fs.existsSync(activeModsPath) ? activeModsPath : "",
    saveDataPath: fs.existsSync(saveDataPath) ? saveDataPath : "",
  };
});

// ----------------------- IPC: Mods -----------------------
ipcMain.handle("mods:listBoth", async () => {
  try {
    const rows = await listMods(config.activeModsPath, config.modsVaultPath);
    return rows;
  } catch (err) {
    console.error("[mods:listBoth] error:", err);
    return [];
  }
});

ipcMain.handle("mods:apply", async (_e, enabled: string[]) => {
  try {
    const backupRoot = path.join(config.modPlayVaultPath, "ops");
    await ensureDir(backupRoot);
    await reconcileMods(enabled, config.activeModsPath, config.modsVaultPath, backupRoot);
    mainWindow?.webContents.send("mods:changed");
    return { ok: true };
  } catch (err: any) {
    console.error("[mods:apply] error:", err);
    return { ok: false, message: String(err?.message || err) };
  }
});

ipcMain.handle("mods:delete", async (_e, name: string) => {
  try {
    const res = await deleteMod(name, config.activeModsPath, config.modsVaultPath, "");
    mainWindow?.webContents.send("mods:changed");
    return res; // { ok: true }
  } catch (err: any) {
    console.error("[mods:delete] error:", err);
    return { ok: false, message: String(err?.message || err) };
  }
});

/** Overwrite mod_play_vault with current Steam save/config (manual button). */
ipcMain.handle("mods:manualGameDataSave", async () => {
  try {
    const from = config.saveDataPath;
    const to   = config.modPlayVaultPath;
    const res  = await replaceDirContents(from, to);
    return { files: res.files, bytes: res.bytes };
  } catch (err: any) {
    console.error("[mods:manualGameDataSave] overwrite error:", err);
    return { files: 0, bytes: 0, error: String(err?.message || err) };
  }
});

// ----------------------- IPC: Launch (Mod Play / Vanilla) -----------------------
ipcMain.handle("game:launchModPlay", async () => {
  try {
    await mirrorVaultIntoSavesIfNonEmpty(); // only if vault has content
    const launched = launchGameExe();
    if (!launched.ok || !launched.child) return launched;

    launched.child.on("exit", async () => {
      try { await mirrorSavesIntoVault(); } catch (e) { console.error("[modPlay exit mirror] failed:", e); }
      mainWindow?.webContents.send("mods:changed");
    });

    return { ok: true, pid: launched.pid };
  } catch (err: any) {
    return { ok: false, message: String(err?.message || err) };
  }
});

ipcMain.handle("game:launchVanilla", async () => {
  try {
    const launched = launchGameExe();
    return { ok: launched.ok, pid: launched.pid, message: launched.message };
  } catch (err: any) {
    return { ok: false, message: String(err?.message || err) };
  }
});

// ----------------------- App lifecycle -----------------------
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: { preload: path.join(__dirname, "preload.js") },
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  } else {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("closed", () => (mainWindow = null));
}

app.whenReady().then(async () => {
  loadConfigFromDisk();
  await Promise.all([
    ensureDir(config.modsVaultPath),
    ensureDir(config.modPlayVaultPath),
  ]);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  saveConfigToDisk();
  if (process.platform !== "darwin") app.quit();
});
