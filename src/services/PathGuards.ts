// src/services/PathGuards.ts
import * as path from "node:path";
import { promises as fs } from "node:fs";

/**
 * Join one or more path segments to `base` safely (prevents directory traversal).
 * Ensures the returned path remains inside (or equal to) the resolved `base` directory.
 */
export function safeJoin(base: string, ...parts: string[]): string {
  const baseResolved = path.resolve(base);
  // filter(Boolean) to ignore empty fragments safely
  const target = path.resolve(baseResolved, ...parts.filter(Boolean));
  if (!isInside(baseResolved, target)) {
    throw new Error(`Path escape blocked: ${target}`);
  }
  return target;
}

export function isInside(base: string, target: string): boolean {
  const a = path.resolve(base) + path.sep;
  const b = path.resolve(target) + path.sep;
  // Case-insensitive check for Windows, safe on POSIX too
  return b.toLowerCase().startsWith(a.toLowerCase());
}

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}
