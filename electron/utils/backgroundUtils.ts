/**
 * @file electron/utils/backgroundUtils.ts
 * @project Space Marine 2 Mod Loader
 * Background image management utilities
 */

import { app } from "electron";
import path from "path";
import { pathToFileURL } from "node:url";

export function bgStorageDir(): string {
  return path.join(app.getPath("userData"), "backgrounds");
}

export function bgDestFor(srcAbs: string): string {
  const ext = (path.extname(srcAbs) || ".jpg").toLowerCase();
  return path.join(bgStorageDir(), "user_bg" + ext);
}

export function toFileUrl(abs: string): string {
  try {
    return pathToFileURL(abs).toString();
  } catch {
    return "";
  }
}