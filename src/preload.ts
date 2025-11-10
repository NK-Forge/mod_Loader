import { contextBridge, ipcRenderer } from 'electron';

type API = {
  revealPath: (p: string) => Promise<void>;
  getImmutablePaths: () => any;
  onConfigChanged?: (cb: ()=>void) => () => void;
  listCopyEvents: (modPlayVault: string, lastDays: number) => Promise<any[]>;
};

const api: API = {
  revealPath: (p) => ipcRenderer.invoke('paths:reveal', p),
  getImmutablePaths: () => ipcRenderer.sendSync('config:getImmutablePaths'),
  onConfigChanged: (cb) => {
    const ch = 'config:changed';
    const handler = () => cb();
    ipcRenderer.on(ch, handler);
    return () => ipcRenderer.removeListener(ch, handler);
  },
  listCopyEvents: (modPlayVault, lastDays) => ipcRenderer.invoke('copylog:list', { modPlayVault, lastDays }),
};

contextBridge.exposeInMainWorld('api', api);
