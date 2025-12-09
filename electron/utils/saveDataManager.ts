/**
 * @file electron/utils/saveDataManager.ts
 * @project Space Marine 2 Mod Loader
 * Save data mirroring between game and vault
 */

import { getConfig } from "../config/configManager";
import { replaceDirContents, dirIsEmpty } from "./fileSystemUtils";

/**
 * Mirror FROM vault INTO game saves (pre-launch)
 * Only if vault has data
 */
export async function mirrorVaultIntoGameSavesIfPresent(): Promise<void> {
  const config = getConfig();
  console.log("[SaveData] mirrorVaultIntoGameSavesIfPresent");
  console.log("  vault:", config.modPlayVaultPath);
  console.log("  game saves:", config.saveDataPath);

  const vaultEmpty = await dirIsEmpty(config.modPlayVaultPath);
  if (vaultEmpty) {
    console.log("[SaveData] vault is empty, skipping mirror");
    return;
  }

  await replaceDirContents(config.modPlayVaultPath, config.saveDataPath);
  console.log("[SaveData] mirrored vault → game saves");
}

/**
 * Mirror FROM game saves INTO vault (post-exit)
 */
export async function mirrorSavesIntoVault(): Promise<void> {
  const config = getConfig();
  console.log("[SaveData] mirrorSavesIntoVault");
  console.log("  game saves:", config.saveDataPath);
  console.log("  vault:", config.modPlayVaultPath);

  await replaceDirContents(config.saveDataPath, config.modPlayVaultPath);
  console.log("[SaveData] mirrored game saves -> vault");
}