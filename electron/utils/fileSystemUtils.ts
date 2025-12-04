/**
 * @file electron/utils/fileSystemUtils.ts
 * @project Space Marine 2 Mod Loader
 * File system utility functions
 */

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { ensureDir } from "../../src/main/security/backup";

export async function dirIsEmpty(p: string): Promise<boolean> {
  try {
    const items = await fsp.readdir(p);
    return items.length === 0;
  } catch {
    return true;
  }
}

export async function replaceDirContents(
  from: string,
  to: string
): Promise<void> {
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
  while (stack.length > 0) {
    const { src, dst } = stack.pop()!;
    const items = await fsp.readdir(src, { withFileTypes: true });
    for (const item of items) {
      const srcPath = path.join(src, item.name);
      const dstPath = path.join(dst, item.name);
      if (item.isDirectory()) {
        await ensureDir(dstPath);
        stack.push({ src: srcPath, dst: dstPath });
      } else {
        await fsp.copyFile(srcPath, dstPath);
      }
    }
  }
}

export function ensureDirSync(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}