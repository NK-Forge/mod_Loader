/**
 * @file electron/main.ts
 * @project Space Marine 2 Mod Loader
 * Phase 3B additions: Launch (Mod Play / Vanilla) + save mirroring
 */

import { app, BrowserWindow, ipcMain, dialog, Menu } from "electron";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import fse from "fs-extra";
import { pathToFileURL } from "node:url";

import { ensureDir } from "../src/main/security/backup";
import { listMods, reconcileMods, deleteMod } from "../src/main/mods/fsMods";
import "../src/main/ipc/paths";
import { patchConfig as syncConfigStore } from "../src/main/state/configStore";


// Phase 3C: watchers & play control
import { registerVaultWatcherIPC } from "./ipc/vaultWatcher";
import { watchRegistry } from "./watchRegistry";

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
  backgroundImagePath?: string;
}

let mainWindow: BrowserWindow | null = null;

Menu.setApplicationMenu(null); // disable default menu

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
  backgroundImagePath: "",
};

async function detectPaths() {
  const result: {
    gameRoot: string;
    gameExe: string;
    activeModsPath: string;
    saveDataPath: string;
  } = {
    gameRoot: "",
    gameExe: "",
    activeModsPath: "",
    saveDataPath: "",
  };

  // 1) Prefer any existing config values that are valid
  if (config.gameRoot && fs.existsSync(config.gameRoot)) {
    result.gameRoot = config.gameRoot;
  }

  if (config.gameExe && fs.existsSync(config.gameExe)) {
    result.gameExe = config.gameExe;
  }

  if (config.activeModsPath && fs.existsSync(config.activeModsPath)) {
    result.activeModsPath = config.activeModsPath;
  }

  if (config.saveDataPath && fs.existsSync(config.saveDataPath)) {
    result.saveDataPath = config.saveDataPath;
  }

  // 2) If we still don't have a game root, try common SM2 install paths
  const candidateRoots = [
    result.gameRoot,
    config.gameRoot,
    "E:\\Steam\\steamapps\\common\\Space Marine 2",
    "C:\\Steam\\steamapps\\common\\Space Marine 2",
    "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Space Marine 2",
  ].filter((p): p is string => !!p);

  if (!result.gameRoot) {
    for (const root of candidateRoots) {
      if (fs.existsSync(root)) {
        result.gameRoot = root;
        break;
      }
    }
  }

  // 3) Game EXE under gameRoot
  if (!result.gameExe && result.gameRoot) {
    const exe = path.join(
      result.gameRoot,
      "Warhammer 40000 Space Marine 2.exe"
    );
    if (fs.existsSync(exe)) {
      result.gameExe = exe;
    }
  }

  // 4) Active mods folder under gameRoot
  if (!result.activeModsPath && result.gameRoot) {
    const mods = path.join(
      result.gameRoot,
      "client_pc",
      "root",
      "mods"
    );
    if (fs.existsSync(mods)) {
      result.activeModsPath = mods;
    }
  }

  // 5) Save data path in AppData\Saber\Space Marine 2\storage\steam\<id>\Main\config
  if (!result.saveDataPath) {
    const userRoot = process.env.USERPROFILE || process.env.HOME;
    if (userRoot) {
      const steamRoot = path.join(
        userRoot,
        "AppData",
        "Local",
        "Saber",
        "Space Marine 2",
        "storage",
        "steam"
      );

      if (fs.existsSync(steamRoot)) {
        const level1 = fs.readdirSync(steamRoot, { withFileTypes: true })
                        .filter(d => d.isDirectory())
                        .map(d => d.name);

        for (const d1 of level1) {
          const first = path.join(steamRoot, d1);

          // Case A: ...\steam\<entry>\Main\config
          let candidate = path.join(first, "Main", "config");
          if (fs.existsSync(candidate)) {
            result.saveDataPath = candidate;
            break;
          }

          // Case B: ...\steam\user\<steamId>\Main\config
          const subdirs = fs.readdirSync(first, { withFileTypes: true })
                            .filter(d => d.isDirectory())
                            .map(d => d.name);

          for (const d2 of subdirs) {
            candidate = path.join(first, d2, "Main", "config");
            if (fs.existsSync(candidate)) {
              result.saveDataPath = candidate;
              break;
            }
          }

          if (result.saveDataPath) break;
        }
      }
    }
  }
  return result;
}

