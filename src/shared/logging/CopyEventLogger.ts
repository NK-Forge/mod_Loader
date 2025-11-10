import { promises as fs } from 'fs';
import * as path from 'path';

export type CopyEvent = {
  ts: string;
  src: string;
  dest: string;
  files: number;
  bytes: number;
  ms: number;
  result: 'ok'|'error';
  error?: string;
};

export async function appendCopyEvent(modPlayVault: string, ev: CopyEvent): Promise<void> {
  const logFile = path.join(modPlayVault, '.copy_log.jsonl');
  const line = JSON.stringify(ev) + '\n';
  await fs.mkdir(modPlayVault, { recursive: true });
  await fs.appendFile(logFile, line, 'utf8');
}
