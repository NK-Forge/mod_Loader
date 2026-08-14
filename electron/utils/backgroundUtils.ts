/**
 * @file electron/utils/backgroundUtils.ts
 * @project Space Marine 2 Mod Loader
 * Background image management utilities
 */

import { app } from "electron";
import { readFile } from "node:fs/promises";
import path from "path";

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export function bgStorageDir(): string {
  return path.join(app.getPath("userData"), "backgrounds");
}

export function bgDestFor(srcAbs: string): string {
  const ext = (path.extname(srcAbs) || ".jpg").toLowerCase();
  return path.join(bgStorageDir(), "user_bg" + ext);
}

/**
 * Return a renderer-safe data URL for a managed background image.
 *
 * Development renders from http://localhost, so directly exposing a file://
 * URL would require weakening Chromium webSecurity. Converting the copied
 * background to a data URL lets us keep normal same-origin protections on.
 */
export async function toImageDataUrl(abs: string): Promise<string> {
  try {
    const ext = path.extname(abs).toLowerCase();
    const mime = IMAGE_MIME_BY_EXTENSION[ext];
    if (!mime) return "";

    const data = await readFile(abs);
    return `data:${mime};base64,${data.toString("base64")}`;
  } catch {
    return "";
  }
}
