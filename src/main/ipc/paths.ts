import { ipcMain, shell } from 'electron';
import { getConfig } from '../state/configStore';

ipcMain.handle('paths:reveal', async (_ev, target: string) => {
  if (!target) return;
  await shell.openPath(target);
});


ipcMain.handle("paths:immutable:get", async () => {
  const cfg = getConfig();
  return {
    ok: true,
    modsVaultPath: cfg?.modsVaultPath ?? "",
    modPlayVaultPath: cfg?.modPlayVaultPath ?? "",
    activeModsPath: cfg?.activeModsPath ?? "",
  };
});