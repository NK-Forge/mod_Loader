// electron/main.ts
import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawn, execSync } from "node:child_process";

// =====================
// Types & Config Shapes
// =====================
type InstallStrategy = "hardlink" | "symlink" | "copy";

type AppConfig = {
  gameRoot: string;
  gameExe: string;
  activeModsPath: string;   // <game>\client_pc\root\mods  (real game folder)
  modsVaultPath: string;    // user's library of mods (each mod = subfolder)
  modPlayVaultPath: string; // save-data backups
  saveDataPath: string;     // live save-data folder: ...\Saber\Space Marine 2\...\Main\config
  installStrategy: InstallStrategy;
  autoDetected: boolean;
  setupComplete: boolean;

  // NEW: track last run state to control "Manual Backup" button
  lastRunUsedMods: boolean;
  lastRunClosedAt: string; // ISO timestamp of last close
};

const defaultConfig: AppConfig = {
  gameRoot: "",
  gameExe: "",
  activeModsPath: "",
  modsVaultPath: "",
  modPlayVaultPath: "",
  saveDataPath: "",
  installStrategy: "hardlink",
  autoDetected: false,
  setupComplete: false,
  lastRunUsedMods: false,
  lastRunClosedAt: "",
};

const APP_DIR = app.getPath("userData");
const CONFIG_PATH = path.join(APP_DIR, "config.json");

