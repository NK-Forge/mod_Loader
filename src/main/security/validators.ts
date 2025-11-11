/**
 * @file validators.ts
 * @project Space Marine 2 Mod Loader
 * @phase 3B — Safety & Security
 * @description
 *  Path and name validation utilities used by all filesystem-affecting handlers.
 */

import path from "path";

/** Conservative allowlist: letters, digits, dot, underscore, dash, space. */
const MOD_NAME_RE = /^[a-zA-Z0-9._\- ]{1,128}$/;

/**
 * Trim/normalize a mod name.
 * @param name string
 * @returns sanitized name
 */
export function sanitizeModName(name: string): string {
  return String(name ?? "").trim();
}

/**
 * Validate a sanitized mod name against an allowlist.
 * @param name string
 * @returns boolean
 */
export function isSafeModName(name: string): boolean {
  return MOD_NAME_RE.test(name);
}

/**
 * Check if candidate is strictly inside base (no traversal).
 * @param base absolute base directory
 * @param candidate absolute path to check
 */
export function isPathInside(base: string, candidate: string): boolean {
  const rel = path.relative(path.resolve(base), path.resolve(candidate));
  // Allow "" (same dir) and any path that doesn't traverse up or become absolute
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Assert that candidate is inside base; throws on failure.
 * @throws Error if outside
 */
export function assertInside(base: string, candidate: string): void {
  if (!isPathInside(base, candidate)) {
    throw new Error(`Unsafe path: "${candidate}" is outside of base "${base}"`);
  }
}

/**
 * Deduplicate, sanitize, and validate a list of mod names.
 * Invalid names are dropped.
 * @param names string[]
 * @returns safe, unique names
 */
export function validateModList(names: string[]): string[] {
  const out = new Set<string>();
  for (const raw of names ?? []) {
    const n = sanitizeModName(raw);
    if (isSafeModName(n)) out.add(n);
  }
  return [...out];
}
