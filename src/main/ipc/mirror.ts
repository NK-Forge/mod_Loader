// src/main/ipc/mirror.ts
import { safeHandle } from "./safeHandle";
import { getConfig } from "../state/configStore";
import { mirrorPlatformConfigToModVault } from "../services/MirrorCopyService";

safeHandle("mirror:run", async () => {
  const cfg = getConfig();
  const src = cfg.saveDataPath;
  const dest = cfg.modPlayVaultPath;

  if (!src || !dest) {
    throw new Error("Mirror failed: saveDataPath or modPlayVaultPath is not configured.");
  }
  await mirrorPlatformConfigToModVault(src, dest);
  return true;
});
