// src/main/ipc/copylog.ts
import { ipcMain } from "electron";
import { readCopyEvents } from "../../services/SaveFileManager";

ipcMain.handle("copylog:list", async (_evt, args: { modPlayVault: string; lastDays: number }) => {
  const { modPlayVault, lastDays } = args || {};
  if (!modPlayVault) return [];
  return readCopyEvents(modPlayVault, Math.max(1, lastDays ?? 14));
});