function bgStorageDir() {
  return path.join(app.getPath("userData"), "backgrounds");
}
function bgDestFor(srcAbs: string) {
  const ext = (path.extname(srcAbs) || ".jpg").toLowerCase();
  return path.join(bgStorageDir(), "user_bg" + ext);
}
function toFileUrl(abs: string) {
  try { return pathToFileURL(abs).toString(); } catch { return ""; }
}

function loadConfigFromDisk(): void {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
      config = { ...config, ...data };
      // keep configStore in sync for src/main/ipc/*
      syncConfigStore(config);
    } else {
      // first run: persist defaults and sync
      saveConfigToDisk();
      syncConfigStore(config);
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

  // mirror into configStore so paths.ts (and any other src/main services)
  // see the real values
  syncConfigStore(config);

  mainWindow?.webContents.send("config:changed", config);
}

// ----------------------- Utils -----------------------
async function dirIsEmpty(p: string): Promise<boolean> {
  try {
    const items = await fsp.readdir(p);
    return items.length === 0;
  } catch {
    return true;
  }
}

async function replaceDirContents(from: string, to: string): Promise<void> {
  await ensureDir(from);
  await ensureDir(to);
  // Clear destination then copy everything over (true mirror)
  const entries = await fsp.readdir(to);
  for (const name of entries) {
    const t = path.join(to, name);
    await fsp.rm(t, { recursive: true, force: true });
  }

  // Copy all from src → dst
  const stack = [{ src: from, dst: to }];
  while (stack.length) {
    const { src, dst } = stack.pop()!;
    await ensureDir(dst);
    const items = await fsp.readdir(src, { withFileTypes: true });
    for (const it of items) {
      const s = path.join(src, it.name);
      const d = path.join(dst, it.name);
      if (it.isDirectory()) {
        stack.push({ src: s, dst: d });
      } else if (it.isFile()) {
        await ensureDir(path.dirname(d));
        await fsp.copyFile(s, d);
      }
    }
  }
}

// ----------------------- Phase 3B/3C: Mirroring helpers -----------------------
async function mirrorVaultIntoGameSavesIfPresent(): Promise<void> {
  const from = config.modPlayVaultPath;
  const to = config.saveDataPath;
  if (!from || !to) return;
  if (await dirIsEmpty(from)) return; // nothing in vault → do nothing pre-launch
  await replaceDirContents(from, to);
}

async function mirrorSavesIntoVault(): Promise<void> {
  const from = config.saveDataPath;
  const to   = config.modPlayVaultPath;
  if (!from || !to) return;
  await replaceDirContents(from, to);
}

// ---- Game launch helpers ----

function resolveGameExe(): string | null {
  // 1) If the user explicitly set a gameExe and it's a real file, use it
  if (config.gameExe) {
    try {
      const st = fs.statSync(config.gameExe);
      if (st.isFile()) {
        return config.gameExe;
      }
    } catch {
      // fall through to auto-detect
    }
  }

  // 2) Otherwise, derive it from Game Root:
  //    <gameRoot>\Warhammer 40000 Space Marine 2.exe
  if (!config.gameRoot) return null;

  const exe = path.join(
    config.gameRoot,
    "Warhammer 40000 Space Marine 2.exe"
  );

  try {
    const st = fs.statSync(exe);
    if (st.isFile()) {
      return exe;
    }
  } catch {
    // not found
  }

  return null;
}

function launchGameExe(): {
  ok: boolean;
  pid?: number;
  message?: string;
  child?: ReturnType<typeof spawn>;
} {
  const exe = resolveGameExe();

  if (!exe) {
    return {
      ok: false,
      message:
        "Could not find 'Warhammer 40000 Space Marine 2.exe'. Check Game Root in Options or configure the game .exe path.",
    };
  }

  try {
    const child = spawn(exe, [], {
      cwd: path.dirname(exe),
      detached: false,
      stdio: "ignore",
    });

    child.on("error", (err) => {
      console.error("[launchGameExe] child error:", err);
    });

    return { ok: true, pid: child.pid, child };
  } catch (e: any) {
    console.error("[launchGameExe] spawn failed:", e);
    return {
      ok: false,
      message: e?.message || "Failed to launch game.",
    };
  }
}

// ----------------------- Window -----------------------
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: "hiddenInset",

    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: app.isPackaged,
    },
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  } else {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("closed", () => (mainWindow = null));
}

ipcMain.handle("window:minimize", () => {
  if (mainWindow && !mainWindow.isMinimized()) {
    mainWindow.minimize();
  }
});

