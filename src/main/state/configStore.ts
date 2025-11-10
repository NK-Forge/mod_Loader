// src/main/state/configStore.ts
import { EventEmitter } from "node:events";

export type InstallStrategy = "auto" | "hardlink" | "symlink" | "copy";

export type AppConfig = {
  setupComplete?: boolean;
  autoDetected?: boolean;

  gameRoot?: string;
  gameExe?: string;

  // FLAT, single source of truth
  activeModsPath?: string;
  modsVaultPath?: string;
  modPlayVaultPath?: string;
  saveDataPath?: string;

  installStrategy?: InstallStrategy;

  lastRunUsedMods?: boolean;
  lastRunClosedAt?: string;
};

const emitter = new EventEmitter();

// in-memory config (authoritative for main + services)
let CONFIG: AppConfig = {
  installStrategy: "hardlink",
};

export function getConfig(): AppConfig {
  return CONFIG;
}

export function replaceConfig(next: AppConfig) {
  CONFIG = { ...next };
  emitter.emit("change", CONFIG);
}

export function patchConfig(patch: Partial<AppConfig>) {
  CONFIG = { ...CONFIG, ...patch };
  emitter.emit("change", CONFIG);
}

export function onConfigChanged(fn: (cfg: AppConfig) => void): () => void {
  emitter.on("change", fn);
  return () => emitter.off("change", fn);
}
