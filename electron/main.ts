/**
 * @file electron/main.ts
 * @project Space Marine 2 Mod Loader
 * @phase 3B — Safety & Security + Move/Trash operations
 */

import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import { ensureDir, backupDir } from "../src/main/security/backup";
import { listMods, reconcileMods, deleteMod } from "../src/main/mods/fsMods";

let mainWindow: BrowserWindow | null = null;

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
      console.log("[Config] Loaded.");
    } else {
      saveConfigToDisk();
      console.log("[Config] Created default.");
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

/* ---------------- IPC: Config ---------------- */

ipcMain.handle("config:get", () => config);

ipcMain.handle("config:set", (_e, next: Partial<AppConfig>) => {
  replaceConfig(next);
  return config;
});

ipcMain.handle("config:completeSetup", (_e, next: AppConfig) => {
  replaceConfig({ ...next, setupComplete: true });
  return config;
});

/** Expose immutable vault paths to renderer settings. */
ipcMain.handle("config:getImmutablePaths", () => ({
  modsVaultPath: config.modsVaultPath,
  modPlayVaultPath: config.modPlayVaultPath,
}));

/* ---------------- IPC: FS/Dialogs ---------------- */

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

/* ---------------- IPC: Detect (best effort) ---------------- */

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

/* ---------------- IPC: Mods ---------------- */

ipcMain.handle("mods:listBoth", async () => {
  try {
    console.log("[mods:listBoth] active=", config.activeModsPath, " vault=", config.modsVaultPath);
    const rows = await listMods(config.activeModsPath, config.modsVaultPath);
    console.log("[mods:listBoth] rows=", rows);
    return rows;
  } catch (err) {
    console.error("[mods:listBoth] error:", err);
    return [];
  }
});

/** Apply now MOVES enabled/disabled between Vault and Active (reconcile). */
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

/** Delete a mod permanently (no backup). */
ipcMain.handle("mods:delete", async (_e, name: string) => {
  try {
    // Pass a dummy backupRoot to keep API signature; fsMods ignores it now
    const res = await deleteMod(name, config.activeModsPath, config.modsVaultPath, "");
    mainWindow?.webContents.send("mods:changed");
    return res; // { ok: true }
  } catch (err: any) {
    console.error("[mods:delete] error:", err);
    return { ok: false, message: String(err?.message || err) };
  }
});

/** Manual snapshot of save/config data into mod_play_vault/manual/<timestamp>. */
ipcMain.handle("mods:manualGameDataSave", async () => {
  try {
    const manualRoot = path.join(config.modPlayVaultPath, "manual");
    await ensureDir(manualRoot);
    const { files, bytes } = await backupDir(config.saveDataPath, manualRoot);
    return { files, bytes };
  } catch (err: any) {
    console.error("[mods:manualGameDataSave] error:", err);
    return { files: 0, bytes: 0, error: String(err?.message || err) };
  }
});

/** Watchers (no-op in 3B; real chokidar comes in 3C). */
ipcMain.handle("mods:startWatch", async () => true);
ipcMain.handle("mods:stopWatch", async () => true);

/* ---------------- Window / Lifecycle ---------------- */

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