ipcMain.handle("window:toggle-maximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle("window:close", () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

// ----------------------- IPC: Config -----------------------
ipcMain.handle("paths:detect", async () => detectPaths());

ipcMain.handle("config:get", () => config);
ipcMain.handle("config:set", (_e, next: Partial<AppConfig>) => {
  const prev = { ...config, ...next };
  //replaceConfig(next); // persists + emits "config:changed"

  // If path fields changed, rebind watchers (mods + modPlay)
  const pathsChanged =
    prev.modsVaultPath !== config.modsVaultPath ||
    prev.modPlayVaultPath !== config.modPlayVaultPath ||
    prev.saveDataPath !== config.saveDataPath;

  if (pathsChanged) {
    try {
      watchRegistry.setPaths({
        mods: config.modsVaultPath || "",
        modPlay: config.modPlayVaultPath || "",
        backup: config.saveDataPath || "",
      });
    } catch (err) {
      console.error("[Phase5] watchers:setPaths on config change failed", err);
    }
  }

  return config;
});

// ---------- Dialog Handler - Browse for Folder -----------
ipcMain.handle("dialog:browseFolder", async (event) => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });
  
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  
  return result.filePaths[0];
});

// ----------------------- IPC: FS Utilities -----------------------
ipcMain.handle("fs:testWrite", async (_event, targetPath: string) => {
  try {
    const testFile = path.join(targetPath, ".write-test");
    await fsp.writeFile(testFile, "test", "utf8");
    await fsp.unlink(testFile);
    return true;
  } catch (error) {
    console.error(`Write test failed for ${targetPath}:`, error);
    return false;
  }
});

// ---------------- Ensure directories exist ----------------------
ipcMain.handle("fs:ensureDirs", async (_event, paths: string[]) => {
  try {
    for (const dirPath of paths) {
      await fsp.mkdir(dirPath, { recursive: true });
    }
    return { ok: true };
  } catch (error) {
    console.error("Failed to create directories:", error);
    const err = error as Error;
    return { ok: false, message: err.message };
  }
});

// ----------------------- IPC: Mods -----------------------
ipcMain.handle("mods:list", async () => {
  try {
    const mods = await listMods(
      config.activeModsPath,   // activeDir
      config.modsVaultPath     // vaultDir
    );
    return { ok: true, mods };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Failed to list mods." };
  }
});

// --- Mods: reconcile ---
ipcMain.handle("mods:reconcile", async (_e, desired: string[]) => {
  try {
    await reconcileMods(
      desired,                  // ← first param is the desired list
      config.activeModsPath,    // activeDir
      config.modsVaultPath,     // vaultDir
      config.installStrategy    // strategy
    );
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Failed to reconcile mods." };
  }
});

// --- Mods: delete ---
ipcMain.handle("mods:delete", async (_e, modName: string) => {
  try {
    await deleteMod(
      config.activeModsPath,    // activeDir
      config.modsVaultPath,     // vaultDir
      modName,                  // name
      config.installStrategy    // strategy (remove if your signature doesn’t need it)
    );
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Failed to delete mod." };
  }
});

// ----------------------- IPC: Play (Vanilla vs Mod) -----------------------
ipcMain.handle("play:canLaunch", async () => {
  // If activeModsPath has files, we consider Mod Play. If empty → Vanilla.
  const modsEmpty = await dirIsEmpty(config.activeModsPath);
  return { isModPlay: !modsEmpty };
});

ipcMain.handle("play:launch", async () => {
  const isModPlay = !(await dirIsEmpty(config.activeModsPath));

  // Pre-launch behavior: only for Mod Play
  if (isModPlay) {
    await mirrorVaultIntoGameSavesIfPresent();
  }

  const result = launchGameExe();
  if (!result.ok || !result.child) {
    dialog.showErrorBox("Launch Failed", result.message || "Could not start game.");
    return { ok: false, message: result.message || "Launch error" };
  }

  // On process close, perform post-exit mirror (only in Mod Play)
  return await new Promise((resolve) => {
    result.child!.on("close", async (code: number) => {
      if (isModPlay) {
        await mirrorSavesIntoVault();
      }
      resolve({ ok: true, mode: isModPlay ? "mod" : "vanilla", exitCode: code ?? 0 });
    });
  });
});

// --- Manual save: copy game config → mod_play_vault (overwrites) ---
ipcMain.handle("manualGameDataSave", async () => {
  try {
    await mirrorSavesIntoVault(); // uses config.saveDataPath → config.modPlayVaultPath
    // return a small summary like App.tsx expects:
    // (If you don’t track counts/bytes, just return ok:true)
    return { ok: true, files: 0, bytes: 0 };
  } catch (e: any) {
    return { ok: false, error: e?.message || "manualGameDataSave failed" };
  }
});

