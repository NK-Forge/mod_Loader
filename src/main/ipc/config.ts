// src/main/ipc/config.ts
import path from "node:path";
import { promises as fs } from "node:fs";
import { app } from "electron";
import { safeHandle } from "./safeHandle";
import {
  AppConfig,
  getConfig,
  replaceConfig,
  patchConfig,
} from "../state/configStore";

const APP_DIR = path.join(app.getPath("userData"));
const CONFIG_PATH = path.join(APP_DIR, "config.json");

// Small FS helpers
async function ensureDir(p: string | undefined) {
  if (!p) return;
  await fs.mkdir(p, { recursive: true }).catch(() => void 0);
}

async function readJSON<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJSON<T>(file: string, data: T): Promise<void> {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf-8");
}

// Expose config get/set over IPC (idempotent)
safeHandle("config:get", async () => {
  return getConfig();
});

safeHandle<AppConfig>("config:set", async (_evt, next) => {
  await writeJSON(CONFIG_PATH, next);
  replaceConfig(next);
  return true;
});

// Called by Setup Wizard to finish configuration
safeHandle<Partial<AppConfig>>("config:completeSetup", async (_evt, patch) => {
  const cur = await readJSON<AppConfig>(CONFIG_PATH, {});
  const next: AppConfig = {
    ...cur,
    ...patch,
    setupComplete: true,
    autoDetected: !!patch.autoDetected || cur.autoDetected,
  };

  // ensure expected directories exist
  await Promise.all([
    ensureDir(next.activeModsPath),
    ensureDir(next.modsVaultPath),
    ensureDir(next.modPlayVaultPath),
    ensureDir(next.saveDataPath),
  ]);

  await writeJSON(CONFIG_PATH, next);
  replaceConfig(next);
  return next;
});

export { CONFIG_PATH, APP_DIR, readJSON, writeJSON, ensureDir };
