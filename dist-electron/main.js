"use strict";
const electron = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const node_child_process = require("node:child_process");
const defaultConfig = {
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
  lastRunClosedAt: ""
};
const APP_DIR = electron.app.getPath("userData");
const CONFIG_PATH = path.join(APP_DIR, "config.json");
function ensureDir(p) {
  if (p && !fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function dirExists(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
function readJSON(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return fallback;
  }
}
function writeJSON(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}
function listDirs(p) {
  if (!dirExists(p)) return [];
  return fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
}
function walkAllFiles(root) {
  if (!dirExists(root)) return [];
  const out = [];
  const st = [root];
  while (st.length) {
    const cur = st.pop();
    for (const ent of fs.readdirSync(cur, { withFileTypes: true })) {
      const p = path.join(cur, ent.name);
      if (ent.isDirectory()) st.push(p);
      else out.push(p);
    }
  }
  return out;
}
function copyDir(src, dst) {
  if (!dirExists(src)) return;
  ensureDir(dst);
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else {
      ensureDir(path.dirname(d));
      fs.copyFileSync(s, d);
    }
  }
}
function emptyDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir)) fs.rmSync(path.join(dir, e), { recursive: true, force: true });
}
function installModFiles(srcRoot, dstRoot, strategy) {
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
      fs.copyFileSync(f, dst);
    }
  }
}
function timestamp() {
  const n = /* @__PURE__ */ new Date(), p = (x) => String(x).padStart(2, "0");
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}_${p(n.getHours())}-${p(n.getMinutes())}-${p(n.getSeconds())}`;
}
const EXE_CANDIDATES = [
  "Warhammer 40000 Space Marine 2.exe",
  "SpaceMarine2.exe"
];
function findExeInDir(dir) {
  for (const name of EXE_CANDIDATES) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  try {
    const files = fs.readdirSync(dir);
    const hit = files.find(
      (f) => f.toLowerCase().endsWith(".exe") && f.toLowerCase().includes("space") && f.toLowerCase().includes("marine") && f.includes("2")
    );
    return hit ? path.join(dir, hit) : null;
  } catch {
    return null;
  }
}
function tryReadSteamPathFromRegistry() {
  try {
    const out = node_child_process.execSync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath', { stdio: ["ignore", "pipe", "ignore"] }).toString();
    const m = out.match(/SteamPath\s+REG_SZ\s+(.+)\r?\n/);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}
function parseLibraryFoldersVdf(vdfPath) {
  try {
    const txt = fs.readFileSync(vdfPath, "utf-8");
    return Array.from(txt.matchAll(/"path"\s+"([^"]+)"/g)).map((m) => path.join(m[1], "steamapps"));
  } catch {
    return [];
  }
}
function detectSm2ModsDir() {
  const steamPath = tryReadSteamPathFromRegistry();
  const candidates = [];
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
function detectSm2GameRootFromSteamLibraries() {
  const steamPath = tryReadSteamPathFromRegistry();
  if (!steamPath) return null;
  const appsCandidates = [];
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
function detectDefaultSavePath() {
  const base = path.join(os.homedir(), "AppData", "Local", "Saber", "Space Marine 2", "storage", "steam", "user");
  if (!fs.existsSync(base)) return "";
  const userDirs = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  if (!userDirs[0]) return "";
  const p = path.join(base, userDirs[0], "Main", "config");
  return fs.existsSync(p) ? p : "";
}
function autoDetectPaths() {
  const detected = {};
  const modsDir = detectSm2ModsDir();
  if (modsDir) {
    detected.activeModsPath = modsDir;
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
function backupSaveToPlayVault(modPlayVaultPath, saveDataPath) {
  if (!dirExists(saveDataPath)) return;
  ensureDir(modPlayVaultPath);
  const dst = path.join(modPlayVaultPath, timestamp());
  copyDir(saveDataPath, dst);
}
function restoreLatestFromPlayVault(modPlayVaultPath, saveDataPath) {
  if (!dirExists(modPlayVaultPath)) return;
  ensureDir(saveDataPath);
  const subs = fs.readdirSync(modPlayVaultPath, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => ({ name: d.name, mtime: fs.statSync(path.join(modPlayVaultPath, d.name)).mtimeMs })).sort((a, b) => b.mtime - a.mtime);
  if (!subs[0]) return;
  emptyDir(saveDataPath);
  copyDir(path.join(modPlayVaultPath, subs[0].name), saveDataPath);
}
let win = null;
function resolvePreloadPath() {
  for (const f of ["preload.js", "preload.cjs"]) {
    const p = path.join(__dirname, f);
    if (fs.existsSync(p)) return p;
  }
  return path.join(process.cwd(), "electron", "preload.ts");
}
async function createWindow() {
  ensureDir(APP_DIR);
  const cur = readJSON(CONFIG_PATH, defaultConfig);
  if (!cur.modsVaultPath) cur.modsVaultPath = path.join(APP_DIR, "mod_vault");
  if (!cur.modPlayVaultPath) cur.modPlayVaultPath = path.join(APP_DIR, "mod_play_vault");
  writeJSON(CONFIG_PATH, cur);
  win = new electron.BrowserWindow({
    width: 1100,
    height: 750,
    title: "WH40K Mod Manager",
    webPreferences: { preload: resolvePreloadPath(), contextIsolation: true, nodeIntegration: false, devTools: true },
    show: false
  });
  const devURL = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
  await win.loadURL(devURL);
  win.once("ready-to-show", () => {
    win == null ? void 0 : win.show();
    win == null ? void 0 : win.webContents.openDevTools({ mode: "detach" });
  });
}
electron.app.whenReady().then(createWindow);
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
});
electron.ipcMain.handle("detect:paths", () => autoDetectPaths());
electron.ipcMain.handle("fs:ensureDirs", (_e, paths) => {
  for (const p of paths) ensureDir(p);
  return true;
});
electron.ipcMain.handle("fs:testWrite", (_e, dir) => {
  try {
    ensureDir(dir);
    const probe = path.join(dir, `.write_test_${Math.random().toString(36).slice(2)}`);
    fs.writeFileSync(probe, "ok");
    fs.rmSync(probe, { force: true });
    return true;
  } catch {
    return false;
  }
});
electron.ipcMain.handle("browse:folder", async () => {
  const res = await electron.dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});
electron.ipcMain.handle("config:get", () => readJSON(CONFIG_PATH, defaultConfig));
electron.ipcMain.handle("config:set", (_e, cfg) => {
  writeJSON(CONFIG_PATH, cfg);
  return true;
});
electron.ipcMain.handle("config:completeSetup", (_e, cfg) => {
  const cur = readJSON(CONFIG_PATH, defaultConfig);
  const next = {
    ...cur,
    ...cfg,
    autoDetected: !!cfg.autoDetected,
    setupComplete: true
  };
  [next.modsVaultPath, next.modPlayVaultPath, next.activeModsPath].forEach(ensureDir);
  writeJSON(CONFIG_PATH, next);
  return next;
});
electron.ipcMain.handle("mods:scan", () => {
  const cfg = readJSON(CONFIG_PATH, defaultConfig);
  const names = /* @__PURE__ */ new Set([
    ...listDirs(cfg.activeModsPath),
    ...listDirs(cfg.modsVaultPath)
  ]);
  const list = [...names].map((name) => ({
    name,
    inMods: dirExists(path.join(cfg.activeModsPath, name)),
    inVault: dirExists(path.join(cfg.modsVaultPath, name))
  }));
  list.sort((a, b) => Number(b.inMods) - Number(a.inMods) || a.name.localeCompare(b.name));
  return list;
});
electron.ipcMain.handle("mods:enable", (_e, modName) => {
  const cfg = readJSON(CONFIG_PATH, defaultConfig);
  const srcVault = path.join(cfg.modsVaultPath, modName);
  const dstMods = path.join(cfg.activeModsPath, modName);
  if (!dirExists(srcVault)) {
    throw new Error(`"${modName}" not found in vault. Import it to the vault first, then enable.`);
  }
  if (dirExists(dstMods)) return true;
  ensureDir(cfg.activeModsPath);
  installModFiles(srcVault, dstMods, cfg.installStrategy);
  return true;
});
electron.ipcMain.handle("mods:disable", (_e, modName) => {
  const cfg = readJSON(CONFIG_PATH, defaultConfig);
  const srcMods = path.join(cfg.activeModsPath, modName);
  const dstVault = path.join(cfg.modsVaultPath, modName);
  if (!dirExists(srcMods)) return true;
  if (!dirExists(dstVault)) copyDir(srcMods, dstVault);
  fs.rmSync(srcMods, { recursive: true, force: true });
  return true;
});
electron.ipcMain.handle("mods:delete", (_e, modName) => {
  const cfg = readJSON(CONFIG_PATH, defaultConfig);
  const inMods = path.join(cfg.activeModsPath, modName);
  const inVault = path.join(cfg.modsVaultPath, modName);
  if (dirExists(inMods)) fs.rmSync(inMods, { recursive: true, force: true });
  if (dirExists(inVault)) fs.rmSync(inVault, { recursive: true, force: true });
  return true;
});
electron.ipcMain.handle("mods:apply", (_e, enabledMods) => {
  const cfg = readJSON(CONFIG_PATH, defaultConfig);
  emptyDir(cfg.activeModsPath);
  ensureDir(cfg.activeModsPath);
  for (const name of enabledMods) {
    const fromVault = path.join(cfg.modsVaultPath, name);
    const toMods = path.join(cfg.activeModsPath, name);
    if (!dirExists(fromVault)) continue;
    installModFiles(fromVault, toMods, cfg.installStrategy);
  }
  return true;
});
electron.ipcMain.handle("mods:launchTracked", async (_e, enabledMods) => {
  const cfg = readJSON(CONFIG_PATH, defaultConfig);
  if (!cfg.gameExe) throw new Error("Game EXE path not set.");
  const usingMods = Array.isArray(enabledMods) && enabledMods.length > 0;
  emptyDir(cfg.activeModsPath);
  ensureDir(cfg.activeModsPath);
  if (usingMods) {
    if (cfg.modPlayVaultPath && cfg.saveDataPath) {
      restoreLatestFromPlayVault(cfg.modPlayVaultPath, cfg.saveDataPath);
    }
    for (const name of enabledMods) {
      const fromVault = path.join(cfg.modsVaultPath, name);
      const toMods = path.join(cfg.activeModsPath, name);
      if (dirExists(fromVault)) {
        installModFiles(fromVault, toMods, cfg.installStrategy);
      }
    }
  }
  await new Promise((resolve) => {
    var _a;
    const child = node_child_process.spawn(cfg.gameExe, [], {
      cwd: path.dirname(cfg.gameExe),
      detached: false,
      stdio: "ignore"
    });
    child.on("close", () => {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const cur = readJSON(CONFIG_PATH, defaultConfig);
      if (usingMods && cur.modPlayVaultPath && cur.saveDataPath) {
        backupSaveToPlayVault(cur.modPlayVaultPath, cur.saveDataPath);
        cur.lastRunUsedMods = true;
        cur.lastRunClosedAt = now;
      } else {
        cur.lastRunUsedMods = false;
        cur.lastRunClosedAt = now;
      }
      writeJSON(CONFIG_PATH, cur);
      resolve();
    });
    (_a = child.unref) == null ? void 0 : _a.call(child);
  });
  return true;
});
electron.ipcMain.handle("saves:manualBackupNow", () => {
  const cfg = readJSON(CONFIG_PATH, defaultConfig);
  if (!cfg.modPlayVaultPath || !cfg.saveDataPath) return false;
  backupSaveToPlayVault(cfg.modPlayVaultPath, cfg.saveDataPath);
  const updated = { ...cfg, lastRunUsedMods: false };
  writeJSON(CONFIG_PATH, updated);
  return true;
});
