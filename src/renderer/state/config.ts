import React from 'react';

export type ImmutablePaths = {
  modPlayVault: string;
  modsVault: string;
  backupsRoot: string;
  configRoot: string;
  logsRoot: string;
};

export function useImmutablePaths(): ImmutablePaths {
  const api = (window as any).api;
  const [state, setState]= React.useState<ImmutablePaths>(() => api.getImmutablePaths());
  React.useEffect(() => {
    const unsub = api.onConfigChanged?.(() => setState(api.getImmutablePaths()));
    return () => { if (unsub) unsub(); };
  }, []);
  return state;
}