// --- Launch (Vanilla): no mirrors, just spawn ---
ipcMain.handle("launchVanillaPlay", async () => {
  const result = launchGameExe();
  if (!result.ok || !result.child) {
    return { ok: false, message: result.message || "Could not launch (Vanilla)" };
  }
  return await new Promise((resolve) => {
    result.child!.on("close", (code: number) => {
      resolve({ ok: true, mode: "vanilla", exitCode: code ?? 0 });
    });
  });
});

// --- Launch (Mod Play): pre-mirror (vault→config if vault has data), then post-mirror (config→vault) ---
ipcMain.handle("launchModPlay", async () => {
  try {
    await mirrorVaultIntoGameSavesIfPresent(); // vault → config (only if vault has content)
    const result = launchGameExe();
    if (!result.ok || !result.child) {
      return { ok: false, message: result.message || "Could not launch (Mod Play)" };
    }
    return await new Promise((resolve) => {
      result.child!.on("close", async (code: number) => {
        try { await mirrorSavesIntoVault(); } catch {}
        resolve({ ok: true, mode: "mod", exitCode: code ?? 0 });
      });
    });
  } catch (e: any) {
    return { ok: false, message: e?.message || "Launch (Mod Play) failed" };
  }
});

// ----------------------- IPC: Background -----------------------
ipcMain.handle("bg:get", async () => {
  const p = config.backgroundImagePath || "";
  return { ok: true, path: p, fileUrl: p ? toFileUrl(p) : "" };
});

ipcMain.handle("bg:choose", async () => {
  const res = await dialog.showOpenDialog({
    title: "Choose background image",
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["jpg","jpeg","png","webp"] }],
  });
  if (res.canceled || res.filePaths.length === 0) return { ok: false, canceled: true };
  return { ok: true, path: res.filePaths[0] };
});

ipcMain.handle("bg:set", async (_e, srcAbs: string) => {
  try {
    if (!srcAbs) return { ok: false, message: "No file selected." };
    const allowed = [".jpg",".jpeg",".png",".webp"];
    const ext = path.extname(srcAbs).toLowerCase();
    if (!allowed.includes(ext)) return { ok: false, message: "Unsupported format." };
    await fse.ensureDir(bgStorageDir());
    const dst = bgDestFor(srcAbs);
    await fse.copy(srcAbs, dst, { overwrite: true });
    replaceConfig({ backgroundImagePath: dst }); // your existing config persist
    return { ok: true, path: dst, fileUrl: toFileUrl(dst) };
  } catch (e: any) {
    return { ok: false, message: e?.message || "Failed to set background." };
  }
});

ipcMain.handle("bg:reset", async () => {
  replaceConfig({ backgroundImagePath: "" });
  return { ok: true };
});

// ----------------------- IPC: Setup Wizard -----------------------
ipcMain.handle("setup:complete", async (_event, configUpdate: Partial<AppConfig>) => {
  try {
    // Use the existing replaceConfig function which handles saving to disk
    replaceConfig({
      ...configUpdate,
      setupComplete: true,
    });
    
    return { ok: true };
  } catch (error) {
    console.error("Setup completion failed:", error);
    const err = error as Error;
    return { ok: false, message: err.message };
  }
});

// ----------------------- App Lifecycle -----------------------
app.whenReady().then(async () => {
  loadConfigFromDisk();

  await Promise.all([
    ensureDir(config.modsVaultPath),
    ensureDir(config.modPlayVaultPath),
    ensureDir(config.saveDataPath),
  ]);

  await createWindow();

  if (mainWindow) {
    // Wait until renderer is ready to receive events
    await new Promise<void>((resolve) => {
      if (mainWindow!.webContents.isLoading()) {
        mainWindow!.webContents.once("did-finish-load", () => resolve());
      } else {
        resolve();
      }
    });

    // Attach this window to the watcher registry / vault IPC
    registerVaultWatcherIPC(mainWindow);

    // Initial watcher paths – **vaults**, not active mods
    try {
      watchRegistry.setPaths({
        mods: config.modsVaultPath || "",
        modPlay: config.modPlayVaultPath || "",
        backup: config.saveDataPath || "",
      });
    } catch (err) {
      console.error("[Phase5] initial watchers:setPaths failed", err);
    }
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});


app.on("before-quit", async () => {
  try { await (watchRegistry as any).disposeAll?.(); } catch {}
});

app.on("window-all-closed", () => {
  saveConfigToDisk();
  if (process.platform !== "darwin") app.quit();
});