// =====================
// Small FS helpers
// =====================
function ensureDir(p: string) { if (p && !fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function dirExists(p: string): boolean { try { return fs.existsSync(p) && fs.statSync(p).isDirectory(); } catch { return false; } }
function rmIfExists(p: string) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }
function readJSON<T>(p: string, fallback: T): T { try { return JSON.parse(fs.readFileSync(p, "utf-8")) as T; } catch { return fallback; } }
function writeJSON(p: string, data: any) { fs.writeFileSync(p, JSON.stringify(data, null, 2)); }
function listDirs(p: string): string[] {
  if (!dirExists(p)) return [];
  return fs.readdirSync(p, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
}
function walkAllFiles(root: string): string[] {
  if (!dirExists(root)) return [];
  const out: string[] = [];
  const st = [root];
  while (st.length) {
    const cur = st.pop()!;
    for (const ent of fs.readdirSync(cur, { withFileTypes: true })) {
      const p = path.join(cur, ent.name);
      if (ent.isDirectory()) st.push(p); else out.push(p);
    }
  }
  return out;
}
function copyDir(src: string, dst: string) {
  if (!dirExists(src)) return;
  ensureDir(dst);
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else { ensureDir(path.dirname(d)); fs.copyFileSync(s, d); }
  }
}
function emptyDir(dir: string) { if (!fs.existsSync(dir)) return; for (const e of fs.readdirSync(dir)) fs.rmSync(path.join(dir, e), { recursive: true, force: true }); }
function installModFiles(srcRoot: string, dstRoot: string, strategy: InstallStrategy) {
  const files = walkAllFiles(srcRoot);
  for (const f of files) {
    const rel = path.relative(srcRoot, f);
    const dst = path.join(dstRoot, rel);
    ensureDir(path.dirname(dst));
    try {
      if (strategy === "symlink") fs.symlinkSync(f, dst);
      else if (strategy === "hardlink") fs.linkSync(f, dst);
      else fs.copyFileSync(f, dst);
    } catch {
      // fall back to copy on any link error
      fs.copyFileSync(f, dst);
    }
  }
}
function timestamp(): string { const n=new Date(),p=(x:number)=>String(x).padStart(2,"0"); return `${n.getFullYear()}-${p(n.getMonth()+1)}-${p(n.getDate())}_${p(n.getHours())}-${p(n.getMinutes())}-${p(n.getSeconds())}`; }

// =====================
// Steam / Auto-detect
// =====================
const EXE_CANDIDATES = [
  "Warhammer 40000 Space Marine 2.exe",
  "SpaceMarine2.exe",
];
function findExeInDir(dir: string): string | null {
  for (const name of EXE_CANDIDATES) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  // fallback: any "space marine 2" exe
  try {
    const files = fs.readdirSync(dir);
    const hit = files.find(f =>
      f.toLowerCase().endsWith(".exe") &&
      f.toLowerCase().includes("space") &&
      f.toLowerCase().includes("marine") &&
      f.includes("2")
    );
    return hit ? path.join(dir, hit) : null;
  } catch { return null; }
}
function tryReadSteamPathFromRegistry(): string | null {
  try {
    const out = execSync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath', { stdio: ["ignore", "pipe", "ignore"] }).toString();
    const m = out.match(/SteamPath\s+REG_SZ\s+(.+)\r?\n/);
    return m ? m[1].trim() : null;
  } catch { return null; }
}
function parseLibraryFoldersVdf(vdfPath: string): string[] {
  try {
    const txt = fs.readFileSync(vdfPath, "utf-8");
    return Array.from(txt.matchAll(/"path"\s+"([^"]+)"/g)).map(m => path.join(m[1], "steamapps"));
  } catch { return []; }
}
function detectSm2ModsDir(): string | null {
  const steamPath = tryReadSteamPathFromRegistry();
  const candidates: string[] = [];
  if (steamPath) {
    const apps = path.join(steamPath, "steamapps");
    candidates.push(apps);
    const vdf = path.join(apps, "libraryfolders.vdf");
    if (fs.existsSync(vdf)) candidates.push(...parseLibraryFoldersVdf(vdf));
  }
  for (const apps of candidates) {
    const mods = path.join(apps, "common", "Space Marine 2", "client_pc", "root", "mods");
    if (fs.existsSync(mods)) return mods;
  }
  return null;
}
function detectSm2GameRootFromSteamLibraries(): string | null {
  const steamPath = tryReadSteamPathFromRegistry();
  if (!steamPath) return null;
  const appsCandidates: string[] = [];
  const defaultApps = path.join(steamPath, "steamapps");
  appsCandidates.push(defaultApps);
  const vdf = path.join(defaultApps, "libraryfolders.vdf");
  if (fs.existsSync(vdf)) appsCandidates.push(...parseLibraryFoldersVdf(vdf));
  for (const apps of appsCandidates) {
    const root = path.join(apps, "common", "Space Marine 2");
    const exe = findExeInDir(root);
    if (exe) return root;
  }
  return null;
}
function detectDefaultSavePath(): string {
  const base = path.join(os.homedir(), "AppData", "Local", "Saber", "Space Marine 2", "storage", "steam", "user");
  if (!fs.existsSync(base)) return "";
  const userDirs = fs.readdirSync(base, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
  if (!userDirs[0]) return "";
  const p = path.join(base, userDirs[0], "Main", "config");
  return fs.existsSync(p) ? p : "";
}
function autoDetectPaths(): Partial<AppConfig> {
  const detected: Partial<AppConfig> = {};
  const modsDir = detectSm2ModsDir();
  if (modsDir) {
    detected.activeModsPath = modsDir; // use *real* game mods folder
    const gameRoot = path.resolve(modsDir, "..", "..", "..");
    detected.gameRoot = gameRoot;
    detected.gameExe = findExeInDir(gameRoot) ?? "";
  } else {
    const gameRoot = detectSm2GameRootFromSteamLibraries();
    if (gameRoot) {
      detected.gameRoot = gameRoot;
      detected.gameExe = findExeInDir(gameRoot) ?? "";
      detected.activeModsPath = path.join(gameRoot, "client_pc", "root", "mods");
    }
  }
  detected.saveDataPath = detectDefaultSavePath();
  return detected;
}

// =====================
// Save backup/restore
// =====================
function backupSaveToPlayVault(modPlayVaultPath: string, saveDataPath: string) {
  if (!dirExists(saveDataPath)) return;
  ensureDir(modPlayVaultPath);
  const dst = path.join(modPlayVaultPath, timestamp());
  copyDir(saveDataPath, dst);
}
function restoreLatestFromPlayVault(modPlayVaultPath: string, saveDataPath: string) {
  if (!dirExists(modPlayVaultPath)) return;
  ensureDir(saveDataPath);
  const subs = fs.readdirSync(modPlayVaultPath, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => ({ name: d.name, mtime: fs.statSync(path.join(modPlayVaultPath, d.name)).mtimeMs }))
    .sort((a,b)=>b.mtime - a.mtime);
  if (!subs[0]) return;
  // FULL OVERWRITE: clear live saves, then copy snapshot in
  emptyDir(saveDataPath);
  copyDir(path.join(modPlayVaultPath, subs[0].name), saveDataPath);
}

// =====================
// Electron bootstrap
// =====================
let win: BrowserWindow | null = null;

function resolvePreloadPath(): string {
  for (const f of ["preload.js", "preload.cjs"]) {
    const p = path.join(__dirname, f);
    if (fs.existsSync(p)) return p;
  }
  return path.join(process.cwd(), "electron", "preload.ts");
}

async function createWindow() {
  ensureDir(APP_DIR);
  // prime config / defaults
  const cur = readJSON<AppConfig>(CONFIG_PATH, defaultConfig);
  if (!cur.modsVaultPath) cur.modsVaultPath = path.join(APP_DIR, "mod_vault");
  if (!cur.modPlayVaultPath) cur.modPlayVaultPath = path.join(APP_DIR, "mod_play_vault");
  writeJSON(CONFIG_PATH, cur);

  win = new BrowserWindow({
    width: 1100, height: 750, title: "WH40K Mod Manager",
    webPreferences: { preload: resolvePreloadPath(), contextIsolation: true, nodeIntegration: false, devTools: true },
    show: false
  });

  const devURL = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
  await win.loadURL(devURL);
  win.once("ready-to-show", () => {
    win?.show();
    win?.webContents.openDevTools({ mode: "detach" });
  });
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// =====================
// IPC – Setup Wizard
// =====================
ipcMain.handle("detect:paths", () => autoDetectPaths());
ipcMain.handle("fs:ensureDirs", (_e, paths: string[]) => { for (const p of paths) ensureDir(p); return true; });
ipcMain.handle("fs:testWrite", (_e, dir: string) => {
  try {
    ensureDir(dir);
    const probe = path.join(dir, `.write_test_${Math.random().toString(36).slice(2)}`);
    fs.writeFileSync(probe, "ok"); fs.rmSync(probe, { force: true });
    return true;
  } catch { return false; }
});
ipcMain.handle("browse:folder", async () => {
  const res = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

ipcMain.handle("config:get", () => readJSON<AppConfig>(CONFIG_PATH, defaultConfig));
ipcMain.handle("config:set", (_e, cfg: AppConfig) => { writeJSON(CONFIG_PATH, cfg); return true; });
ipcMain.handle("config:completeSetup", (_e, cfg: Partial<AppConfig>) => {
  const cur = readJSON<AppConfig>(CONFIG_PATH, defaultConfig);
  const next: AppConfig = {
    ...cur,
    ...cfg,
    autoDetected: !!cfg.autoDetected,
    setupComplete: true
  } as AppConfig;
  [next.modsVaultPath, next.modPlayVaultPath, next.activeModsPath].forEach(ensureDir);
  writeJSON(CONFIG_PATH, next);
  return next;
});

// =====================
// IPC – Mods (YOUR RULES)
// =====================
type ModInfo = { name: string; inMods: boolean; inVault: boolean };

ipcMain.handle("mods:scan", () => {
  const cfg = readJSON<AppConfig>(CONFIG_PATH, defaultConfig);
  const names = new Set<string>([
    ...listDirs(cfg.activeModsPath),
    ...listDirs(cfg.modsVaultPath),
  ]);
  const list: ModInfo[] = [...names].map(name => ({
    name,
    inMods: dirExists(path.join(cfg.activeModsPath, name)),
    inVault: dirExists(path.join(cfg.modsVaultPath, name)),
  }));
  list.sort((a, b) => Number(b.inMods) - Number(a.inMods) || a.name.localeCompare(b.name));
  return list;
});

// Enable = must exist in vault → install into mods
ipcMain.handle("mods:enable", (_e, modName: string) => {
  const cfg = readJSON<AppConfig>(CONFIG_PATH, defaultConfig);
  const srcVault = path.join(cfg.modsVaultPath, modName);
  const dstMods  = path.join(cfg.activeModsPath, modName);

  if (!dirExists(srcVault)) {
    throw new Error(`"${modName}" not found in vault. Import it to the vault first, then enable.`);
  }
  if (dirExists(dstMods)) return true; // already enabled
  ensureDir(cfg.activeModsPath);
  installModFiles(srcVault, dstMods, cfg.installStrategy);
  return true;
});

// Disable = make sure vault has the mod, then remove from mods
ipcMain.handle("mods:disable", (_e, modName: string) => {
  const cfg = readJSON<AppConfig>(CONFIG_PATH, defaultConfig);
  const srcMods  = path.join(cfg.activeModsPath, modName);
  const dstVault = path.join(cfg.modsVaultPath, modName);

  if (!dirExists(srcMods)) return true; // already not in use
  if (!dirExists(dstVault)) copyDir(srcMods, dstVault); // preserve library copy
  fs.rmSync(srcMods, { recursive: true, force: true });
  return true;
});

// Delete = remove from BOTH mods and vault
ipcMain.handle("mods:delete", (_e, modName: string) => {
  const cfg = readJSON<AppConfig>(CONFIG_PATH, defaultConfig);
  const inMods  = path.join(cfg.activeModsPath, modName);
  const inVault = path.join(cfg.modsVaultPath, modName);
  if (dirExists(inMods))  fs.rmSync(inMods,  { recursive: true, force: true });
  if (dirExists(inVault)) fs.rmSync(inVault, { recursive: true, force: true });
  return true;
});

// Convenience apply
ipcMain.handle("mods:apply", (_e, enabledMods: string[]) => {
  const cfg = readJSON<AppConfig>(CONFIG_PATH, defaultConfig);
  // wipe live mods then install enabled ones (from vault)
  emptyDir(cfg.activeModsPath);
  ensureDir(cfg.activeModsPath);
  for (const name of enabledMods) {
    const fromVault = path.join(cfg.modsVaultPath, name);
    const toMods    = path.join(cfg.activeModsPath, name);
    if (!dirExists(fromVault)) continue; // must exist in vault per your rule
    installModFiles(fromVault, toMods, cfg.installStrategy);
  }
  return true;
});

// Launch with tracked saves ONLY when mods are enabled
ipcMain.handle("mods:launchTracked", async (_e, enabledMods: string[]) => {
  const cfg = readJSON<AppConfig>(CONFIG_PATH, defaultConfig);
  if (!cfg.gameExe) throw new Error("Game EXE path not set.");

  const usingMods = Array.isArray(enabledMods) && enabledMods.length > 0;

  // Always reflect the selection in live mods folder
  emptyDir(cfg.activeModsPath);
  ensureDir(cfg.activeModsPath);

  if (usingMods) {
    // 1) Restore latest mod-play snapshot → overwrite live saves
    if (cfg.modPlayVaultPath && cfg.saveDataPath) {
      restoreLatestFromPlayVault(cfg.modPlayVaultPath, cfg.saveDataPath);
    }
    // 2) Apply selected mods into the real game mods folder
    for (const name of enabledMods) {
      const fromVault = path.join(cfg.modsVaultPath, name);
      const toMods    = path.join(cfg.activeModsPath, name);
      if (dirExists(fromVault)) {
        installModFiles(fromVault, toMods, cfg.installStrategy);
      }
    }
  }
  // If not using mods: do NOT restore saves. Steam Cloud may overwrite as usual.

  // 3) Launch game and wait for exit
  await new Promise<void>((resolve) => {
    const child = spawn(cfg.gameExe, [], {
      cwd: path.dirname(cfg.gameExe),
      detached: false,
      stdio: "ignore",
    });
    child.on("close", () => {
      // 4) On close → if we played with mods, back up live saves
      const now = new Date().toISOString();
      const cur = readJSON<AppConfig>(CONFIG_PATH, defaultConfig);

      if (usingMods && cur.modPlayVaultPath && cur.saveDataPath) {
        backupSaveToPlayVault(cur.modPlayVaultPath, cur.saveDataPath);
        // mark the last run: used mods → enable Manual Backup button
        cur.lastRunUsedMods = true;
        cur.lastRunClosedAt = now;
      } else {
        // vanilla session → disable Manual Backup button
        cur.lastRunUsedMods = false;
        cur.lastRunClosedAt = now;
      }
      writeJSON(CONFIG_PATH, cur);
      resolve();
    });
    child.unref?.();
  });

  return true;
});

// =====================
// IPC – Saves (manual)
// =====================

// Manual backup NOW – only succeeds if saveDataPath exists; also clears the "light up" flag afterward
ipcMain.handle("saves:manualBackupNow", () => {
  const cfg = readJSON<AppConfig>(CONFIG_PATH, defaultConfig);
  if (!cfg.modPlayVaultPath || !cfg.saveDataPath) return false;

  backupSaveToPlayVault(cfg.modPlayVaultPath, cfg.saveDataPath);

  // After a manual backup, turn off the "lastRunUsedMods" flag so the button disables
  const updated = { ...cfg, lastRunUsedMods: false };
  writeJSON(CONFIG_PATH, updated);
  return true;
});
