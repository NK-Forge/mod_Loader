/**
 * @file electron/config/pathDetection.ts
 * @project Space Marine 2 Mod Loader
 * Auto-detection of game paths and storefront launch targets.
 */

import { getConfig } from "./configManager";
import type { Platform } from "./configManager";
import {
  detectSaberSaveDataPath,
  scanStorefronts,
  type StorefrontCandidate,
} from "./storefrontDetection";
import { SM2_XBOX_STORE_PRODUCT_ID } from "../utils/xboxGamePass";

export interface DetectedPaths {
  gameRoot: string;
  gameExe: string;
  activeModsPath: string;
  saveDataPath: string;
  platform: Platform;
  launchUri?: string;
  steamAppId?: string;
  epicAppName?: string;
  epicNamespaceId?: string;
  epicItemId?: string;
  epicArtifactId?: string;
  epicLaunchUri?: string;
  xboxAumid?: string;
  xboxLaunchUri?: string;
  xboxStoreProductId?: string;
  storefronts: StorefrontCandidate[];
  selectedStorefrontId?: string;
  storeFallbackUri?: string;
}

function applyCandidate(candidate?: StorefrontCandidate): Partial<DetectedPaths> {
  if (!candidate) return {};

  return {
    gameRoot: candidate.gameRoot || "",
    gameExe: candidate.gameExe || "",
    activeModsPath: candidate.activeModsPath || "",
    saveDataPath: candidate.saveDataPath || "",
    platform: candidate.platform,
    launchUri: candidate.launchUri || "",
    steamAppId: candidate.steamAppId,
    epicAppName: candidate.epic?.appName,
    epicNamespaceId: candidate.epic?.namespaceId,
    epicItemId: candidate.epic?.itemId,
    epicArtifactId: candidate.epic?.artifactId,
    epicLaunchUri: candidate.platform === "epic" ? candidate.launchUri : undefined,
    xboxAumid: candidate.xbox?.aumid,
    xboxLaunchUri: candidate.platform === "xbox" ? candidate.launchUri : undefined,
    xboxStoreProductId:
      candidate.platform === "xbox" ? candidate.storeProductId || SM2_XBOX_STORE_PRODUCT_ID : undefined,
    selectedStorefrontId: candidate.id,
  };
}

export async function detectPaths(): Promise<DetectedPaths> {
  const config = getConfig() as any;

  const scan = await scanStorefronts({
    preferredPlatform: config.platform,
    preferredLaunchUri: config.launchUri || config.epicLaunchUri || config.xboxLaunchUri,
    existingGameRoot: config.gameRoot,
    existingSaveDataPath: config.saveDataPath,
  });

  const selected = scan.selected;
  const selectedValues = applyCandidate(selected);
  const platform = selectedValues.platform || config.platform || "unknown";

  return {
    gameRoot: selectedValues.gameRoot || config.gameRoot || "",
    gameExe: selectedValues.gameExe || config.gameExe || "",
    activeModsPath: selectedValues.activeModsPath || config.activeModsPath || "",
    saveDataPath:
      selectedValues.saveDataPath ||
      config.saveDataPath ||
      detectSaberSaveDataPath(platform),
    platform,
    launchUri: selectedValues.launchUri || config.launchUri || "",
    steamAppId: selectedValues.steamAppId || config.steamAppId,
    epicAppName: selectedValues.epicAppName || config.epicAppName,
    epicNamespaceId: selectedValues.epicNamespaceId || config.epicNamespaceId,
    epicItemId: selectedValues.epicItemId || config.epicItemId,
    epicArtifactId: selectedValues.epicArtifactId || config.epicArtifactId,
    epicLaunchUri: selectedValues.epicLaunchUri || config.epicLaunchUri,
    xboxAumid: selectedValues.xboxAumid || config.xboxAumid,
    xboxLaunchUri: selectedValues.xboxLaunchUri || config.xboxLaunchUri,
    xboxStoreProductId:
      selectedValues.xboxStoreProductId || config.xboxStoreProductId || SM2_XBOX_STORE_PRODUCT_ID,
    storefronts: scan.checks,
    selectedStorefrontId: selectedValues.selectedStorefrontId,
    storeFallbackUri: scan.storeFallbackUri,
  };
}
