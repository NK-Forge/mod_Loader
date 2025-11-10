import { ipcMain, shell } from 'electron';

ipcMain.handle('paths:reveal', async (_ev, target: string) => {
  if (!target) return;
  await shell.openPath(target);
});
