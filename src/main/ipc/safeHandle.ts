// src/main/ipc/safeHandle.ts
import { ipcMain, IpcMainInvokeEvent } from "electron";

export function safeHandle<T = any, R = any>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, args: T) => Promise<R> | R
) {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, handler);
}
