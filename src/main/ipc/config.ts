// src/main/ipc/config.ts
import path from "node:path";
import { promises as fs } from "node:fs";
import { app } from "electron";

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

export { CONFIG_PATH, APP_DIR, readJSON, writeJSON, ensureDir };
