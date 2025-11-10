import { promises as fs } from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { appendCopyEvent } from '../../shared/logging/CopyEventLogger';

async function ensureDir(p: string){ await fs.mkdir(p, { recursive: true }); }

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile()) yield full;
  }
}

export async function mirrorPlatformConfigToModVault(srcRoot: string, destRoot: string) {
  const t0 = performance.now();
  let files = 0; let bytes = 0;
  let result: 'ok'|'error' = 'ok'; let error: string|undefined;

  try {
    await ensureDir(destRoot);

    for await (const srcFile of walk(srcRoot)) {
      const rel = path.relative(srcRoot, srcFile);
      const destFile = path.join(destRoot, rel);
      await ensureDir(path.dirname(destFile));
      const data = await fs.readFile(srcFile);
      bytes += data.byteLength; files += 1;
      await fs.writeFile(destFile, data);
    }

  } catch (e: any) {
    result = 'error';
    error = e?.message || String(e);
  } finally {
    const ms = Math.round(performance.now() - t0);
    await appendCopyEvent(destRoot, {
      ts: new Date().toISOString(),
      src: srcRoot,
      dest: destRoot,
      files, bytes, ms, result,
      error,
    });
  }
}
