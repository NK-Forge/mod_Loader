// src/main/ipc/saves.ts
import { safeHandle } from "./safeHandle";
import { AppConfig, getConfig } from "../state/configStore";

/**
 * Resolve the game's save/config root directory.
 * Phase 3A: prefer flat key `saveDataPath`.
 * Legacy (Phase 2): fall back to nested `paths.platform_config_root` or `paths.config_root`.
 */
export function resolveSaveRoot(cfg: AppConfig): string | undefined {
  // Flat (Phase 3A)
  if (cfg.saveDataPath) return cfg.saveDataPath as string;

  // Legacy (Phase 2) – tolerated at runtime; typed via `any` to avoid TS schema errors
  const legacyPaths = (cfg as any)?.paths;
  return legacyPaths?.platform_config_root ?? legacyPaths?.config_root;
}

/**
 * Resolve the Mod-Play vault path.
 * Phase 3A: prefer flat key `modPlayVaultPath`.
 * Legacy (Phase 2): fall back to nested `vaults.mod_play_vault`.
 */
export function resolveModPlayVault(cfg: AppConfig): string | undefined {
  // Flat (Phase 3A)
  if (cfg.modPlayVaultPath) return cfg.modPlayVaultPath as string;

  // Legacy (Phase 2)
  const legacyVaults = (cfg as any)?.vaults;
  return legacyVaults?.mod_play_vault;
}

/**
 * Optional: quick introspection IPC so the renderer/devtools can check
 * what the main process believes the active save root / mod-play vault are.
 * Safe to keep; remove if you already expose equivalent info elsewhere.
 */
safeHandle("saves:get-roots", async () => {
  const cfg = getConfig();
  return {
    saveRoot: resolveSaveRoot(cfg),
    modPlayVault: resolveModPlayVault(cfg),
  };
});
